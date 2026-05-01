#!/usr/bin/env node

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Command } from 'commander';
import {
  runAssessment, ALL_CONNECTORS, SIGNAL_ROUTES,
  buildPresentation, toIndex, toStage, WEIGHT_PROFILES,
  buildCoverageMap, SCHEMA_VERSION,
} from '@sachsk23/aiei-engine';
import type {
  EnvironmentConfig, CompositeResult, Dimension,
  WeightProfileName, ConnectorName, ConnectorConfigs,
} from '@sachsk23/aiei-engine';
import { renderReport } from '@sachsk23/aiei-templates';
import { readFileSync, existsSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Exit codes (spec section 3)
// ---------------------------------------------------------------------------

const EXIT = {
  OK: 0,
  CONFIG_ERROR: 1,
  AUTH_FAILURE: 2,
  PARTIAL_SCORE: 3,
  NO_CONNECTORS: 4,
  VALIDATION_FAILURE: 5,
} as const;

const AX_PILLAR_MAP: Record<string, string> = {
  spec_security_score: 'Access', dependabot_score: 'Access',
  code_scanning_score: 'Access', secret_scanning_score: 'Access',
  collection_quality: 'Context', agent_score: 'Context',
  error_contract_depth: 'Context',
  cfr_ai: 'Orchestration', slo_attainment: 'Orchestration',
  contract_catch_rate: 'Orchestration', uptime_ai: 'Orchestration',
  adaptability: 'Orchestration',
};

const HELP_SCHEMAS = {
  root: {
    command: 'aiei',
    description: 'AIEI - AI Effectiveness & Efficiency Index',
    commands: [
      'score',
      'demo',
      'connectors',
      'formula',
      'signals',
      'validate',
      'init',
    ],
    options: [
      { flag: '--version', type: 'boolean', description: 'Show version' },
      { flag: '--help', type: 'boolean', description: 'Show help' },
      { flag: '--json', type: 'boolean', description: 'Emit structured help when paired with --help' },
    ],
  },
  score: {
    command: 'score',
    description: 'Run full AIEI scoring assessment',
    options: [
      { flag: '--config', alias: '-c', type: 'string', required: false },
      { flag: '--rate', alias: '-r', type: 'number', default: 75, required: false },
      { flag: '--format', alias: '-f', type: 'enum', choices: ['text', 'json', 'scorecard', 'html'], default: 'text' },
      { flag: '--profile', alias: '-p', type: 'enum', choices: Object.keys(WEIGHT_PROFILES), default: 'reliability_first' },
      { flag: '--demo', type: 'boolean', default: false },
      { flag: '--json', type: 'boolean', default: false },
    ],
    exitCodes: EXIT,
  },
  demo: {
    command: 'demo',
    description: 'Run a no-credential sample assessment using deterministic demo data',
    options: [
      { flag: '--format', alias: '-f', type: 'enum', choices: ['text', 'json', 'scorecard', 'html'], default: 'text' },
      { flag: '--json', type: 'boolean', default: false },
    ],
    exitCodes: { OK: EXIT.OK },
  },
  connectors: {
    command: 'connectors',
    description: 'List available connectors and their signals',
    options: [{ flag: '--json', type: 'boolean', default: false }],
  },
  formula: {
    command: 'formula',
    description: 'Show current scoring formulas and derivations',
    options: [{ flag: '--json', type: 'boolean', default: false }],
  },
  signals: {
    command: 'signals',
    description: 'Show signal reference',
    options: [{ flag: '--json', type: 'boolean', default: false }],
  },
  validate: {
    command: 'validate',
    description: 'Check config file and connector credentials',
    options: [
      { flag: '--config', alias: '-c', type: 'string', required: false },
      { flag: '--json', type: 'boolean', default: false },
    ],
    exitCodes: EXIT,
  },
  init: {
    command: 'init',
    description: 'Create .aiei.json config template',
    options: [
      { flag: '--template', alias: '-t', type: 'enum', choices: ['generic', 'fox'], default: 'generic' },
      { flag: '--json', type: 'boolean', default: false },
    ],
  },
} as const;

const FORMULA_SPEC = {
  version: SCHEMA_VERSION,
  dimensions: {
    Q: {
      expression: '(1 - defect_rate_ai / defect_rate_nonai) x ai_test_pass_rate x (1 - rework_rate_ai)',
      variables: [
        { name: 'defect_rate_ai', description: 'Bugs per unit of AI-assisted code', default: null },
        { name: 'defect_rate_nonai', description: 'Bugs per unit of human-written code', default: null },
        { name: 'ai_test_pass_rate', description: 'Test pass rate on AI code (0-1)', default: 1.0 },
        { name: 'rework_rate_ai', description: 'Follow-up commit rate on AI PRs (0-1)', default: 0.0 },
      ],
      modifiers: [
        { name: 'collection_quality_adjustment', gate: 'collection_quality signal present', expression: '(collection_quality * 100 - 70) / 300', cap: 0.10 },
        { name: 'agent_score_adjustment', gate: 'agent_score signal present', expression: '(agent_score * 100 - 70) / 500', cap: 0.06 },
        { name: 'api_runtime_quality_adjustment', gate: 'any runtime signal present', expression: '(avg(runtime_signals) - 0.5) / 5', cap: 0.10 },
      ],
    },
    L: {
      expression: '1 - (cycle_time_ai / cycle_time_nonai)',
      variables: [
        { name: 'cycle_time_ai', description: 'Hours commit-to-production for AI PRs', default: null },
        { name: 'cycle_time_nonai', description: 'Hours commit-to-production for human PRs', default: null },
      ],
      modifiers: [
        { name: 'deploy_frequency_bonus', gate: 'deploy_frequency signal present', expression: 'min(deploy_frequency / 10, 0.15)', cap: 0.15 },
      ],
    },
    R: {
      expression: '(1 - cfr_ai) x slo_attainment x contract_catch_rate x uptime_ai x adaptability',
      variables: [
        { name: 'cfr_ai', description: 'Change failure rate for AI deployments (0-1)', default: 0 },
        { name: 'slo_attainment', description: 'SLOs met / SLOs tracked (0-1)', default: 1.0 },
        { name: 'contract_catch_rate', description: 'Contract violations caught pre-prod (0-1)', default: 1.0 },
        { name: 'uptime_ai', description: 'Uptime of AI-assisted services (0-1)', default: 1.0 },
        { name: 'adaptability', description: 'Workflow recovery / durability (0-1)', default: 1.0 },
      ],
      modifiers: [],
    },
    C: {
      expression: '(hours_saved * hourly_rate - overhead * hourly_rate) / total_ai_cost / target_roi',
      variables: [
        { name: 'hours_saved_monthly', description: 'Engineering hours saved per month', default: null },
        { name: 'review_overhead_hours_monthly', description: 'Additional review hours for AI code', default: 0 },
        { name: 'total_ai_cost', description: 'Monthly AI tooling spend (USD)', default: null },
      ],
      modifiers: [
        { name: 'cost_growth_penalty', gate: 'cost_growth_rate > value_growth_rate', expression: '(cost_growth_rate - value_growth_rate) / 100', cap: 1.0 },
      ],
    },
    S: {
      expression: 'spec_security_score x dependabot_score x code_scanning_score x secret_scanning_score',
      variables: [
        { name: 'spec_security_score', description: 'OWASP API Security compliance (0-1)', default: null },
        { name: 'dependabot_score', description: 'Dependency vulnerability posture (0-1)', default: null },
        { name: 'code_scanning_score', description: 'Static analysis posture (0-1)', default: null },
        { name: 'secret_scanning_score', description: 'Exposed credential posture (0-1)', default: null },
      ],
      modifiers: [],
      note: 'Supplemental - not included in composite weight calculation',
    },
  },
  composite: {
    expression: 'sum(weight[d] x score[d]) for d in {Q, L, R, C}',
    note: 'Weights renormalized if fewer than 4 dimensions score',
    weightProfiles: Object.fromEntries(Object.entries(WEIGHT_PROFILES).map(([k, v]) => [k, v.weights])),
  },
};

const SIGNAL_METADATA: Record<string, { description: string; normalization: string; defaultWhenMissing: number | null }> = {
  cfr_ai: { description: 'Change failure rate for AI-assisted deployments', normalization: '0-1 failure rate, inverted in R formula as (1 - cfr_ai)', defaultWhenMissing: 0 },
  uptime_ai: { description: 'Uptime of services with AI-assisted code in production', normalization: '0-1 uptime ratio', defaultWhenMissing: 1 },
  slo_attainment: { description: 'Percentage of service level objectives met', normalization: '0-1 SLO attainment ratio', defaultWhenMissing: 1 },
  contract_catch_rate: { description: 'Proportion of API contract violations caught before production', normalization: '0-1 contract assertion pass/catch ratio', defaultWhenMissing: 1 },
  adaptability: { description: 'Workflow recovery and durability for agentic or AI-assisted systems', normalization: '0-1 completion/success/recovery rate', defaultWhenMissing: 1 },
  defect_rate_ai: { description: 'Bugs per unit of AI-assisted code', normalization: 'Raw defect rate compared with defect_rate_nonai', defaultWhenMissing: null },
  defect_rate_nonai: { description: 'Bugs per unit of human-written baseline code', normalization: 'Raw defect rate used as Q-score control group', defaultWhenMissing: null },
  ai_test_pass_rate: { description: 'Test pass rate for AI-assisted changes', normalization: '0-1 pass ratio', defaultWhenMissing: 1 },
  rework_rate_ai: { description: 'Follow-up/rework rate for AI-assisted PRs', normalization: '0-1 rework ratio, applied as (1 - rework_rate_ai)', defaultWhenMissing: 0 },
  cycle_time_ai: { description: 'Commit-to-production cycle time for AI-assisted changes', normalization: 'Raw hours compared with cycle_time_nonai', defaultWhenMissing: null },
  cycle_time_nonai: { description: 'Commit-to-production cycle time for non-AI baseline changes', normalization: 'Raw hours used as L-score control group', defaultWhenMissing: null },
  deploy_frequency: { description: 'Deployments per day', normalization: 'min(deploy_frequency / 10, 0.15) bonus', defaultWhenMissing: null },
  hours_saved_monthly: { description: 'Monthly engineering hours saved by AI-assisted development', normalization: 'Raw hours multiplied by hourly_rate', defaultWhenMissing: null },
  review_overhead_hours_monthly: { description: 'Monthly extra review hours caused by AI-generated code', normalization: 'Raw hours subtracted from labor value', defaultWhenMissing: 0 },
  total_ai_cost: { description: 'Monthly AI tooling cost', normalization: 'Raw USD cost used as ROI denominator', defaultWhenMissing: null },
  spec_security_score: { description: 'API specification security posture', normalization: '0-1 security score', defaultWhenMissing: null },
  dependabot_score: { description: 'Dependency vulnerability posture', normalization: '0-1 score after vulnerability penalties', defaultWhenMissing: null },
  code_scanning_score: { description: 'Static/code scanning posture', normalization: '0-1 score after finding penalties', defaultWhenMissing: null },
  secret_scanning_score: { description: 'Exposed credential posture', normalization: '0-1 score; each active secret deducts 0.20, floored at 0', defaultWhenMissing: null },
  collection_quality: { description: 'Postman collection/spec quality for AI-consumable APIs', normalization: '(collection_quality * 100 - 70) / 300 gated Q adjustment', defaultWhenMissing: null },
  agent_score: { description: 'Agent-readiness score for API documentation', normalization: '(agent_score * 100 - 70) / 500 gated Q adjustment', defaultWhenMissing: null },
  cost_growth_rate: { description: 'Month-over-month AI cost growth', normalization: 'Percentage-point delta used only when cost_growth_rate > value_growth_rate', defaultWhenMissing: null },
  value_growth_rate: { description: 'Month-over-month AI value growth', normalization: 'Percentage-point comparator for cost growth penalty', defaultWhenMissing: null },
  runtime_retry_behavior: { description: 'Whether API contracts document retry behavior such as Retry-After', normalization: '0-1 documented retry support signal', defaultWhenMissing: null },
  runtime_idempotency: { description: 'Whether mutating operations document idempotency keys', normalization: '0-1 mutating operation coverage', defaultWhenMissing: null },
  error_recovery_quality: { description: 'Whether error responses include machine-actionable recovery fields', normalization: '0-1 actionable error response coverage', defaultWhenMissing: null },
  error_contract_depth: { description: 'Depth of machine-readable error contracts', normalization: '0-1 structured error recovery metadata coverage', defaultWhenMissing: null },
};

function emitJsonHelpIfRequested(argv: string[]): void {
  if (!argv.includes('--help') || !argv.includes('--json')) return;
  const command = argv.find((arg) => !arg.startsWith('-') && arg !== 'node' && !arg.endsWith('cli.js'));
  const key = command && command in HELP_SCHEMAS ? command as keyof typeof HELP_SCHEMAS : 'root';
  process.stdout.write(JSON.stringify(HELP_SCHEMAS[key], null, 2) + '\n');
  process.exit(EXIT.OK);
}

emitJsonHelpIfRequested(process.argv.slice(2));

function connectorDocsUrl(name: string): string {
  return `CONNECTORS.md#${name.replace(/_/g, '-').toLowerCase()}`;
}

function connectorDescriptors() {
  return ALL_CONNECTORS.map(c => {
    const produced = SIGNAL_ROUTES
      .filter(r => r.priorityOrder.includes(c.name))
      .map(r => r.formulaInput);

    return {
      name: c.name,
      dimensions: c.dimensions,
      requiredCredentials: c.requiredCredentials,
      optionalCredentials: [],
      signalsProduced: produced,
      docsUrl: connectorDocsUrl(c.name),
    };
  });
}

function isMissingCredentialValue(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'string') {
    if (value.startsWith('REPLACE_WITH_')) return true;
    if (value.startsWith('$')) return !process.env[value.substring(1)];
  }
  return false;
}

