import { Connector, ConnectorOutput, DiagnosticEntry } from './types.js';
import { timedFetch } from './fetch-utils.js';

const AI_LABELS = ['ai-generated', 'ai-assisted', 'ai', 'copilot', 'cursor', 'claude'];

export const linearConnector: Connector = {
  name: 'linear',
  dimensions: ['L'],
  requiredCredentials: ['apiKey'],

  async validate(config) {
    try {
      const res = await timedFetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
          Authorization: config.apiKey as string,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: '{ viewer { id name } }' }),
      });
      if (!res.ok) return { connected: false, error: `Linear: ${res.status}` };
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
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString();
      const query = `{
        issues(filter: { completedAt: { gte: "${thirtyDaysAgo}" } }, first: 100) {
          nodes {
            createdAt
            completedAt
            labels { nodes { name } }
          }
        }
      }`;

      const res = await timedFetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const data = (await res.json()) as Record<string, unknown>;
      const gqlErrors = data.errors as Array<{ message?: string }> | undefined;
      if (Array.isArray(gqlErrors) && gqlErrors.length > 0) {
        diagnostics.push({
          key: 'linear_graphql_errors',
          value: gqlErrors.map((e) => e.message).join('; '),
          label: 'Linear GraphQL errors',
        });
        return { signals, diagnostics, connected: false };
      }
      const issues =
        ((data.data as Record<string, unknown>)?.issues as Record<string, unknown>)?.nodes as Array<
          Record<string, unknown>
        > || [];

      let aiCount = 0;
      let nonAiCount = 0;
      let aiCycleSum = 0;
      let nonAiCycleSum = 0;

      for (const issue of issues) {
        if (!issue.completedAt || !issue.createdAt) continue;
        const labels = (
          (issue.labels as Record<string, Array<Record<string, string>>>)?.nodes || []
        ).map((l) => l.name?.toLowerCase());
        const isAi = labels.some((l) => AI_LABELS.includes(l));
        const created = new Date(issue.createdAt as string).getTime();
        const completed = new Date(issue.completedAt as string).getTime();
        const cycleHours = (completed - created) / 3_600_000;

        if (isAi) {
          aiCount++;
          aiCycleSum += cycleHours;
        } else {
          nonAiCount++;
          nonAiCycleSum += cycleHours;
        }
      }

      if (aiCount > 0) signals.cycle_time_ai = aiCycleSum / aiCount;
      if (nonAiCount > 0) signals.cycle_time_nonai = nonAiCycleSum / nonAiCount;

      diagnostics.push(
        { key: 'total_issues', value: issues.length, label: 'Completed issues (30d)' },
        { key: 'ai_issues', value: aiCount, label: 'AI-labeled issues' },
        { key: 'non_ai_issues', value: nonAiCount, label: 'Non-AI issues' },
      );
      return {
        signals,
        diagnostics,
        connected: true,
        confidence: {
          sampleSize: issues.length,
          timeWindowDays: 30,
          truncated: issues.length >= 100,
          completeness: issues.length >= 100 ? 'partial' : 'full',
        },
      };
    } catch {
      diagnostics.push({ key: 'linear_error', value: 'failed', label: 'Linear fetch failed' });
    }

    return { signals, diagnostics, connected: false };
  },
};
