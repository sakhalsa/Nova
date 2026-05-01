#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  runAssessment, ALL_CONNECTORS, BENCHMARKS, buildPresentation,
  WEIGHT_PROFILES, DIMENSIONS,
  SIGNAL_ROUTES, buildCoverageMap, SCHEMA_VERSION,
} from '@sachsk23/aiei-engine';
import type {
  EnvironmentConfig, CompositeResult, AssessmentResult,
  ConnectorName, ConnectorConfigs, Dimension,
} from '@sachsk23/aiei-engine';
import { renderReport as renderHtmlReport } from '@sachsk23/aiei-templates';
import { readFileSync, existsSync } from 'node:fs';

const args = process.argv.slice(2);
const READ_ONLY = args.includes('--read-only');
const toolsArg = args.find((arg) => arg.startsWith('--tools='));
const ALLOWED_TOOLS = toolsArg
  ? new Set(toolsArg.replace('--tools=', '').split(',').map((tool) => tool.trim()).filter(Boolean))
  : null;

const server = new Server(
  { name: 'aiei', version: '1.6.0' },
  { capabilities: { tools: {} } },
);

let lastResult: { assessment: AssessmentResult; config: EnvironmentConfig } | null = null;

const AX_PILLAR_MAP: Record<string, string> = {
  spec_security_score: 'Access', dependabot_score: 'Access',
  code_scanning_score: 'Access', secret_scanning_score: 'Access',
  collection_quality: 'Context', agent_score: 'Context',
  error_contract_depth: 'Context',
  cfr_ai: 'Orchestration', slo_attainment: 'Orchestration',
  contract_catch_rate: 'Orchestration', uptime_ai: 'Orchestration',
  adaptability: 'Orchestration',
};

