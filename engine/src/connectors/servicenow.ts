import { Connector, ConnectorOutput, DiagnosticEntry } from './types.js';
import { timedFetch } from './fetch-utils.js';

async function snowFetch(instance: string, path: string, username: string, password: string): Promise<unknown> {
  const res = await timedFetch(`https://${instance}.service-now.com${path}`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`ServiceNow ${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

export const servicenowConnector: Connector = {
  name: 'servicenow',
  dimensions: ['R'],
  requiredCredentials: ['instance', 'username', 'password'],

  async validate(config) {
    try {
      await snowFetch(
        config.instance as string,
        '/api/now/table/sys_user?sysparm_limit=1',
        config.username as string,
        config.password as string,
      );
      return { connected: true };
    } catch (e: unknown) {
      return { connected: false, error: (e as Error).message };
    }
  },

  async collect(config): Promise<ConnectorOutput> {
    const instance = config.instance as string;
    const username = config.username as string;
    const password = config.password as string;
    const signals: Record<string, number> = {};
    const diagnostics: DiagnosticEntry[] = [];

    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString().split('T')[0];
      const data = (await snowFetch(
        instance,
        `/api/now/table/incident?sysparm_query=sys_created_on>=${thirtyDaysAgo}&sysparm_limit=100&sysparm_fields=sys_created_on,resolved_at,state,priority`,
        username,
        password,
      )) as Record<string, unknown>;
      const incidents = (data.result as Array<Record<string, unknown>>) || [];

      let totalTtrHours = 0;
      let resolved = 0;

      for (const inc of incidents) {
        if (inc.resolved_at && inc.sys_created_on) {
          const created = new Date(inc.sys_created_on as string).getTime();
          const resolvedAt = new Date(inc.resolved_at as string).getTime();
          const ttrHours = (resolvedAt - created) / 3_600_000;
          totalTtrHours += ttrHours;
          resolved++;
        }
      }

      const mttr = resolved > 0 ? totalTtrHours / resolved : 0;
      signals.uptime_ai = Math.max(Math.min(1 - mttr / 24, 1), 0);

      diagnostics.push(
        { key: 'incidents_30d', value: incidents.length, label: 'Incidents (30d)' },
        { key: 'resolved_30d', value: resolved, label: 'Resolved incidents (30d)' },
        { key: 'mttr_hours', value: Math.round(mttr * 100) / 100, label: 'Mean time to resolve (hours)' },
      );
      return {
        signals,
        diagnostics,
        connected: true,
        confidence: {
          sampleSize: incidents.length,
          timeWindowDays: 30,
          truncated: incidents.length >= 100,
          completeness: incidents.length >= 100 ? 'partial' : 'full',
        },
      };
    } catch {
      diagnostics.push({ key: 'servicenow_error', value: 'failed', label: 'ServiceNow fetch failed' });
    }

    return { signals, diagnostics, connected: false };
  },
};
