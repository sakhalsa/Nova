import {
  Dimension,
  DimensionScore,
  DimensionWeights,
  SignalResult,
  WeightProfileName,
  WEIGHT_PROFILES,
  CORE_DIMENSIONS,
  SCHEMA_VERSION,
  AssessmentMode,
  ScoringMode,
  DataQuality,
  CompositeResult,
  SignalConfidence,
} from './types.js';

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function sig(signals: Map<string, SignalResult>, key: string): number | null {
  const s = signals.get(key);
  return s ? s.value : null;
}

function sigOrDefault(signals: Map<string, SignalResult>, key: string, fallback: number): number {
  return sig(signals, key) ?? fallback;
}

function sourcingConnectors(signals: Map<string, SignalResult>, keys: string[]): string[] {
  const connectors = new Set<string>();
  for (const k of keys) {
    const s = signals.get(k);
    if (s?.connector) connectors.add(s.connector);
  }
  return [...connectors];
}

function collectSignals(signals: Map<string, SignalResult>, keys: string[]): SignalResult[] {
  const out: SignalResult[] = [];
  for (const k of keys) {
    const s = signals.get(k);
    if (s) out.push(s);
  }
  return out;
}

// ---------------------------------------------------------------------------
// R = (1 - cfr_ai) * slo_attainment * contract_catch_rate * uptime_ai * adaptability
// ---------------------------------------------------------------------------

const R_KEYS = ['cfr_ai', 'slo_attainment', 'contract_catch_rate', 'uptime_ai', 'adaptability'];

export function scoreR(signals: Map<string, SignalResult>): DimensionScore {
  const hasAnyLiveR = R_KEYS.some((k) => signals.has(k));
  if (!hasAnyLiveR) {
    return {
      dimension: 'R',
      score: 0,
      status: 'calibrating',
      signals: [],
      connectorsSourcing: [],
      calibrationMessage:
        'No reliability data collected. Connect a reliability provider (Datadog, Grafana, PagerDuty, Cloudflare, New Relic) to score R.',
    };
  }

  const cfr = clamp01(sigOrDefault(signals, 'cfr_ai', 0));
  const slo = clamp01(sigOrDefault(signals, 'slo_attainment', 1));
  const contract = clamp01(sigOrDefault(signals, 'contract_catch_rate', 1));
  const uptime = clamp01(sigOrDefault(signals, 'uptime_ai', 1));
  const adapt = clamp01(sigOrDefault(signals, 'adaptability', 1));

  const score = (1 - cfr) * slo * contract * uptime * adapt;

  return {
    dimension: 'R',
    score: Math.max(Math.min(score, 1), 0),
    status: 'scored',
    signals: collectSignals(signals, R_KEYS),
    connectorsSourcing: sourcingConnectors(signals, R_KEYS),
  };
}

// ---------------------------------------------------------------------------
// Q — strict: defect_rate_ai vs defect_rate_nonai; portfolio: vs SoTA baseline
// ---------------------------------------------------------------------------

const Q_KEYS = [
  'defect_rate_ai', 'defect_rate_nonai', 'ai_test_pass_rate', 'rework_rate_ai',
  'collection_quality', 'agent_score',
  'runtime_retry_behavior', 'runtime_idempotency', 'error_recovery_quality', 'error_contract_depth',
];

export interface ScoreQOptions {
  scoringMode?: ScoringMode;
  portfolioDefectBaseline?: number;
}

