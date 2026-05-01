import {
  CompositeResult,
  Dimension,
  DimensionScore,
  SignalResult,
  CORE_DIMENSIONS,
  SCHEMA_VERSION,
  ScoringMode,
  WeightProfileName,
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

export interface FormulaVersion {
  id: string;
  schemaVersion: string;
  formulas: Record<Dimension, string>;
  signalKeys: Record<Dimension, string[]>;
  changelog: string;
  previousVersion: string | null;
  migrationAvailable: boolean;
  publishedDate: string;
}

const CURRENT_FORMULA: FormulaVersion = {
  id: 'qlrc-2026-04',
  schemaVersion: SCHEMA_VERSION,
  formulas: {
    Q: '(1 - defect_rate_ai / defect_rate_nonai) * ai_test_pass_rate * (1 - rework_rate_ai)',
    L: '1 - (cycle_time_ai / cycle_time_nonai)',
    R: '(1 - cfr_ai) * slo_attainment * contract_catch_rate * uptime_ai * adaptability',
    C: 'min((hours_saved * hourlyRate - overhead * hourlyRate) / total_ai_cost / targetRoi, 1.0)',
    S: 'spec_security_score * dependabot_score * code_scanning_score',
  },
  signalKeys: {
    Q: ['defect_rate_ai', 'defect_rate_nonai', 'ai_test_pass_rate', 'rework_rate_ai'],
    L: ['cycle_time_ai', 'cycle_time_nonai'],
    R: ['cfr_ai', 'slo_attainment', 'contract_catch_rate', 'uptime_ai', 'adaptability'],
    C: ['hours_saved_monthly', 'review_overhead_hours_monthly', 'total_ai_cost'],
    S: ['spec_security_score', 'dependabot_score', 'code_scanning_score'],
  },
  changelog: 'Initial published formula. Multiplicative R and S. Q and L support strict (measured baseline) and portfolio (industry prior) modes. C normalizes against target ROI.',
  previousVersion: null,
  migrationAvailable: false,
  publishedDate: '2026-04-15',
};

const FORMULA_HISTORY: FormulaVersion[] = [CURRENT_FORMULA];

export function getCurrentFormula(): FormulaVersion {
  return CURRENT_FORMULA;
}

export function getFormulaHistory(): FormulaVersion[] {
  return [...FORMULA_HISTORY];
}

export function getFormulaById(id: string): FormulaVersion | null {
  return FORMULA_HISTORY.find((f) => f.id === id) ?? null;
}

export interface MigrationRequest {
  result: CompositeResult;
  targetFormulaId?: string;
  baselineDefectRate?: number;
  baselineCycleTimeHours?: number;
  monthlyAiCost?: number;
  targetRoi?: number;
  hourlyRate?: number;
}

export interface MigrationResult {
  original: {
    formulaId: string;
    composite: number;
    dimensions: Record<Dimension, { score: number; status: string }>;
  };
  migrated: {
    formulaId: string;
    composite: number;
    dimensions: Record<Dimension, { score: number; status: string }>;
  };
  signalsPreserved: string[];
  signalsLost: string[];
  warnings: string[];
  migrationNote: string;
}

export function migrateResult(req: MigrationRequest): MigrationResult {
  const targetFormula = req.targetFormulaId
    ? getFormulaById(req.targetFormulaId)
    : CURRENT_FORMULA;

  if (!targetFormula) {
    throw new Error(`Formula "${req.targetFormulaId}" not found. Available: ${FORMULA_HISTORY.map((f) => f.id).join(', ')}`);
  }

  const { result } = req;
  const warnings: string[] = [];

  const signals = new Map<string, SignalResult>();
  for (const dim of Object.values(result.dimensions)) {
    for (const sig of dim.signals) {
      signals.set(sig.key, sig);
    }
  }

  const allRequiredKeys = new Set<string>();
  for (const keys of Object.values(targetFormula.signalKeys)) {
    for (const k of keys) allRequiredKeys.add(k);
  }

  const preserved = [...signals.keys()].filter((k) => allRequiredKeys.has(k));
  const lost = [...signals.keys()].filter((k) => !allRequiredKeys.has(k));

  if (lost.length > 0) {
    warnings.push(`Signals not used in target formula: ${lost.join(', ')}.`);
  }

  const missingRequired = [...allRequiredKeys].filter((k) => !signals.has(k));
  if (missingRequired.length > 0) {
    warnings.push(`Target formula expects signals not present in original: ${missingRequired.join(', ')}. Defaults will apply.`);
  }

  const scoringMode: ScoringMode = result.scoringMode || 'strict';
  const baseDefect = req.baselineDefectRate;
  const baseCycle = req.baselineCycleTimeHours;

  const qOpts = scoringMode === 'portfolio'
    ? { scoringMode: 'portfolio' as const, portfolioDefectBaseline: baseDefect }
    : { scoringMode: 'strict' as const };
  const lOpts = scoringMode === 'portfolio'
    ? { scoringMode: 'portfolio' as const, portfolioCycleHours: baseCycle }
    : { scoringMode: 'strict' as const };

  const migratedDimensions: Record<Dimension, DimensionScore> = {
    R: scoreR(signals),
    Q: scoreQ(signals, baseDefect, qOpts),
    L: scoreL(signals, baseCycle, lOpts),
    C: scoreC(signals, req.monthlyAiCost, req.targetRoi ?? 2.0, req.hourlyRate ?? 75),
    S: scoreS(signals),
  };

  const weights = resolveWeights(result.weightProfile);
  const migratedComposite = computeComposite(
    migratedDimensions,
    weights,
    result.orgName,
    result.weightProfile,
    { scoringMode },
  );

  const originalDims: Record<string, { score: number; status: string }> = {};
  const migratedDims: Record<string, { score: number; status: string }> = {};
  for (const dim of [...CORE_DIMENSIONS, 'S' as Dimension]) {
    originalDims[dim] = { score: result.dimensions[dim].score, status: result.dimensions[dim].status };
    migratedDims[dim] = { score: migratedDimensions[dim].score, status: migratedDimensions[dim].status };
  }

  const originalFormulaId = result.schemaVersion === CURRENT_FORMULA.schemaVersion
    ? CURRENT_FORMULA.id
    : `unknown-${result.schemaVersion}`;

  return {
    original: {
      formulaId: originalFormulaId,
      composite: result.composite,
      dimensions: originalDims as Record<Dimension, { score: number; status: string }>,
    },
    migrated: {
      formulaId: targetFormula.id,
      composite: migratedComposite.composite,
      dimensions: migratedDims as Record<Dimension, { score: number; status: string }>,
    },
    signalsPreserved: preserved,
    signalsLost: lost,
    warnings,
    migrationNote: originalFormulaId === targetFormula.id
      ? 'Re-scored under the same formula version. Differences reflect rounding or default handling.'
      : `Migrated from ${originalFormulaId} to ${targetFormula.id}. ${targetFormula.changelog}`,
  };
}
