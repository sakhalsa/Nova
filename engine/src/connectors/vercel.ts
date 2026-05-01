import { Connector, ConnectorOutput, DiagnosticEntry } from './types.js';
import { timedFetch } from './fetch-utils.js';

async function vFetch(path: string, token: string): Promise<unknown> {
  const res = await timedFetch(`https://api.vercel.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Vercel ${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

export const vercelConnector: Connector = {
  name: 'vercel',
  dimensions: ['R', 'L'],
  requiredCredentials: ['token'],

  async validate(config) {
    try {
      await vFetch('/v2/user', config.token as string);
      return { connected: true };
    } catch (e: unknown) {
      return { connected: false, error: (e as Error).message };
    }
  },

  async collect(config): Promise<ConnectorOutput> {
    const token = config.token as string;
    const projectId = config.projectId as string;
    const signals: Record<string, number> = {};
    const diagnostics: DiagnosticEntry[] = [];

    try {
      const query = projectId ? `?projectId=${projectId}&limit=100` : '?limit=100';
      const data = (await vFetch(`/v6/deployments${query}`, token)) as Record<string, unknown>;
      const deployments = (data.deployments as Array<Record<string, unknown>>) || [];

      if (deployments.length === 0) {
        return { signals, diagnostics, connected: true };
      }

      const errors = deployments.filter((d) => d.state === 'ERROR');
      const ready = deployments.filter((d) => d.state === 'READY');

      signals.cfr_ai = deployments.length > 0 ? errors.length / deployments.length : 0;

      const toMs = (d: Record<string, unknown>): number => {
        const c = d.created;
        if (typeof c === 'number' && !Number.isNaN(c)) return c;
        if (typeof c === 'string') return new Date(c).getTime();
        return NaN;
      };

      const timestamps = deployments.map(toMs).filter((t) => !Number.isNaN(t));
      if (timestamps.length > 1) {
        const span = (Math.max(...timestamps) - Math.min(...timestamps)) / 86400_000;
        signals.deploy_frequency = span > 0 ? deployments.length / span : deployments.length;
      }

      diagnostics.push(
        { key: 'total_deployments', value: deployments.length, label: 'Total deployments' },
        { key: 'error_deployments', value: errors.length, label: 'Failed deployments' },
        { key: 'ready_deployments', value: ready.length, label: 'Successful deployments' },
      );
      return {
        signals,
        diagnostics,
        connected: true,
        confidence: {
          sampleSize: deployments.length,
          timeWindowDays: 30,
          truncated: deployments.length >= 100,
          completeness: deployments.length >= 100 ? 'partial' : 'full',
        },
      };
    } catch {
      diagnostics.push({ key: 'vercel_error', value: 'failed', label: 'Vercel fetch failed' });
    }

    return { signals, diagnostics, connected: false };
  },
};
