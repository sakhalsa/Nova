import { SimulationRequest, simulateAssessment } from '../simulate.js';
import { CompositeResult, DimensionScore, Dimension, CORE_DIMENSIONS, SignalResult } from '../types.js';

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

function assertClose(actual: number, expected: number, label: string, tolerance = 0.05): void {
  assert(Math.abs(actual - expected) <= tolerance, `${label}: expected ~${expected}, got ${actual}`);
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

function makeBaseResult(): CompositeResult {
  return {
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
    schemaVersion: '1',
    assessmentMode: 'full',
    scoringMode: 'strict',
    partialComposite: false,
    scoredCoreCount: 4,
    gap: 0.35,
  } as CompositeResult;
}

console.log('--- Simulation Tests ---');

// Improving cfr_ai should improve R and composite
{
  const base = makeBaseResult();
  const req: SimulationRequest = {
    baseResult: base,
    hypothetical: { cfr_ai: 0.01 },
    baselineDefectRate: 4.0,
    baselineCycleTimeHours: 24,
    monthlyAiCost: 5000,
  };
  const result = simulateAssessment(req);

  assert(result.simulated.composite >= result.original.composite, 'Lower cfr improves composite');
  assert(result.compositeDelta >= 0, 'Positive composite delta');
  assert(result.signalOverrides.length === 1, 'One signal override');
  assert(result.signalOverrides[0].signal === 'cfr_ai', 'Override is cfr_ai');
  assert(result.signalOverrides[0].original === 0.05, 'Original cfr_ai value');
  assert(result.signalOverrides[0].simulated === 0.01, 'Simulated cfr_ai value');
  assert(result.interpretation.length > 0, 'Has interpretation');

  const rDelta = result.dimensionDeltas.find((d) => d.dimension === 'R');
  assert(rDelta !== undefined && rDelta.delta > 0, 'R dimension improved');
}

// No-op simulation should yield zero delta
{
  const base = makeBaseResult();
  const req: SimulationRequest = {
    baseResult: base,
    hypothetical: { cfr_ai: 0.05 },
    baselineDefectRate: 4.0,
    baselineCycleTimeHours: 24,
    monthlyAiCost: 5000,
  };
  const result = simulateAssessment(req);
  assertClose(result.compositeDelta, 0, 'Same signal yields zero delta', 0.01);
}

// biggestMover identification
{
  const base = makeBaseResult();
  const req: SimulationRequest = {
    baseResult: base,
    hypothetical: {
      cfr_ai: 0.50,
      cycle_time_ai: 1,
    },
    baselineDefectRate: 4.0,
    baselineCycleTimeHours: 24,
    monthlyAiCost: 5000,
  };
  const result = simulateAssessment(req);
  assert(result.biggestMover !== null, 'Has biggest mover');
  assert(result.dimensionDeltas.length === 5, '5 dimension deltas (QLRCS)');
}

console.log(`\nSimulation: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
