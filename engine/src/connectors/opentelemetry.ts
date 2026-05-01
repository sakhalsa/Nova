import { Connector, ConnectorOutput, DiagnosticEntry } from './types.js';
import { timedFetch } from './fetch-utils.js';

async function promQuery(baseUrl: string, query: string, headers: Record<string, string>): Promise<unknown> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/v1/query?query=${encodeURIComponent(query)}&time=${Math.floor(Date.now() / 1000)}`;
  const res = await timedFetch(url, { headers: { ...headers, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`OTel Prometheus ${url}: ${res.status} ${res.statusText}`);
  return res.json();
}

function extractScalar(data: unknown): number | null {
  const result = ((data as Record<string, unknown>).data as Record<string, unknown>)?.result as Array<Record<string, unknown>> | undefined;
  if (!result || result.length === 0) return null;
  const val = parseFloat(((result[0].value as unknown[])?.[1] as string) || '');
  return isNaN(val) ? null : val;
}

function buildAuthHeaders(config: Record<string, unknown>): Record<string, string> {
  const headers: Record<string, string> = {};
  const bearerToken = config.bearerToken as string | undefined;
  const basicUser = config.basicUser as string | undefined;
  const basicPassword = config.basicPassword as string | undefined;

  if (bearerToken) {
    headers['Authorization'] = `Bearer ${bearerToken}`;
  } else if (basicUser && basicPassword) {
    headers['Authorization'] = `Basic ${Buffer.from(`${basicUser}:${basicPassword}`).toString('base64')}`;
  }
  return headers;
}

export const opentelemetryConnector: Connector = {
  name: 'opentelemetry',
  dimensions: ['R'],
  requiredCredentials: ['prometheusUrl'],

  async validate(config) {
    try {
      const baseUrl = (config.prometheusUrl as string).replace(/\/$/, '');
      const headers = buildAuthHeaders(config);
      const res = await timedFetch(`${baseUrl}/api/v1/status/buildinfo`, {
        headers: { ...headers, Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return { connected: true };
    } catch (e: unknown) {
      return { connected: false, error: (e as Error).message };
    }
  },

  async collect(config): Promise<ConnectorOutput> {
    const baseUrl = (config.prometheusUrl as string).replace(/\/$/, '');
    const headers = buildAuthHeaders(config);
    const serviceName = (config.serviceName as string) || '';
    const signals: Record<string, number> = {};
    const diagnostics: DiagnosticEntry[] = [];

    // OTel semantic convention metrics (stable since semconv 1.21+):
    //   http.server.request.duration (histogram)
    //   http.server.request.count (counter) - or derived from duration_count
    // Legacy metrics (pre-semconv): http_server_duration, http_server_request_count
    const errorMetric = (config.errorMetric as string) || 'http_server_request_duration_seconds_count';
    const durationMetric = (config.durationMetric as string) || 'http_server_request_duration_seconds_bucket';

    const svcFilter = serviceName ? `,service_name="${serviceName}"` : '';

    // 1. Error rate -> uptime_ai
    try {
      const errorRateQuery = `sum(rate(${errorMetric}{http_response_status_code=~"5.."${svcFilter}}[30d])) / sum(rate(${errorMetric}{${svcFilter ? svcFilter.slice(1) : ''}}[30d]))`;
      const errorRate = extractScalar(await promQuery(baseUrl, errorRateQuery, headers));

      if (errorRate !== null) {
        signals.uptime_ai = Math.max(1 - errorRate, 0);
        diagnostics.push(
          { key: 'error_rate_30d', value: errorRate, label: '30-day 5xx error rate' },
          { key: 'uptime_derived', value: signals.uptime_ai, label: 'Uptime (1 - error_rate)' },
        );
      }
    } catch {
      diagnostics.push({ key: 'error_rate_failed', value: 'failed', label: `Error rate query failed. Configure errorMetric if your metric name differs from ${errorMetric}.` });
    }

    // 2. Total request volume -> SLO attainment proxy
    // If no explicit SLO, use availability (error rate < 0.1%) as a proxy
    try {
      const totalQuery = `sum(increase(${errorMetric}{${svcFilter ? svcFilter.slice(1) : ''}}[30d]))`;
      const totalRequests = extractScalar(await promQuery(baseUrl, totalQuery, headers));

      if (totalRequests !== null && totalRequests > 0) {
        const errorQuery = `sum(increase(${errorMetric}{http_response_status_code=~"5.."${svcFilter}}[30d]))`;
        const errorRequests = extractScalar(await promQuery(baseUrl, errorQuery, headers));
        const errors = errorRequests ?? 0;

        const successRate = (totalRequests - errors) / totalRequests;
        signals.slo_attainment = Math.min(successRate, 1);

        diagnostics.push(
          { key: 'total_requests_30d', value: totalRequests, label: 'Total requests (30d)' },
          { key: 'error_requests_30d', value: errors, label: '5xx requests (30d)' },
          { key: 'success_rate', value: successRate, label: 'Success rate (SLO proxy)' },
        );
      }
    } catch {
      diagnostics.push({ key: 'slo_query_failed', value: 'failed', label: 'SLO attainment query failed' });
    }

    // 3. Change failure rate from deployment-correlated errors
    // Uses rate increase after recent changes vs baseline
    try {
      const recentRate = extractScalar(
        await promQuery(baseUrl, `sum(rate(${errorMetric}{http_response_status_code=~"5.."${svcFilter}}[7d]))`, headers),
      );
      const baselineRate = extractScalar(
        await promQuery(baseUrl, `sum(rate(${errorMetric}{http_response_status_code=~"5.."${svcFilter}}[30d]))`, headers),
      );

      if (recentRate !== null && baselineRate !== null && baselineRate > 0) {
        // If recent error rate is higher than baseline, changes are causing failures
        const cfrRatio = recentRate / baselineRate;
        // Normalize: ratio of 1.0 = no regression (cfr 0), ratio 2.0+ = serious regression (cfr 1.0)
        signals.cfr_ai = Math.min(Math.max(cfrRatio - 1, 0), 1.0);
        diagnostics.push(
          { key: 'recent_error_rate_7d', value: recentRate, label: 'Recent error rate (7d)' },
          { key: 'baseline_error_rate_30d', value: baselineRate, label: 'Baseline error rate (30d)' },
          { key: 'cfr_ratio', value: cfrRatio, label: 'Error rate trend (recent/baseline)' },
        );
      }
    } catch {
      diagnostics.push({ key: 'cfr_query_failed', value: 'failed', label: 'Change failure rate query failed' });
    }

    // 4. P95 latency (diagnostic only, not a formula signal)
    try {
      const p95Query = `histogram_quantile(0.95, sum(rate(${durationMetric}{${svcFilter ? svcFilter.slice(1) : ''}}[30d])) by (le))`;
      const p95 = extractScalar(await promQuery(baseUrl, p95Query, headers));
      if (p95 !== null) {
        diagnostics.push({ key: 'p95_latency_ms', value: p95 * 1000, label: 'P95 latency (ms, 30d)' });
      }
    } catch {
      diagnostics.push({ key: 'p95_query_failed', value: 'failed', label: 'P95 latency query failed' });
    }

    return {
      signals,
      diagnostics,
      connected: Object.keys(signals).length > 0,
      confidence: {
        sampleSize: Object.keys(signals).length > 0 ? 30 : 0,
        timeWindowDays: 30,
        truncated: false,
        completeness: Object.keys(signals).length >= 2 ? 'full' : Object.keys(signals).length > 0 ? 'partial' : 'minimal',
      },
    };
  },
};
