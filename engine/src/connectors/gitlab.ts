import { Connector, ConnectorOutput, DiagnosticEntry } from './types.js';
import { timedFetch } from './fetch-utils.js';

async function glFetch(path: string, token: string): Promise<unknown> {
  const res = await timedFetch(`https://gitlab.com/api/v4${path}`, {
    headers: { 'PRIVATE-TOKEN': token },
  });
  if (!res.ok) throw new Error(`GitLab ${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

const AI_LABELS = ['ai-generated', 'ai-assisted', 'copilot'];

export const gitlabConnector: Connector = {
  name: 'gitlab',
  dimensions: ['Q', 'L', 'C'],
  requiredCredentials: ['token', 'projectId'],

  async validate(config) {
    try {
      await glFetch(`/projects/${config.projectId}`, config.token as string);
      return { connected: true };
    } catch (e: unknown) {
      return { connected: false, error: (e as Error).message };
    }
  },

  async collect(config): Promise<ConnectorOutput> {
    const token = config.token as string;
    const projectId = config.projectId as string;
    const signals: Record<string, number> = {};
    const diagnostics: DiagnosticEntry[] = [];

    try {
      const mrs = (await glFetch(
        `/projects/${projectId}/merge_requests?state=merged&per_page=100&order_by=updated_at&sort=desc`,
        token,
      )) as Array<Record<string, unknown>>;

      let aiCount = 0;
      let nonAiCount = 0;
      let aiCycleSum = 0;
      let nonAiCycleSum = 0;
      let reworkCount = 0;

      for (const mr of mrs) {
        const labels = ((mr.labels as string[]) || []).map((l) => l.toLowerCase());
        const isAi = labels.some((l) => AI_LABELS.includes(l));
        const created = new Date(mr.created_at as string).getTime();
        const merged = new Date(mr.merged_at as string).getTime();
        const cycleHours = (merged - created) / 3_600_000;

        if (isAi) {
          aiCount++;
          aiCycleSum += cycleHours;
          const title = ((mr.title as string) || '').toLowerCase();
          if (title.includes('revert')) reworkCount++;
        } else {
          nonAiCount++;
          nonAiCycleSum += cycleHours;
        }
      }

      if (aiCount > 0) {
        signals.rework_rate_ai = reworkCount / aiCount;
        signals.cycle_time_ai = aiCycleSum / aiCount;
      }
      if (nonAiCount > 0) {
        signals.cycle_time_nonai = nonAiCycleSum / nonAiCount;
      }

      // Labor estimation
      if (aiCount > 0 && nonAiCount > 0) {
        const avgNonAi = nonAiCycleSum / nonAiCount;
        const avgAi = aiCycleSum / aiCount;
        const hoursSavedPerMr = Math.max(avgNonAi - avgAi, 0);
        signals.hours_saved_monthly = hoursSavedPerMr * aiCount;
        signals.review_overhead_hours_monthly = 0.5 * aiCount;
      }

      diagnostics.push(
        { key: 'total_mrs', value: mrs.length, label: 'Total merged MRs analyzed' },
        { key: 'ai_mrs', value: aiCount, label: 'AI-labeled MRs' },
        { key: 'non_ai_mrs', value: nonAiCount, label: 'Non-AI MRs' },
      );
      return {
        signals,
        diagnostics,
        connected: true,
        confidence: {
          sampleSize: mrs.length,
          timeWindowDays: 30,
          truncated: mrs.length >= 100,
          completeness: mrs.length >= 100 ? 'partial' : 'full',
        },
      };
    } catch {
      diagnostics.push({ key: 'gitlab_error', value: 'failed', label: 'GitLab MR fetch failed' });
    }

    return { signals, diagnostics, connected: false };
  },
};
