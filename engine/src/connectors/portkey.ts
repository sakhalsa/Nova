import { Connector, ConnectorOutput, DiagnosticEntry } from './types.js';
import { timedFetch } from './fetch-utils.js';

async function pkFetch(path: string, apiKey: string): Promise<unknown> {
  const res = await timedFetch(`https://api.portkey.ai${path}`, {
    headers: { 'x-portkey-api-key': apiKey, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Portkey ${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

export const portkeyConnector: Connector = {
  name: 'portkey',
  dimensions: ['C'],
  requiredCredentials: ['apiKey'],

  async validate(config) {
    try {
      await pkFetch('/v1/logs?limit=1', config.apiKey as string);
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
      const data = (await pkFetch('/v1/logs?limit=100', apiKey)) as Record<string, unknown>;
      const logs = (data.data as Array<Record<string, unknown>>) ||
                   (data.logs as Array<Record<string, unknown>>) || [];

      let totalCost = 0;
      let totalTokens = 0;
      let requestCount = 0;

      for (const log of logs) {
        const cost = (log.cost as number) || 0;
        const tokens = ((log.total_tokens as number) || (log.tokens as number) || 0);
        totalCost += cost;
        totalTokens += tokens;
        requestCount++;
      }

      // Portkey aggregates costs across all providers (OpenAI, Anthropic, etc.)
      // so it becomes the single source of truth for total_ai_cost
      if (totalCost > 0) {
        signals.total_ai_cost = totalCost;
      }

      diagnostics.push(
        { key: 'total_cost', value: totalCost, label: 'Portkey aggregated cost ($)' },
        { key: 'total_tokens', value: totalTokens, label: 'Total tokens' },
        { key: 'request_count', value: requestCount, label: 'Requests in window' },
      );
    } catch {
      diagnostics.push({ key: 'portkey_error', value: 'failed', label: 'Portkey log fetch failed' });
    }

    return { signals, diagnostics, connected: true };
  },
};
