import {
  EnvironmentConfig,
  CompositeResult,
  Dimension,
  DimensionScore,
  ConnectorName,
  ConnectorValidation,
  ValidationResult,
  WEIGHT_PROFILES,
  SignalResult,
  ScoringMode,
  CORE_DIMENSIONS,
  ProvenanceStep,
} from './types.js';
import { INDUSTRY_DEFAULTS, STATE_OF_API_BASELINES } from './dimensions.js';
import {
  scoreQ,
  scoreL,
  scoreR,
  scoreC,
  scoreS,
  resolveWeights,
  computeComposite,
  annotateDimensionsDataQuality,
} from './scorer.js';
import { ALL_CONNECTORS, CONNECTOR_MAP, SIGNAL_ROUTES, mergeSignals, hasCred } from './connectors/registry.js';
import { ConnectorOutput, ProvenanceEntry } from './connectors/types.js';
import { appendLocal, uploadToTurbopuffer } from './history.js';
import { setDefaultFetchTimeoutMs } from './connectors/fetch-utils.js';
import { buildProductDomainGuidance } from './product-domain-guidance.js';
import { buildRunGuidance } from './run-guidance.js';

export interface AssessmentResult {
  validation: ValidationResult;
  result: CompositeResult;
  durationMs: number;
}

function resolveScoringMode(
  config: EnvironmentConfig,
  signals: Map<string, SignalResult>,
): ScoringMode {
  const mode = config.scoringMode;
  if (mode === 'strict') return 'strict';
  if (mode === 'portfolio') return 'portfolio';
  if (config.baselineSource === 'industry') return 'portfolio';
  if (!signals.has('defect_rate_nonai') && !signals.has('cycle_time_nonai')) return 'portfolio';
  return 'strict';
}

