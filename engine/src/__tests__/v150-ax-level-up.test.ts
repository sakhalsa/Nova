import { SignalResult } from '../types.js';
import { scoreQ, scoreR } from '../scorer.js';
import { buildPresentation } from '../presentation.js';
import { computeComposite, resolveWeights } from '../scorer.js';
import type { DimensionScore, Dimension, CompositeResult } from '../types.js';

function makeSignals(entries: [string, number, string?][]): Map<string, SignalResult> {
  const m = new Map<string, SignalResult>();
  for (const [key, value, connector] of entries) {
    m.set(key, { key, value, source: 'live', connector });
  }
  return m;
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) { passed++; }
  else { failed++; console.error(`  FAIL: ${label}`); }
}

function assertClose(actual: number, expected: number, label: string, tolerance = 0.01): void {
  assert(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
}

// ---------------------------------------------------------------------------
// Q-Score runtime quality adjustment (Move 2)
// ---------------------------------------------------------------------------

console.log('--- Q-Score runtime quality adjustment ---');

{
  const base = makeSignals([
    ['defect_rate_ai', 1.6, 'sonarqube'],
    ['defect_rate_nonai', 3.2, 'sonarqube'],
    ['ai_test_pass_rate', 0.95, 'postman'],
    ['rework_rate_ai', 0.1, 'github'],
  ]);
  const qNoRuntime = scoreQ(base);
  assertClose(qNoRuntime.score, 0.4275, 'Q without runtime signals unchanged');
}

{
  const withRuntime = makeSignals([
    ['defect_rate_ai', 1.6, 'sonarqube'],
    ['defect_rate_nonai', 3.2, 'sonarqube'],
    ['ai_test_pass_rate', 0.95, 'postman'],
    ['rework_rate_ai', 0.1, 'github'],
    ['runtime_retry_behavior', 1.0, 'postman'],
    ['runtime_idempotency', 0.8, 'postman'],
    ['error_recovery_quality', 0.6, 'postman'],
    ['error_contract_depth', 0.7, 'postman'],
  ]);
  const qWithRuntime = scoreQ(withRuntime);
  // avg = (1.0 + 0.8 + 0.6 + 0.7) / 4 = 0.775
  // adj = (0.775 - 0.5) / 5 = 0.055
  // base = 0.4275 + 0.055 = 0.4825
  assertClose(qWithRuntime.score, 0.4825, 'Q with runtime signals includes adjustment');
  assert(qWithRuntime.score > 0.4275, 'Q with good runtime signals is higher than without');
}

{
  const lowRuntime = makeSignals([
    ['defect_rate_ai', 1.6, 'sonarqube'],
    ['defect_rate_nonai', 3.2, 'sonarqube'],
    ['ai_test_pass_rate', 0.95, 'postman'],
    ['rework_rate_ai', 0.1, 'github'],
    ['runtime_retry_behavior', 0.0, 'postman'],
    ['runtime_idempotency', 0.0, 'postman'],
  ]);
  const qLow = scoreQ(lowRuntime);
  // avg = 0, adj = (0 - 0.5) / 5 = -0.10
  // base 0.4275 - 0.10 = 0.3275
  assertClose(qLow.score, 0.3275, 'Q with poor runtime signals is penalized');
}

// ---------------------------------------------------------------------------
// R-Score with orchestration adaptability (Move 1)
// ---------------------------------------------------------------------------

console.log('--- R-Score adaptability from orchestration ---');

{
  const signals = makeSignals([
    ['cfr_ai', 0.05, 'datadog'],
    ['slo_attainment', 0.95, 'datadog'],
    ['contract_catch_rate', 0.90, 'postman'],
    ['uptime_ai', 0.999, 'pagerduty'],
    ['adaptability', 0.87, 'inngest'],
  ]);
  const r = scoreR(signals);
  // R = (1-0.05) * 0.95 * 0.90 * 0.999 * 0.87
  const expected = 0.95 * 0.95 * 0.90 * 0.999 * 0.87;
  assertClose(r.score, expected, 'R with Inngest adaptability');
  assert(r.status === 'scored', 'R scored with orchestration connector');
}

// ---------------------------------------------------------------------------
// Presentation: AX Pillar Mapping (Move 3)
// ---------------------------------------------------------------------------

console.log('--- AX Pillar Mapping ---');

{
  const dim = (d: Dimension, n: number): DimensionScore => ({
    dimension: d, score: n, status: 'scored', signals: [], connectorsSourcing: ['github'],
  });

  const dims: Record<Dimension, DimensionScore> = {
    Q: dim('Q', 0.7), L: dim('L', 0.5), R: dim('R', 0.8), C: dim('C', 0.6), S: dim('S', 0.75),
  };

  const weights = resolveWeights('balanced');
  const composite = computeComposite(dims, weights, 'Test', 'balanced');

  const signalValues = new Map<string, number>([
    ['defect_rate_ai', 0.02], ['defect_rate_nonai', 0.04],
    ['ai_test_pass_rate', 0.95], ['rework_rate_ai', 0.1],
    ['cycle_time_ai', 12], ['cycle_time_nonai', 24],
    ['cfr_ai', 0.05], ['slo_attainment', 0.95],
    ['contract_catch_rate', 0.9], ['uptime_ai', 0.999],
    ['adaptability', 0.87],
    ['spec_security_score', 0.8], ['dependabot_score', 0.9], ['code_scanning_score', 0.95],
    ['hours_saved_monthly', 100], ['total_ai_cost', 3000],
  ]);

  const pres = buildPresentation(composite, signalValues);

  assert(pres.axMapping.length === 4, 'AX mapping has 4 pillars');
  assert(pres.axMapping.some(p => p.pillar === 'Access'), 'Access pillar present');
  assert(pres.axMapping.some(p => p.pillar === 'Orchestration'), 'Orchestration pillar present');

  const access = pres.axMapping.find(p => p.pillar === 'Access')!;
  assert(access.coverage !== 'none', 'Access has some coverage when S signals present');
  assert(access.signals_contributing.length > 0, 'Access has contributing signals');

  const orch = pres.axMapping.find(p => p.pillar === 'Orchestration')!;
  assert(orch.coverage !== 'none', 'Orchestration has coverage when R signals present');
  assert(orch.signals_contributing.includes('adaptability'), 'Orchestration includes adaptability signal');
}

// ---------------------------------------------------------------------------
// Presentation: Epistemic Summary (Move 5)
// ---------------------------------------------------------------------------

console.log('--- Epistemic Summary ---');

{
  const dim = (d: Dimension, n: number): DimensionScore => ({
    dimension: d, score: n, status: 'scored',
    signals: [{ key: 'test', value: 1, source: 'live' }],
    connectorsSourcing: ['github'],
  });

  const dims: Record<Dimension, DimensionScore> = {
    Q: dim('Q', 0.7), L: dim('L', 0.5), R: dim('R', 0.8), C: dim('C', 0.6), S: dim('S', 0),
  };
  dims.S.status = 'unavailable';
  dims.S.signals = [];

  const weights = resolveWeights('balanced');
  const composite = computeComposite(dims, weights, 'Test', 'balanced');

  const signalValues = new Map<string, number>([
    ['defect_rate_ai', 0.02], ['cycle_time_ai', 12], ['cfr_ai', 0.05], ['total_ai_cost', 3000],
  ]);

  const pres = buildPresentation(composite, signalValues);
  const es = pres.epistemicSummary;

  assert(es.dimensions_scored > 0, 'epistemicSummary has scored dimensions');
  assert(es.signals_missing > 0, 'epistemicSummary reports missing signals');
  assert(es.honesty_statement.length > 50, 'honesty statement is substantive');
  assert(es.what_this_score_does_not_know.length > 0, 'blind spots listed');
  assert(es.honesty_statement.includes('live signal'), 'honesty statement mentions live signals');
  assert(es.honesty_statement.includes('AX pillar'), 'honesty statement mentions AX pillars');
}

// ---------------------------------------------------------------------------
// Empty signals: AX mapping shows 'none' coverage
// ---------------------------------------------------------------------------

console.log('--- AX Mapping edge: no signals ---');

{
  const dim = (d: Dimension, n: number): DimensionScore => ({
    dimension: d, score: n, status: 'calibrating', signals: [], connectorsSourcing: [],
  });

  const dims: Record<Dimension, DimensionScore> = {
    Q: dim('Q', 0), L: dim('L', 0), R: dim('R', 0), C: dim('C', 0), S: dim('S', 0),
  };

  const weights = resolveWeights('balanced');
  const composite = computeComposite(dims, weights, 'Test', 'balanced');
  const pres = buildPresentation(composite, new Map());

  for (const p of pres.axMapping) {
    assert(p.coverage === 'none', `${p.pillar} coverage is none with no signals`);
    assert(p.assessment.includes('Connect'), `${p.pillar} assessment suggests connecting`);
  }

  const es = pres.epistemicSummary;
  assert(es.signals_live === 0, 'no live signals when empty');
  assert(es.ax_pillars_covered === 0, '0 pillars covered when empty');
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
