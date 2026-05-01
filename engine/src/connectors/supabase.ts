import { Connector, ConnectorOutput, DiagnosticEntry } from './types.js';
import { timedFetch } from './fetch-utils.js';

async function sbFetch(path: string, token: string): Promise<unknown> {
  const res = await timedFetch(`https://api.supabase.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Supabase ${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

export const supabaseConnector: Connector = {
  name: 'supabase',
  dimensions: ['R'],
  requiredCredentials: ['accessToken'],

  async validate(config) {
    try {
      await sbFetch('/v1/projects', config.accessToken as string);
      return { connected: true };
    } catch (e: unknown) {
      return { connected: false, error: (e as Error).message };
    }
  },

  async collect(config): Promise<ConnectorOutput> {
    const token = config.accessToken as string;
    const signals: Record<string, number> = {};
    const diagnostics: DiagnosticEntry[] = [];

    try {
      const projects = (await sbFetch('/v1/projects', token)) as Array<Record<string, unknown>>;
      const total = projects.length;
      const healthy = projects.filter(
        (p) => (p.status as string) === 'ACTIVE_HEALTHY',
      ).length;

      if (total > 0) {
        signals.adaptability = healthy / total;
        diagnostics.push(
          { key: 'total_projects', value: total, label: 'Total Supabase projects' },
          { key: 'healthy_projects', value: healthy, label: 'Active healthy projects' },
        );
      }
    } catch {
      diagnostics.push({ key: 'supabase_error', value: 'failed', label: 'Supabase fetch failed' });
    }

    return { signals, diagnostics, connected: true };
  },
};
