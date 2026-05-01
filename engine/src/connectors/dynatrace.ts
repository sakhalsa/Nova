import { Connector, ConnectorOutput, DiagnosticEntry } from './types.js';
import { timedFetch } from './fetch-utils.js';

async function dtFetch(baseUrl: string, path: string, token: string): Promise<unknown> {
  const url = `${baseUrl.replace(/\/$/, '')}${path}`;
  const res = await timedFetch(url, {
    headers: { Authorization: `Api-Token ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Dynatrace ${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

export const dynatraceConnector: Connector = {
  name: 'dynatrace',
  dimensions: ['R'],
  requiredCredentials: ['baseUrl', 'apiToken'],

  async validate(config) {
    try {
      await dtFetch(
        config.baseUrl as string,
        '/api/v1/config/clusterversion',
        config.apiToken as string,
      );
      return { connected: true };
    } catch (e: unknown) {
      return { connected: false, error: (e as Error).message };
    }
  },

  async collect(config): Promise<ConnectorOutput> {
    const baseUrl = config.baseUrl as string;
    const token = config.apiToken as string;
    const signals: Record<string, number> = {};
    const diagnostics: DiagnosticEntry[] = [];

    // SLOs: v2 API returns SLO list with evaluatedPercentage
    try {
      const sloData = (await dtFetch(
        baseUrl,
        '/api/v2/slo?pageSize=100&timeFrame=CURRENT&demo=false&evaluate=true',
        token,
      )) as Record<string, unknown>;
      const slos = (sloData.slo as Array<Record<string, unknown>>) || [];

      if (slos.length > 0) {
        let totalAttainment = 0;
        let count = 0;

        for (const slo of slos) {
          const evaluated = slo.evaluatedPercentage as number | undefined;
          if (evaluated !== undefined && evaluated !== null) {
            totalAttainment += evaluated / 100;
            count++;
          }
        }

        if (count > 0) {
          signals.slo_attainment = Math.min(totalAttainment / count, 1);
          signals.uptime_ai = signals.slo_attainment;
          diagnostics.push(
            { key: 'slo_count', value: count, label: 'SLOs evaluated' },
            { key: 'avg_attainment', value: signals.slo_attainment, label: 'Average SLO attainment' },
          );
        }
      }
    } catch {
      diagnostics.push({ key: 'slo_error', value: 'failed', label: 'Dynatrace SLO fetch failed' });
    }

    // Problems API: open problems map to CFR-like signal
    try {
      const now = Date.now();
      const thirtyDaysAgo = now - 30 * 86_400_000;
      const problemData = (await dtFetch(
        baseUrl,
        `/api/v2/problems?from=${thirtyDaysAgo}&to=${now}&pageSize=500`,
        token,
      )) as Record<string, unknown>;
      const problems = (problemData.problems as Array<Record<string, unknown>>) || [];
      const totalProblems = (problemData.totalCount as number) || problems.length;

      if (totalProblems >= 0) {
        // Normalize: 0 problems = 0.0 CFR (perfect), 50+ = 1.0 CFR (worst)
        signals.cfr_ai = Math.min(totalProblems / 50, 1.0);
        diagnostics.push(
          { key: 'problems_30d', value: totalProblems, label: 'Problems detected (30d)' },
          { key: 'cfr_derived', value: signals.cfr_ai, label: 'Change failure rate (derived from problem count)' },
        );
      }
    } catch {
      diagnostics.push({ key: 'problems_error', value: 'failed', label: 'Dynatrace Problems API fetch failed' });
    }

    // Availability: synthetic monitors for uptime when SLOs aren't configured
    if (signals.uptime_ai === undefined) {
      try {
        const monitorData = (await dtFetch(
          baseUrl,
          '/api/v1/synthetic/monitors?type=HTTP',
          token,
        )) as Record<string, unknown>;
        const monitors = (monitorData.monitors as Array<Record<string, unknown>>) || [];

        if (monitors.length > 0) {
          let totalAvail = 0;
          let count = 0;

          for (const mon of monitors) {
            const enabled = mon.enabled as boolean;
            if (!enabled) continue;
            // availabilityStatus: true when healthy
            const avail = mon.availabilityStatus as boolean | undefined;
            if (avail !== undefined) {
              totalAvail += avail ? 1.0 : 0.0;
              count++;
            }
          }

          if (count > 0) {
            signals.uptime_ai = totalAvail / count;
            diagnostics.push(
              { key: 'synthetic_monitors', value: count, label: 'Synthetic monitors evaluated' },
              { key: 'synthetic_uptime', value: signals.uptime_ai, label: 'Synthetic availability rate' },
            );
          }
        }
      } catch {
        diagnostics.push({ key: 'synthetic_error', value: 'failed', label: 'Dynatrace Synthetic API fetch failed' });
      }
    }

    return {
      signals,
      diagnostics,
      connected: true,
      confidence: {
        sampleSize: Object.keys(signals).length > 0 ? 30 : 0,
        timeWindowDays: 30,
        truncated: false,
        completeness: Object.keys(signals).length >= 2 ? 'full' : Object.keys(signals).length > 0 ? 'partial' : 'minimal',
      },
    };
  },
};
