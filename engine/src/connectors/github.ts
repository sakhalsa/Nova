import { Connector, ConnectorOutput, DiagnosticEntry } from './types.js';
import { timedFetch } from './fetch-utils.js';
import { AiDetectionConfig, DEFAULT_AI_DETECTION } from '../types.js';

async function ghFetch(path: string, token: string): Promise<unknown> {
  const res = await timedFetch(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`GitHub ${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

function resolveDetection(config: Record<string, unknown>): Required<AiDetectionConfig> {
  const custom = config.aiDetection as AiDetectionConfig | undefined;
  return {
    labels: (custom?.labels ?? DEFAULT_AI_DETECTION.labels).map((l) => l.toLowerCase()),
    branchPatterns: (custom?.branchPatterns ?? DEFAULT_AI_DETECTION.branchPatterns).map((p) => p.toLowerCase()),
    titlePatterns: (custom?.titlePatterns ?? DEFAULT_AI_DETECTION.titlePatterns).map((p) => p.toLowerCase()),
  };
}

function isAiPr(pr: Record<string, unknown>, detection: Required<AiDetectionConfig>): boolean {
  const labels = ((pr.labels as Array<Record<string, string>>) || []).map((l) =>
    l.name?.toLowerCase(),
  );
  if (labels.some((l) => detection.labels.includes(l))) return true;

  const branch = ((pr.head as Record<string, unknown>)?.ref as string || '').toLowerCase();
  if (detection.branchPatterns.some((p) => branch.startsWith(p))) return true;

  const title = ((pr.title as string) || '').toLowerCase();
  if (detection.titlePatterns.some((p) => title.includes(p))) return true;

  return false;
}

export const githubConnector: Connector = {
  name: 'github',
  dimensions: ['Q', 'L', 'C', 'S'],
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
    const detection = resolveDetection(config);
    const diagnostics: DiagnosticEntry[] = [];
    const signals: Record<string, number> = {};

    let totalPrs = 0;
    let aiPrs = 0;
    let nonAiPrs = 0;
    let aiCycleSum = 0;
    let nonAiCycleSum = 0;
    let reworkCount = 0;
    let totalChanges = 0;
    let aiChanges = 0;
    let paginationCapped = false;

    for (const repo of repos) {
      try {
        const prs = (await ghFetch(
          `/repos/${org}/${repo}/pulls?state=closed&per_page=100&sort=updated&direction=desc`,
          token,
        )) as Array<Record<string, unknown>>;

        if (prs.length >= 100) paginationCapped = true;

        const merged = prs.filter((pr) => pr.merged_at);
        totalPrs += merged.length;

        for (const pr of merged) {
          const isAi = isAiPr(pr, detection);
          const created = new Date(pr.created_at as string).getTime();
          const mergedAt = new Date(pr.merged_at as string).getTime();
          const cycleHours = (mergedAt - created) / 3_600_000;
          const changes = ((pr.additions as number) || 0) + ((pr.deletions as number) || 0);
          totalChanges += changes;

          if (isAi) {
            aiPrs++;
            aiCycleSum += cycleHours;
            aiChanges += changes;
            const title = ((pr.title as string) || '').toLowerCase();
            if (title.includes('revert')) reworkCount++;
          } else {
            nonAiPrs++;
            nonAiCycleSum += cycleHours;
          }
        }
      } catch {
        diagnostics.push({ key: `repo_error_${repo}`, value: 'fetch failed', label: `Failed to fetch PRs for ${repo}` });
      }
    }

    if (aiPrs > 0) {
      signals.rework_rate_ai = reworkCount / aiPrs;
      signals.cycle_time_ai = aiCycleSum / aiPrs;
    }
    if (nonAiPrs > 0) {
      signals.cycle_time_nonai = nonAiCycleSum / nonAiPrs;
    }

    if (aiPrs > 0 && nonAiPrs > 0) {
      const avgNonAiHours = nonAiCycleSum / nonAiPrs;
      const avgAiHours = aiCycleSum / aiPrs;
      const hoursSavedPerPr = Math.max(avgNonAiHours - avgAiHours, 0);
      signals.hours_saved_monthly = hoursSavedPerPr * aiPrs;
      signals.review_overhead_hours_monthly = 0.5 * aiPrs;
    }

    // S-score signals: aggregate across all repos
    const dependabotScores: number[] = [];
    const codeScanScores: number[] = [];
    const secretScanScores: number[] = [];

    for (const repo of repos) {
      try {
        const alerts = (await ghFetch(
          `/repos/${org}/${repo}/dependabot/alerts?state=open&per_page=100`,
          token,
        )) as Array<unknown>;
        const criticalCount = (alerts as Array<Record<string, Record<string, string>>>).filter(
          (a) => a.security_vulnerability?.severity === 'critical',
        ).length;
        dependabotScores.push(Math.max(1 - criticalCount * 0.1, 0));
      } catch {
        // Dependabot may not be enabled for this repo
      }

      try {
        const scanAlerts = (await ghFetch(
          `/repos/${org}/${repo}/code-scanning/alerts?state=open&per_page=100`,
          token,
        )) as Array<unknown>;
        const highCount = (scanAlerts as Array<Record<string, Record<string, string>>>).filter(
          (a) => a.rule?.severity === 'error' || a.rule?.severity === 'critical',
        ).length;
        codeScanScores.push(Math.max(1 - highCount * 0.05, 0));
      } catch {
        // Code scanning may not be enabled for this repo
      }

      try {
        const secretAlerts = (await ghFetch(
          `/repos/${org}/${repo}/secret-scanning/alerts?state=open&per_page=100`,
          token,
        )) as Array<unknown>;
        const activeCount = (secretAlerts as Array<Record<string, unknown>>).length;
        // Each open secret is severe: exposed credentials are binary risk.
        // 0.2 penalty per alert floors at 0.
        secretScanScores.push(Math.max(1 - activeCount * 0.2, 0));
      } catch {
        // Secret scanning requires GHAS or public repo
      }
    }

    if (dependabotScores.length > 0) {
      signals.dependabot_score = Math.min(...dependabotScores);
    }
    if (codeScanScores.length > 0) {
      signals.code_scanning_score = Math.min(...codeScanScores);
    }
    if (secretScanScores.length > 0) {
      signals.secret_scanning_score = Math.min(...secretScanScores);
    }

    diagnostics.push(
      { key: 'total_prs', value: totalPrs, label: 'Total merged PRs analyzed' },
      { key: 'ai_prs', value: aiPrs, label: 'AI-detected PRs' },
      { key: 'non_ai_prs', value: nonAiPrs, label: 'Non-AI PRs' },
      { key: 'ai_detection_methods', value: `labels:${detection.labels.join(',')} branches:${detection.branchPatterns.join(',')} titles:${detection.titlePatterns.join(',')}`, label: 'AI detection patterns' },
    );

    if (paginationCapped) {
      diagnostics.push({
        key: 'pagination_warning',
        value: 'capped at 100 PRs per repo',
        label: 'Sample limited to most recent 100 closed PRs per repo. Results may not reflect full history.',
      });
    }

    if (aiPrs === 0 && totalPrs > 0) {
      diagnostics.push({
        key: 'no_ai_detected',
        value: 'zero AI PRs found',
        label: 'No PRs matched AI detection patterns. Add labels (ai-generated, copilot, cursor) or configure aiDetection in GitHub config.',
      });
    }

    if (dependabotScores.length > 0) {
      diagnostics.push({ key: 'dependabot_repos', value: dependabotScores.length, label: 'Repos with Dependabot data' });
    }
    if (codeScanScores.length > 0) {
      diagnostics.push({ key: 'code_scanning_repos', value: codeScanScores.length, label: 'Repos with code scanning data' });
    }
    if (secretScanScores.length > 0) {
      diagnostics.push({ key: 'secret_scanning_repos', value: secretScanScores.length, label: 'Repos with secret scanning data' });
    }

    return {
      signals,
      diagnostics,
      connected: true,
      confidence: {
        sampleSize: totalPrs,
        timeWindowDays: 30,
        truncated: paginationCapped,
        completeness: paginationCapped ? 'partial' : 'full',
      },
    };
  },
};
