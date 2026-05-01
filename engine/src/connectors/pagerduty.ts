import { Connector, ConnectorOutput, DiagnosticEntry } from './types.js';
import { timedFetch } from './fetch-utils.js';

async function pdFetch(path: string, apiKey: string): Promise<unknown> {
  const res = await timedFetch(`https://api.pagerduty.com${path}`, {
    headers: { Authorization: `Token token=${apiKey}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`PagerDuty ${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

export const pagerdutyConnector: Connector = {
  name: 'pagerduty',
  dimensions: ['R'],
  requiredCredentials: ['apiKey'],

  async validate(config) {
    try {
      await pdFetch('/abilities', config.apiKey as string);
      return { connected: true };
    } catch (e: unknown) {
      return { connected: false, error: (e as Error).message };
    }
  },

  async collect(config): Promise<ConnectorOutput> {
    const apiKey = config.apiKey as string;
    const signals: Record<string, number> = {};
    const diagnostics: DiagnosticEntry[] = [];

    try {
      const since = new Date(Date.now() - 30 * 86400_000).toISOString();
      const data = (await pdFetch(
        `/incidents?since=${since}&statuses[]=resolved&limit=100`,
        apiKey,
      )) as Record<string, unknown>;
      const incidents = (data.incidents as Array<Record<string, unknown>>) || [];

      let totalTtrHours = 0;
      let resolved = 0;

      for (const inc of incidents) {
        const created = new Date(inc.created_at as string).getTime();
        const resolvedAt = inc.last_status_change_at
          ? new Date(inc.last_status_change_at as string).getTime()
          : Date.now();
        const ttrHours = (resolvedAt - created) / 3_600_000;
        totalTtrHours += ttrHours;
        resolved++;
      }

      const mttr = resolved > 0 ? totalTtrHours / resolved : 0;
      signals.uptime_ai = Math.max(Math.min(1 - mttr / 24, 1), 0);

      diagnostics.push(
        { key: 'incidents_30d', value: resolved, label: 'Resolved incidents (30d)' },
        { key: 'mttr_hours', value: Math.round(mttr * 100) / 100, label: 'Mean time to resolve (hours)' },
      );
      return {
        signals,
        diagnostics,
        connected: true,
        confidence: {
          sampleSize: resolved,
          timeWindowDays: 30,
          truncated: incidents.length >= 100,
          completeness: incidents.length >= 100 ? 'partial' : 'full',
        },
      };
    } catch {
      diagnostics.push({ key: 'pagerduty_error', value: 'failed', label: 'PagerDuty fetch failed' });
    }

    return { signals, diagnostics, connected: false };
  },
};
