import { Connector, ConnectorOutput, DiagnosticEntry } from './types.js';
import { timedFetch } from './fetch-utils.js';

async function oaiFetch(path: string, apiKey: string, orgId?: string): Promise<unknown> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  if (orgId) headers['OpenAI-Organization'] = orgId;
  const res = await timedFetch(`https://api.openai.com${path}`, { headers });
  if (!res.ok) throw new Error(`OpenAI ${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

export const openaiConnector: Connector = {
  name: 'openai',
  dimensions: ['C'],
  requiredCredentials: ['apiKey'],

  async validate(config) {
    try {
      await oaiFetch('/v1/models', config.apiKey as string, config.orgId as string);
      return { connected: true };
    } catch (e: unknown) {
      return { connected: false, error: (e as Error).message };
    }
  },

  async collect(config): Promise<ConnectorOutput> {
    const apiKey = config.apiKey as string;
    const orgId = config.orgId as string;
    const signals: Record<string, number> = {};
    const diagnostics: DiagnosticEntry[] = [];

    // Attempt cost API (requires Admin key + org)
    try {
      const now = Math.floor(Date.now() / 1000);
      const thirtyDaysAgo = now - 30 * 86400;
      const costData = (await oaiFetch(
        `/v1/organization/costs?start_time=${thirtyDaysAgo}&end_time=${now}&group_by=model`,
        apiKey,
        orgId,
      )) as Record<string, unknown>;

      const buckets = (costData.data as Array<Record<string, unknown>>) || [];
      let totalCost = 0;
      for (const bucket of buckets) {
        const results = (bucket.results as Array<Record<string, unknown>>) || [];
        for (const result of results) {
          const amount = result.amount as Record<string, number>;
          if (amount?.value != null) totalCost += amount.value;
        }
      }

      if (totalCost > 0) {
        signals.total_ai_cost = totalCost;
        diagnostics.push({ key: 'monthly_cost', value: totalCost, label: 'OpenAI monthly cost ($)' });
        return {
          signals,
          diagnostics,
          connected: true,
          confidence: {
            sampleSize: buckets.length,
            timeWindowDays: 30,
            truncated: false,
            completeness: 'full',
          },
        };
      }
    } catch {
      diagnostics.push({
        key: 'cost_api_unavailable',
        value: 'skipped',
        label: 'Cost API requires Admin API key with organization costs permission',
      });
    }

    // Model count as validation diagnostic
    try {
      const models = (await oaiFetch('/v1/models', apiKey, orgId)) as Record<string, unknown>;
      const modelList = (models.data as Array<unknown>) || [];
      diagnostics.push({ key: 'models_available', value: modelList.length, label: 'Models available' });
    } catch {
      // Already validated
    }

    const modelDiag = diagnostics.find((d) => d.key === 'models_available');
    return {
      signals,
      diagnostics,
      connected: true,
      confidence: {
        sampleSize: modelDiag ? Number(modelDiag.value) : 0,
        timeWindowDays: 0,
        truncated: false,
        completeness: Object.keys(signals).length > 0 ? 'full' : 'minimal',
      },
    };
  },
};
