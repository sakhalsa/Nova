import {
  CORE_DIMENSIONS,
  Dimension,
  DimensionScore,
  EnvironmentConfig,
  ProductDomainGuidance,
  ConnectorName,
  CompositeResult,
  ValidationResult,
  RunGuidance,
  ConnectorSetupHint,
  SetupGuidance,
  ScoreLiteracyGuidance,
  WorkflowGuidance,
  WorkflowStep,
  SignalHint,
  OpsGuidance,
  SCHEMA_VERSION,
} from './types.js';

const DIM_CONNECTOR_PRIORITY: Record<Dimension, ConnectorName[]> = {
  Q: ['sonarqube', 'github', 'postman', 'gitlab'],
  L: ['github', 'gitlab', 'linear', 'jira', 'jellyfish'],
  R: ['postman', 'datadog', 'cloudflare', 'grafana', 'pagerduty', 'newrelic'],
  C: ['portkey', 'openai'],
  S: ['github', 'crunch42'],
};

const SIGNAL_CATALOG: Omit<SignalHint, 'seenInThisRun'>[] = [
  {
    key: 'cfr_ai',
    dimension: 'R',
    plainEnglish: 'Change failure rate for AI-related changes (proxy from delivery/observability signals).',
    improvesWith: 'Tighter deploy and incident linkage in Datadog or Vercel; label AI-related changes in Git.',
  },
  {
    key: 'uptime_ai',
    dimension: 'R',
    plainEnglish: 'Service uptime or availability for routes your observability stack tracks.',
    improvesWith: 'Instrument critical paths in Datadog, Grafana, New Relic, PagerDuty, Cloudflare, or ServiceNow.',
  },
  {
    key: 'slo_attainment',
    dimension: 'R',
    plainEnglish: 'Share of SLO checks or synthetic monitors passing (Postman monitors or APM SLOs).',
    improvesWith: 'Add Postman monitors for production APIs; align Datadog SLO widgets with the same services.',
  },
  {
    key: 'contract_catch_rate',
    dimension: 'R',
    plainEnglish: 'How often contract or schema checks catch mismatches before production.',
    improvesWith: 'Collection tests and assertions in Postman on release-critical APIs.',
  },
  {
    key: 'adaptability',
    dimension: 'R',
    plainEnglish: 'Operational adaptability proxy from connected analytics where available.',
    improvesWith: 'Connect Splunk or Supabase signals if those map to your incident or change workflows.',
  },
  {
    key: 'defect_rate_ai',
    dimension: 'Q',
    plainEnglish: 'Defect density on AI-touched code (SonarQube path).',
    improvesWith: 'SonarQube on repos where AI-generated code lands; consistent project keys.',
  },
  {
    key: 'defect_rate_nonai',
    dimension: 'Q',
    plainEnglish: 'Non-AI defect baseline used for comparison (manual or portfolio prior).',
    improvesWith: 'Set baselineDefectRate or baselineSource industry; avoids pure calibration.',
  },
  {
    key: 'ai_test_pass_rate',
    dimension: 'Q',
    plainEnglish: 'Share of collections with passing tests (AI-related weighting in formula).',
    improvesWith: 'Add test scripts to Postman collections; scope to APIs that matter for releases.',
  },
  {
    key: 'rework_rate_ai',
    dimension: 'Q',
    plainEnglish: 'Rework churn on AI-labeled PRs (GitHub/GitLab heuristics).',
    improvesWith: 'Tune AI detection labels; ensure PR metadata is consistent.',
  },
  {
    key: 'cycle_time_ai',
    dimension: 'L',
    plainEnglish: 'Lead time for changes touching AI-assisted work.',
    improvesWith: 'GitHub/GitLab/Linear/Jira/Jellyfish with real deployment events.',
  },
  {
    key: 'cycle_time_nonai',
    dimension: 'L',
    plainEnglish: 'Baseline cycle time for non-AI work (strict mode or priors).',
    improvesWith: 'Set baselineCycleTimeHours or use portfolio scoring with industry priors.',
  },
  {
    key: 'deploy_frequency',
    dimension: 'L',
    plainEnglish: 'Deploy frequency proxy from Datadog or Vercel where wired.',
    improvesWith: 'Connect deployment events to the same connectors your teams trust.',
  },
  {
    key: 'hours_saved_monthly',
    dimension: 'C',
    plainEnglish: 'Estimated labor hours saved (GitHub/GitLab PR metrics).',
    improvesWith: 'Ensure PR volume and review data cover the teams in scope.',
  },
  {
    key: 'review_overhead_hours_monthly',
    dimension: 'C',
    plainEnglish: 'Review overhead used in ROI-style cost narrative.',
    improvesWith: 'Same as hours_saved: needs GitHub/GitLab activity in configured repos.',
  },
  {
    key: 'total_ai_cost',
    dimension: 'C',
    plainEnglish: 'Monthly AI spend from Portkey/OpenAI (summed when both present).',
    improvesWith: 'Connect Portkey or OpenAI; or set monthlyAiCost for a manual C input.',
  },
  {
    key: 'spec_security_score',
    dimension: 'S',
    plainEnglish: 'API spec security posture from 42Crunch.',
    improvesWith: 'Point Crunch42 at authoritative OpenAPI specs for external APIs.',
  },
  {
    key: 'dependabot_score',
    dimension: 'S',
    plainEnglish: 'Dependency update hygiene from GitHub Dependabot signals.',
    improvesWith: 'Enable Dependabot on org repos in scope.',
  },
  {
    key: 'code_scanning_score',
    dimension: 'S',
    plainEnglish: 'Static analysis / code scanning coverage from GitHub Advanced Security.',
    improvesWith: 'Turn on code scanning for repositories that ship customer-facing APIs.',
  },
];