export function scoreQ(
  signals: Map<string, SignalResult>,
  baselineDefectRate?: number,
  options?: ScoreQOptions,
): DimensionScore {
  const scoringMode = options?.scoringMode ?? 'strict';
  const portfolioBaseline = options?.portfolioDefectBaseline;

  const defectRateAi = sig(signals, 'defect_rate_ai');
  const defectRateNonAi = sig(signals, 'defect_rate_nonai') ?? baselineDefectRate ?? null;
  const testPassDelta = clamp01(sigOrDefault(signals, 'ai_test_pass_rate', 1));
  const rework = clamp01(sigOrDefault(signals, 'rework_rate_ai', 0));

  if (scoringMode === 'portfolio' && portfolioBaseline != null && portfolioBaseline > 0) {
    if (defectRateAi === null) {
      return {
        dimension: 'Q',
        score: 0,
        status: 'unavailable',
        signals: collectSignals(signals, Q_KEYS),
        connectorsSourcing: sourcingConnectors(signals, Q_KEYS),
        calibrationMessage:
          'Portfolio mode needs defect rate from a quality connector (e.g. SonarQube).',
      };
    }
    const defectComponent = clamp01(1 - Math.min(1, defectRateAi / portfolioBaseline));
    const score = Math.max(defectComponent * testPassDelta * (1 - rework), 0);
    return {
      dimension: 'Q',
      score: Math.min(score, 1),
      status: 'scored',
      signals: collectSignals(signals, Q_KEYS),
      connectorsSourcing: sourcingConnectors(signals, Q_KEYS),
    };
  }

  if (defectRateNonAi === null || defectRateAi === null) {
    const hasAnySignals = defectRateAi !== null || sig(signals, 'rework_rate_ai') !== null;
    return {
      dimension: 'Q',
      score: 0,
      status: hasAnySignals ? 'calibrating' : 'unavailable',
      signals: collectSignals(signals, Q_KEYS),
      connectorsSourcing: sourcingConnectors(signals, Q_KEYS),
      calibrationMessage: hasAnySignals
        ? `Baseline captured: defect_rate_ai=${defectRateAi ?? 'pending'}. Provide baselineDefectRate for comparison.`
        : undefined,
    };
  }

  const defectComponent = defectRateNonAi > 0 ? 1 - defectRateAi / defectRateNonAi : 1;
  let score = Math.max(defectComponent * testPassDelta * (1 - rework), 0);

  // v1.4.0: collection quality adjustment - gated on signal availability
  // Derivation: 70 = median collection quality (State of the API, 100K+ respondents)
  // /300 = normalizes max bonus to +0.10 at score=100
  const cq = sig(signals, 'collection_quality');
  if (cq !== null) {
    score += (cq * 100 - 70) / 300;
  }

  // v1.4.0: agent score adjustment - gated on signal availability
  // Derivation: 70 = agent-consumable threshold, /500 = max bonus +0.06
  const agentScore = sig(signals, 'agent_score');
  if (agentScore !== null && agentScore > 0) {
    score += (agentScore * 100 - 70) / 500;
  }

  // v1.5.0: API runtime quality adjustment - gated on signal availability
  // Average of up to 4 runtime signals, then (avg - 0.5) / 5 = max +0.10
  const runtimeSignals = [
    sig(signals, 'runtime_retry_behavior'),
    sig(signals, 'runtime_idempotency'),
    sig(signals, 'error_recovery_quality'),
    sig(signals, 'error_contract_depth'),
  ].filter((v): v is number => v !== null);

  if (runtimeSignals.length > 0) {
    const runtimeAvg = runtimeSignals.reduce((a, b) => a + b, 0) / runtimeSignals.length;
    score += (runtimeAvg - 0.5) / 5;
  }

  return {
    dimension: 'Q',
    score: clamp01(score),
    status: 'scored',
    signals: collectSignals(signals, Q_KEYS),
    connectorsSourcing: sourcingConnectors(signals, Q_KEYS),
  };
}

// ---------------------------------------------------------------------------
// L — v1.4.0: deploy_frequency now contributes a capped bonus
// ---------------------------------------------------------------------------

const L_KEYS = ['cycle_time_ai', 'cycle_time_nonai', 'deploy_frequency'];

export interface ScoreLOptions {
  scoringMode?: ScoringMode;
  portfolioCycleHours?: number;
}

