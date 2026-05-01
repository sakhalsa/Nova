import {
  CompositeResult,
  Dimension,
  DimensionScore,
  DimensionWeights,
  SignalResult,
  WeightProfileName,
  CORE_DIMENSIONS,
  ScoringMode,
} from './types.js';
import {
  scoreQ,
  scoreL,
  scoreR,
  scoreC,
  scoreS,
  resolveWeights,
  computeComposite,
} from './scorer.js';

export interface SimulationRequest {
  baseResult: CompositeResult;
  hypothetical: Record<string, number>;
  weightProfile?: WeightProfileName;
  baselineDefectRate?: number;
  baselineCycleTimeHours?: number;
  monthlyAiCost?: number;
  targetRoi?: number;
  hourlyRate?: number;
}

export interface SignalDelta {
  signal: string;
  original: number | null;
  simulated: number;
  dimension: Dimension;
}

export interface DimensionDelta {
  dimension: Dimension;
  original: number;
  simulated: number;
  delta: number;
  originalStatus: string;
  simulatedStatus: string;
}

export interface SimulationResult {
  original: {
    composite: number;
    dimensions: Record<Dimension, { score: number; status: string }>;
  };
  simulated: {
    composite: number;
    dimensions: Record<Dimension, { score: number; status: string }>;
  };
  compositeDelta: number;
  dimensionDeltas: DimensionDelta[];
  biggestMover: { dimension: Dimension; delta: number; drivenBy: string[] } | null;
  signalOverrides: SignalDelta[];
  interpretation: string;
}

const SIGNAL_DIMENSION_MAP: Record<string, Dimension> = {
  cfr_ai: 'R',
  slo_attainment: 'R',
  contract_catch_rate: 'R',
  uptime_ai: 'R',
  adaptability: 'R',
  defect_rate_ai: 'Q',
  defect_rate_nonai: 'Q',
  ai_test_pass_rate: 'Q',
  rework_rate_ai: 'Q',
  cycle_time_ai: 'L',
  cycle_time_nonai: 'L',
  deploy_frequency: 'L',
  hours_saved_monthly: 'C',
  review_overhead_hours_monthly: 'C',
  total_ai_cost: 'C',
  spec_security_score: 'S',
  dependabot_score: 'S',
  code_scanning_score: 'S',
};

function extractSignals(result: CompositeResult): Map<string, SignalResult> {
  const m = new Map<string, SignalResult>();
  for (const dim of Object.values(result.dimensions)) {
    for (const sig of dim.signals) {
      m.set(sig.key, sig);
    }
  }
  return m;
}

function applyOverrides(
  base: Map<string, SignalResult>,
  overrides: Record<string, number>,
): Map<string, SignalResult> {
  const merged = new Map(base);
  for (const [key, value] of Object.entries(overrides)) {
    merged.set(key, {
      key,
      value,
      source: 'manual',
      connector: 'simulation',
    });
  }
  return merged;
}

export function simulateAssessment(req: SimulationRequest): SimulationResult {
  const { baseResult, hypothetical } = req;

  const baseSignals = extractSignals(baseResult);
  const simSignals = applyOverrides(baseSignals, hypothetical);

  const profile = req.weightProfile || baseResult.weightProfile;
  const weights = resolveWeights(profile);
  const scoringMode: ScoringMode = baseResult.scoringMode || 'strict';

  const baseDefect = req.baselineDefectRate;
  const baseCycle = req.baselineCycleTimeHours;

  const qOpts = scoringMode === 'portfolio'
    ? { scoringMode: 'portfolio' as const, portfolioDefectBaseline: baseDefect }
    : { scoringMode: 'strict' as const };
  const lOpts = scoringMode === 'portfolio'
    ? { scoringMode: 'portfolio' as const, portfolioCycleHours: baseCycle }
    : { scoringMode: 'strict' as const };

  const simDimensions: Record<Dimension, DimensionScore> = {
    R: scoreR(simSignals),
    Q: scoreQ(simSignals, baseDefect, qOpts),
    L: scoreL(simSignals, baseCycle, lOpts),
    C: scoreC(simSignals, req.monthlyAiCost, req.targetRoi ?? 2.0, req.hourlyRate ?? 75),
    S: scoreS(simSignals),
  };

  const simComposite = computeComposite(
    simDimensions,
    weights,
    baseResult.orgName,
    profile,
    { scoringMode },
  );

  const signalOverrides: SignalDelta[] = [];
  for (const [key, value] of Object.entries(hypothetical)) {
    const origSig = baseSignals.get(key);
    signalOverrides.push({
      signal: key,
      original: origSig?.value ?? null,
      simulated: value,
      dimension: SIGNAL_DIMENSION_MAP[key] || 'Q',
    });
  }

  const dimensionDeltas: DimensionDelta[] = [];
  for (const dim of [...CORE_DIMENSIONS, 'S' as Dimension]) {
    const orig = baseResult.dimensions[dim];
    const sim = simDimensions[dim];
    dimensionDeltas.push({
      dimension: dim,
      original: orig.score,
      simulated: sim.score,
      delta: Math.round((sim.score - orig.score) * 1000) / 1000,
      originalStatus: orig.status,
      simulatedStatus: sim.status,
    });
  }

  const movers = dimensionDeltas
    .filter((d) => CORE_DIMENSIONS.includes(d.dimension))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const biggestMover = movers.length > 0 && movers[0].delta !== 0
    ? {
        dimension: movers[0].dimension,
        delta: movers[0].delta,
        drivenBy: signalOverrides
          .filter((s) => s.dimension === movers[0].dimension)
          .map((s) => s.signal),
      }
    : null;

  const compositeDelta = Math.round((simComposite.composite - baseResult.composite) * 1000) / 1000;

  const parts: string[] = [];
  if (compositeDelta > 0) {
    parts.push(`Composite improves ${(compositeDelta * 100).toFixed(1)} points.`);
  } else if (compositeDelta < 0) {
    parts.push(`Composite drops ${(Math.abs(compositeDelta) * 100).toFixed(1)} points.`);
  } else {
    parts.push('Composite unchanged.');
  }

  if (biggestMover) {
    const direction = biggestMover.delta > 0 ? 'improves' : 'degrades';
    parts.push(
      `Biggest mover: ${biggestMover.dimension} ${direction} ${(Math.abs(biggestMover.delta) * 100).toFixed(1)} points driven by ${biggestMover.drivenBy.join(', ')}.`,
    );
  }

  const newlyScored = dimensionDeltas.filter(
    (d) => d.originalStatus !== 'scored' && d.simulatedStatus === 'scored',
  );
  if (newlyScored.length > 0) {
    parts.push(
      `Simulation unlocks scoring for: ${newlyScored.map((d) => d.dimension).join(', ')}.`,
    );
  }

  const originalDims: Record<string, { score: number; status: string }> = {};
  const simulatedDims: Record<string, { score: number; status: string }> = {};
  for (const dim of [...CORE_DIMENSIONS, 'S' as Dimension]) {
    originalDims[dim] = { score: baseResult.dimensions[dim].score, status: baseResult.dimensions[dim].status };
    simulatedDims[dim] = { score: simDimensions[dim].score, status: simDimensions[dim].status };
  }

  return {
    original: {
      composite: baseResult.composite,
      dimensions: originalDims as Record<Dimension, { score: number; status: string }>,
    },
    simulated: {
      composite: simComposite.composite,
      dimensions: simulatedDims as Record<Dimension, { score: number; status: string }>,
    },
    compositeDelta,
    dimensionDeltas,
    biggestMover,
    signalOverrides,
    interpretation: parts.join(' '),
  };
}
