import { SignalResult, WEIGHT_PROFILES, DimensionScore, Dimension, ValidationResult } from '../types.js';
import { scoreR, scoreQ, scoreL, scoreC, scoreS, computeComposite, resolveWeights } from '../scorer.js';
import { buildRunGuidance } from '../run-guidance.js';
import { STATE_OF_API_BASELINES } from '../dimensions.js';

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
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${label}`);
  }
}

function assertClose(actual: number, expected: number, label: string, tolerance = 0.001): void {
  assert(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
}

// ---------------------------------------------------------------------------
// R-Score tests
// ---------------------------------------------------------------------------

console.log('--- R-Score ---');

{
  const signals = makeSignals([
    ['cfr_ai', 0.03, 'datadog'],
    ['slo_attainment', 0.95, 'postman'],
    ['contract_catch_rate', 0.98, 'postman'],
    ['uptime_ai', 0.99, 'datadog'],
    ['adaptability', 1.0, 'splunk'],
  ]);
  const r = scoreR(signals);
  // R = (1-0.03) * 0.95 * 0.98 * 0.99 * 1.0 = 0.97 * 0.95 * 0.98 * 0.99
  const expected = 0.97 * 0.95 * 0.98 * 0.99 * 1.0;
  assertClose(r.score, expected, 'R full signals');
  assert(r.status === 'scored', 'R status scored');
}

{
  const signals = makeSignals([['cfr_ai', 1.0, 'datadog']]);
  const r = scoreR(signals);
  assertClose(r.score, 0, 'R with cfr=1 is zero');
}

{
  const r = scoreR(new Map());
  assertClose(r.score, 0, 'R with no signals returns 0 (calibrating)');
  assert(r.status === 'calibrating', 'R calibrating when no live signals');
}

// ---------------------------------------------------------------------------
// Q-Score tests
// ---------------------------------------------------------------------------

console.log('--- Q-Score ---');

{
  const signals = makeSignals([
    ['defect_rate_ai', 1.6, 'sonarqube'],
    ['defect_rate_nonai', 3.2, 'sonarqube'],
    ['ai_test_pass_rate', 0.95, 'postman'],
    ['rework_rate_ai', 0.1, 'github'],
  ]);
  const q = scoreQ(signals);
  // defect_component = 1 - (1.6/3.2) = 0.5
  // Q = 0.5 * 0.95 * (1-0.1) = 0.5 * 0.95 * 0.9 = 0.4275
  assertClose(q.score, 0.4275, 'Q with baselines');
  assert(q.status === 'scored', 'Q status scored');
}

{
  const signals = makeSignals([['rework_rate_ai', 0.05, 'github']]);
  const q = scoreQ(signals);
  assert(q.status === 'calibrating', 'Q calibrating without baseline');
}

{
  const signals = makeSignals([
    ['defect_rate_ai', 1.6, 'sonarqube'],
    ['rework_rate_ai', 0.05, 'github'],
  ]);
  const q = scoreQ(signals, 3.2);
  assert(q.status === 'scored', 'Q scored with external baseline');
  assert(q.score > 0, 'Q positive with external baseline');
}

// ---------------------------------------------------------------------------
// L-Score tests
// ---------------------------------------------------------------------------

console.log('--- L-Score ---');

{
  const signals = makeSignals([
    ['cycle_time_ai', 12, 'github'],
    ['cycle_time_nonai', 24, 'github'],
  ]);
  const l = scoreL(signals);
  assertClose(l.score, 0.5, 'L with 50% improvement');
  assert(l.status === 'scored', 'L status scored');
}

{
  const signals = makeSignals([['cycle_time_ai', 18, 'linear']]);
  const l = scoreL(signals);
  assert(l.status === 'calibrating', 'L calibrating without baseline');
}

{
  const signals = makeSignals([['cycle_time_ai', 18, 'github']]);
  const l = scoreL(signals, 24);
  assertClose(l.score, 0.25, 'L with external baseline');
}

{
  const signals = makeSignals([
    ['cycle_time_ai', 30, 'github'],
    ['cycle_time_nonai', 20, 'github'],
  ]);
  const l = scoreL(signals);
  assertClose(l.score, 0, 'L clamped to 0 when AI is slower');
}

{
  const signals = makeSignals([
    ['cycle_time_ai', 0, 'github'],
    ['cycle_time_nonai', 24, 'github'],
  ]);
  const l = scoreL(signals);
  assertClose(l.score, 1, 'L capped at 1 when AI cycle time is zero');
}

{
  const signals = makeSignals([
    ['defect_rate_ai', 0.06, 'sonarqube'],
    ['ai_test_pass_rate', 0.95, 'postman'],
    ['rework_rate_ai', 0.1, 'github'],
  ]);
  const q = scoreQ(signals, undefined, {
    scoringMode: 'portfolio',
    portfolioDefectBaseline: STATE_OF_API_BASELINES.baselineDefectRate,
  });
  assert(q.status === 'scored', 'Q portfolio scored');
  assertClose(q.score, 0.4275, 'Q portfolio uses SoTA-style baseline');
  assert(STATE_OF_API_BASELINES.locked, 'State of API baselines are locked');
  assertClose(STATE_OF_API_BASELINES.baselineDefectRate, 0.12, 'State of API defect baseline');
  assertClose(STATE_OF_API_BASELINES.baselineCycleTimeHours, 24, 'State of API cycle baseline');
}

// ---------------------------------------------------------------------------
// C-Score tests
// ---------------------------------------------------------------------------

console.log('--- C-Score ---');

{
  const signals = makeSignals([
    ['hours_saved_monthly', 100, 'github'],
    ['review_overhead_hours_monthly', 10, 'github'],
    ['total_ai_cost', 3000, 'portkey'],
  ]);
  const c = scoreC(signals, undefined, 2.0, 75);
  // labor = 100*75 = 7500, overhead = 10*75 = 750
  // C_raw = (7500-750)/3000 = 2.25
  // C_norm = min(2.25/2.0, 1) = 1.0
  assertClose(c.score, 1.0, 'C at target ROI');
  assert(c.status === 'scored', 'C status scored');
}

{
  const c = scoreC(new Map());
  assert(c.status === 'unavailable', 'C unavailable with no signals or cost');
}

{
  const signals = makeSignals([['hours_saved_monthly', 50, 'github']]);
  const c = scoreC(signals, 2000, 2.0, 75);
  // labor = 50*75 = 3750, overhead = 0, C_raw = 3750/2000 = 1.875
  // C_norm = min(1.875/2.0, 1) = 0.9375
  assertClose(c.score, 0.9375, 'C with manual cost fallback');
}

// ---------------------------------------------------------------------------
// S-Score tests
// ---------------------------------------------------------------------------

console.log('--- S-Score ---');

{
  const signals = makeSignals([
    ['spec_security_score', 0.8, 'crunch42'],
    ['dependabot_score', 0.9, 'github'],
    ['code_scanning_score', 0.95, 'github'],
  ]);
  const s = scoreS(signals);
  // S = 0.8 * 0.9 * 0.95 = 0.684
  assertClose(s.score, 0.684, 'S multiplicative');
  assert(s.status === 'scored', 'S status scored');
}

{
  const s = scoreS(new Map());
  assert(s.status === 'unavailable', 'S unavailable with no connectors');
  assertClose(s.score, 0, 'S score is 0 when unavailable');
}

// ---------------------------------------------------------------------------
// Composite tests
// ---------------------------------------------------------------------------

console.log('--- Composite ---');

{
  const dims = {
    R: { dimension: 'R' as const, score: 0.9, status: 'scored' as const, signals: [], connectorsSourcing: [] },
    Q: { dimension: 'Q' as const, score: 0.7, status: 'scored' as const, signals: [], connectorsSourcing: [] },
    L: { dimension: 'L' as const, score: 0.5, status: 'scored' as const, signals: [], connectorsSourcing: [] },
    C: { dimension: 'C' as const, score: 0.6, status: 'scored' as const, signals: [], connectorsSourcing: [] },
    S: { dimension: 'S' as const, score: 0.8, status: 'scored' as const, signals: [], connectorsSourcing: [] },
  };
  const weights = resolveWeights('balanced');
  const result = computeComposite(dims, weights, 'Test Org', 'balanced');
  // balanced: 0.25 each, composite = 0.25*0.7 + 0.25*0.5 + 0.25*0.9 + 0.25*0.6 = 0.675
  assertClose(result.composite, 0.675, 'Composite balanced');
  assert(!result.calibrating.includes('Q'), 'Q not in calibrating');
  assert(!result.calibrating.includes('S'), 'S not in calibrating when scored');
}

{
  // S NEVER enters composite
  const dims = {
    R: { dimension: 'R' as const, score: 0.9, status: 'scored' as const, signals: [], connectorsSourcing: [] },
    Q: { dimension: 'Q' as const, score: 0.7, status: 'scored' as const, signals: [], connectorsSourcing: [] },
    L: { dimension: 'L' as const, score: 0.5, status: 'scored' as const, signals: [], connectorsSourcing: [] },
    C: { dimension: 'C' as const, score: 0.6, status: 'scored' as const, signals: [], connectorsSourcing: [] },
    S: { dimension: 'S' as const, score: 0.0, status: 'unavailable' as const, signals: [], connectorsSourcing: [] },
  };
  const weights = resolveWeights('balanced');
  const result = computeComposite(dims, weights, 'Test Org', 'balanced');
  assertClose(result.composite, 0.675, 'Composite same regardless of S');
  assert(result.calibrating.includes('S'), 'S in calibrating when unavailable');
}

// Composite with calibrating dimensions renormalizes
{
  const dims = {
    R: { dimension: 'R' as const, score: 0.9, status: 'scored' as const, signals: [], connectorsSourcing: [] },
    Q: { dimension: 'Q' as const, score: 0, status: 'calibrating' as const, signals: [], connectorsSourcing: [] },
    L: { dimension: 'L' as const, score: 0, status: 'calibrating' as const, signals: [], connectorsSourcing: [] },
    C: { dimension: 'C' as const, score: 0.6, status: 'scored' as const, signals: [], connectorsSourcing: [] },
    S: { dimension: 'S' as const, score: 0, status: 'unavailable' as const, signals: [], connectorsSourcing: [] },
  };
  const weights = resolveWeights('balanced');
  const result = computeComposite(dims, weights, 'Test Org', 'balanced');
  // Only R and C scored. Renormalized: R weight 0.25/(0.25+0.25)=0.5, C weight 0.5
  // composite = 0.5*0.9 + 0.5*0.6 = 0.75
  assertClose(result.composite, 0.75, 'Composite renormalized during calibration');
  assert(result.calibrating.includes('Q'), 'Q in calibrating');
  assert(result.calibrating.includes('L'), 'L in calibrating');
}

// Weight profiles sum to 1
console.log('--- Weight Profiles ---');
for (const [name, profile] of Object.entries(WEIGHT_PROFILES)) {
  const w = profile.weights;
  const sum = w.q + w.l + w.r + w.c;
  assertClose(sum, 1.0, `${name} weights sum to 1.0`);
}

// Invalid weight profile throws
{
  let threw = false;
  try {
    resolveWeights('nonexistent' as any);
  } catch {
    threw = true;
  }
  assert(threw, 'Invalid weight profile throws');
}

// ---------------------------------------------------------------------------
// Run guidance
// ---------------------------------------------------------------------------

console.log('--- Run guidance ---');

{
  const validation: ValidationResult = {
    orgName: 'T',
    weightProfile: 'balanced',
    connectors: [
      {
        name: 'postman',
        configured: true,
        connected: false,
        error: '401 Unauthorized',
        dimensions: ['Q', 'R'],
      },
    ],
    coverage: { Q: [], L: [], R: [], C: [], S: [] },
    warnings: [],
    sAvailable: false,
    sEnabled: false,
    costSource: 'none',
    ready: false,
  };

  const dim = (d: Dimension, n: number, st: DimensionScore['status']): DimensionScore => ({
    dimension: d,
    score: n,
    status: st,
    signals: [],
    connectorsSourcing: [],
  });

  const dimensions = {
    Q: dim('Q', 0.5, 'calibrating'),
    L: dim('L', 0.5, 'calibrating'),
    R: dim('R', 0.5, 'calibrating'),
    C: dim('C', 0.5, 'calibrating'),
    S: dim('S', 0, 'unavailable'),
  };

  const composite = computeComposite(dimensions, resolveWeights('balanced'), 'T', 'balanced', {
    scoringMode: 'strict',
    scoredCoreCount: 0,
  });

  const pd = {
    intro: 'i',
    whenThisApplies: 'w',
    topics: [],
  };

  const rg = buildRunGuidance({
    validation,
    config: { orgName: 'T', weightProfile: 'balanced', connectors: {} },
    composite,
    dimensions,
    productDomain: pd,
    signalKeysPresent: ['cfr_ai', 'total_ai_cost'],
  });

  assert(rg.setup.connectorHints.length === 1, 'setup captures failed connector');
  assert(rg.setup.connectorHints[0].nextFix.includes('token'), '401 maps to token hint');
  assert(rg.signalHints.some((s) => s.key === 'cfr_ai' && s.seenInThisRun), 'cfr_ai seen');
  assert(rg.signalHints.some((s) => s.key === 'defect_rate_ai' && !s.seenInThisRun), 'missing signal not seen');
  assert(rg.workflow.firstRun.length >= 2, 'workflow steps present');
  assert(rg.productDomain.intro === 'i', 'productDomain embedded');
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