export function scoreL(
  signals: Map<string, SignalResult>,
  baselineCycleTimeHours?: number,
  options?: ScoreLOptions,
): DimensionScore {
  const scoringMode = options?.scoringMode ?? 'strict';
  const portfolioCycle = options?.portfolioCycleHours;

  const ctAi = sig(signals, 'cycle_time_ai');
  const ctNonAi = sig(signals, 'cycle_time_nonai') ?? baselineCycleTimeHours ?? null;

  if (scoringMode === 'portfolio' && portfolioCycle != null && portfolioCycle > 0) {
    if (ctAi === null) {
      return {
        dimension: 'L',
        score: 0,
        status: 'unavailable',
        signals: collectSignals(signals, L_KEYS),
        connectorsSourcing: sourcingConnectors(signals, L_KEYS),
        calibrationMessage:
          'Portfolio mode needs cycle time from a delivery connector (GitHub, GitLab, Linear, Jira).',
      };
    }
    const raw = 1 - ctAi / portfolioCycle;
    return {
      dimension: 'L',
      score: clamp01(Math.max(raw, 0)),
      status: 'scored',
      signals: collectSignals(signals, L_KEYS),
      connectorsSourcing: sourcingConnectors(signals, L_KEYS),
    };
  }

  if (ctAi === null || ctNonAi === null) {
    const hasAnySignals = ctAi !== null;
    return {
      dimension: 'L',
      score: 0,
      status: hasAnySignals ? 'calibrating' : 'unavailable',
      signals: collectSignals(signals, L_KEYS),
      connectorsSourcing: sourcingConnectors(signals, L_KEYS),
      calibrationMessage: hasAnySignals
        ? `Baseline captured: cycle_time_ai=${ctAi}h. Provide baselineCycleTimeHours for comparison.`
        : undefined,
    };
  }

  if (ctNonAi === 0) {
    return {
      dimension: 'L',
      score: 0,
      status: 'scored',
      signals: collectSignals(signals, L_KEYS),
      connectorsSourcing: sourcingConnectors(signals, L_KEYS),
    };
  }

  let raw = 1 - ctAi / ctNonAi;

  // v1.4.0: deploy frequency bonus - gated on signal availability
  // Derivation: 10 deploys/day = DORA Elite (2025). Cap at 0.15 to keep
  // cycle time reduction as the dominant signal.
  const deployFreq = sig(signals, 'deploy_frequency');
  if (deployFreq !== null && deployFreq > 0) {
    raw += Math.min(deployFreq / 10, 0.15);
  }

  return {
    dimension: 'L',
    score: clamp01(Math.max(raw, 0)),
    status: 'scored',
    signals: collectSignals(signals, L_KEYS),
    connectorsSourcing: sourcingConnectors(signals, L_KEYS),
  };
}

// ---------------------------------------------------------------------------
// C, S
// ---------------------------------------------------------------------------

const C_KEYS = ['hours_saved_monthly', 'review_overhead_hours_monthly', 'total_ai_cost', 'cost_growth_rate', 'value_growth_rate'];

