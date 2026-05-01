import { Connector, ConnectorOutput, DiagnosticEntry } from './types.js';
import { timedFetch } from './fetch-utils.js';

function flattenItems(items: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const item of items) {
    if (item.item) {
      out.push(...flattenItems(item.item as Array<Record<string, unknown>>));
    } else {
      out.push(item);
    }
  }
  return out;
}

async function pmFetch(path: string, apiKey: string): Promise<unknown> {
  const res = await timedFetch(`https://api.getpostman.com${path}`, {
    headers: { 'X-Api-Key': apiKey },
  });
  if (!res.ok) throw new Error(`Postman ${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

export const postmanConnector: Connector = {
  name: 'postman',
  dimensions: ['Q', 'R'],
  requiredCredentials: ['apiKey', 'workspaceId'],

  async validate(config) {
    try {
      await pmFetch('/me', config.apiKey as string);
      return { connected: true };
    } catch (e: unknown) {
      return { connected: false, error: (e as Error).message };
    }
  },

  async collect(config): Promise<ConnectorOutput> {
    const apiKey = config.apiKey as string;
    const workspaceId = config.workspaceId as string;
    const signals: Record<string, number> = {};
    const diagnostics: DiagnosticEntry[] = [];
    let hadSuccess = false;

    // Collections in workspace for test coverage
    try {
      const wsData = (await pmFetch(`/workspaces/${workspaceId}`, apiKey)) as Record<string, unknown>;
      hadSuccess = true;
      const ws = wsData.workspace as Record<string, unknown>;
      const collections = (ws?.collections as Array<Record<string, unknown>>) || [];
      diagnostics.push({ key: 'collection_count', value: collections.length, label: 'Collections in workspace' });
    } catch {
      diagnostics.push({ key: 'workspace_error', value: 'failed', label: 'Failed to fetch workspace' });
    }

    // Monitors for SLO and contract catch rate
    try {
      const monData = (await pmFetch('/monitors', apiKey)) as Record<string, unknown>;
      hadSuccess = true;
      const monitors = (monData.monitors as Array<Record<string, unknown>>) || [];
      const wsMonitors = monitors.filter((m) => {
        const col = m.collectionUid as string;
        return col && col.includes(workspaceId.split('-')[0]);
      });

      let totalRuns = 0;
      let passedRuns = 0;
      let contractChecks = 0;
      let contractPasses = 0;

      for (const mon of wsMonitors.slice(0, 10)) {
        try {
          const detail = (await pmFetch(`/monitors/${mon.uid}`, apiKey)) as Record<string, unknown>;
          hadSuccess = true;
          const monitor = detail.monitor as Record<string, unknown>;
          const lastRun = monitor?.lastRun as Record<string, unknown>;
          if (lastRun) {
            totalRuns++;
            const stats = lastRun.stats as Record<string, Record<string, number>>;
            if (stats?.assertions) {
              contractChecks += stats.assertions.total || 0;
              contractPasses += stats.assertions.total - (stats.assertions.failed || 0);
            }
            if ((stats?.assertions?.failed || 0) === 0) passedRuns++;
          }
        } catch {
          // Individual monitor fetch may fail
        }
      }

      if (totalRuns > 0) {
        signals.slo_attainment = passedRuns / totalRuns;
        diagnostics.push({ key: 'monitor_pass_rate', value: signals.slo_attainment, label: 'Monitor SLO attainment' });
      }

      if (contractChecks > 0) {
        signals.contract_catch_rate = contractPasses / contractChecks;
        diagnostics.push({ key: 'contract_catch', value: signals.contract_catch_rate, label: 'Contract test catch rate' });
      }
    } catch {
      diagnostics.push({ key: 'monitor_error', value: 'failed', label: 'Failed to fetch monitors' });
    }

    // Test coverage + runtime validation + error contract depth from collections
    try {
      const envData = (await pmFetch(`/workspaces/${workspaceId}`, apiKey)) as Record<string, unknown>;
      hadSuccess = true;
      const ws = envData.workspace as Record<string, unknown>;
      const collections = (ws?.collections as Array<Record<string, unknown>>) || [];
      let withTests = 0;
      let retryAfterPresent = 0;
      let idempotencyKeyPresent = 0;
      let errorRecoveryPresent = 0;
      let errorContractDepthHits = 0;
      let totalResponses = 0;
      let totalErrorResponses = 0;
      let mutatingOps = 0;

      for (const col of collections) {
        try {
          const colDetail = (await pmFetch(`/collections/${col.uid}`, apiKey)) as Record<string, unknown>;
          hadSuccess = true;
          const collection = colDetail.collection as Record<string, unknown>;
          const items = flattenItems((collection?.item as Array<Record<string, unknown>>) || []);

          for (const item of items) {
            const events = (item.event as Array<Record<string, unknown>>) || [];
            const hasTests = events.some((e) => e.listen === 'test');
            if (hasTests) { withTests++; break; }
          }

          for (const item of items) {
            const req = item.request as Record<string, unknown> | undefined;
            if (!req) continue;
            const method = ((req.method as string) || 'GET').toUpperCase();

            totalResponses++;

            if (['POST', 'PUT', 'PATCH'].includes(method)) {
              mutatingOps++;
              const headers = (req.header as Array<Record<string, string>>) || [];
              if (headers.some(h => /idempoten/i.test(h.key || '') || /idempoten/i.test(h.value || ''))) {
                idempotencyKeyPresent++;
              }
            }

            const responses = (item.response as Array<Record<string, unknown>>) || [];
            for (const resp of responses) {
              const code = resp.code as number || 0;
              const respHeaders = (resp.header as Array<Record<string, string>>) || [];
              const bodyStr = (resp.body as string) || '';

              if (code === 429 || code === 503) {
                if (respHeaders.some(h => /retry-after/i.test(h.key || ''))) {
                  retryAfterPresent++;
                }
              }

              if (code >= 400) {
                totalErrorResponses++;
                const hasActionable = /retry_after|retry_seconds|action|error_code|remediation/i.test(bodyStr);
                if (hasActionable) {
                  errorRecoveryPresent++;
                  errorContractDepthHits++;
                }
              }
            }
          }
        } catch {
          // skip individual collection
        }
      }

      if (collections.length > 0) {
        signals.ai_test_pass_rate = withTests / collections.length;
        diagnostics.push({ key: 'test_coverage', value: signals.ai_test_pass_rate, label: 'Collections with test scripts' });
      }

      if (totalResponses > 0) {
        const retryScore = retryAfterPresent > 0 ? 1.0 : 0.0;
        signals.runtime_retry_behavior = retryScore;
        diagnostics.push({ key: 'runtime_retry_behavior', value: retryScore, label: 'APIs with Retry-After headers' });
      }

      if (mutatingOps > 0) {
        signals.runtime_idempotency = idempotencyKeyPresent / mutatingOps;
        diagnostics.push({ key: 'runtime_idempotency', value: signals.runtime_idempotency, label: 'Mutating ops with idempotency keys' });
      }

      if (totalErrorResponses > 0) {
        signals.error_recovery_quality = errorRecoveryPresent / totalErrorResponses;
        diagnostics.push({ key: 'error_recovery_quality', value: signals.error_recovery_quality, label: 'Errors with machine-actionable recovery' });

        signals.error_contract_depth = errorContractDepthHits / totalErrorResponses;
        diagnostics.push({ key: 'error_contract_depth', value: signals.error_contract_depth, label: 'Error contract depth (actionable fields)' });
      }
    } catch {
      // skip
    }

    return {
      signals,
      diagnostics,
      connected: hadSuccess,
      confidence: {
        sampleSize: diagnostics.find((d) => d.key === 'collection_count')
          ? Number(diagnostics.find((d) => d.key === 'collection_count')?.value)
          : 0,
        timeWindowDays: 0,
        truncated: false,
        completeness: hadSuccess ? 'partial' : 'minimal',
      },
    };
  },
};
