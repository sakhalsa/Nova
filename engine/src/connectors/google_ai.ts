import { Connector, ConnectorOutput, DiagnosticEntry } from './types.js';
import { timedFetch } from './fetch-utils.js';

export const googleAiConnector: Connector = {
  name: 'google_ai',
  dimensions: ['C'],
  requiredCredentials: ['apiKey'],

  async validate(config) {
    try {
      const res = await timedFetch('https://generativelanguage.googleapis.com/v1beta/models', {
        headers: { 'x-goog-api-key': config.apiKey as string },
      });
      if (!res.ok) return { connected: false, error: `Google AI: ${res.status}` };
      return { connected: true };
    } catch (e: unknown) {
      return { connected: false, error: (e as Error).message };
    }
  },

  // Google AI (Gemini) has no public cost API. This connector validates
  // connectivity and confirms the customer uses Google AI. Actual cost
  // data must come from Portkey or manual monthlyAiCost config.
  async collect(config): Promise<ConnectorOutput> {
    const diagnostics: DiagnosticEntry[] = [];

    try {
      const res = await timedFetch('https://generativelanguage.googleapis.com/v1beta/models', {
        headers: { 'x-goog-api-key': config.apiKey as string },
      });
      const data = (await res.json()) as Record<string, unknown>;
      const models = (data.models as Array<unknown>) || [];
      diagnostics.push(
        { key: 'models_available', value: models.length, label: 'Google AI models available' },
        { key: 'cost_note', value: 'no public cost API', label: 'Use Portkey or manual monthlyAiCost for cost tracking' },
      );
      return {
        signals: {},
        diagnostics,
        connected: true,
        confidence: {
          sampleSize: models.length,
          timeWindowDays: 0,
          truncated: false,
          completeness: 'full',
        },
      };
    } catch {
      diagnostics.push({ key: 'google_ai_error', value: 'failed', label: 'Google AI model list failed' });
    }

    return { signals: {}, diagnostics, connected: false };
  },
};
