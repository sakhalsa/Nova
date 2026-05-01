import { Connector, ConnectorOutput, DiagnosticEntry } from './types.js';
import { timedFetch } from './fetch-utils.js';

function sfxBase(realm: string): string {
  return `https://api.${realm}.signalfx.com`;
}

async function sfxFetch(realm: string, path: string, token: string): Promise<unknown> {
  const res = await timedFetch(`${sfxBase(realm)}${path}`, {
    headers: { 'X-SF-Token': token, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Splunk/SignalFx ${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

export const splunkConnector: Connector = {
  name: 'splunk',
  dimensions: ['R'],
  requiredCredentials: ['signalfxToken'],

  async validate(config) {
    const realm = (config.signalfxRealm as string) || 'us1';
    try {
      await sfxFetch(realm, '/v2/detector?limit=1', config.signalfxToken as string);
      return { connected: true };
    } catch (e: unknown) {
      return { connected: false, error: (e as Error).message };
    }
  },

  async collect(config): Promise<ConnectorOutput> {
    const token = config.signalfxToken as string;
    const realm = (config.signalfxRealm as string) || 'us1';
    const signals: Record<string, number> = {};
    const diagnostics: DiagnosticEntry[] = [];

    try {
      const data = (await sfxFetch(realm, '/v2/detector?limit=50', token)) as Record<string, unknown>;
      const detectors = (data.results as Array<Record<string, unknown>>) || [];
      const total = detectors.length;
      const active = detectors.filter((d) => {
        const rules = (d.rules as Array<Record<string, unknown>>) || [];
        return rules.some((r) => r.severity === 'Critical' || r.severity === 'Major');
      }).length;

      if (total > 0) {
        signals.adaptability = 1 - active / total;
        diagnostics.push(
          { key: 'total_detectors', value: total, label: 'Total detectors' },
          { key: 'active_alerts', value: active, label: 'Active critical/major alerts' },
          { key: 'health_ratio', value: signals.adaptability, label: 'Infrastructure health ratio' },
        );
      }
    } catch {
      diagnostics.push({ key: 'splunk_error', value: 'failed', label: 'Splunk/SignalFx fetch failed' });
    }

    return { signals, diagnostics, connected: true };
  },
};
