import { Connector, ConnectorOutput, DiagnosticEntry } from './types.js';
import { timedFetch } from './fetch-utils.js';

export const anthropicConnector: Connector = {
  name: 'anthropic',
  dimensions: ['C'],
  requiredCredentials: ['apiKey'],

  async validate(config) {
    try {
      const res = await timedFetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': config.apiKey as string,
          'anthropic-version': '2023-06-01',
        },
      });
      if (!res.ok) return { connected: false, error: `Anthropic: ${res.status}` };
      return { connected: true };
    } catch (e: unknown) {
      return { connected: false, error: (e as Error).message };
    }
  },

  // Anthropic has no public cost API. This connector validates connectivity
  // and confirms the customer uses Anthropic. Actual cost data must come
  // from Portkey (aggregator) or manual monthlyAiCost config.
  async collect(config): Promise<ConnectorOutput> {
    const diagnostics: DiagnosticEntry[] = [];

    try {
      const res = await timedFetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': config.apiKey as string,
          'anthropic-version': '2023-06-01',
        },
      });
      const data = (await res.json()) as Record<string, unknown>;
      const models = (data.data as Array<unknown>) || [];
      diagnostics.push(
        { key: 'models_available', value: models.length, label: 'Anthropic models available' },
        { key: 'cost_note', value: 'no public cost API', label: 'Use Portkey or manual monthlyAiCost for cost tracking' },
      );
    } catch {
      diagnostics.push({ key: 'anthropic_error', value: 'failed', label: 'Anthropic model list failed' });
    }

    return { signals: {}, diagnostics, connected: true };
  },
};
