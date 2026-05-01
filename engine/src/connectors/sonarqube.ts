import { Connector, ConnectorOutput, DiagnosticEntry } from './types.js';
import { timedFetch } from './fetch-utils.js';

async function sqFetch(baseUrl: string, path: string, token: string): Promise<unknown> {
  const res = await timedFetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
    headers: { Authorization: `Basic ${Buffer.from(token + ':').toString('base64')}` },
  });
  if (!res.ok) throw new Error(`SonarQube ${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

export const sonarqubeConnector: Connector = {
  name: 'sonarqube',
  dimensions: ['Q'],
  requiredCredentials: ['url', 'token', 'projectKey'],

  async validate(config) {
    try {
      await sqFetch(config.url as string, '/api/system/status', config.token as string);
      return { connected: true };
    } catch (e: unknown) {
      return { connected: false, error: (e as Error).message };
    }
  },

  async collect(config): Promise<ConnectorOutput> {
    const baseUrl = config.url as string;
    const token = config.token as string;
    const projectKey = config.projectKey as string;
    const signals: Record<string, number> = {};
    const diagnostics: DiagnosticEntry[] = [];

    try {
      const metricsData = (await sqFetch(
        baseUrl,
        `/api/measures/component?component=${encodeURIComponent(projectKey)}&metricKeys=bugs,ncloc,code_smells,vulnerabilities,coverage,alert_status,reliability_rating,security_rating`,
        token,
      )) as Record<string, unknown>;

      const component = metricsData.component as Record<string, unknown>;
      const measures = (component?.measures as Array<Record<string, string>>) || [];

      const metricMap = new Map<string, number>();
      for (const m of measures) {
        metricMap.set(m.metric, parseFloat(m.value) || 0);
      }

      const bugs = metricMap.get('bugs') || 0;
      const ncloc = metricMap.get('ncloc') || 1;
      const defectsPerKloc = (bugs / ncloc) * 1000;
      signals.defect_rate_ai = defectsPerKloc;

      diagnostics.push(
        { key: 'bugs', value: bugs, label: 'Open bugs' },
        { key: 'ncloc', value: ncloc, label: 'Lines of code' },
        { key: 'defects_per_kloc', value: defectsPerKloc, label: 'Defects per KLOC (project-wide)' },
        { key: 'code_smells', value: metricMap.get('code_smells') || 0, label: 'Code smells' },
        { key: 'vulnerabilities', value: metricMap.get('vulnerabilities') || 0, label: 'Vulnerabilities' },
        { key: 'coverage', value: metricMap.get('coverage') || 0, label: 'Test coverage %' },
        { key: 'measurement_scope', value: 'project-level', label: 'SonarQube measures total project defects, not AI-specific. Score compares against industry baseline.' },
      );

      // Quality gate status as a diagnostic
      const qgData = (await sqFetch(
        baseUrl,
        `/api/qualitygates/project_status?projectKey=${encodeURIComponent(projectKey)}`,
        token,
      )) as Record<string, unknown>;
      const qgStatus = (qgData.projectStatus as Record<string, string>)?.status || 'UNKNOWN';
      signals.quality_gate_status = qgStatus === 'OK' ? 1 : 0;
      diagnostics.push({ key: 'quality_gate', value: qgStatus, label: 'Quality gate status' });
    } catch {
      diagnostics.push({ key: 'sonarqube_error', value: 'failed', label: 'SonarQube metrics fetch failed' });
    }

    return { signals, diagnostics, connected: true };
  },
};
