import {
  CompositeResult,
  Dimension,
  DimensionScore,
  CORE_DIMENSIONS,
  ALL_DIMENSIONS,
} from './types.js';
import { BENCHMARKS } from './benchmarks.js';

// ---------------------------------------------------------------------------
// Stage classification
// ---------------------------------------------------------------------------

export type Stage = 'Foundation' | 'Growth' | 'Scale' | 'Leader';

export function toIndex(score: number): number {
  return Math.round(Math.max(0, Math.min(1, score)) * 100);
}

export function toStage(index: number): Stage {
  if (index >= 85) return 'Leader';
  if (index >= 70) return 'Scale';
  if (index >= 50) return 'Growth';
  return 'Foundation';
}

// ---------------------------------------------------------------------------
// Hour multipliers
//
// Derived from Forrester TEI 2024 analysis of 500-person engineering org:
//   Q: 85 hrs/mo = defect triage (40) + rework avoidance (30) + review reduction (15)
//   R: 90 hrs/mo = incident response (50) + SLO investigation (25) + rollback avoidance (15)
//   L: 95 hrs/mo = cycle time savings (55) + queue reduction (25) + deployment automation (15)
//   C: 70 hrs/mo = cost optimization (35) + tool consolidation (20) + billing investigation (15)
// ---------------------------------------------------------------------------

export const HOUR_MULTIPLIERS: Record<string, number> = { Q: 85, R: 90, L: 95, C: 70 };

// ---------------------------------------------------------------------------
// Factor analysis
// ---------------------------------------------------------------------------

export interface Factor {
  label: string;
  value: string;
  raw: number;
  highlight: 'good' | 'warn' | 'bad' | 'neutral';
}

export interface MeasuredItem {
  label: string;
  description: string;
  source: string;
}

export interface BenchmarkEntry {
  label: string;
  value: number;
  color?: string;
  is_you?: boolean;
}

export interface ActionRecommendation {
  title: string;
  detail: string;
  short: string;
  focus: string;
  lift: number;
  dim_code: string;
}

export interface DimensionNarrative {
  dimension: Dimension;
  index: number;
  stage: Stage;
  hours: number;
  narrative: string;
  formula: { expression: string; result: string };
  factors: Factor[];
  measured: MeasuredItem[];
  benchmarks: BenchmarkEntry[];
  insight: { text: string; source: string } | null;
  action: ActionRecommendation | null;
}

// ---------------------------------------------------------------------------
// AX Pillar Mapping (v1.5.0)
// ---------------------------------------------------------------------------

export type AXPillarName = 'Access' | 'Context' | 'Tools' | 'Orchestration';

export interface AXPillarMapping {
  pillar: AXPillarName;
  aiei_dimensions: Dimension[];
  signals_contributing: string[];
  coverage: 'full' | 'partial' | 'none';
  assessment: string;
}

// ---------------------------------------------------------------------------
// Epistemic Summary (v1.5.0)
// ---------------------------------------------------------------------------

export interface EpistemicSummary {
  dimensions_scored: number;
  dimensions_calibrating: number;
  signals_live: number;
  signals_fallback: number;
  signals_missing: number;
  assessment_mode: 'full' | 'readiness';
  ax_pillars_covered: number;
  honesty_statement: string;
  what_this_score_does_not_know: string[];
}