function signalDescriptors() {
  return SIGNAL_ROUTES.map(r => ({
    key: r.formulaInput,
    dimension: r.dimension,
    description: SIGNAL_METADATA[r.formulaInput]?.description ?? 'AIEI scoring signal',
    normalization: SIGNAL_METADATA[r.formulaInput]?.normalization ?? '0-1 normalized signal',
    sources: r.priorityOrder,
    priorityOrder: r.priorityOrder,
    mergeStrategy: r.mergeStrategy,
    defaultWhenMissing: SIGNAL_METADATA[r.formulaInput]?.defaultWhenMissing ?? null,
    axPillar: AX_PILLAR_MAP[r.formulaInput] || 'Tools',
  }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function diag(msg: string): void {
  process.stderr.write(msg + '\n');
}

function out(data: unknown, json: boolean): void {
  if (json) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  }
}

function loadConfig(configPath?: string): EnvironmentConfig {
  const paths = configPath
    ? [configPath]
    : [resolve('.aiei.json'), resolve('aiei.config.json'), resolve('aiei-env.json')];

  for (const p of paths) {
    if (existsSync(p)) {
      try {
        const raw = JSON.parse(readFileSync(p, 'utf-8'));
        raw.weightProfile = raw.weightProfile || 'reliability_first';
        return raw as EnvironmentConfig;
      } catch (e: unknown) {
        diag(`Error: config file ${p} is not valid JSON.`);
        process.exit(EXIT.CONFIG_ERROR);
      }
    }
  }

  diag('Error: no config file found. Run "aiei init" to create one.');
  process.exit(EXIT.CONFIG_ERROR);
}

function extractSignalValues(result: CompositeResult): Map<string, number> {
  const signals = new Map<string, number>();
  for (const ds of Object.values(result.dimensions)) {
    for (const s of ds.signals) {
      signals.set(s.key, s.value);
    }
  }
  return signals;
}

function demoResult(): CompositeResult {
  const now = new Date('2026-04-30T00:00:00.000Z').toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    composite: 0.68,
    orgName: 'demo-org',
    timestamp: now,
    weightProfile: 'reliability_first',
    weights: WEIGHT_PROFILES.reliability_first.weights,
    assessmentMode: 'full',
    scoringMode: 'strict',
    partialComposite: false,
    scoredCoreCount: 4,
    calibrating: [],
    weakest: { dimension: 'C', score: 0.55 },
    strongest: { dimension: 'Q', score: 0.74 },
    gap: 0.19,
    epistemicNote: 'Demo data only. Use live connectors for a real assessment.',
    dimensions: {
      Q: {
        dimension: 'Q',
        score: 0.74,
        status: 'scored',
        connectorsSourcing: ['github', 'postman', 'fern'],
        signals: [
          { key: 'defect_rate_ai', value: 0.07, source: 'fallback', connector: 'demo' },
          { key: 'defect_rate_nonai', value: 0.12, source: 'fallback', connector: 'demo' },
          { key: 'ai_test_pass_rate', value: 0.91, source: 'fallback', connector: 'demo' },
          { key: 'rework_rate_ai', value: 0.16, source: 'fallback', connector: 'demo' },
          { key: 'collection_quality', value: 0.82, source: 'fallback', connector: 'demo' },
          { key: 'agent_score', value: 0.78, source: 'fallback', connector: 'demo' },
          { key: 'error_contract_depth', value: 0.7, source: 'fallback', connector: 'demo' },
        ],
      },
      L: {
        dimension: 'L',
        score: 0.62,
        status: 'scored',
        connectorsSourcing: ['github', 'github_actions'],
        signals: [
          { key: 'cycle_time_ai', value: 18, source: 'fallback', connector: 'demo' },
          { key: 'cycle_time_nonai', value: 42, source: 'fallback', connector: 'demo' },
          { key: 'deploy_frequency', value: 3.5, source: 'fallback', connector: 'demo' },
        ],
      },
      R: {
        dimension: 'R',
        score: 0.71,
        status: 'scored',
        connectorsSourcing: ['datadog', 'postman', 'inngest'],
        signals: [
          { key: 'cfr_ai', value: 0.08, source: 'fallback', connector: 'demo' },
          { key: 'slo_attainment', value: 0.96, source: 'fallback', connector: 'demo' },
          { key: 'contract_catch_rate', value: 0.88, source: 'fallback', connector: 'demo' },
          { key: 'uptime_ai', value: 0.995, source: 'fallback', connector: 'demo' },
          { key: 'adaptability', value: 0.89, source: 'fallback', connector: 'demo' },
        ],
      },
      C: {
        dimension: 'C',
        score: 0.55,
        status: 'scored',
        connectorsSourcing: ['github', 'portkey'],
        signals: [
          { key: 'hours_saved_monthly', value: 126, source: 'fallback', connector: 'demo' },
          { key: 'review_overhead_hours_monthly', value: 18, source: 'fallback', connector: 'demo' },
          { key: 'total_ai_cost', value: 7200, source: 'fallback', connector: 'demo' },
        ],
      },
      S: {
        dimension: 'S',
        score: 0.73,
        status: 'scored',
        connectorsSourcing: ['github', 'crunch42'],
        signals: [
          { key: 'spec_security_score', value: 0.86, source: 'fallback', connector: 'demo' },
          { key: 'dependabot_score', value: 0.95, source: 'fallback', connector: 'demo' },
          { key: 'code_scanning_score', value: 0.9, source: 'fallback', connector: 'demo' },
          { key: 'secret_scanning_score', value: 1, source: 'fallback', connector: 'demo' },
        ],
      },
    },
  };
}

function outputResult(result: CompositeResult, format: string, orgName: string): void {
  if (format === 'json') {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return;
  }

  if (format === 'html') {
    const signals = extractSignalValues(result);
    const presentation = buildPresentation(result, signals);
    const html = renderReport({
      orgName,
      timestamp: result.timestamp,
      schemaVersion: result.schemaVersion,
      weightProfile: result.weightProfile,
      assessmentMode: result.assessmentMode,
      scoringMode: result.scoringMode,
      scoredCoreCount: result.scoredCoreCount,
      epistemicNote: result.epistemicNote,
      presentation,
    });
    const target = resolve('aiei-report.html');
    writeFileSync(target, html);
    diag(`Report written to ${target}`);
  }

  if (format !== 'json') printScorecard(result);
}

// ---------------------------------------------------------------------------
// Scorecard printer (human mode for `score`)
// ---------------------------------------------------------------------------

function printScorecard(r: CompositeResult): void {
  const idx = toIndex(r.composite);
  const stage = toStage(idx);
  const bar = (i: number) => {
    const filled = Math.round(i / 2.5);
    return '\u2588'.repeat(filled) + '\u2591'.repeat(40 - filled);
  };

  const names: Record<string, string> = {
    Q: 'Quality', L: 'Lead Time', R: 'Reliability', C: 'Cost',
  };

  process.stdout.write('\n');
  process.stdout.write(`  AIEI Score: ${idx}  [${stage}]\n`);
  process.stdout.write(`  ${bar(idx)}\n\n`);

  for (const d of ['Q', 'R', 'L', 'C'] as const) {
    const ds = r.dimensions[d];
    const di = toIndex(ds.score);
    const label = `${names[d]}`.padEnd(14) + ` (${d})`;
    process.stdout.write(`  ${label.padEnd(20)} ${String(di).padStart(3)}  ${bar(di)}  ${toStage(di)}\n`);
  }

  if (r.dimensions.S.status === 'scored') {
    const si = toIndex(r.dimensions.S.score);
    process.stdout.write(`  ${'Security'.padEnd(14)} (S) ${String(si).padStart(3)}  ${bar(si)}  supplemental\n`);
  }

  process.stdout.write('\n');
  process.stdout.write(`  Connectors: ${r.calibrating.length === 0 ? 'all dimensions scored' : `${r.scoredCoreCount}/4 core, ${r.calibrating.join(', ')} calibrating`}\n`);
  process.stdout.write(`  Mode: ${r.assessmentMode} | Scoring: ${r.scoringMode} | Profile: ${r.weightProfile}\n`);
  process.stdout.write('\n');
}

// ---------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------

const program = new Command();

program
  .name('aiei')
  .description('AIEI - AI Effectiveness & Efficiency Index')
  .version(SCHEMA_VERSION);

// ---------------------------------------------------------------------------
// aiei score
// ---------------------------------------------------------------------------

program
  .command('score', { isDefault: true })
  .description('Run full AIEI scoring assessment')
  .option('-c, --config <path>', 'Path to .aiei.json config file')
  .option('-r, --rate <number>', 'Blended hourly engineering rate in USD (default: 75)')
  .option('-f, --format <type>', 'Output format: text, json, scorecard, html', 'text')
  .option('-p, --profile <name>', 'Weight profile: reliability_first, balanced, quality_first, speed_first, cost_first')
  .option('--demo', 'Run deterministic no-credential sample assessment')
  .option('--json', 'Equivalent to --format json')
  .addHelpText('after', `
Exit codes:
  0  All dimensions scored successfully
  1  Config file not found or malformed
  2  One or more connector auth failures
  3  Partial score (some connectors failed, result still valid)
  4  No connectors available

Examples:
  aiei score                                      Default config, terminal scorecard
  aiei score --config ./prod.aiei.json            Custom config path
  aiei score --json                               JSON to stdout, diagnostics to stderr
  aiei score --format html --rate 175             HTML report with $175/hr rate
  aiei score --demo --json                        No-credential sample result
  aiei score --json 2>/dev/null                   JSON only, suppress diagnostics
  aiei score --json | jq '.dimensions.Q.score'    Extract Q-score`)
  .action(async (opts) => {
    const format = opts.json ? 'json' : opts.format;
    if (opts.demo) {
      diag('Running AIEI demo assessment with deterministic sample data...');
      outputResult(demoResult(), format, 'demo-org');
      return;
    }

    const config = loadConfig(opts.config);
    if (opts.rate) config.hourlyRate = Number(opts.rate);
    if (opts.profile) config.weightProfile = opts.profile as WeightProfileName;

    const connCount = Object.keys(config.connectors).length;
    diag(`Running AIEI scoring with ${connCount} configured connectors...`);

    const { result, validation } = await runAssessment(config);

    const failedConnectors = validation.connectors.filter(c => c.configured && !c.connected);
    const connectedCount = validation.connectors.filter(c => c.connected).length;

    for (const cv of validation.connectors) {
      if (cv.configured && cv.connected) {
        diag(`  ${cv.name}: connected`);
      } else if (cv.configured && !cv.connected) {
        diag(`  ${cv.name}: failed${cv.error ? ` (${cv.error})` : ''}`);
      }
    }

    if (connectedCount === 0) {
      diag('\nError: no connectors available. Verify credentials and network.');
      process.exit(EXIT.NO_CONNECTORS);
    }

    if (failedConnectors.length > 0) {
      diag(`\n${connectedCount} of ${connCount} connectors connected. Scoring with available data.`);
    }

    outputResult(result, format, config.orgName);

    if (failedConnectors.length > 0) {
      process.exit(EXIT.PARTIAL_SCORE);
    }
  });

program
  .command('demo')
  .description('Run a no-credential sample assessment using deterministic demo data')
  .option('-f, --format <type>', 'Output format: text, json, scorecard, html', 'text')
  .option('--json', 'Equivalent to --format json')
  .addHelpText('after', `
Examples:
  aiei demo                         No-credential terminal scorecard
  aiei demo --json                  Machine-readable demo result
  aiei demo --format html           Generate sample HTML report`)
  .action((opts) => {
    const format = opts.json ? 'json' : opts.format;
    diag('Running AIEI demo assessment with deterministic sample data...');
    outputResult(demoResult(), format, 'demo-org');
  });

// ---------------------------------------------------------------------------
// aiei connectors
// ---------------------------------------------------------------------------

program
  .command('connectors')
  .description('List available connectors and their signals')
  .option('--json', 'Output structured JSON')
  .addHelpText('after', `
Examples:
  aiei connectors                   Human-readable table
  aiei connectors --json            Structured JSON for agents
  aiei connectors --json | jq '.[].name'   List connector names`)
  .action((opts) => {
    const data = connectorDescriptors();

    if (opts.json) {
      process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      return;
    }

    process.stdout.write('\nAIEI Connectors (' + ALL_CONNECTORS.length + ' implemented)\n\n');
    process.stdout.write('  ' + 'Connector'.padEnd(20) + 'Dimensions'.padEnd(14) + 'Signals Produced\n');
    process.stdout.write('  ' + '-'.repeat(20) + '-'.repeat(14) + '-'.repeat(40) + '\n');

    for (const d of data) {
      process.stdout.write(
        '  ' +
        d.name.padEnd(20) +
        d.dimensions.join(', ').padEnd(14) +
        d.signalsProduced.join(', ') + '\n'
      );
    }
    process.stdout.write('\n');
  });

// ---------------------------------------------------------------------------
// aiei formula
// ---------------------------------------------------------------------------

program
  .command('formula')
  .description('Show current scoring formulas and derivations')
  .option('--json', 'Output structured JSON')
  .addHelpText('after', `
Examples:
  aiei formula                      Human-readable formulas
  aiei formula --json               Machine-readable formula spec`)
  .action((opts) => {
    if (opts.json) {
      process.stdout.write(JSON.stringify(FORMULA_SPEC, null, 2) + '\n');
      return;
    }

    process.stdout.write(`
AIEI Scoring Formulas (v${SCHEMA_VERSION})

Q = (1 - defect_rate_ai / defect_rate_nonai) x ai_test_pass_rate x (1 - rework_rate_ai)
    + collection_quality_adjustment    [if collection_quality signal present]
    + agent_score_adjustment           [if agent_score signal present]
    + api_runtime_quality_adjustment   [if any runtime signal present]

    collection_quality_adjustment = (collection_quality - 70) / 300
      70 = median collection quality (State of the API, 100K+ respondents)
      /300 = max bonus +0.10 at score=100

    agent_score_adjustment = (agent_score - 70) / 500
      70 = agent-consumable threshold. /500 = max bonus +0.06

    api_runtime_quality_adjustment = (avg(runtime_signals) - 0.5) / 5
      Averages present runtime signals. 0.5 midpoint. Max +/-0.10.
      Signals: runtime_retry_behavior, runtime_idempotency,
               error_recovery_quality, error_contract_depth

L = 1 - (cycle_time_ai / cycle_time_nonai)
    + deploy_frequency_bonus           [if deploy_frequency signal present]

    deploy_frequency_bonus = min(deploy_frequency / 10, 0.15)
      10 deploys/day = DORA Elite (2025). Cap 0.15.

R = (1 - cfr_ai) x slo_attainment x contract_catch_rate x uptime_ai x adaptability
    All five factors multiplicative. Zero in any factor drives R toward zero.

C = (hours_saved x hourly_rate - overhead x hourly_rate) / total_ai_cost / target_roi
    - cost_growth_penalty              [if cost_growth_rate > value_growth_rate]

    cost_growth_penalty = (cost_growth_rate - value_growth_rate) / 100
      Asymmetric: only growing cost faster than value is penalized.

S = spec_security_score x dependabot_score x code_scanning_score x secret_scanning_score
    Supplemental. Not included in composite weight. Multiplicative: one zero = zero.

Composite = sum(weight[d] x score[d]) for d in {Q, L, R, C}
            Weights renormalized if fewer than 4 dimensions score.

Weight profiles:
  reliability_first  Q:20  L:20  R:45  C:15  (default)
  balanced           Q:25  L:25  R:25  C:25
  quality_first      Q:40  L:15  R:25  C:20
  speed_first        Q:15  L:40  R:25  C:20
  cost_first         Q:15  L:20  R:20  C:45
`);
  });

// ---------------------------------------------------------------------------
// aiei signals (new)
// ---------------------------------------------------------------------------

program
  .command('signals')
  .description('Show signal reference (what each signal measures)')
  .option('--json', 'Output structured JSON')
  .addHelpText('after', `
Examples:
  aiei signals                      Human-readable signal table
  aiei signals --json               Full signal descriptors for agents
  aiei signals --json | jq '.[].key'  List all signal keys`)
  .action((opts) => {
    const data = signalDescriptors();

    if (opts.json) {
      process.stdout.write(JSON.stringify(data, null, 2) + '\n');
      return;
    }

    process.stdout.write(`\nAIEI Signal Reference (${data.length} signals across 5 dimensions)\n\n`);
    process.stdout.write('  ' + 'Dim'.padEnd(5) + 'Signal'.padEnd(30) + 'Sources'.padEnd(36) + 'AX Pillar\n');
    process.stdout.write('  ' + '-'.repeat(5) + '-'.repeat(30) + '-'.repeat(36) + '-'.repeat(14) + '\n');

    for (const s of data) {
      const sources = s.sources.length > 0 ? s.sources.join(', ') : 'config';
      process.stdout.write(
        '  ' +
        s.dimension.padEnd(5) +
        s.key.padEnd(30) +
        sources.substring(0, 35).padEnd(36) +
        s.axPillar + '\n'
      );
    }
    process.stdout.write(`\n  ${data.length} signals. Run 'aiei signals --json' for full schema.\n\n`);
  });

// ---------------------------------------------------------------------------
// aiei validate (new)
// ---------------------------------------------------------------------------

program
  .command('validate')
  .description('Check config file and connector credentials')
  .option('-c, --config <path>', 'Path to .aiei.json config file')
  .option('--json', 'Output structured JSON')
  .addHelpText('after', `
Examples:
  aiei validate                     Check default config
  aiei validate --json              Machine-readable validation result
  aiei validate --config prod.json  Check specific config file`)
  .action(async (opts) => {
    const config = loadConfig(opts.config);
    const connectors = config.connectors as ConnectorConfigs;
    const configuredNames = Object.keys(connectors) as ConnectorName[];

    const results: {
      name: string;
      configured: boolean;
      credentialsPresent: boolean;
      missingCredentials: string[];
      dimensions: string[];
    }[] = [];

    for (const conn of ALL_CONNECTORS) {
      const isConfigured = configuredNames.includes(conn.name);
      if (!isConfigured) {
        results.push({
          name: conn.name,
          configured: false,
          credentialsPresent: false,
          missingCredentials: conn.requiredCredentials,
          dimensions: conn.dimensions,
        });
        continue;
      }

      const connConfig = connectors[conn.name] as Record<string, unknown> | undefined;
      const missing: string[] = [];
      for (const cred of conn.requiredCredentials) {
        const val = connConfig?.[cred];
        if (!isMissingCredentialValue(val)) continue;
        if (Array.isArray(val)) missing.push(`${cred} (empty array)`);
        else if (typeof val === 'string' && val.startsWith('$')) missing.push(`${cred} (env ${val} not set)`);
        else if (typeof val === 'string' && val.startsWith('REPLACE_WITH_')) missing.push(`${cred} (${val})`);
        else missing.push(cred);
      }

      results.push({
        name: conn.name,
        configured: true,
        credentialsPresent: missing.length === 0,
        missingCredentials: missing,
        dimensions: conn.dimensions,
      });
    }

    const coverage = buildCoverageMap(connectors);
    const configured = results.filter(r => r.configured);
    const ready = results.filter(r => r.configured && r.credentialsPresent);
    const warnings: string[] = [];

    for (const r of configured) {
      if (!r.credentialsPresent) {
        warnings.push(`${r.name} configured but credentials missing: ${r.missingCredentials.join(', ')}`);
      }
    }

    for (const dim of ['Q', 'L', 'R', 'C', 'S'] as Dimension[]) {
      const dimConnectors = coverage[dim];
      if (dimConnectors.length === 0) {
        warnings.push(`${dim} dimension has no configured connectors`);
      }
    }

    const validationResult = {
      configPath: opts.config || '.aiei.json',
      valid: true,
      orgName: config.orgName,
      weightProfile: config.weightProfile,
      connectors: results.filter(r => r.configured),
      dimensionCoverage: coverage,
      warnings,
      summary: {
        configured: configured.length,
        ready: ready.length,
        total: ALL_CONNECTORS.length,
      },
    };

    if (opts.json) {
      process.stdout.write(JSON.stringify(validationResult, null, 2) + '\n');
      if (warnings.length > 0) process.exit(EXIT.VALIDATION_FAILURE);
      return;
    }

    process.stdout.write(`\nConfig: ${validationResult.configPath} (valid)\n`);
    process.stdout.write(`Org: ${config.orgName} | Profile: ${config.weightProfile}\n\n`);

    process.stdout.write('  ' + 'Connector'.padEnd(20) + 'Configured'.padEnd(14) + 'Credentials'.padEnd(16) + 'Status\n');
    process.stdout.write('  ' + '-'.repeat(20) + '-'.repeat(14) + '-'.repeat(16) + '-'.repeat(16) + '\n');

    for (const r of configured) {
      const status = r.credentialsPresent ? 'ready' : `missing: ${r.missingCredentials.join(', ')}`;
      process.stdout.write(
        '  ' +
        r.name.padEnd(20) +
        'yes'.padEnd(14) +
        `${r.credentialsPresent ? (conn(r).length + '/' + conn(r).length) : '0/' + conn(r).length}`.padEnd(16) +
        status + '\n'
      );
    }

    process.stdout.write('\n  Dimension coverage:\n');
    for (const dim of ['Q', 'L', 'R', 'C', 'S'] as Dimension[]) {
      const names = coverage[dim];
      process.stdout.write(`    ${dim}: ${names.length > 0 ? names.join(', ') : '(none)'}\n`);
    }

    if (warnings.length > 0) {
      process.stdout.write('\n  Warnings:\n');
      for (const w of warnings) {
        process.stdout.write(`    - ${w}\n`);
      }
    }

    process.stdout.write(`\n  ${ready.length} of ${configured.length} configured connectors ready.\n`);
    process.stdout.write(`  Run 'aiei score' to begin assessment.\n\n`);

    if (warnings.length > 0) process.exit(EXIT.VALIDATION_FAILURE);
  });

function conn(r: { name: string }): string[] {
  const c = ALL_CONNECTORS.find(x => x.name === r.name);
  return c ? c.requiredCredentials : [];
}

// ---------------------------------------------------------------------------
// aiei init
// ---------------------------------------------------------------------------

const INIT_TEMPLATES: Record<string, object> = {
  generic: {
    orgName: 'your-org',
    weightProfile: 'reliability_first',
    connectors: {
      github: { token: '$GITHUB_TOKEN', org: 'your-org', repos: [] },
      sonarqube: { url: 'https://sonarcloud.io', token: '$SONAR_TOKEN', projectKey: 'your-project' },
      datadog: { apiKey: '$DD_API_KEY', appKey: '$DD_APP_KEY' },
      pagerduty: { apiKey: '$PAGERDUTY_TOKEN' },
      openai: { apiKey: '$OPENAI_API_KEY' },
      postman: { apiKey: '$POSTMAN_API_KEY', workspaceId: 'REPLACE_WITH_WORKSPACE_ID' },
    },
  },
  fox: {
    orgName: 'fox-entertainment',
    weightProfile: 'reliability_first',
    connectors: {
      github: { token: '$GITHUB_TOKEN', org: 'fox-entertainment', repos: [] },
      postman: { apiKey: '$POSTMAN_API_KEY', workspaceId: 'REPLACE_WITH_FOX_WORKSPACE_ID' },
      grafana: { baseUrl: 'REPLACE_WITH_GRAFANA_URL', apiToken: '$GRAFANA_API_TOKEN' },
      crunch42: { apiToken: '$CRUNCH42_TOKEN' },
    },
  },
};

program
  .command('init')
  .description('Create .aiei.json config template')
  .option('-t, --template <name>', 'Starter template: generic, fox', 'generic')
  .option('--json', 'Output structured JSON confirmation')
  .addHelpText('after', `
Templates:
  generic    GitHub, SonarQube, Datadog, PagerDuty, OpenAI, Postman
  fox        GitHub, Postman, Grafana, 42Crunch

Examples:
  aiei init                         Create generic .aiei.json
  aiei init --template fox          Create Fox-shaped .aiei.json
  aiei init --json                  Create config and output result as JSON`)
  .action((opts) => {
    if (existsSync(resolve('.aiei.json'))) {
      diag('Warning: .aiei.json already exists. Not overwriting.');
      if (opts.json) {
        process.stdout.write(JSON.stringify({ path: '.aiei.json', created: false, reason: 'already exists' }, null, 2) + '\n');
      }
      return;
    }

    const templateName = opts.template in INIT_TEMPLATES ? opts.template : 'generic';
    const template = INIT_TEMPLATES[templateName];

    writeFileSync('.aiei.json', JSON.stringify(template, null, 2) + '\n');

    if (opts.json) {
      process.stdout.write(JSON.stringify({
        path: '.aiei.json',
        template: templateName,
        created: true,
        connectorCount: Object.keys((template as Record<string, unknown>).connectors as object).length,
      }, null, 2) + '\n');
      return;
    }

    process.stdout.write(`Created .aiei.json (${templateName} template) - edit with your connector credentials.\n`);
    process.stdout.write('Tokens prefixed with $ are resolved from environment variables.\n');
    process.stdout.write(`Run 'aiei validate' to check credentials before scoring.\n`);
  });

// ---------------------------------------------------------------------------
// Custom --help --json handler
// ---------------------------------------------------------------------------

program.configureOutput({
  writeOut: (str) => process.stdout.write(str),
  writeErr: (str) => process.stderr.write(str),
});

program.parse();
