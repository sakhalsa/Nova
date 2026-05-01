import { Connector, ConnectorOutput, DiagnosticEntry } from './types.js';
import { timedFetch } from './fetch-utils.js';

async function ghFetch(path: string, token: string): Promise<unknown> {
  const res = await timedFetch(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`GitHub Actions ${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

export const githubActionsConnector: Connector = {
  name: 'github_actions',
  dimensions: ['L'],
  requiredCredentials: ['token', 'org', 'repos'],

  async validate(config) {
    try {
      await ghFetch(`/orgs/${config.org}`, config.token as string);
      return { connected: true };
    } catch (e: unknown) {
      return { connected: false, error: (e as Error).message };
    }
  },

  async collect(config): Promise<ConnectorOutput> {
    const token = config.token as string;
    const org = config.org as string;
    const repos = config.repos as string[];
    const signals: Record<string, number> = {};
    const diagnostics: DiagnosticEntry[] = [];

    let totalRuns = 0;
    let successRuns = 0;
    const dailyDeploys = new Set<string>();

    for (const repo of repos) {
      try {
        const data = (await ghFetch(
          `/repos/${org}/${repo}/actions/runs?per_page=100&status=completed`,
          token,
        )) as Record<string, unknown>;
        const runs = (data.workflow_runs as Array<Record<string, unknown>>) || [];

        const thirtyDaysAgo = Date.now() - 30 * 86_400_000;

        for (const run of runs) {
          const createdAt = new Date(run.created_at as string).getTime();
          if (createdAt < thirtyDaysAgo) continue;

          totalRuns++;
          if (run.conclusion === 'success') successRuns++;

          const dateKey = (run.created_at as string).slice(0, 10);
          dailyDeploys.add(`${repo}:${dateKey}`);
        }
      } catch {
        diagnostics.push({ key: `actions_error_${repo}`, value: 'fetch failed', label: `Failed to fetch workflow runs for ${repo}` });
      }
    }

    if (totalRuns > 0) {
      signals.deploy_frequency = totalRuns / 30;
      diagnostics.push(
        { key: 'workflow_runs_30d', value: totalRuns, label: 'Workflow runs (30d)' },
        { key: 'success_rate', value: successRuns / totalRuns, label: 'Workflow success rate' },
        { key: 'deploy_freq_per_day', value: signals.deploy_frequency, label: 'Deploys per day' },
      );
    }

    return {
      signals,
      diagnostics,
      connected: true,
      confidence: {
        sampleSize: totalRuns,
        timeWindowDays: 30,
        truncated: false,
        completeness: totalRuns > 0 ? 'full' : 'minimal',
      },
    };
  },
};