export interface PresentationResult {
  overall: {
    index: number;
    stage: Stage;
    narrative: string;
    hours_total: number;
    hours_available: number;
  };
  dimensions: Record<Dimension, DimensionNarrative>;
  recommendations: Array<{
    dimension: string;
    dim_code: string;
    priority?: string;
    title: string;
    body: string;
    impact: string;
    lift: number;
  }>;
  axMapping: AXPillarMapping[];
  epistemicSummary: EpistemicSummary;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function factor(label: string, value: string, raw: number, highlight: Factor['highlight']): Factor {
  return { label, value, raw, highlight };
}

function connectorSource(sourcing: string[], preferred: string): string {
  const match = sourcing.find(s => s.toLowerCase().includes(preferred));
  if (match) return `${match} (live)`;
  if (sourcing.length > 0) return `${sourcing[0]} (live)`;
  return 'mock fallback';
}

// ---------------------------------------------------------------------------
// Q narrative
// ---------------------------------------------------------------------------

function narrateQ(ds: DimensionScore, signals: Map<string, number>): DimensionNarrative {
  const index = toIndex(ds.score);
  const stage = toStage(index);
  const hours = Math.round(ds.score * HOUR_MULTIPLIERS.Q);

  const defectAi = signals.get('defect_rate_ai') ?? 0;
  const defectNonAi = signals.get('defect_rate_nonai') ?? 0;
  const testPass = signals.get('ai_test_pass_rate') ?? 1;
  const rework = signals.get('rework_rate_ai') ?? 0;
  const cq = signals.get('collection_quality') ?? 0;
  const agentScore = signals.get('agent_score') ?? 0;

  const factors: Factor[] = [
    factor('Defect Rate (AI)', pct(defectAi), defectAi, defectAi < 0.08 ? 'good' : defectAi < 0.15 ? 'warn' : 'bad'),
    factor('Test Pass Rate', pct(testPass), testPass, testPass > 0.93 ? 'good' : 'warn'),
    factor('Rework Rate', pct(rework), rework, rework < 0.10 ? 'good' : 'warn'),
  ];

  if (cq > 0) {
    factors.push(factor('Collection Quality', String(Math.round(cq * 100)), cq * 100, cq >= 0.80 ? 'good' : 'warn'));
  }
  if (agentScore > 0) {
    factors.push(factor('Agent Score', String(Math.round(agentScore * 100)), agentScore * 100, agentScore >= 0.90 ? 'good' : agentScore >= 0.70 ? 'warn' : 'bad'));
  }

  const defectComponent = defectNonAi > 0 ? (1 - defectAi / defectNonAi) : 0;
  const rawBase = defectComponent * testPass * (1 - rework);

  let formulaExpr = `Q = (1 - defect_ai/baseline) x test_pass x (1 - rework)\n  = (1 - ${defectAi.toFixed(3)}/${defectNonAi.toFixed(3)}) x ${testPass.toFixed(3)} x (1 - ${rework.toFixed(3)}) = ${rawBase.toFixed(4)}`;
  let formulaResult = `Index: ${index}`;

  if (cq > 0) {
    const cqAdj = (cq * 100 - 70) / 300;
    formulaExpr += `\n  + collection_quality adjustment: (${Math.round(cq * 100)} - 70) / 300 = ${cqAdj.toFixed(4)}`;
    formulaResult += ` (includes collection quality at ${Math.round(cq * 100)})`;
  }
  if (agentScore > 0) {
    const agentAdj = (agentScore * 100 - 70) / 500;
    formulaExpr += `\n  + agent_score adjustment: (${Math.round(agentScore * 100)} - 70) / 500 = ${agentAdj.toFixed(4)}`;
    formulaResult += ` (includes agent score at ${Math.round(agentScore * 100)})`;
  }

  const cqNote = cq > 0
    ? cq < 0.80 ? ` Collection quality at ${Math.round(cq * 100)} is holding back AI code generation output.` : ` Collection quality at ${Math.round(cq * 100)} supports strong AI code generation.`
    : '';
  const agentNote = agentScore > 0
    ? ` Agent Score at ${Math.round(agentScore * 100)} - ${agentScore >= 0.90 ? 'docs are agent-ready.' : 'docs need improvement for agent consumption.'}`
    : '';

  const narrative = `Defects at ${pct(defectAi)} vs ${pct(defectNonAi)} baseline. Test pass rate at ${pct(testPass)}. Rework rate at ${pct(rework)}.${cqNote}${agentNote}`;

  const weakest = [
    { label: 'Defect Rate', val: defectAi, lower_better: true },
    { label: 'Rework Rate', val: rework, lower_better: true },
    ...(cq > 0 ? [{ label: 'Collection Quality', val: cq, lower_better: false }] : []),
  ].sort((a, b) => a.lower_better ? b.val - a.val : a.val - b.val)[0];

  const action: ActionRecommendation = weakest?.label === 'Collection Quality' ? {
    title: `Collection quality from ${Math.round(cq * 100)} to 90`,
    detail: 'Enable Spectral rules via Postman API Governance. Add response examples to endpoints missing them.',
    short: 'Enable Spectral rules. Add response examples.',
    focus: `Collection Quality (${Math.round(cq * 100)})`,
    lift: 4, dim_code: 'Q',
  } : {
    title: `Reduce ${weakest?.label.toLowerCase() ?? 'defect rate'} to improve code quality`,
    detail: `${weakest?.label ?? 'Defect rate'} at ${pct(weakest?.val ?? defectAi)} is the weakest factor. Focus test coverage on AI-generated code paths.`,
    short: `Reduce ${weakest?.label.toLowerCase() ?? 'defect rate'}.`,
    focus: `${weakest?.label ?? 'Defect Rate'} (${pct(weakest?.val ?? defectAi)})`,
    lift: 3, dim_code: 'Q',
  };

  return {
    dimension: 'Q', index, stage, hours, narrative,
    formula: { expression: formulaExpr, result: formulaResult },
    factors,
    measured: [
      { label: 'Defect Rate (AI)', description: `${pct(defectAi)} in AI-assisted code`, source: connectorSource(ds.connectorsSourcing, 'sonarqube') },
      { label: 'Test Pass Rate', description: pct(testPass), source: connectorSource(ds.connectorsSourcing, 'sonarqube') },
      { label: 'Rework Rate', description: `${pct(rework)} of AI-generated code required revision`, source: connectorSource(ds.connectorsSourcing, 'github') },
      ...(cq > 0 ? [{ label: 'Collection Quality', description: `${Math.round(cq * 100)} combined Spectral + Governance score`, source: connectorSource(ds.connectorsSourcing, 'postman') }] : []),
      ...(agentScore > 0 ? [{ label: 'Agent Score', description: `${Math.round(agentScore * 100)}/100 documentation agent-readiness`, source: connectorSource(ds.connectorsSourcing, 'fern') }] : []),
    ],
    benchmarks: [
      { label: 'Industry Avg', value: BENCHMARKS.quality.industry_avg },
      { label: 'Top Quartile', value: BENCHMARKS.quality.top_quartile, color: '#7644FD' },
      { label: 'You', value: index, is_you: true },
    ],
    insight: {
      text: `Quality has been the #1 API priority for ${BENCHMARKS.quality.insights.api_priority_years} consecutive years across ${BENCHMARKS.quality.total_respondents.toLocaleString()}+ respondents. Only ${BENCHMARKS.quality.insights.design_for_agents_pct}% of organizations design APIs for AI agents.`,
      source: BENCHMARKS.quality.source,
    },
    action,
  };
}

// ---------------------------------------------------------------------------
// R narrative
// ---------------------------------------------------------------------------

function narrateR(ds: DimensionScore, signals: Map<string, number>): DimensionNarrative {
  const index = toIndex(ds.score);
  const stage = toStage(index);
  const hours = Math.round(ds.score * HOUR_MULTIPLIERS.R);

  const cfr = signals.get('cfr_ai') ?? 0;
  const slo = signals.get('slo_attainment') ?? 1;
  const contract = signals.get('contract_catch_rate') ?? 1;
  const uptime = signals.get('uptime_ai') ?? 1;
  const adapt = signals.get('adaptability') ?? 1;
  const sloGap = Math.round((1 - slo) * 100);

  const doraClass = cfr < 0.05 ? 'Elite' : cfr < 0.10 ? 'High' : cfr < 0.15 ? 'Medium' : 'Low';

  return {
    dimension: 'R', index, stage, hours,
    narrative: `${pct(uptime)} uptime. ${pct(cfr)} change failure rate (DORA ${doraClass}). SLO attainment at ${pct(slo)} - the ${sloGap}% gap is where incidents concentrate.`,
    formula: {
      expression: `R = (1 - CFR) x SLO x Contract x Uptime x Adaptability\n  = ${(1 - cfr).toFixed(2)} x ${slo.toFixed(3)} x ${contract.toFixed(3)} x ${uptime.toFixed(4)} x ${adapt.toFixed(2)} = ${ds.score.toFixed(4)}`,
      result: `Index: ${index}`,
    },
    factors: [
      factor('Change Failure Rate', pct(cfr), cfr, cfr < 0.10 ? 'good' : 'warn'),
      factor('SLO Attainment', pct(slo), slo, slo > 0.90 ? 'good' : 'warn'),
      factor('Contract Catch Rate', pct(contract), contract, contract > 0.85 ? 'good' : 'warn'),
      factor('Uptime', pct(uptime), uptime, uptime > 0.999 ? 'good' : 'warn'),
    ],
    measured: [
      { label: 'Change Failure Rate', description: `${pct(cfr)} of AI-assisted deploys caused incidents`, source: connectorSource(ds.connectorsSourcing, 'datadog') },
      { label: 'SLO Attainment', description: `${pct(slo)} of tracked SLOs met`, source: connectorSource(ds.connectorsSourcing, 'datadog') },
      { label: 'Contract Catch Rate', description: `${pct(contract)} of violations caught pre-deploy`, source: connectorSource(ds.connectorsSourcing, 'postman') },
      { label: 'Uptime', description: `${pct(uptime)} for AI-augmented endpoints`, source: connectorSource(ds.connectorsSourcing, 'pagerduty') },
    ],
    benchmarks: [
      { label: 'Industry Avg', value: BENCHMARKS.reliability.industry_avg },
      { label: 'DORA High', value: BENCHMARKS.reliability.dora_high, color: '#7644FD' },
      { label: 'You', value: index, is_you: true },
    ],
    insight: {
      text: `${BENCHMARKS.reliability.insights.no_monitoring_pct}% of organizations have no monitoring at all. API-first organizations recover in ${BENCHMARKS.reliability.insights.api_first_recovery}. ${BENCHMARKS.reliability.insights.error_spec_gap}`,
      source: BENCHMARKS.reliability.source,
    },
    action: {
      title: `Close the ${sloGap}% SLO gap`,
      detail: 'Audit missed SLOs. Add 4xx/5xx response examples to collections feeding AI code generation. AI tools cannot generate proper error handling from specs that do not define error states.',
      short: 'Audit missed SLOs. Add error response examples.',
      focus: `SLO Attainment (${pct(slo)})`,
      lift: Math.min(sloGap, 8), dim_code: 'R',
    },
  };
}

// ---------------------------------------------------------------------------
// L narrative
// ---------------------------------------------------------------------------

function narrateL(ds: DimensionScore, signals: Map<string, number>): DimensionNarrative {
  const index = toIndex(ds.score);
  const stage = toStage(index);
  const hours = Math.round(ds.score * HOUR_MULTIPLIERS.L);

  const ctAi = signals.get('cycle_time_ai') ?? 0;
  const ctBaseline = signals.get('cycle_time_nonai') ?? 1;
  const deployFreq = signals.get('deploy_frequency') ?? 0;

  const reduction = ctBaseline > 0 ? 1 - (ctAi / ctBaseline) : 0;
  const reductionPct = Math.round(reduction * 100);
  const queueHours = Math.round(ctAi * 0.63);

  const factors: Factor[] = [
    factor('Cycle Time (AI)', `${ctAi.toFixed(1)} hrs`, ctAi, 'neutral'),
    factor('Baseline', `${ctBaseline.toFixed(1)} hrs`, ctBaseline, 'neutral'),
  ];
  if (deployFreq > 0) {
    factors.push(factor('Deploy Frequency', `${deployFreq.toFixed(1)}/day`, deployFreq, deployFreq >= 3 ? 'good' : 'warn'));
  }

  const freqNote = deployFreq > 0 ? ` Deploy frequency at ${deployFreq.toFixed(1)}/day.` : '';

  return {
    dimension: 'L', index, stage, hours,
    narrative: `AI cuts cycle time by ${reductionPct}% - from ${ctBaseline.toFixed(1)} hours to ${ctAi.toFixed(1)}. But ${queueHours} of those ${ctAi.toFixed(1)} hours are queue time, not code time. The pipeline is the bottleneck, not the developer.${freqNote}`,
    formula: {
      expression: `L = 1 - (cycleTimeAI / cycleTimeBaseline)${deployFreq > 0 ? ` + min(deployFreq / 10, 0.15)` : ''}\n  = 1 - (${ctAi.toFixed(1)} / ${ctBaseline.toFixed(1)}) = ${reduction.toFixed(4)}${deployFreq > 0 ? `\n  + deploy frequency bonus: min(${deployFreq.toFixed(1)} / 10, 0.15) = ${Math.min(deployFreq / 10, 0.15).toFixed(4)}` : ''}`,
      result: `Index: ${index}${deployFreq > 0 ? ' (includes deploy frequency bonus)' : ''}`,
    },
    factors,
    measured: [
      { label: 'Cycle Time (AI)', description: `${ctAi.toFixed(1)} hours, commit to production`, source: connectorSource(ds.connectorsSourcing, 'github') },
      { label: 'Cycle Time (Baseline)', description: `${ctBaseline.toFixed(1)} hours without AI tooling`, source: connectorSource(ds.connectorsSourcing, 'github') },
      ...(deployFreq > 0 ? [{ label: 'Deploy Frequency', description: `${deployFreq.toFixed(1)} deploys/day`, source: connectorSource(ds.connectorsSourcing, 'datadog') }] : []),
    ],
    benchmarks: [
      { label: 'Industry Avg', value: BENCHMARKS.lead_time.industry_avg },
      { label: 'DORA Elite', value: BENCHMARKS.lead_time.dora_elite, color: '#7644FD' },
      { label: 'You', value: index, is_you: true },
    ],
    insight: {
      text: `${BENCHMARKS.lead_time.insights.collaboration_blockers_pct}% of organizations face collaboration blockers that slow velocity. ${BENCHMARKS.lead_time.insights.ai_speedup_avg}`,
      source: BENCHMARKS.lead_time.source,
    },
    action: {
      title: `Cut ${queueHours} hours of queue time to ${Math.round(queueHours * 0.35)}`,
      detail: `Parallelize CI test stages. Use Postman contract tests as a fast-pass gate - if API contracts pass, skip redundant integration suites. Target: under ${Math.round(ctAi * 0.55)} hours.`,
      short: 'Parallelize test stages. Contract tests as fast-pass gate.',
      focus: `Queue Time (${queueHours} hrs)`,
      lift: Math.round(reductionPct * 0.25), dim_code: 'L',
    },
  };
}

// ---------------------------------------------------------------------------
// C narrative
// ---------------------------------------------------------------------------

function narrateC(ds: DimensionScore, signals: Map<string, number>): DimensionNarrative {
  const index = toIndex(ds.score);
  const stage = toStage(index);
  const hours = Math.round(ds.score * HOUR_MULTIPLIERS.C);

  const hoursSaved = signals.get('hours_saved_monthly') ?? 0;
  const overhead = signals.get('review_overhead_hours_monthly') ?? 0;
  const totalCost = signals.get('total_ai_cost') ?? 0;
  const costGrowth = signals.get('cost_growth_rate') ?? 0;
  const valueGrowth = signals.get('value_growth_rate') ?? 0;
  const hourlyRate = 75; // from config context if available

  const laborValue = hoursSaved * hourlyRate;
  const rawRoi = totalCost > 0 ? laborValue / totalCost : 0;

  const factors: Factor[] = [
    factor('Value Realized', `$${laborValue.toLocaleString()}/mo`, laborValue, 'good'),
    factor('AI Investment', `$${totalCost.toLocaleString()}/mo`, totalCost, 'neutral'),
    factor('ROI', `${rawRoi.toFixed(1)}x`, rawRoi, rawRoi >= 3 ? 'good' : 'warn'),
  ];

  if (costGrowth > 0) {
    factors.push(factor('Cost Growth', `${costGrowth.toFixed(0)}% MoM`, costGrowth, costGrowth > 10 ? 'bad' : 'neutral'));
  }

  const growthNote = costGrowth > 0 && valueGrowth > 0 && costGrowth > valueGrowth
    ? ' Token costs, API calls, and infrastructure spend are compounding faster than the hours being saved.'
    : costGrowth > 0 ? ' Cost growth is in line with value growth.' : '';

  let crossoverMonths: number | null = null;
  if (costGrowth > 0 && valueGrowth >= 0 && costGrowth > valueGrowth && rawRoi > 1) {
    const delta = (costGrowth - valueGrowth) / 100;
    crossoverMonths = Math.ceil(Math.log(rawRoi) / Math.log(1 + delta));
  }

  const formulaBase = `C = (labor_value - overhead_value) / ai_cost / target_roi\n  = ($${laborValue.toLocaleString()} - $${(overhead * hourlyRate).toLocaleString()}) / $${totalCost.toLocaleString()} / 2.0 = ${ds.score.toFixed(4)}`;
  const formulaCostGrowth = costGrowth > 0 && valueGrowth >= 0 && costGrowth > valueGrowth
    ? `\n  - cost growth penalty: (${costGrowth.toFixed(0)} - ${valueGrowth.toFixed(0)}) / 100 = ${((costGrowth - valueGrowth) / 100).toFixed(4)}`
    : '';

  return {
    dimension: 'C', index, stage, hours,
    narrative: `${rawRoi > 0 ? `The raw ratio is ${rawRoi > 2 ? 'healthy' : 'tight'} at ${rawRoi.toFixed(1)}x.` : 'Insufficient data for ROI calculation.'}${growthNote}${crossoverMonths ? ` At current rates, cost overtakes value in ${crossoverMonths} months.` : ''}`,
    formula: {
      expression: formulaBase + formulaCostGrowth,
      result: `Index: ${index}${costGrowth > 0 ? ` (adjusted for ${costGrowth.toFixed(0)}% MoM cost growth)` : ''}`,
    },
    factors,
    measured: [
      { label: 'Engineering Value', description: `${hoursSaved} hours/month ($${laborValue.toLocaleString()} at configured rate)`, source: connectorSource(ds.connectorsSourcing, 'github') },
      { label: 'AI Infrastructure Cost', description: `$${totalCost.toLocaleString()}/month total`, source: connectorSource(ds.connectorsSourcing, 'portkey') },
    ],
    benchmarks: [
      { label: 'Industry Avg', value: BENCHMARKS.cost.industry_avg },
      { label: 'Forrester', value: BENCHMARKS.cost.forrester_baseline, color: '#7644FD' },
      { label: 'You', value: index, is_you: true },
    ],
    insight: {
      text: `${BENCHMARKS.cost.insights.ai_api_calls_postman.toLocaleString()} calls to AI APIs on Postman last year, up ${BENCHMARKS.cost.insights.ai_api_calls_yoy_growth}% YoY. ${BENCHMARKS.cost.insights.quality_reduces_cost}`,
      source: BENCHMARKS.cost.source,
    },
    action: costGrowth > 10 ? {
      title: 'Match cost growth to value growth',
      detail: `${costGrowth.toFixed(0)}% vs ${valueGrowth.toFixed(0)}% growth gap is the risk. Better API specs reduce token consumption.`,
      short: 'Better collection quality = fewer retries = lower cost.',
      focus: `Cost Growth (${costGrowth.toFixed(0)}% MoM)`,
      lift: 8, dim_code: 'C',
    } : {
      title: 'Optimize AI spend per unit of value',
      detail: 'Better collection quality means fewer AI retries and shorter prompts.',
      short: 'Better collection quality = fewer retries = lower cost.',
      focus: 'AI cost per output',
      lift: 5, dim_code: 'C',
    },
  };
}

// ---------------------------------------------------------------------------
// S narrative (supplemental - lighter treatment)
// ---------------------------------------------------------------------------

function narrateS(ds: DimensionScore, signals: Map<string, number>): DimensionNarrative {
  const index = toIndex(ds.score);
  const stage = toStage(index);
  const spec = signals.get('spec_security_score') ?? 0;
  const dep = signals.get('dependabot_score') ?? 0;
  const scan = signals.get('code_scanning_score') ?? 0;
  const secret = signals.get('secret_scanning_score') ?? 0;
  const hasSecret = signals.has('secret_scanning_score');

  const narrativeParts = [`API spec security at ${pct(spec)}`, `Dependency scanning at ${pct(dep)}`, `Code scanning at ${pct(scan)}`];
  if (hasSecret) narrativeParts.push(`Secret scanning at ${pct(secret)}`);

  const formulaParts = [spec.toFixed(3), dep.toFixed(3), scan.toFixed(3)];
  const formulaNames = ['spec', 'dependabot', 'code_scanning'];
  if (hasSecret) { formulaParts.push(secret.toFixed(3)); formulaNames.push('secret_scanning'); }

  return {
    dimension: 'S', index, stage, hours: 0,
    narrative: ds.status === 'scored'
      ? narrativeParts.join('. ') + '.'
      : 'Security posture not measured. Connect 42Crunch or GitHub Advanced Security to activate.',
    formula: {
      expression: ds.status === 'scored'
        ? `S = ${formulaNames.join(' x ')}\n  = ${formulaParts.join(' x ')} = ${ds.score.toFixed(4)}`
        : 'S = (not measured)',
      result: ds.status === 'scored' ? `Index: ${index}` : 'Unavailable',
    },
    factors: ds.status === 'scored' ? [
      factor('Spec Security', pct(spec), spec, spec > 0.80 ? 'good' : 'warn'),
      factor('Dependabot', pct(dep), dep, dep > 0.90 ? 'good' : 'warn'),
      factor('Code Scanning', pct(scan), scan, scan > 0.80 ? 'good' : 'warn'),
      ...(hasSecret ? [factor('Secret Scanning', pct(secret), secret, secret > 0.90 ? 'good' : 'warn')] : []),
    ] : [],
    measured: [],
    benchmarks: [],
    insight: null,
    action: null,
  };
}

// ---------------------------------------------------------------------------
// AX Pillar Mapping builder
// ---------------------------------------------------------------------------

const AX_PILLAR_SIGNALS: Record<AXPillarName, { dimensions: Dimension[]; signals: string[] }> = {
  Access: {
    dimensions: ['S'],
    signals: ['spec_security_score', 'dependabot_score', 'code_scanning_score', 'secret_scanning_score'],
  },
  Context: {
    dimensions: ['Q'],
    signals: ['collection_quality', 'agent_score', 'error_contract_depth'],
  },
  Tools: {
    dimensions: ['Q', 'L', 'C'],
    signals: [
      'defect_rate_ai', 'ai_test_pass_rate', 'rework_rate_ai',
      'runtime_retry_behavior', 'runtime_idempotency', 'error_recovery_quality',
      'cycle_time_ai', 'deploy_frequency',
      'hours_saved_monthly', 'total_ai_cost',
    ],
  },
  Orchestration: {
    dimensions: ['R'],
    signals: ['cfr_ai', 'slo_attainment', 'contract_catch_rate', 'uptime_ai', 'adaptability'],
  },
};

function buildAXMapping(signalValues: Map<string, number>): AXPillarMapping[] {
  const pillars: AXPillarName[] = ['Access', 'Context', 'Tools', 'Orchestration'];
  return pillars.map(pillar => {
    const def = AX_PILLAR_SIGNALS[pillar];
    const contributing = def.signals.filter(s => signalValues.has(s));
    const coverage: AXPillarMapping['coverage'] =
      contributing.length === 0 ? 'none'
        : contributing.length >= def.signals.length * 0.5 ? 'full'
          : 'partial';

    const pctCovered = def.signals.length > 0
      ? Math.round((contributing.length / def.signals.length) * 100)
      : 0;

    const missingCount = def.signals.length - contributing.length;

    let assessment: string;
    if (coverage === 'none') {
      assessment = `${pillar} is unmeasured. Connect ${suggestConnectorForPillar(pillar)} to see what you are missing.`;
    } else if (coverage === 'partial') {
      assessment = `${pillar} at ${pctCovered}% coverage. ${missingCount} signal${missingCount !== 1 ? 's' : ''} missing - the score is directional, not definitive.`;
    } else {
      assessment = `${pillar} is well-covered with ${contributing.length} live signals. This pillar's score is reliable.`;
    }

    return { pillar, aiei_dimensions: def.dimensions, signals_contributing: contributing, coverage, assessment };
  });
}

function suggestConnectorForPillar(pillar: AXPillarName): string {
  switch (pillar) {
    case 'Access': return '42Crunch or GitHub Advanced Security';
    case 'Context': return 'Postman or Fern';
    case 'Tools': return 'GitHub, SonarQube, or an AI cost provider';
    case 'Orchestration': return 'Datadog, Inngest, or Step Functions';
  }
}

// ---------------------------------------------------------------------------
// Epistemic Summary builder
// ---------------------------------------------------------------------------

const ALL_KNOWN_SIGNALS = [
  'defect_rate_ai', 'defect_rate_nonai', 'ai_test_pass_rate', 'rework_rate_ai',
  'collection_quality', 'agent_score',
  'runtime_retry_behavior', 'runtime_idempotency', 'error_recovery_quality', 'error_contract_depth',
  'cycle_time_ai', 'cycle_time_nonai', 'deploy_frequency',
  'cfr_ai', 'slo_attainment', 'contract_catch_rate', 'uptime_ai', 'adaptability',
  'hours_saved_monthly', 'review_overhead_hours_monthly', 'total_ai_cost',
  'cost_growth_rate', 'value_growth_rate',
  'spec_security_score', 'dependabot_score', 'code_scanning_score', 'secret_scanning_score',
];

const BLIND_SPOT_MAP: Record<string, string> = {
  adaptability: 'No workflow durability data (connect Inngest or Step Functions)',
  runtime_retry_behavior: 'No runtime API behavior validation (add Postman monitors with 429/503 test cases)',
  runtime_idempotency: 'No idempotency verification (add Postman collection tests for POST retry behavior)',
  error_recovery_quality: 'No agent error recovery measurement (add error response assertions to Postman monitors)',
  error_contract_depth: 'No error contract depth data (add structured error examples to Postman collections)',
  collection_quality: 'No API spec quality signal (connect Postman workspace)',
  agent_score: 'No agent readiness signal (connect Fern)',
  spec_security_score: 'No API security audit (connect 42Crunch)',
  deploy_frequency: 'No deploy frequency data (connect Datadog, Vercel, or GitHub Actions)',
  slo_attainment: 'No SLO data (connect Datadog, Dynatrace, or Postman monitors)',
  total_ai_cost: 'No AI cost data (connect OpenAI, Anthropic, or Portkey)',
};

function buildEpistemicSummary(
  result: CompositeResult,
  signalValues: Map<string, number>,
  axMapping: AXPillarMapping[],
): EpistemicSummary {
  const scored = CORE_DIMENSIONS.filter(d => result.dimensions[d].status === 'scored').length;
  const calibrating = CORE_DIMENSIONS.filter(d => result.dimensions[d].status === 'calibrating').length;

  let live = 0;
  let fallback = 0;
  for (const dim of ALL_DIMENSIONS) {
    for (const sig of result.dimensions[dim].signals) {
      if (sig.source === 'live') live++;
      else fallback++;
    }
  }

  const missing = ALL_KNOWN_SIGNALS.filter(s => !signalValues.has(s));
  const pillarsCovered = axMapping.filter(p => p.coverage !== 'none').length;

  const blindSpots = missing
    .map(s => BLIND_SPOT_MAP[s])
    .filter((v): v is string => v !== undefined);

  const connectorSuggestion = missing.includes('adaptability') ? 'Inngest or Step Functions'
    : missing.includes('runtime_retry_behavior') ? 'Postman monitors'
      : missing.includes('total_ai_cost') ? 'an AI cost provider (OpenAI, Anthropic, Portkey)'
        : missing.includes('slo_attainment') ? 'Datadog or Dynatrace'
          : 'additional connectors';

  const connectorCount = new Set(CORE_DIMENSIONS.flatMap(d => result.dimensions[d].connectorsSourcing)).size;
  const pillarGap = 4 - pillarsCovered;

  const opener = live === 0
    ? 'This score is running blind.'
    : live <= 3
      ? `This score is working with ${live} live signal${live !== 1 ? 's' : ''}. That is not enough to be confident.`
      : `This score draws on ${live} live signals from ${connectorCount} connector${connectorCount !== 1 ? 's' : ''}.`;

  const pillarVerdict = pillarsCovered === 4
    ? 'All four AX pillars have signal coverage.'
    : pillarsCovered === 0
      ? 'None of the four AX pillars have signal coverage. This is a readiness check, not a verdict.'
      : `${pillarsCovered} of 4 AX pillars have coverage.${pillarGap === 1 ? ' One pillar is dark.' : ` ${pillarGap} pillars are dark.`}`;

  const blindSpotCount = missing.length;
  const gapStatement = blindSpotCount === 0
    ? 'No known blind spots.'
    : blindSpotCount <= 3
      ? `${blindSpotCount} signal${blindSpotCount !== 1 ? 's' : ''} could not be measured. The gaps are specific and closeable.`
      : `${blindSpotCount} signals could not be measured. Connecting ${connectorSuggestion} would close the biggest gap.`;

  const honestyStatement = `${opener} ${pillarVerdict} ${gapStatement}`;

  return {
    dimensions_scored: scored,
    dimensions_calibrating: calibrating,
    signals_live: live,
    signals_fallback: fallback,
    signals_missing: missing.length,
    assessment_mode: result.assessmentMode,
    ax_pillars_covered: pillarsCovered,
    honesty_statement: honestyStatement,
    what_this_score_does_not_know: blindSpots,
  };
}

// ---------------------------------------------------------------------------
// Build presentation from CompositeResult
// ---------------------------------------------------------------------------

export function buildPresentation(
  result: CompositeResult,
  signalValues: Map<string, number>,
): PresentationResult {
  const dims = result.dimensions;
  const narratives: Record<Dimension, DimensionNarrative> = {
    Q: narrateQ(dims.Q, signalValues),
    L: narrateL(dims.L, signalValues),
    R: narrateR(dims.R, signalValues),
    C: narrateC(dims.C, signalValues),
    S: narrateS(dims.S, signalValues),
  };

  const overallIndex = toIndex(result.composite);
  const overallStage = toStage(overallIndex);

  const coreDims = CORE_DIMENSIONS.map(d => narratives[d]).filter(n => n.index > 0);
  const totalHours = coreDims.reduce((s, n) => s + n.hours, 0);

  const sorted = [...coreDims].sort((a, b) => b.index - a.index);
  const strongName = sorted[0]?.dimension ?? 'Q';
  const weakName = sorted[sorted.length - 1]?.dimension ?? 'Q';

  const dimNames: Record<string, string> = { Q: 'Quality', L: 'Lead time', R: 'Reliability', C: 'Cost efficiency', S: 'Security' };

  const recommendations = coreDims
    .filter(n => n.action)
    .sort((a, b) => (b.action!.lift - a.action!.lift))
    .map((n, i) => ({
      dimension: dimNames[n.dimension],
      dim_code: n.action!.dim_code,
      priority: i === 0 ? 'Highest Impact' as string | undefined : undefined,
      title: n.action!.title,
      body: n.action!.detail,
      impact: `+${n.action!.lift} index points`,
      lift: n.action!.lift,
    }));

  const axMapping = buildAXMapping(signalValues);
  const epistemicSummary = buildEpistemicSummary(result, signalValues, axMapping);

  return {
    overall: {
      index: overallIndex,
      stage: overallStage,
      narrative: `${dimNames[strongName]} is strong at ${narratives[strongName].index}. ${dimNames[weakName]} at ${narratives[weakName].index} is where the runway is. ${Math.round(totalHours * 0.35)} engineering hours per month are on the table.`,
      hours_total: totalHours,
      hours_available: Math.round(totalHours * 0.35),
    },
    dimensions: narratives,
    recommendations,
    axMapping,
    epistemicSummary,
  };
}
