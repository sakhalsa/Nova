import { Connector, ConnectorOutput, DiagnosticEntry } from './types.js';
import { timedFetch } from './fetch-utils.js';

const DEFAULT_BASE = 'https://api.inngest.com';

async function iFetch(path: string, key: string, base: string): Promise<unknown> {
  const res = await timedFetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`Inngest ${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

export const inngestConnector: Connector = {
  name: 'inngest',
  dimensions: ['R'],
  requiredCredentials: ['signingKey'],

  async validate(config) {
    try {
      const base = (config.baseUrl as string) || DEFAULT_BASE;
      await iFetch('/v1/events', config.signingKey as string, base);
      return { connected: true };
    } catch (e: unknown) {
      return { connected: false, error: (e as Error).message };
    }
  },

  async collect(config): Promise<ConnectorOutput> {
    const key = config.signingKey as string;
    const base = (config.baseUrl as string) || DEFAULT_BASE;
    const signals: Record<string, number> = {};
    const diagnostics: DiagnosticEntry[] = [];

    try {
      const data = (await iFetch('/v1/functions', key, base)) as Record<string, unknown>;
      const functions = (data.data as Array<Record<string, unknown>>) || [];
      diagnostics.push({ key: 'function_count', value: functions.length, label: 'Inngest functions' });

      let totalRuns = 0;
      let completedRuns = 0;
      let totalSteps = 0;
      let retriedSteps = 0;
      let retrySuccesses = 0;

      for (const fn of functions.slice(0, 20)) {
        try {
          const runs = (await iFetch(`/v1/functions/${fn.id}/runs?limit=100`, key, base)) as Record<string, unknown>;
          const runList = (runs.data as Array<Record<string, unknown>>) || [];
          for (const run of runList) {
            totalRuns++;
            if (run.status === 'Completed') completedRuns++;
            const stepCount = (run.step_count as number) || 0;
            const retryCount = (run.retry_count as number) || 0;
            totalSteps += stepCount;
            if (retryCount > 0) {
              retriedSteps += retryCount;
              if (run.status === 'Completed') retrySuccesses += retryCount;
            }
          }
        } catch {
          // individual function fetch may fail
        }
      }

      if (totalRuns > 0) {
        const completionRate = completedRuns / totalRuns;
        signals.adaptability = completionRate;
        diagnostics.push({ key: 'workflow_completion_rate', value: completionRate, label: 'Workflow completion rate' });
        diagnostics.push({ key: 'total_runs', value: totalRuns, label: 'Total workflow runs sampled' });
      }

      if (retriedSteps > 0) {
        const retrySuccess = retrySuccesses / retriedSteps;
        diagnostics.push({ key: 'step_retry_success_rate', value: retrySuccess, label: 'Step retry success rate' });
      }

      return {
        signals,
        diagnostics,
        connected: totalRuns > 0,
        confidence: {
          sampleSize: totalRuns,
          timeWindowDays: 30,
          truncated: functions.length > 20,
          completeness: totalRuns > 50 ? 'full' : totalRuns > 10 ? 'partial' : 'minimal',
        },
      };
    } catch (e: unknown) {
      return {
        signals: {},
        diagnostics: [{ key: 'error', value: (e as Error).message, label: 'Inngest API error' }],
        connected: false,
      };
    }
  },
};
