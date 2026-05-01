import { Connector, ConnectorOutput, DiagnosticEntry } from './types.js';
import { timedFetch } from './fetch-utils.js';

async function cfFetch(path: string, token: string): Promise<unknown> {
  const res = await timedFetch(`https://api.cloudflare.com/client/v4${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Cloudflare ${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

async function cfGraphQL(token: string, query: string): Promise<unknown> {
  const res = await timedFetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Cloudflare GraphQL: ${res.status} ${res.statusText}`);
  return res.json();
}

export const cloudflareConnector: Connector = {
  name: 'cloudflare',
  dimensions: ['R', 'S'],
  requiredCredentials: ['apiToken', 'zoneId'],

  async validate(config) {
    try {
      await cfFetch('/user/tokens/verify', config.apiToken as string);
      return { connected: true };
    } catch (e: unknown) {
      return { connected: false, error: (e as Error).message };
    }
  },

  async collect(config): Promise<ConnectorOutput> {
    const token = config.apiToken as string;
    const zoneId = config.zoneId as string;
    const signals: Record<string, number> = {};
    const diagnostics: DiagnosticEntry[] = [];
    let totalRequests = 0;

    // R-score: uptime from HTTP status analytics
    try {
      const data = (await cfFetch(
        `/zones/${zoneId}/analytics/dashboard?since=-10080&continuous=true`,
        token,
      )) as Record<string, unknown>;
      const result = data.result as Record<string, unknown>;
      const totals = result?.totals as Record<string, unknown>;
      const requests = totals?.requests as Record<string, unknown>;
      const httpStatus = requests?.http_status as Record<string, number>;

      if (httpStatus) {
        let total = 0;
        let errors = 0;
        for (const [code, count] of Object.entries(httpStatus)) {
          total += count;
          if (parseInt(code) >= 500) errors += count;
        }
        totalRequests = total;
        const errorRate = total > 0 ? errors / total : 0;
        signals.uptime_ai = Math.max(Math.min(1 - errorRate, 1), 0);

        diagnostics.push(
          { key: 'total_requests_7d', value: total, label: 'Total requests (7d)' },
          { key: 'error_requests_7d', value: errors, label: '5xx errors (7d)' },
          { key: 'error_rate', value: errorRate, label: 'Error rate' },
        );
      }
    } catch {
      diagnostics.push({ key: 'cloudflare_analytics_error', value: 'failed', label: 'Cloudflare analytics failed' });
    }

    // S-score: WAF/firewall events via GraphQL Analytics
    try {
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const query = `{
        viewer {
          zones(filter: {zoneTag: "${zoneId}"}) {
            firewallEventsAdaptiveGroups(
              filter: {datetime_gt: "${since}"},
              limit: 1,
              orderBy: [count_DESC]
            ) {
              count
              dimensions { action }
            }
          }
        }
      }`;
      const gqlData = (await cfGraphQL(token, query)) as Record<string, unknown>;
      const data = gqlData.data as Record<string, unknown> | undefined;
      const viewer = data?.viewer as Record<string, unknown> | undefined;
      const zones = (viewer?.zones as Array<Record<string, unknown>>) || [];
      const groups = (zones[0]?.firewallEventsAdaptiveGroups as Array<Record<string, unknown>>) || [];

      let blocked = 0;
      for (const group of groups) {
        const dims = group.dimensions as Record<string, string> | undefined;
        const action = dims?.action || '';
        if (action === 'block' || action === 'challenge' || action === 'managed_challenge') {
          blocked += (group.count as number) || 0;
        }
      }

      // Threat ratio: blocked requests / total requests.
      // Lower is better. Score: 1.0 at 0% threats, 0.0 at 10%+ threats.
      if (totalRequests > 0) {
        const threatRatio = blocked / totalRequests;
        signals.code_scanning_score = Math.max(1 - threatRatio * 10, 0);
        diagnostics.push(
          { key: 'waf_blocked_7d', value: blocked, label: 'WAF blocked/challenged requests (7d)' },
          { key: 'threat_ratio', value: threatRatio, label: 'Threat ratio (blocked/total)' },
        );
      }
    } catch {
      diagnostics.push({ key: 'cloudflare_waf_error', value: 'failed', label: 'Cloudflare WAF analytics failed. Ensure token has Analytics:Read permission.' });
    }

    return {
      signals,
      diagnostics,
      connected: Object.keys(signals).length > 0,
      confidence: {
        sampleSize: totalRequests,
        timeWindowDays: 7,
        truncated: false,
        completeness: totalRequests > 0 ? 'full' : 'minimal',
      },
    };
  },
};
