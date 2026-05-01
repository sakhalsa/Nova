import { Dimension, ScoreRecord, CORE_DIMENSIONS, ALL_DIMENSIONS } from './types.js';
import { getLocalHistory } from './history.js';

export interface SignalChange {
  signal: string;
  valueA: number | null;
  valueB: number | null;
  delta: number | null;
  connector: string;
  interpretation: string;
}

export interface ConnectorChanges {
  added: string[];
  removed: string[];
  unchanged: string[];
}

export interface ScoreDiff {
  dimension: Dimension;
  scoreA: number;
  scoreB: number;
  delta: number;
  statusA: string;
  statusB: string;
  signalChanges: SignalChange[];
  connectorChanges: ConnectorChanges;
}

export interface AssessmentDiff {
  runA: { id: string; timestamp: string; orgName: string };
  runB: { id: string; timestamp: string; orgName: string };
  compositeA: number;
  compositeB: number;
  compositeDelta: number;
  dimensionDiffs: Record<Dimension, ScoreDiff>;
  modeChanged: boolean;
  profileChanged: boolean;
  newDimensionsScored: Dimension[];
  dimensionsLost: Dimension[];
  connectorCountDelta: number;
  interpretation: string;
}

const SIGNAL_DIMENSION_MAP: Record<string, Dimension> = {
  cfr_ai: 'R', slo_attainment: 'R', contract_catch_rate: 'R', uptime_ai: 'R', adaptability: 'R',
  defect_rate_ai: 'Q', defect_rate_nonai: 'Q', ai_test_pass_rate: 'Q', rework_rate_ai: 'Q',
  cycle_time_ai: 'L', cycle_time_nonai: 'L', deploy_frequency: 'L',
  hours_saved_monthly: 'C', review_overhead_hours_monthly: 'C', total_ai_cost: 'C',
  spec_security_score: 'S', dependabot_score: 'S', code_scanning_score: 'S',
};

function signalInterpretation(key: string, valA: number | null, valB: number | null): string {
  if (valA === null && valB !== null) return `${key} is new in run B (${valB.toFixed(3)}).`;
  if (valA !== null && valB === null) return `${key} was lost between runs.`;
  if (valA === null || valB === null) return '';
  const delta = valB - valA;
  if (Math.abs(delta) < 0.001) return `${key} unchanged.`;

  const lowerIsBetter = ['cfr_ai', 'defect_rate_ai', 'rework_rate_ai', 'total_ai_cost', 'review_overhead_hours_monthly'];
  const improved = lowerIsBetter.includes(key) ? delta < 0 : delta > 0;
  const direction = improved ? 'improved' : 'degraded';
  return `${key} ${direction} from ${valA.toFixed(3)} to ${valB.toFixed(3)}.`;
}

function buildDimensionDiff(
  dim: Dimension,
  recordA: ScoreRecord,
  recordB: ScoreRecord,
): ScoreDiff {
  const scoreA = (recordA.scores as Record<string, number>)[dim] ?? 0;
  const scoreB = (recordB.scores as Record<string, number>)[dim] ?? 0;
  const statusA = recordA.calibrating.includes(dim) ? 'calibrating' : 'scored';
  const statusB = recordB.calibrating.includes(dim) ? 'calibrating' : 'scored';

  const allSignalKeys = new Set<string>();
  for (const [k, d] of Object.entries(SIGNAL_DIMENSION_MAP)) {
    if (d === dim) allSignalKeys.add(k);
  }
  for (const k of Object.keys(recordA.signals)) {
    if (SIGNAL_DIMENSION_MAP[k] === dim) allSignalKeys.add(k);
  }
  for (const k of Object.keys(recordB.signals)) {
    if (SIGNAL_DIMENSION_MAP[k] === dim) allSignalKeys.add(k);
  }

  const signalChanges: SignalChange[] = [];
  for (const key of allSignalKeys) {
    const sigA = recordA.signals[key];
    const sigB = recordB.signals[key];
    const valA = sigA?.value ?? null;
    const valB = sigB?.value ?? null;
    if (valA === null && valB === null) continue;

    signalChanges.push({
      signal: key,
      valueA: valA,
      valueB: valB,
      delta: valA !== null && valB !== null ? Math.round((valB - valA) * 1000) / 1000 : null,
      connector: sigB?.source || sigA?.source || '',
      interpretation: signalInterpretation(key, valA, valB),
    });
  }

  const connsA = new Set(recordA.connectors.connected);
  const connsB = new Set(recordB.connectors.connected);
  const added = [...connsB].filter((c) => !connsA.has(c));
  const removed = [...connsA].filter((c) => !connsB.has(c));
  const unchanged = [...connsA].filter((c) => connsB.has(c));

  return {
    dimension: dim,
    scoreA,
    scoreB,
    delta: Math.round((scoreB - scoreA) * 1000) / 1000,
    statusA,
    statusB,
    signalChanges,
    connectorChanges: { added, removed, unchanged },
  };
}

