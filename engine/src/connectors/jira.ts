import { Connector, ConnectorOutput, DiagnosticEntry } from './types.js';
import { timedFetch } from './fetch-utils.js';

const AI_LABELS = ['ai-generated', 'ai-assisted', 'ai', 'copilot', 'cursor', 'claude'];

async function jiraFetch(domain: string, path: string, email: string, token: string): Promise<unknown> {
  const res = await timedFetch(`https://${domain}.atlassian.net${path}`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Jira ${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

export const jiraConnector: Connector = {
  name: 'jira',
  dimensions: ['L'],
  requiredCredentials: ['domain', 'email', 'apiToken', 'projectKey'],

  async validate(config) {
    try {
      await jiraFetch(
        config.domain as string,
        '/rest/api/3/myself',
        config.email as string,
        config.apiToken as string,
      );
      return { connected: true };
    } catch (e: unknown) {
      return { connected: false, error: (e as Error).message };
    }
  },

  async collect(config): Promise<ConnectorOutput> {
    const domain = config.domain as string;
    const email = config.email as string;
    const token = config.apiToken as string;
    const projectKey = config.projectKey as string;
    const signals: Record<string, number> = {};
    const diagnostics: DiagnosticEntry[] = [];

    try {
      const jql = encodeURIComponent(
        `project=${projectKey} AND status=Done AND resolved >= -30d ORDER BY resolved DESC`,
      );
      const data = (await jiraFetch(
        domain,
        `/rest/api/3/search?jql=${jql}&maxResults=100&fields=created,resolutiondate,labels`,
        email,
        token,
      )) as Record<string, unknown>;
      const issues = (data.issues as Array<Record<string, unknown>>) || [];

      let aiCount = 0;
      let nonAiCount = 0;
      let aiCycleSum = 0;
      let nonAiCycleSum = 0;

      for (const issue of issues) {
        const fields = issue.fields as Record<string, unknown>;
        if (!fields?.resolutiondate || !fields?.created) continue;
        const labels = ((fields.labels as string[]) || []).map((l) => l.toLowerCase());
        const isAi = labels.some((l) => AI_LABELS.includes(l));
        const created = new Date(fields.created as string).getTime();
        const resolved = new Date(fields.resolutiondate as string).getTime();
        const cycleHours = (resolved - created) / 3_600_000;

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
        { key: 'total_issues', value: issues.length, label: 'Resolved issues (30d)' },
        { key: 'ai_issues', value: aiCount, label: 'AI-labeled issues' },
        { key: 'non_ai_issues', value: nonAiCount, label: 'Non-AI issues' },
      );
    } catch {
      diagnostics.push({ key: 'jira_error', value: 'failed', label: 'Jira fetch failed' });
    }

    return { signals, diagnostics, connected: true };
  },
};
