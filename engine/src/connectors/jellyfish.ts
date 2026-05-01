import { Connector, ConnectorOutput, DiagnosticEntry } from './types.js';
import { timedFetch } from './fetch-utils.js';

async function jfFetch(path: string, apiKey: string): Promise<unknown> {
  const res = await timedFetch(`https://app.jellyfish.co${path}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Jellyfish ${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

export const jellyfishConnector: Connector = {
  name: 'jellyfish',
  dimensions: ['L'],
  requiredCredentials: ['apiKey'],

  async validate(config) {
    try {
      await jfFetch('/api/v1/metrics/cycle-time?period=last_7_days', config.apiKey as string);
      return { connected: true };
    } catch (e: unknown) {
      return { connected: false, error: (e as Error).message };
    }
  },

  async collect(config): Promise<ConnectorOutput> {
    const apiKey = config.apiKey as string;
    const signals: Record<string, number> = {};
    const diagnostics: DiagnosticEntry[] = [];

    // Jellyfish provides aggregate cycle time without AI/non-AI split.
    // Strategy: use as cycle_time_ai; baseline (cycle_time_nonai) must come
    // from config or calibration run.
    try {
      const data = (await jfFetch(
        '/api/v1/metrics/cycle-time?period=last_30_days',
        apiKey,
      )) as Record<string, unknown>;

      const cycleTimeHours = (data.cycle_time_hours as number) ?? (data.value as number) ?? null;

      if (cycleTimeHours !== null) {
        signals.cycle_time_ai = cycleTimeHours;
        diagnostics.push({
          key: 'aggregate_cycle_time',
          value: cycleTimeHours,
          label: 'Aggregate cycle time (hours, 30d)',
        });
      }
    } catch {
      diagnostics.push({ key: 'jellyfish_error', value: 'failed', label: 'Jellyfish fetch failed' });
    }

    return { signals, diagnostics, connected: true };
  },
};
