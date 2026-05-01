import {
  EnvironmentConfig,
  ConnectorName,
  Dimension,
  ValidationResult,
  ConnectorValidation,
  WEIGHT_PROFILES,
  ALL_DIMENSIONS,
} from './types.js';
import {
  ALL_CONNECTORS,
  CONNECTOR_MAP,
  hasCred,
  buildCoverageMap,
} from './connectors/registry.js';

export async function validateConfig(config: EnvironmentConfig): Promise<ValidationResult> {
  const connectorResults: ConnectorValidation[] = [];
  const warnings: string[] = [];

  // Validate weight profile
  if (!WEIGHT_PROFILES[config.weightProfile]) {
    warnings.push(
      `Weight profile '${config.weightProfile}' not recognized. Falling back to 'reliability_first'.`,
    );
  }

  // Test all configured connectors in parallel
  const tasks: Promise<void>[] = [];

  for (const conn of ALL_CONNECTORS) {
    const connConfig = config.connectors[conn.name];
    const configured = hasCred(config.connectors, conn.name);

    if (!configured) {
      connectorResults.push({
        name: conn.name,
        configured: false,
        connected: false,
        dimensions: conn.dimensions,
      });
      continue;
    }

    tasks.push(
      (async () => {
        try {
          const result = await conn.validate(connConfig as unknown as Record<string, unknown>);
          connectorResults.push({
            name: conn.name,
            configured: true,
            connected: result.connected,
            error: result.error,
            dimensions: conn.dimensions,
          });
          if (!result.connected) {
            warnings.push(`${conn.name}: ${result.error || 'connection failed'}`);
          }
        } catch (e: unknown) {
          connectorResults.push({
            name: conn.name,
            configured: true,
            connected: false,
            error: (e as Error).message,
            dimensions: conn.dimensions,
          });
          warnings.push(`${conn.name}: ${(e as Error).message}`);
        }
      })(),
    );
  }

  await Promise.allSettled(tasks);

  // Build coverage map from connected connectors only
  const coverage: Record<Dimension, string[]> = { Q: [], L: [], R: [], C: [], S: [] };
  for (const cv of connectorResults) {
    if (cv.connected) {
      for (const dim of cv.dimensions) {
        if (!coverage[dim].includes(cv.name)) coverage[dim].push(cv.name);
      }
    }
  }

  // Check dimension coverage
  const coreDims: Dimension[] = ['Q', 'L', 'R', 'C'];
  for (const dim of coreDims) {
    if (coverage[dim].length === 0) {
      warnings.push(`No connectors feeding ${dim} - dimension will use fallback or be unavailable.`);
    }
  }

  // S detection
  const sAvailable = ALL_CONNECTORS.some(
    (c) => c.dimensions.includes('S') && hasCred(config.connectors, c.name),
  );
  const sEnabled = config.sEnabled === true && sAvailable;

  // C cost source detection
  const costConnectors: ConnectorName[] = ['portkey', 'openai'];
  const hasCostConnector = costConnectors.some((n) => {
    const cv = connectorResults.find((c) => c.name === n);
    return cv?.connected;
  });
  const hasManualCost = config.monthlyAiCost !== undefined && config.monthlyAiCost > 0;
  const costSource = hasCostConnector ? 'connectors' : hasManualCost ? 'manual' : 'none';

  if (costSource === 'none') {
    warnings.push(
      'No cost data source. Provide monthlyAiCost in config or connect Portkey/OpenAI for C-score.',
    );
  }

  // Baseline detection
  if (!config.baselineDefectRate && !config.baselineCycleTimeHours) {
    if (config.baselineSource !== 'industry') {
      warnings.push(
        'No baselines configured. First run will be a calibration run for Q and L. Set baselineSource: "industry" to use published defaults.',
      );
    }
  }

  const ready = coreDims.some((d) => coverage[d].length > 0);

  return {
    orgName: config.orgName,
    weightProfile: WEIGHT_PROFILES[config.weightProfile] ? config.weightProfile : 'reliability_first',
    connectors: connectorResults,
    coverage,
    warnings,
    sAvailable,
    sEnabled,
    costSource,
    ready,
  };
}
