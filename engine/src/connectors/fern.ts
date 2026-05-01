import { Connector, ConnectorOutput, DiagnosticEntry } from './types.js';
import { timedFetch } from './fetch-utils.js';

const API_BASE = 'https://api.buildwithfern.com';

async function fernFetch(path: string, token: string): Promise<unknown> {
  const res = await timedFetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Fern ${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

export const fernConnector: Connector = {
  name: 'fern',
  dimensions: ['Q'],
  requiredCredentials: ['token', 'orgId'],

  async validate(config) {
    try {
      await fernFetch(`/api/organizations/${config.orgId}`, config.token as string);
      return { connected: true };
    } catch (e: unknown) {
      return { connected: false, error: (e as Error).message };
    }
  },

  async collect(config): Promise<ConnectorOutput> {
    const token = config.token as string;
    const orgId = config.orgId as string;
    const signals: Record<string, number> = {};
    const diagnostics: DiagnosticEntry[] = [];

    try {
      const apisData = (await fernFetch(
        `/api/organizations/${orgId}/apis`,
        token,
      )) as Array<Record<string, unknown>>;

      if (apisData.length === 0) {
        diagnostics.push({ key: 'no_apis', value: 0, label: 'No APIs found in Fern organization' });
        return { signals, diagnostics, connected: true };
      }

      let totalScore = 0;
      let count = 0;

      for (const api of apisData) {
        const readiness = api.agentReadinessScore as number | undefined;
        if (readiness !== undefined && readiness !== null) {
          totalScore += readiness;
          count++;
        }
      }

      if (count > 0) {
        signals.agent_score = totalScore / count;
        diagnostics.push(
          { key: 'apis_assessed', value: count, label: 'APIs with agent readiness score' },
          { key: 'avg_agent_score', value: signals.agent_score, label: 'Average agent readiness score (0-100)' },
        );
      }
    } catch {
      diagnostics.push({ key: 'fern_error', value: 'failed', label: 'Fern API fetch failed' });
    }

    return { signals, diagnostics, connected: true };
  },
};
