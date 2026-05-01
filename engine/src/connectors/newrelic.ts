import { Connector, ConnectorOutput, DiagnosticEntry } from './types.js';
import { timedFetch } from './fetch-utils.js';

async function nrFetch(path: string, apiKey: string): Promise<unknown> {
  const res = await timedFetch(`https://api.newrelic.com${path}`, {
    headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`New Relic ${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

export const newrelicConnector: Connector = {
  name: 'newrelic',
  dimensions: ['R'],
  requiredCredentials: ['apiKey', 'appId'],

  async validate(config) {
    try {
      await nrFetch(`/v2/applications/${config.appId}.json`, config.apiKey as string);
      return { connected: true };
    } catch (e: unknown) {
      return { connected: false, error: (e as Error).message };
    }
  },

  async collect(config): Promise<ConnectorOutput> {
    const apiKey = config.apiKey as string;
    const appId = config.appId as string;
    const signals: Record<string, number> = {};
    const diagnostics: DiagnosticEntry[] = [];

    try {
      const data = (await nrFetch(`/v2/applications/${appId}.json`, apiKey)) as Record<string, unknown>;
      const app = data.application as Record<string, unknown>;
      const summary = app?.application_summary as Record<string, number>;

      if (summary) {
        const errorRate = (summary.error_rate || 0) / 100;
        signals.uptime_ai = 1 - errorRate;

        diagnostics.push(
          { key: 'error_rate', value: errorRate, label: 'Application error rate' },
          { key: 'apdex_score', value: summary.apdex_score || 0, label: 'Apdex score' },
          { key: 'response_time', value: summary.response_time || 0, label: 'Avg response time (ms)' },
          { key: 'throughput', value: summary.throughput || 0, label: 'Throughput (rpm)' },
        );
      }
    } catch {
      diagnostics.push({ key: 'newrelic_error', value: 'failed', label: 'New Relic fetch failed' });
    }

    return { signals, diagnostics, connected: true };
  },
};