export function scoreC(
  signals: Map<string, SignalResult>,
  monthlyAiCost?: number,
  targetRoi = 2.0,
  hourlyRate = 75,
): DimensionScore {
  const hoursSaved = sig(signals, 'hours_saved_monthly');
  const overheadHours = sigOrDefault(signals, 'review_overhead_hours_monthly', 0);
  const costFromConnectors = sig(signals, 'total_ai_cost');
  const totalAiCost = costFromConnectors ?? monthlyAiCost ?? null;

  if (totalAiCost === null || totalAiCost === 0) {
    return {
      dimension: 'C',
      score: 0,
      status: hoursSaved !== null ? 'calibrating' : 'unavailable',
      signals: collectSignals(signals, C_KEYS),
      connectorsSourcing: sourcingConnectors(signals, C_KEYS),
      calibrationMessage:
        'Provide monthlyAiCost in config or connect a cost provider (Portkey, OpenAI) to enable cost efficiency scoring.',
    };
  }

  if (hoursSaved === null) {
    return {
      dimension: 'C',
      score: 0,
      status: 'calibrating',
      signals: collectSignals(signals, C_KEYS),
      connectorsSourcing: sourcingConnectors(signals, C_KEYS),
      calibrationMessage:
        'Labor savings data not yet available. Connect GitHub or GitLab for hours-saved estimation.',
    };
  }

  const laborValue = hoursSaved * hourlyRate;
  const overheadValue = overheadHours * hourlyRate;
  const cRaw = (laborValue - overheadValue) / totalAiCost;
  let cNorm = Math.min(cRaw / targetRoi, 1.0);

  // v1.4.0: cost growth penalty - gated on signal availability
  // Derivation: percentage-point delta / 100 normalizes to 0-1 scale.
  // Asymmetric by design: growing costs are a risk signal, but growing
  // value is already captured in the base formula.
  const costGrowth = sig(signals, 'cost_growth_rate');
  const valueGrowth = sig(signals, 'value_growth_rate');
  if (costGrowth !== null && valueGrowth !== null && costGrowth > valueGrowth) {
    cNorm -= (costGrowth - valueGrowth) / 100;
  }

  return {
    dimension: 'C',
    score: Math.max(cNorm, 0),
    status: 'scored',
    signals: collectSignals(signals, C_KEYS),
    connectorsSourcing: sourcingConnectors(signals, C_KEYS),
  };
}

const S_KEYS = ['spec_security_score', 'dependabot_score', 'code_scanning_score', 'secret_scanning_score'];

export function scoreS(signals: Map<string, SignalResult>): DimensionScore {
  const spec = sig(signals, 'spec_security_score');
  const dep = sig(signals, 'dependabot_score');
  const scan = sig(signals, 'code_scanning_score');
  const secret = sig(signals, 'secret_scanning_score');

  const factors: number[] = [];
  if (spec !== null) factors.push(spec);
  if (dep !== null) factors.push(dep);
  if (scan !== null) factors.push(scan);
  if (secret !== null) factors.push(secret);

  if (factors.length === 0) {
    return {
      dimension: 'S',
      score: 0,
      status: 'unavailable',
      signals: [],
      connectorsSourcing: [],
      calibrationMessage:
        'Security analysis requires 42Crunch or GitHub Advanced Security. Connect a security provider to activate.',
    };
  }

  const score = factors.reduce((a, b) => a * b, 1);
  return {
    dimension: 'S',
    score: Math.max(Math.min(score, 1), 0),
    status: 'scored',
    signals: collectSignals(signals, S_KEYS),
    connectorsSourcing: sourcingConnectors(signals, S_KEYS),
  };
}

// ---------------------------------------------------------------------------
// Composite
// ---------------------------------------------------------------------------

export function resolveWeights(profileName: WeightProfileName): DimensionWeights {
  const profile = WEIGHT_PROFILES[profileName];
  if (!profile) {
    throw new Error(
      `Weight profile '${profileName}' not recognized. ${
        'Contact your Postman representative to configure a custom profile.'
      }`,
    );
  }
  return profile.weights;
}

const DEFAULT_CONF: SignalConfidence = {
  sampleSize: 0,
  timeWindowDays: 0,
  truncated: false,
  completeness: 'minimal',
};

const DIM_SIGNAL_KEYS: Record<Dimension, string[]> = {
  Q: ['defect_rate_ai', 'defect_rate_nonai', 'ai_test_pass_rate', 'rework_rate_ai', 'collection_quality', 'agent_score'],
  L: ['cycle_time_ai', 'cycle_time_nonai', 'deploy_frequency'],
  R: ['cfr_ai', 'slo_attainment', 'contract_catch_rate', 'uptime_ai', 'adaptability'],
  C: ['hours_saved_monthly', 'review_overhead_hours_monthly', 'total_ai_cost', 'cost_growth_rate', 'value_growth_rate'],
  S: ['spec_security_score', 'dependabot_score', 'code_scanning_score', 'secret_scanning_score'],
};