const FORMULA_SPEC = {
  version: SCHEMA_VERSION,
  dimensions: {
    Q: {
      expression: '(1 - defect_rate_ai / defect_rate_nonai) x ai_test_pass_rate x (1 - rework_rate_ai)',
      modifiers: [
        { name: 'collection_quality_adjustment', gate: 'collection_quality signal present', expression: '(collection_quality * 100 - 70) / 300', cap: 0.10 },
        { name: 'agent_score_adjustment', gate: 'agent_score signal present', expression: '(agent_score * 100 - 70) / 500', cap: 0.06 },
        { name: 'api_runtime_quality_adjustment', gate: 'any runtime signal present', expression: '(avg(runtime_signals) - 0.5) / 5', cap: 0.10 },
      ],
    },
    L: {
      expression: '1 - (cycle_time_ai / cycle_time_nonai) + deploy_frequency_bonus',
      modifiers: [{ name: 'deploy_frequency_bonus', gate: 'deploy_frequency signal present', expression: 'min(deploy_frequency / 10, 0.15)', cap: 0.15 }],
    },
    R: { expression: '(1 - cfr_ai) x slo_attainment x contract_catch_rate x uptime_ai x adaptability' },
    C: {
      expression: '(hours_saved * hourly_rate - overhead * hourly_rate) / total_ai_cost / target_roi - cost_growth_penalty',
      modifiers: [{ name: 'cost_growth_penalty', gate: 'cost_growth_rate > value_growth_rate', expression: '(cost_growth_rate - value_growth_rate) / 100' }],
    },
    S: {
      expression: 'spec_security_score x dependabot_score x code_scanning_score x secret_scanning_score',
      note: 'Supplemental - not included in composite weight calculation',
    },
  },
  composite: {
    expression: 'sum(weight[d] x score[d]) for d in {Q, L, R, C}',
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

function connectorDocsUrl(name: string): string {
  return `CONNECTORS.md#${name.replace(/_/g, '-').toLowerCase()}`;
}

function text(payload: unknown) {
  return { content: [{ type: 'text' as const, text: typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2) }] };
}

function connectorDescriptors() {
  return ALL_CONNECTORS.map(c => ({
    name: c.name,
    dimensions: c.dimensions,
    requiredCredentials: c.requiredCredentials,
    optionalCredentials: [],
    signalsProduced: SIGNAL_ROUTES
      .filter(route => route.priorityOrder.includes(c.name))
      .map(route => route.formulaInput),
    docsUrl: connectorDocsUrl(c.name),
  }));
}

function signalDescriptors() {
  return SIGNAL_ROUTES.map(route => ({
    key: route.formulaInput,
    dimension: route.dimension,
    description: SIGNAL_METADATA[route.formulaInput]?.description ?? 'AIEI scoring signal',
    normalization: SIGNAL_METADATA[route.formulaInput]?.normalization ?? '0-1 normalized signal',
    sources: route.priorityOrder,
    priorityOrder: route.priorityOrder,
    mergeStrategy: route.mergeStrategy,
    defaultWhenMissing: SIGNAL_METADATA[route.formulaInput]?.defaultWhenMissing ?? null,
    axPillar: AX_PILLAR_MAP[route.formulaInput] || 'Tools',
  }));
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

function validateConfigShape(config: EnvironmentConfig, configPath?: string) {
  const connectors = config.connectors as ConnectorConfigs;
  const configuredNames = Object.keys(connectors) as ConnectorName[];
  const results = ALL_CONNECTORS.map(connector => {
    const configured = configuredNames.includes(connector.name);
    const connectorConfig = connectors[connector.name] as Record<string, unknown> | undefined;
    const missingCredentials = configured
      ? connector.requiredCredentials
          .map(cred => {
            const val = connectorConfig?.[cred];
            if (!isMissingCredentialValue(val)) return null;
            if (Array.isArray(val)) return `${cred} (empty array)`;
            if (typeof val === 'string' && val.startsWith('$')) return `${cred} (env ${val} not set)`;
            if (typeof val === 'string' && val.startsWith('REPLACE_WITH_')) return `${cred} (${val})`;
            return cred;
          })
          .filter((cred): cred is string => cred !== null)
      : connector.requiredCredentials;

    return {
      name: connector.name,
      configured,
      credentialsPresent: configured && missingCredentials.length === 0,
      missingCredentials,
      dimensions: connector.dimensions,
    };
  });

  const warnings: string[] = [];
  for (const r of results.filter(r => r.configured && !r.credentialsPresent)) {
    warnings.push(`${r.name} configured but credentials missing: ${r.missingCredentials.join(', ')}`);
  }

  const coverage = buildCoverageMap(connectors);
  for (const dim of ['Q', 'L', 'R', 'C', 'S'] as Dimension[]) {
    if (coverage[dim].length === 0) warnings.push(`${dim} dimension has no configured connectors`);
  }

  return {
    configPath: configPath ?? '.aiei.json',
    valid: true,
    orgName: config.orgName,
    weightProfile: config.weightProfile,
    connectors: results.filter(r => r.configured),
    dimensionCoverage: coverage,
    warnings,
  };
}

const ALL_TOOLS = [
  {
    name: 'aiei_score',
    description: 'Run AIEI scoring across configured connectors. Returns Q/R/L/C/S dimension scores, composite index, AX mapping, epistemic summary, narratives, benchmarks, ROI, and recommendations.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        config_path: { type: 'string', description: 'Path to .aiei.json config file.' },
        hourly_rate: { type: 'number', description: 'Blended engineering hourly rate for ROI calculation.' },
      },
    },
  },
  {
    name: 'aiei_report',
    description: 'Run AIEI scoring and generate a self-contained HTML report. In --read-only mode, output_path is rejected and the HTML is returned inline.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        config_path: { type: 'string', description: 'Path to .aiei.json config file.' },
        output_path: { type: 'string', description: 'File path to write HTML report.' },
        hourly_rate: { type: 'number', description: 'Blended engineering hourly rate.' },
      },
    },
  },
  {
    name: 'aiei_query',
    description: 'Query AIEI capabilities, dimension explanations, weight profiles, connector requirements, formulas, signals, and status.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        topic: { type: 'string', enum: ['dimensions', 'weights', 'connectors', 'status', 'formula', 'signals'], description: 'What to query.' },
        dimension: { type: 'string', description: 'Specific dimension (Q, L, R, C, S).' },
      },
      required: ['topic'],
    },
  },
  {
    name: 'aiei_connectors',
    description: 'List all available AIEI connectors, required credentials, and produced signals.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'aiei_signals',
    description: 'List AIEI signal descriptors, dimensions, source priority chains, merge strategy, and AX pillar mapping.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'aiei_formula',
    description: 'Return current v1.5.0 scoring formulas, modifiers, and weight profiles.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'aiei_validate',
    description: 'Validate AIEI config shape, credential presence, and dimension coverage without running scoring.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        config_path: { type: 'string', description: 'Path to .aiei.json config file.' },
      },
    },
  },
  {
    name: 'aiei_benchmarks',
    description: 'Return industry benchmark data from Postman State of the API, DORA Accelerate, and Forrester TEI reports.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        dimension: { type: 'string', enum: ['quality', 'reliability', 'lead_time', 'cost', 'all'], description: 'Which dimension benchmarks. Default: all.' },
      },
    },
  },
];

