import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { runAssessment, AssessmentResult } from './runner.js';
import { renderReport } from './reporter.js';
import { EnvironmentConfig, ReportFormat, WEIGHT_PROFILES, CompositeResult, ValidationResult } from './types.js';
import { DIMENSIONS } from './dimensions.js';
import { validateConfig } from './setup.js';
import { ALL_CONNECTORS } from './connectors/registry.js';

// ---------------------------------------------------------------------------
// MCP Tool Definitions
// ---------------------------------------------------------------------------

export const TOOL_DEFINITIONS = [
  {
    name: 'aiei_query',
    description:
      'Query AIEI capabilities, dimension explanations, weight profiles, and connector requirements. Call before aiei_execute: same order as POST /v1/validate then POST /v1/assess in HTTP.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          enum: ['dimensions', 'weights', 'connectors', 'status'],
          description: 'What to query about AIEI',
        },
        dimension: { type: 'string', description: 'Specific dimension to query (Q, L, R, C, S)' },
      },
      required: ['topic'],
    },
  },
  {
    name: 'aiei_execute',
    description:
      'Run an AIEI assessment. Validates connectors, collects signals, scores dimensions, and returns validation + CompositeResult. result.runGuidance has setup hints (failed connectors), score literacy, CI/agent workflow steps, signal catalog with seenInThisRun, ops notes, and productDomain (identity/streaming/contract drift). result.productDomainGuidance mirrors productDomain for backward compatibility. Config is loaded from file or passed inline.',
    inputSchema: {
      type: 'object',
      properties: {
        config: {
          type: 'object',
          description: 'Full or partial EnvironmentConfig. Overrides file config for this run.',
        },
        configPath: {
          type: 'string',
          description: 'Path to config file. Defaults to ./aiei-env.json',
        },
      },
    },
  },
  {
    name: 'aiei_report',
    description:
      'Generate a formatted report from the most recent assessment result.',
    inputSchema: {
      type: 'object',
      properties: {
        format: { type: 'string', enum: ['json', 'html', 'summary'], default: 'summary' },
      },
    },
  },
];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let lastResult: AssessmentResult | null = null;
let cachedConfig: EnvironmentConfig | null = null;
let serverConfigPath: string | null = null;

export function setConfigPath(path: string): void {
  serverConfigPath = path;
}

export function setConfig(config: EnvironmentConfig): void {
  cachedConfig = config;
}

// ---------------------------------------------------------------------------
// Three-tier config loading: inline > server args > working directory file
// ---------------------------------------------------------------------------

function loadConfig(inlineConfig?: Partial<EnvironmentConfig>, inlinePath?: string): EnvironmentConfig {
  // Tier 1: Inline config (from aiei_execute call)
  if (inlineConfig && inlineConfig.orgName && inlineConfig.connectors) {
    const config = inlineConfig as EnvironmentConfig;
    config.weightProfile = config.weightProfile || 'reliability_first';
    return config;
  }

  // Tier 2: Server initialization path (from --config arg when MCP server starts)
  const filePath = inlinePath || serverConfigPath || './aiei-env.json';
  const resolvedPath = resolve(filePath);

  if (existsSync(resolvedPath)) {
    try {
      const config = JSON.parse(readFileSync(resolvedPath, 'utf-8')) as EnvironmentConfig;
      config.configPath = resolvedPath;
      return config;
    } catch {
      throw new Error(`Failed to parse config at ${resolvedPath}`);
    }
  }

  // Tier 3: Cached from previous call
  if (cachedConfig) return cachedConfig;

  throw new Error(
    'No AIEI configuration found. Run \'npx @postmanlabs/aiei --setup\' to configure, or pass config inline.',
  );
}

// ---------------------------------------------------------------------------
// Tool handler
// ---------------------------------------------------------------------------

export async function handleTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case 'aiei_query':
      return handleQuery(args);
    case 'aiei_execute':
      return handleExecute(args);
    case 'aiei_report':
      return handleReport(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function handleQuery(args: Record<string, unknown>): unknown {
  const topic = args.topic as string;

  switch (topic) {
    case 'dimensions': {
      const dim = args.dimension as string;
      if (dim && DIMENSIONS[dim as keyof typeof DIMENSIONS]) {
        return DIMENSIONS[dim as keyof typeof DIMENSIONS];
      }
      return DIMENSIONS;
    }
    case 'weights':
      return WEIGHT_PROFILES;
    case 'connectors': {
      return ALL_CONNECTORS.map((c: { name: string; dimensions: string[]; requiredCredentials: string[] }) => ({
        name: c.name,
        dimensions: c.dimensions,
        requiredCredentials: c.requiredCredentials,
      }));
    }
    case 'status':
      return {
        lastRun: lastResult ? lastResult.result.timestamp : null,
        configLoaded: cachedConfig !== null || serverConfigPath !== null,
      };
    default:
      return { error: `Unknown topic: ${topic}` };
  }
}

async function handleExecute(args: Record<string, unknown>): Promise<unknown> {
  const config = loadConfig(
    args.config as Partial<EnvironmentConfig>,
    args.configPath as string,
  );

  // Validate weight profile
  if (!WEIGHT_PROFILES[config.weightProfile]) {
    return {
      error: `Weight profile '${config.weightProfile}' not recognized. Contact your Postman representative to configure a custom profile.`,
      validProfiles: Object.keys(WEIGHT_PROFILES),
    };
  }

  const assessment = await runAssessment(config);
  lastResult = assessment;
  cachedConfig = config;

  const { validation, result } = assessment;

  // Build response with inline setup block
  const setupBlock = {
    connectors: validation.connectors
      .filter((c) => c.configured)
      .map((c) => ({
        name: c.name,
        connected: c.connected,
        error: c.error,
        dimensions: c.dimensions,
      })),
    coverage: validation.coverage,
    warnings: validation.warnings,
    sAvailable: validation.sAvailable,
    sEnabled: validation.sEnabled,
    sHint: !validation.sEnabled && validation.sAvailable
      ? 'Security posture analysis available. Set sEnabled: true and provide 42Crunch or GitHub security credentials.'
      : undefined,
    costSource: validation.costSource,
  };

  const scores: Record<string, unknown> = {};
  for (const [dim, ds] of Object.entries(result.dimensions)) {
    scores[dim] = {
      score: ds.score,
      status: ds.status,
      sources: ds.connectorsSourcing,
      calibrationMessage: ds.calibrationMessage,
    };
  }

  return {
    setup: setupBlock,
    composite: result.composite,
    weightProfile: result.weightProfile,
    calibrating: result.calibrating,
    scores,
    gap: result.gap,
    weakest: result.weakest,
    strongest: result.strongest,
    assessmentMode: result.assessmentMode,
    scoringMode: result.scoringMode,
    scoredCoreCount: result.scoredCoreCount,
    partialComposite: result.partialComposite,
    epistemicNote: result.epistemicNote,
    productDomainGuidance: result.productDomainGuidance,
    runGuidance: result.runGuidance,
    schemaVersion: result.schemaVersion,
    timestamp: result.timestamp,
    durationMs: assessment.durationMs,
  };
}

function handleReport(args: Record<string, unknown>): unknown {
  if (!lastResult) {
    return { error: 'No assessment has been run. Call aiei_execute first.' };
  }
  const format = (args.format as ReportFormat) || 'summary';
  return renderReport(lastResult.result, format, cachedConfig?.narrativeProfile);
}
