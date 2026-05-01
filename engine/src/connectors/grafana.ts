import { Connector, ConnectorOutput, DiagnosticEntry } from './types.js';
import { timedFetch } from './fetch-utils.js';

async function grafanaFetch(baseUrl: string, path: string, token: string): Promise<unknown> {
  const url = `${baseUrl.replace(/\/$/, '')}${path}`;
  const res = await timedFetch(url, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Grafana ${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

export const grafanaConnector: Connector = {
  name: 'grafana',
  dimensions: ['R'],
  requiredCredentials: ['baseUrl', 'apiToken'],

  async validate(config) {
    try {
      await grafanaFetch(config.baseUrl as string, '/api/org', config.apiToken as string);
      return { connected: true };
    } catch (e: unknown) {
      return { connected: false, error: (e as Error).message };
    }
  },

  async collect(config): Promise<ConnectorOutput> {
    const baseUrl = config.baseUrl as string;
    const token = config.apiToken as string;
    const serviceName = (config.serviceName as string) || '';
    const errorRateMetric = (config.errorRateMetric as string) || 'http_requests_total';
    const latencyMetric = (config.latencyMetric as string) || 'http_request_duration_seconds_bucket';
    const signals: Record<string, number> = {};
    const diagnostics: DiagnosticEntry[] = [];

    let dsUid = config.datasourceUid as string;
    if (!dsUid) {
      try {
        const datasources = (await grafanaFetch(baseUrl, '/api/datasources', token)) as Array<
          Record<string, unknown>
        >;
        const prom = datasources.find(
          (d) => (d.type as string) === 'prometheus' || (d.type as string) === 'loki',
        );
        if (prom) dsUid = prom.uid as string;
      } catch {
        // No datasource found
      }
    }

    if (!dsUid) {
      diagnostics.push({ key: 'datasource', value: 'not found', label: 'No Prometheus datasource' });
      return { signals, diagnostics, connected: true };
    }

    const now = Math.floor(Date.now() / 1000);

    const errorFilter = serviceName ? `{job="${serviceName}"}` : '';
    try {
      const errorQuery = encodeURIComponent(
        `sum(rate(${errorRateMetric}{status=~"5.."}${errorFilter ? ',' + errorFilter.slice(1, -1) : ''}[7d])) / sum(rate(${errorRateMetric}${errorFilter}[7d]))`,
      );
      const errData = (await grafanaFetch(
        baseUrl,
        `/api/datasources/proxy/uid/${dsUid}/api/v1/query?query=${errorQuery}&time=${now}`,
        token,
      )) as Record<string, unknown>;
      const result = ((errData.data as Record<string, unknown>)?.result as Array<Record<string, unknown>>) || [];
      if (result.length > 0) {
        const errorRate = parseFloat(((result[0].value as unknown[])?.[1] as string) || '0');
        if (!isNaN(errorRate)) {
          signals.uptime_ai = Math.max(1 - errorRate, 0);
          diagnostics.push({ key: 'error_rate', value: errorRate, label: '7-day error rate' });
        }
      }
    } catch {
      diagnostics.push({ key: 'error_rate_query', value: 'failed', label: `Error rate query failed (metric: ${errorRateMetric}). Configure errorRateMetric if your metric name differs.` });
    }

    try {
      const p95Query = encodeURIComponent(
        `histogram_quantile(0.95, sum(rate(${latencyMetric}${errorFilter}[7d])) by (le))`,
      );
      const p95Data = (await grafanaFetch(
        baseUrl,
        `/api/datasources/proxy/uid/${dsUid}/api/v1/query?query=${p95Query}&time=${now}`,
        token,
      )) as Record<string, unknown>;
      const result = ((p95Data.data as Record<string, unknown>)?.result as Array<Record<string, unknown>>) || [];
      if (result.length > 0) {
        const p95 = parseFloat(((result[0].value as unknown[])?.[1] as string) || '0');
        if (!isNaN(p95)) {
          diagnostics.push({ key: 'p95_latency_ms', value: p95 * 1000, label: 'P95 latency (ms)' });
        }
      }
    } catch {
      diagnostics.push({ key: 'p95_query', value: 'failed', label: `P95 query failed (metric: ${latencyMetric}).` });
    }

    return { signals, diagnostics, connected: true };
  },
};