export async function runAssessment(config: EnvironmentConfig): Promise<AssessmentResult> {
  const startTime = Date.now();

  if (config.timeoutMs != null) {
    setDefaultFetchTimeoutMs(config.timeoutMs);
  }

  const connectorOutputs = new Map<ConnectorName, ConnectorOutput>();
  const connectorResults: ConnectorValidation[] = [];
  const warnings: string[] = [];
  const tasks: Promise<void>[] = [];

  if (!WEIGHT_PROFILES[config.weightProfile]) {
    warnings.push(
      `Weight profile '${config.weightProfile}' not recognized. Falling back to 'reliability_first'.`,
    );
  }

  for (const conn of ALL_CONNECTORS) {
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

    const connConfig = config.connectors[conn.name];
    if (!connConfig) continue;

    tasks.push(
      (async () => {
        try {
          const output = await conn.collect(connConfig as unknown as Record<string, unknown>);
          connectorOutputs.set(conn.name, output);
          connectorResults.push({
            name: conn.name,
            configured: true,
            connected: output.connected,
            dimensions: conn.dimensions,
          });
        } catch (e: unknown) {
          connectorOutputs.set(conn.name, { signals: {}, diagnostics: [], connected: false });
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

  const coverage: Record<Dimension, string[]> = { Q: [], L: [], R: [], C: [], S: [] };
  for (const cv of connectorResults) {
    if (cv.connected) {
      for (const dim of cv.dimensions) {
        if (!coverage[dim].includes(cv.name)) coverage[dim].push(cv.name);
      }
    }
  }

  const coreDims: Dimension[] = ['Q', 'L', 'R', 'C'];
  for (const dim of coreDims) {
    if (coverage[dim].length === 0) {
      warnings.push(`No connectors feeding ${dim} - dimension will use fallback or be unavailable.`);
    }
  }

  const sAvailable = connectorResults.some((c) => c.dimensions.includes('S') && c.connected);
  const sEnabled = config.sEnabled === true && sAvailable;

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

  if (!config.baselineDefectRate && !config.baselineCycleTimeHours) {
    if (config.baselineSource !== 'industry') {
      warnings.push(
        'No baselines configured. First run will be a calibration run for Q and L. Set baselineSource: "industry" to use published defaults.',
      );
    }
  }

  const effectiveProfile = WEIGHT_PROFILES[config.weightProfile]
    ? config.weightProfile
    : ('reliability_first' as const);

  const validation: ValidationResult = {
    orgName: config.orgName,
    weightProfile: effectiveProfile,
    connectors: connectorResults,
    coverage,
    warnings,
    sAvailable,
    sEnabled,
    costSource,
    ready: coreDims.some((d) => coverage[d].length > 0),
  };

  const { signals, confidenceBySignal } = mergeSignals(connectorOutputs);

  const scoringMode = resolveScoringMode(config, signals);

  const baselineDefectRate =
    config.baselineDefectRate ??
    (config.baselineSource === 'industry' ? INDUSTRY_DEFAULTS.baselineDefectRate : undefined);
  const baselineCycleTime =
    config.baselineCycleTimeHours ??
    (config.baselineSource === 'industry' ? INDUSTRY_DEFAULTS.baselineCycleTimeHours : undefined);
  const targetRoi = config.targetRoi ?? INDUSTRY_DEFAULTS.targetRoi;
  const hourlyRate = config.hourlyRate ?? 75;

  const qOpts =
    scoringMode === 'portfolio'
      ? {
          scoringMode: 'portfolio' as const,
          portfolioDefectBaseline: STATE_OF_API_BASELINES.baselineDefectRate,
        }
      : { scoringMode: 'strict' as const };

  const lOpts =
    scoringMode === 'portfolio'
      ? {
          scoringMode: 'portfolio' as const,
          portfolioCycleHours: STATE_OF_API_BASELINES.baselineCycleTimeHours,
        }
      : { scoringMode: 'strict' as const };

  let dimensions: Record<Dimension, DimensionScore> = {
    R: scoreR(signals),
    Q: scoreQ(signals, baselineDefectRate, qOpts),
    L: scoreL(signals, baselineCycleTime, lOpts),
    C: scoreC(signals, config.monthlyAiCost, targetRoi, hourlyRate),
    S: scoreS(signals),
  };

  dimensions = annotateDimensionsDataQuality(dimensions, confidenceBySignal);

  if (config.includeProvenance) {
    const FORMULA_POSITIONS: Record<string, string> = {
      cfr_ai: 'R = (1 - THIS) * slo * contract * uptime * adapt',
      slo_attainment: 'R = (1-cfr) * THIS * contract * uptime * adapt',
      contract_catch_rate: 'R = (1-cfr) * slo * THIS * uptime * adapt',
      uptime_ai: 'R = (1-cfr) * slo * contract * THIS * adapt',
      adaptability: 'R = (1-cfr) * slo * contract * uptime * THIS',
      defect_rate_ai: 'Q = (1 - THIS/baseline) * test_pass * (1 - rework)',
      defect_rate_nonai: 'Q = (1 - defect_ai/THIS) * test_pass * (1 - rework)',
      ai_test_pass_rate: 'Q = defect_component * THIS * (1 - rework)',
      rework_rate_ai: 'Q = defect_component * test_pass * (1 - THIS)',
      cycle_time_ai: 'L = 1 - (THIS / cycle_time_nonai)',
      cycle_time_nonai: 'L = 1 - (cycle_time_ai / THIS)',
      hours_saved_monthly: 'C = (THIS * rate - overhead * rate) / cost / targetRoi',
      review_overhead_hours_monthly: 'C = (hours * rate - THIS * rate) / cost / targetRoi',
      total_ai_cost: 'C = (labor - overhead) / THIS / targetRoi',
      spec_security_score: 'S = THIS * dependabot * code_scanning',
      dependabot_score: 'S = spec * THIS * code_scanning',
      code_scanning_score: 'S = spec * dependabot * THIS',
    };

    const provenanceByDim: Record<Dimension, ProvenanceStep[]> = { Q: [], L: [], R: [], C: [], S: [] };
    const ts = new Date().toISOString();

    for (const route of SIGNAL_ROUTES) {
      const merged = signals.get(route.formulaInput);
      if (!merged) continue;

      const connName = merged.connector as ConnectorName;
      const output = connectorOutputs.get(connName);
      const provEntries = output?.provenance?.filter((p) => p.signal === route.formulaInput) ?? [];

      const step: ProvenanceStep = {
        signal: route.formulaInput,
        rawValue: provEntries.length > 0 ? provEntries[0].rawValue : merged.value,
        normalizedValue: merged.value,
        connector: merged.connector || 'unknown',
        apiEndpoint: provEntries.length > 0 ? provEntries[0].apiEndpoint : '',
        timestamp: provEntries.length > 0 ? provEntries[0].timestamp : ts,
        sampleSize: output?.confidence?.sampleSize ?? 0,
        formulaPosition: FORMULA_POSITIONS[route.formulaInput] || '',
      };

      provenanceByDim[route.dimension].push(step);
    }

    for (const dim of [...CORE_DIMENSIONS, 'S' as Dimension]) {
      if (provenanceByDim[dim].length > 0) {
        dimensions[dim] = { ...dimensions[dim], provenance: provenanceByDim[dim] };
      }
    }
  }

  const scoredCoreCount = CORE_DIMENSIONS.filter((d) => dimensions[d].status === 'scored').length;

  const weights = resolveWeights(effectiveProfile);
  const baseResult = computeComposite(dimensions, weights, config.orgName, effectiveProfile, {
    scoringMode,
    scoredCoreCount,
  });

  const connectedNames = validation.connectors
    .filter((x) => x.connected)
    .map((x) => x.name) as ConnectorName[];

  const productDomain = buildProductDomainGuidance(connectedNames, {
    assessmentMode: baseResult.assessmentMode,
    scoredCoreCount: baseResult.scoredCoreCount,
  });

  const result: CompositeResult = {
    ...baseResult,
    productDomainGuidance: productDomain,
    runGuidance: buildRunGuidance({
      validation,
      config,
      composite: baseResult,
      dimensions,
      productDomain,
      signalKeysPresent: Array.from(signals.keys()),
    }),
  };

  try {
    await appendLocal(result, config, validation);
  } catch {
    // Local history write is non-blocking
  }

  if (config.telemetry) {
    try {
      await uploadToTurbopuffer(result, config);
    } catch {
      // Telemetry upload is non-blocking
    }
  }

  const durationMs = Date.now() - startTime;
  return { validation, result, durationMs };
}