function nextFixForConnector(name: ConnectorName, error?: string): string {
  const e = (error || '').toLowerCase();
  if (e.includes('401') || e.includes('unauthorized'))
    return 'Verify API token is valid and not expired; regenerate if rotated recently.';
  if (e.includes('403') || e.includes('forbidden'))
    return 'Token is authenticated but lacks scopes or org access; grant required API permissions.';
  if (e.includes('404') || e.includes('not found'))
    return 'Check workspace, zone, project, or org IDs match the provider console exactly.';
  if (e.includes('timeout') || e.includes('econnrefused') || e.includes('enotfound'))
    return 'Network or DNS issue: confirm base URL, VPN, and firewall allowlists for this API.';
  if (e.includes('429') || e.includes('rate limit'))
    return 'Backoff and retry; reduce parallel connector load or widen assessment interval in CI.';
  if (!e) return 'Connection failed with no message; re-run with logging and verify required credential fields.';
  return `Review ${name} credentials and required fields against the EnvironmentConfig schema in openapi.yaml.`;
}

function buildSetup(
  validation: ValidationResult,
  config: EnvironmentConfig,
): SetupGuidance {
  const hints: ConnectorSetupHint[] = [];
  for (const c of validation.connectors) {
    if (c.configured && !c.connected) {
      hints.push({
        connector: c.name,
        configured: true,
        connected: false,
        error: c.error,
        nextFix: nextFixForConnector(c.name, c.error),
      });
    }
  }

  const connected = new Set(
    validation.connectors.filter((x) => x.connected).map((x) => x.name) as ConnectorName[],
  );

  const minimal: ConnectorName[] = [];
  const add = (n: ConnectorName) => {
    if (!minimal.includes(n)) minimal.push(n);
  };

  for (const d of CORE_DIMENSIONS) {
    if (validation.coverage[d].length === 0) {
      for (const cand of DIM_CONNECTOR_PRIORITY[d]) {
        if (!connected.has(cand)) {
          add(cand);
          break;
        }
      }
    }
  }

  if (minimal.length === 0 && connected.size === 0) {
    add('postman');
    add('github');
    add('datadog');
  }

  const costNeedsManual =
    validation.costSource === 'none' && !minimal.some((n) => n === 'portkey' || n === 'openai');
  const configFileHint =
    (config.configPath ? `Config path in use: ${config.configPath}. ` : '') +
    'CLI and MCP resolve aiei-env.json from the process working directory unless you pass configPath or inline config. Agents should set cwd to the repo that holds secrets, not assume the IDE root.';

  return {
    intro:
      'Connectors must be both configured (credentials present) and connected (API succeeded). Misconfigured tokens are the most common blocker for agents and CI.',
    connectorHints: hints,
    minimalViableConnectors: minimal.slice(0, 8),
    configFileHint: costNeedsManual
      ? `${configFileHint} For C-score without Portkey/OpenAI, set monthlyAiCost.`
      : configFileHint,
    validationReady: validation.ready,
  };
}

