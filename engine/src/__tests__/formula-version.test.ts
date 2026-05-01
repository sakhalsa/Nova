import { getCurrentFormula, getFormulaHistory, getFormulaById, migrateResult, MigrationRequest } from '../formula-version.js';
import { CompositeResult, DimensionScore, Dimension, SCHEMA_VERSION } from '../types.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${label}`);
  }
}

function makeDimScore(dim: Dimension, score: number, signals: [string, number, string?][]): DimensionScore {
  return {
    dimension: dim,
    score,
    status: 'scored',
    signals: signals.map(([key, value, connector]) => ({
      key,
      value,
      source: 'live',
      connector: connector || 'test',
    })),
    connectorsSourcing: [...new Set(signals.map(([, , c]) => c || 'test'))],
  };
}

console.log('--- Formula Version Tests ---');

// getCurrentFormula returns valid structure
{
  const formula = getCurrentFormula();
  assert(formula.id.length > 0, 'Formula has ID');
  assert(formula.schemaVersion === SCHEMA_VERSION, 'Schema version matches');
  assert(formula.formulas.Q.length > 0, 'Q formula defined');
  assert(formula.formulas.L.length > 0, 'L formula defined');
  assert(formula.formulas.R.length > 0, 'R formula defined');
  assert(formula.formulas.C.length > 0, 'C formula defined');
  assert(formula.formulas.S.length > 0, 'S formula defined');
  assert(formula.signalKeys.R.includes('cfr_ai'), 'R signals include cfr_ai');
  assert(formula.signalKeys.Q.includes('defect_rate_ai'), 'Q signals include defect_rate_ai');
  assert(formula.changelog.length > 0, 'Has changelog');
}

// getFormulaHistory returns at least current
{
  const history = getFormulaHistory();
  assert(history.length >= 1, 'History has at least one version');
  assert(history[0].id === getCurrentFormula().id, 'First history entry is current');
}

// getFormulaById finds current
{
  const current = getCurrentFormula();
  const found = getFormulaById(current.id);
  assert(found !== null, 'Found current formula by ID');
  assert(found!.id === current.id, 'IDs match');
}

// getFormulaById returns null for unknown
{
  const found = getFormulaById('nonexistent-formula');
  assert(found === null, 'Returns null for unknown formula');
}

// migrateResult produces valid output
{
  const baseResult: CompositeResult = {
    composite: 0.7,
    dimensions: {
      R: makeDimScore('R', 0.85, [
        ['cfr_ai', 0.05, 'datadog'],
        ['slo_attainment', 0.95, 'postman'],
        ['contract_catch_rate', 0.98, 'postman'],
        ['uptime_ai', 0.99, 'datadog'],
        ['adaptability', 1.0, 'splunk'],
      ]),
      Q: makeDimScore('Q', 0.6, [
        ['defect_rate_ai', 2.0, 'sonarqube'],
        ['defect_rate_nonai', 4.0, 'sonarqube'],
        ['ai_test_pass_rate', 0.9, 'postman'],
        ['rework_rate_ai', 0.1, 'github'],
      ]),
      L: makeDimScore('L', 0.5, [
        ['cycle_time_ai', 12, 'github'],
        ['cycle_time_nonai', 24, 'github'],
      ]),
      C: makeDimScore('C', 0.65, [
        ['hours_saved_monthly', 200, 'github'],
        ['review_overhead_hours_monthly', 20, 'github'],
        ['total_ai_cost', 5000, 'portkey'],
      ]),
      S: makeDimScore('S', 0.9, [
        ['spec_security_score', 0.95, 'crunch42'],
        ['dependabot_score', 0.98, 'github'],
        ['code_scanning_score', 0.97, 'github'],
      ]),
    },
    weights: { q: 0.25, l: 0.25, r: 0.25, c: 0.25 },
    weightProfile: 'balanced',
    calibrating: [],
    weakest: { dimension: 'L', score: 0.5 },
    strongest: { dimension: 'R', score: 0.85 },
    orgName: 'TestCorp',
    timestamp: '2026-04-28T12:00:00Z',
    schemaVersion: SCHEMA_VERSION,
    assessmentMode: 'full',
    scoringMode: 'strict',
    partialComposite: false,
    scoredCoreCount: 4,
    gap: 0.35,
  } as CompositeResult;

  const req: MigrationRequest = {
    result: baseResult,
    baselineDefectRate: 4.0,
    baselineCycleTimeHours: 24,
    monthlyAiCost: 5000,
  };

  const migrated = migrateResult(req);
  assert(migrated.original.composite === 0.7, 'Original composite preserved');
  assert(migrated.migrated.composite > 0, 'Migrated composite calculated');
  assert(migrated.signalsPreserved.length > 0, 'Signals preserved');
  assert(migrated.migrationNote.length > 0, 'Has migration note');
  assert(migrated.migrated.formulaId === getCurrentFormula().id, 'Target formula matches current');
}

// migrateResult throws for unknown formula
{
  const baseResult: CompositeResult = {
    composite: 0.5,
    dimensions: {
      R: makeDimScore('R', 0.5, []),
      Q: makeDimScore('Q', 0.5, []),
      L: makeDimScore('L', 0.5, []),
      C: makeDimScore('C', 0.5, []),
      S: makeDimScore('S', 0.5, []),
    },
    weights: { q: 0.25, l: 0.25, r: 0.25, c: 0.25 },
    weightProfile: 'balanced',
    calibrating: [],
    weakest: null,
    strongest: null,
    orgName: 'Test',
    timestamp: '2026-04-28T12:00:00Z',
    schemaVersion: '1',
    assessmentMode: 'full',
    scoringMode: 'strict',
    partialComposite: false,
    scoredCoreCount: 4,
    gap: 0,
  } as CompositeResult;

  let threw = false;
  try {
    migrateResult({ result: baseResult, targetFormulaId: 'nonexistent' });
  } catch {
    threw = true;
  }
  assert(threw, 'Throws for unknown target formula');
}

console.log(`\nFormula Version: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
