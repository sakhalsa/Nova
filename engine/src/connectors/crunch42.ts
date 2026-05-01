import { Connector, ConnectorOutput, DiagnosticEntry } from './types.js';
import { timedFetch } from './fetch-utils.js';

const API_BASE = 'https://platform.42crunch.com/api/v2';

async function crunchFetch(path: string, token: string, base?: string): Promise<unknown> {
  const res = await timedFetch(`${(base || API_BASE).replace(/\/$/, '')}${path}`, {
    headers: { 'X-API-KEY': token, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`42Crunch ${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

export const crunch42Connector: Connector = {
  name: 'crunch42',
  dimensions: ['S'],
  requiredCredentials: ['apiToken'],

  async validate(config) {
    try {
      await crunchFetch('/apis', config.apiToken as string, config.apiBase as string);
      return { connected: true };
    } catch (e: unknown) {
      return { connected: false, error: (e as Error).message };
    }
  },

  async collect(config): Promise<ConnectorOutput> {
    const token = config.apiToken as string;
    const base = config.apiBase as string;
    const signals: Record<string, number> = {};
    const diagnostics: DiagnosticEntry[] = [];

    try {
      // If a spec URL or JSON is provided, create/update the API first
      let apiId: string | undefined;

      if (config.specUrl || config.specJson) {
        const specContent = config.specJson || (await (await timedFetch(config.specUrl as string)).text());
        const createRes = await timedFetch(`${(base || API_BASE).replace(/\/$/, '')}/apis`, {
          method: 'POST',
          headers: { 'X-API-KEY': token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ specfile: specContent }),
        });
        if (createRes.ok) {
          const created = (await createRes.json()) as Record<string, unknown>;
          const desc = created.desc as Record<string, string> | undefined;
          apiId = desc?.id || (created.id as string);
        }
      }

      // List APIs and get assessment scores
      const apisData = (await crunchFetch('/apis?perPage=50', token, base)) as Record<string, unknown>;
      const apis = (apisData.list as Array<Record<string, unknown>>) || [];

      if (apis.length === 0) {
        diagnostics.push({ key: 'no_apis', value: 0, label: 'No APIs found in 42Crunch' });
        return { signals, diagnostics, connected: true };
      }

      let totalScore = 0;
      let count = 0;

      for (const api of apis) {
        const assessment = api.assessment as Record<string, unknown>;
        if (assessment) {
          const grade = (assessment.grade as number) || 0;
          totalScore += grade / 100;
          count++;
        }
      }

      if (count > 0) {
        signals.spec_security_score = totalScore / count;
        diagnostics.push(
          { key: 'apis_assessed', value: count, label: 'APIs with security assessment' },
          { key: 'avg_security_score', value: signals.spec_security_score, label: 'Average security score (0-1)' },
        );
      }
    } catch {
      diagnostics.push({ key: 'crunch42_error', value: 'failed', label: '42Crunch assessment failed' });
    }

    return { signals, diagnostics, connected: true };
  },
};