export function annotateDimensionsDataQuality(
  dimensions: Record<Dimension, DimensionScore>,
  confidenceBySignal: Map<string, SignalConfidence>,
): Record<Dimension, DimensionScore> {
  const out = { ...dimensions };
  for (const dim of Object.keys(out) as Dimension[]) {
    const keys = DIM_SIGNAL_KEYS[dim];
    const levels: DataQuality[] = [];
    for (const k of keys) {
      if (!out[dim].signals.some((s) => s.key === k)) continue;
      const c = confidenceBySignal.get(k) ?? DEFAULT_CONF;
      if (c.completeness === 'minimal' || c.sampleSize === 0) levels.push('low');
      else if (c.truncated || c.completeness === 'partial') levels.push('medium');
      else levels.push('high');
    }
    let dq: DataQuality | undefined;
    if (levels.length > 0) {
      if (levels.includes('low')) dq = 'low';
      else if (levels.includes('medium')) dq = 'medium';
      else dq = 'high';
    }
    out[dim] = { ...out[dim], dataQuality: dq };
  }
  return out;
}

export function computeComposite(
  dimensions: Record<Dimension, DimensionScore>,
  weights: DimensionWeights,
  orgName: string,
  weightProfile: WeightProfileName,
  opts?: {
    assessmentMode?: AssessmentMode;
    scoringMode?: ScoringMode;
    partialComposite?: boolean;
    scoredCoreCount?: number;
    epistemicNote?: string;
  },
): CompositeResult {
  const calibrating: Dimension[] = [];
  const scored: { dim: Dimension; score: number; weight: number }[] = [];

  const weightMap: Record<string, number> = {
    Q: weights.q,
    L: weights.l,
    R: weights.r,
    C: weights.c,
  };

  for (const d of CORE_DIMENSIONS) {
    const ds = dimensions[d];
    if (ds.status === 'scored') {
      scored.push({ dim: d, score: ds.score, weight: weightMap[d] });
    } else {
      calibrating.push(d);
    }
  }

  if (dimensions.S.status !== 'scored') {
    calibrating.push('S');
  }

  let composite = 0;
  if (scored.length > 0) {
    const totalWeight = scored.reduce((s, x) => s + x.weight, 0);
    for (const { score, weight } of scored) {
      composite += score * (weight / totalWeight);
    }
  }

  const scoredCore = scored.filter((s) => CORE_DIMENSIONS.includes(s.dim));
  let weakest: { dimension: Dimension; score: number } | null = null;
  let strongest: { dimension: Dimension; score: number } | null = null;

  if (scoredCore.length > 0) {
    const sorted = [...scoredCore].sort((a, b) => a.score - b.score);
    weakest = { dimension: sorted[0].dim, score: sorted[0].score };
    strongest = { dimension: sorted[sorted.length - 1].dim, score: sorted[sorted.length - 1].score };
  }

  const scoredCoreCount =
    opts?.scoredCoreCount ??
    CORE_DIMENSIONS.filter((d) => dimensions[d].status === 'scored').length;

  const assessmentMode: AssessmentMode =
    opts?.assessmentMode ?? (scoredCoreCount < 3 ? 'readiness' : 'full');

  const partialComposite =
    opts?.partialComposite ?? (scoredCoreCount > 0 && scoredCoreCount < 4);

  const epistemicNote =
    opts?.epistemicNote ??
    'Scores aggregate connector signals as proxies for outcomes, not proof of causation. Industry baselines are self-reported survey priors where used.';

  return {
    schemaVersion: SCHEMA_VERSION,
    composite: Math.round(composite * 1000) / 1000,
    dimensions,
    weights,
    weightProfile,
    calibrating,
    weakest,
    strongest,
    gap: strongest && weakest ? Math.round((strongest.score - weakest.score) * 1000) / 1000 : 0,
    timestamp: new Date().toISOString(),
    orgName,
    assessmentMode,
    scoringMode: opts?.scoringMode ?? 'strict',
    partialComposite,
    scoredCoreCount,
    epistemicNote,
  };
}