export function resolveRecordId(
  records: ScoreRecord[],
  ref: string,
): ScoreRecord | null {
  if (ref === 'latest') return records.length > 0 ? records[records.length - 1] : null;
  if (ref === 'previous') return records.length > 1 ? records[records.length - 2] : null;

  const byIndex = parseInt(ref, 10);
  if (!isNaN(byIndex) && byIndex >= 0 && byIndex < records.length) return records[byIndex];

  return records.find((r) => r.id === ref) ?? null;
}

export function diffAssessments(recordA: ScoreRecord, recordB: ScoreRecord): AssessmentDiff {
  const dimensionDiffs: Record<string, ScoreDiff> = {};
  for (const dim of ALL_DIMENSIONS) {
    dimensionDiffs[dim] = buildDimensionDiff(dim, recordA, recordB);
  }

  const scoredA = CORE_DIMENSIONS.filter((d) => !recordA.calibrating.includes(d));
  const scoredB = CORE_DIMENSIONS.filter((d) => !recordB.calibrating.includes(d));
  const newDimensionsScored = scoredB.filter((d) => !scoredA.includes(d));
  const dimensionsLost = scoredA.filter((d) => !scoredB.includes(d));

  const compositeDelta = Math.round((recordB.composite - recordA.composite) * 1000) / 1000;

  const parts: string[] = [];

  if (compositeDelta > 0) {
    parts.push(`Composite improved ${(compositeDelta * 100).toFixed(1)} points.`);
  } else if (compositeDelta < 0) {
    parts.push(`Composite dropped ${(Math.abs(compositeDelta) * 100).toFixed(1)} points.`);
  } else {
    parts.push('Composite unchanged.');
  }

  const coreDiffs = CORE_DIMENSIONS
    .map((d) => dimensionDiffs[d])
    .filter((d) => Math.abs(d.delta) > 0.005)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  for (const dd of coreDiffs.slice(0, 2)) {
    const direction = dd.delta > 0 ? 'improved' : 'degraded';
    const drivers = dd.signalChanges
      .filter((s) => s.delta !== null && Math.abs(s.delta) > 0.001)
      .map((s) => s.signal);
    if (drivers.length > 0) {
      parts.push(`${dd.dimension} ${direction} ${(Math.abs(dd.delta) * 100).toFixed(1)} points driven by ${drivers.join(', ')}.`);
    }
  }

  if (newDimensionsScored.length > 0) {
    parts.push(`New dimensions scored: ${newDimensionsScored.join(', ')}.`);
  }
  if (dimensionsLost.length > 0) {
    parts.push(`Dimensions lost: ${dimensionsLost.join(', ')}.`);
  }

  const connCountA = recordA.connectors.connected.length;
  const connCountB = recordB.connectors.connected.length;

  return {
    runA: { id: recordA.id, timestamp: recordA.timestamp, orgName: recordA.orgName },
    runB: { id: recordB.id, timestamp: recordB.timestamp, orgName: recordB.orgName },
    compositeA: recordA.composite,
    compositeB: recordB.composite,
    compositeDelta,
    dimensionDiffs: dimensionDiffs as Record<Dimension, ScoreDiff>,
    modeChanged: recordA.calibrating.length !== recordB.calibrating.length,
    profileChanged: recordA.weightProfile !== recordB.weightProfile,
    newDimensionsScored,
    dimensionsLost,
    connectorCountDelta: connCountB - connCountA,
    interpretation: parts.join(' '),
  };
}

export async function diffByRefs(
  refA: string,
  refB: string,
  configPath?: string,
): Promise<AssessmentDiff> {
  const records = getLocalHistory(configPath);
  if (records.length < 2 && (refA === 'latest' || refA === 'previous')) {
    throw new Error(`Need at least 2 history records to diff. Found ${records.length}.`);
  }

  const recordA = resolveRecordId(records, refA);
  const recordB = resolveRecordId(records, refB);

  if (!recordA) throw new Error(`Run "${refA}" not found in history.`);
  if (!recordB) throw new Error(`Run "${refB}" not found in history.`);

  return diffAssessments(recordA, recordB);
}