function visibleTools() {
  return ALL_TOOLS.filter(tool => {
    if (ALLOWED_TOOLS && !ALLOWED_TOOLS.has(tool.name)) return false;
    return true;
  });
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: visibleTools(),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const typedArgs = (args ?? {}) as Record<string, unknown>;

  try {
    if (ALLOWED_TOOLS && !ALLOWED_TOOLS.has(name)) {
      return text({ error: `Tool '${name}' is not enabled by --tools allowlist.` });
    }

    if (name === 'aiei_connectors') {
      return text(connectorDescriptors());
    }

    if (name === 'aiei_signals') {
      return text(signalDescriptors());
    }

    if (name === 'aiei_formula') {
      return text(FORMULA_SPEC);
    }

    if (name === 'aiei_validate') {
      const config = loadConfig(typedArgs.config_path as string);
      return text(validateConfigShape(config, typedArgs.config_path as string | undefined));
    }

    if (name === 'aiei_benchmarks') {
      const dim = (typedArgs.dimension as string) || 'all';
      const data = dim === 'all' ? BENCHMARKS : (BENCHMARKS as Record<string, unknown>)[dim] ?? BENCHMARKS;
      return text(data);
    }

    if (name === 'aiei_query') {
      const topic = typedArgs.topic as string;
      if (topic === 'dimensions') {
        const dim = typedArgs.dimension as string;
        const data = dim ? (DIMENSIONS as Record<string, unknown>)[dim] : DIMENSIONS;
        return text(data);
      }
      if (topic === 'weights') {
        return text(WEIGHT_PROFILES);
      }
      if (topic === 'connectors') {
        return text(connectorDescriptors());
      }
      if (topic === 'formula') {
        return text(FORMULA_SPEC);
      }
      if (topic === 'signals') {
        return text(signalDescriptors());
      }
      if (topic === 'status') {
        return text({
          lastRun: lastResult?.assessment.result.timestamp ?? null,
          readOnly: READ_ONLY,
          tools: visibleTools().map(tool => tool.name),
        });
      }
      return text({ error: `Unknown topic: ${topic}` });
    }

    if (name === 'aiei_score' || name === 'aiei_report') {
      const config = loadConfig(typedArgs.config_path as string);
      if (typedArgs.hourly_rate) config.hourlyRate = Number(typedArgs.hourly_rate);

      const assessment = await runAssessment(config);
      lastResult = { assessment, config };

      const signals = extractSignalValues(assessment.result);
      const presentation = buildPresentation(assessment.result, signals);

      if (name === 'aiei_report') {
        if (READ_ONLY && typedArgs.output_path) {
          return text({ error: 'aiei_report output_path is disabled in --read-only mode. Omit output_path to return HTML inline.' });
        }
        const html = renderHtmlReport({
          orgName: config.orgName,
          timestamp: assessment.result.timestamp,
          schemaVersion: assessment.result.schemaVersion,
          weightProfile: assessment.result.weightProfile,
          assessmentMode: assessment.result.assessmentMode,
          scoringMode: assessment.result.scoringMode,
          scoredCoreCount: assessment.result.scoredCoreCount,
          epistemicNote: assessment.result.epistemicNote,
          presentation,
        });
        if (typedArgs.output_path) {
          writeFileSync(resolve(typedArgs.output_path as string), html);
          return text(`Report written to ${typedArgs.output_path}. AIEI Score: ${presentation.overall.index} [${presentation.overall.stage}]`);
        }
        return text(html);
      }

      return text({ ...assessment.result, presentation });
    }

    return text({ error: `Unknown tool: ${name}` });
  } catch (err) {
    return text({ error: err instanceof Error ? err.message : String(err) });
  }
});

function loadConfig(configPath?: string): EnvironmentConfig {
  const paths = configPath
    ? [configPath]
    : [resolve('.aiei.json'), resolve('aiei.config.json'), resolve('aiei-env.json')];

  for (const p of paths) {
    if (existsSync(p)) {
      const raw = JSON.parse(readFileSync(p, 'utf-8'));
      raw.weightProfile = raw.weightProfile || 'reliability_first';
      return raw as EnvironmentConfig;
    }
  }
  throw new Error('No config found. Create .aiei.json or pass config_path.');
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

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(e => {
  process.stderr.write(`AIEI MCP error: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