function buildScoreLiteracy(
  composite: CompositeResult,
  dimensions: Record<Dimension, DimensionScore>,
): ScoreLiteracyGuidance {
  const { assessmentMode, scoringMode, scoredCoreCount, partialComposite, weightProfile } = composite;

  const bullets: string[] = [];
  if (assessmentMode === 'readiness') {
    bullets.push(
      'Readiness mode means fewer than three core dimensions (Q, L, R, C) scored. Treat the composite as directional, not a peer-comparable index.',
    );
  } else {
    bullets.push(
      `Full mode: ${scoredCoreCount} of 4 core dimensions scored. Composite weights only scored dimensions.`,
    );
  }
  if (partialComposite) {
    bullets.push(
      'Partial composite: missing dimensions are not zero — they are excluded from the weighted mean. Do not fill gaps mentally with "average".',
    );
  }
  bullets.push(
    'S (Security) is supplemental: it never enters the weighted composite. Use it alongside Q/L/R/C, not as a fifth leg of the same number.',
  );

  const calibrating = CORE_DIMENSIONS.filter((d) => dimensions[d].status === 'calibrating');
  if (calibrating.length > 0) {
    bullets.push(
      `Dimensions still calibrating: ${calibrating.join(', ')} — signals are weak or baselines are missing; see per-dimension calibrationMessage.`,
    );
  }

  const scoringModeExplainer =
    scoringMode === 'portfolio'
      ? 'Portfolio scoring uses industry priors where non-AI baselines are missing so Q/L can move off pure calibration. Comparability across orgs assumes similar baselineSource and scoringMode.'
      : 'Strict scoring expects measured non-AI baselines for Q/L comparisons. Without them, those dimensions may calibrate instead of scoring.';

  return {
    headline: `How to read this run (${assessmentMode}, profile ${weightProfile})`,
    bullets,
    compositeInterpretation:
      'The composite is a weighted average of scored Q/L/R/C dimensions only. It is a proxy index from toolchain signals, not proof of business outcomes.',
    comparability:
      'Compare runs only with the same weightProfile, scoringMode, and similar connector coverage. Different tools or scopes change the number, not just performance.',
    scoringModeExplainer,
    supplementalSNote:
      'When sEnabled is true and S is scored, show S next to — not inside — the composite in executive views.',
  };
}

function buildWorkflow(): WorkflowGuidance {
  const firstRun: WorkflowStep[] = [
    {
      order: 1,
      label: 'Discover requirements',
      detail:
        'Call aiei_query (MCP) or GET /v1/dimensions and /v1/weights so the agent knows which connectors feed each dimension.',
    },
    {
      order: 2,
      label: 'Validate credentials',
      detail:
        'POST /v1/validate or validateConfig before a full assess. Surfaces mis-scoped tokens without burning connector rate limits on a long run.',
    },
    {
      order: 3,
      label: 'Run assessment',
      detail:
        'POST /v1/assess or aiei_execute with EnvironmentConfig. Prefer explicit configPath when cwd is ambiguous (IDE agents, multi-root workspaces).',
    },
    {
      order: 4,
      label: 'Render the right artifact',
      detail:
        'Use summary for humans, json for pipelines, html for readouts. POST /v1/report accepts the CompositeResult only.',
    },
  ];

  const ciOrAgent: WorkflowStep[] = [
    {
      order: 1,
      label: 'Pin schema version',
      detail:
        'Check result.schemaVersion and validation.warnings on every run. Fail CI if unexpected schema bumps occur without a client update.',
    },
    {
      order: 2,
      label: 'Treat telemetry as optional',
      detail:
        'telemetry: true uploads to Turbopuffer when configured; failures are non-blocking. Do not gate CI on telemetry success.',
    },
    {
      order: 3,
      label: 'Avoid logging secrets',
      detail:
        'Strip API keys from logs when wrapping runAssessment; EnvironmentConfig contains raw tokens.',
    },
  ];

  return {
    firstRun,
    ciOrAgent,
    reportFormats: [
      { context: 'Automation / diff', format: 'json', reason: 'Machine-readable; smallest surprise for codegen.' },
      { context: 'Chat agent handoff', format: 'summary', reason: 'Text fits model context; includes runGuidance blocks.' },
      { context: 'Stakeholder email or deck', format: 'html', reason: 'Visual bars and styled guidance panels.' },
    ],
  };
}

function buildOps(config: EnvironmentConfig): OpsGuidance {
  const telem = config.telemetry === true;
  return {
    schemaVersion: SCHEMA_VERSION,
    telemetryEnabled: telem,
    optionalFeaturesNote: telem
      ? 'Telemetry upload is best-effort. Upstream 429 or network errors do not fail the assessment.'
      : 'Telemetry is off. History may still append locally when the history module is writable.',
    clientCompatibility:
      'Clients generated from openapi.yaml should tolerate unknown fields on CompositeResult. Prefer reading schemaVersion before strict parsing.',
  };
}

export interface BuildRunGuidanceParams {
  validation: ValidationResult;
  config: EnvironmentConfig;
  composite: CompositeResult;
  dimensions: Record<Dimension, DimensionScore>;
  productDomain: ProductDomainGuidance;
  signalKeysPresent: string[];
}

export function buildRunGuidance(params: BuildRunGuidanceParams): RunGuidance {
  const present = new Set(params.signalKeysPresent);
  const signalHints: SignalHint[] = SIGNAL_CATALOG.map((row) => ({
    ...row,
    seenInThisRun: present.has(row.key),
  }));

  return {
    productDomain: params.productDomain,
    setup: buildSetup(params.validation, params.config),
    scoreLiteracy: buildScoreLiteracy(params.composite, params.dimensions),
    workflow: buildWorkflow(),
    signalHints,
    ops: buildOps(params.config),
  };
}
