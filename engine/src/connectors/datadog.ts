import { Connector, ConnectorOutput, DiagnosticEntry } from './types.js';
import { timedFetch } from './fetch-utils.js';

function ddSite(config: Record<string, unknown>): string {
  return (config.site as string) || 'datadoghq.com';
}

async function ddFetch(site: string, path: string, apiKey: string, appKey: string): Promise<unknown> {
  const res = await timedFetch(`https://api.${site}${path}`, {
    headers: { 'DD-API-KEY': apiKey, 'DD-APPLICATION-KEY': appKey, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Datadog ${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

export const datadogConnector: Connector = {
  name: 'datadog',
  dimensions: ['R', 'L'],
  requiredCredentials: ['apiKey', 'appKey'],

  async validate(config) {
    try {
      await ddFetch(ddSite(config), '/api/v1/validate', config.apiKey as string, config.appKey as string);
      return { connected: true };
    } catch (e: unknown) {
      return { connected: false, error: (e as Error).message };
    }
  },

  async collect(config): Promise<ConnectorOutput> {
    const site = ddSite(config);
    const apiKey = config.apiKey as string;
    const appKey = config.appKey as string;
    const signals: Record<string, number> = {};
    const diagnostics: DiagnosticEntry[] = [];

    // SLOs for uptime and SLO attainment
    try {
      const sloData = (await ddFetch(site, '/api/v1/slo', apiKey, appKey)) as Record<string, unknown>;
      const slos = (sloData.data as Array<Record<string, unknown>>) || [];
      if (slos.length > 0) {
        let totalAttainment = 0;
        let count = 0;
        for (const slo of slos) {
          const thresholds = (slo.thresholds as Array<Record<string, number>>) || [];
          if (thresholds.length === 0) continue;

          // overall_status is an object with sli_value, not an array
          let sliValue: number | undefined;
          const overallStatus = slo.overall_status;
          if (Array.isArray(overallStatus) && overallStatus.length > 0) {
            sliValue = (overallStatus[0] as Record<string, number>)?.sli_value;
          } else if (overallStatus && typeof overallStatus === 'object') {
            sliValue = (overallStatus as Record<string, number>).sli_value;
          }

          const target = thresholds[0].target || 99.9;
          const current = sliValue ?? target;
          totalAttainment += current / 100;
          count++;
        }
        if (count > 0) {
          signals.uptime_ai = Math.min(totalAttainment / count, 1);
          signals.slo_attainment = signals.uptime_ai;
          diagnostics.push(
            { key: 'slo_count', value: count, label: 'SLOs evaluated' },
            { key: 'avg_attainment', value: signals.slo_attainment, label: 'Average SLO attainment' },
          );
        }
      }
    } catch {
      diagnostics.push({ key: 'slo_error', value: 'failed', label: 'SLO fetch failed' });
    }

    // DORA deployment events for CFR and deploy frequency
    try {
      const now = Math.floor(Date.now() / 1000);
      const thirtyDaysAgo = now - 30 * 86400;
      const eventsData = (await ddFetch(
        site,
        `/api/v2/dora/deployment?filter[from]=${thirtyDaysAgo}&filter[to]=${now}`,
        apiKey,
        appKey,
      )) as Record<string, unknown>;
      const events = (eventsData.data as Array<Record<string, unknown>>) || [];
      if (events.length > 0) {
        const failures = events.filter((e) => {
          const attrs = e.attributes as Record<string, unknown> | undefined;
          return attrs?.status === 'failure' || attrs?.status === 'error';
        });
        signals.cfr_ai = failures.length / events.length;
        signals.deploy_frequency = events.length / 30;
        diagnostics.push(
          { key: 'deployments_30d', value: events.length, label: 'Deployments (30d)' },
          { key: 'failures_30d', value: failures.length, label: 'Failed deployments (30d)' },
          { key: 'deploy_freq_per_day', value: signals.deploy_frequency, label: 'Deploys per day' },
        );
      }
    } catch {
      diagnostics.push({ key: 'dora_error', value: 'failed', label: 'DORA events fetch failed. Verify DORA integration is enabled in Datadog.' });
    }

    return { signals, diagnostics, connected: true };
  },
};
