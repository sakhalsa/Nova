export type Dimension = 'Q' | 'L' | 'R' | 'C' | 'S';

export const CORE_DIMENSIONS: Dimension[] = ['Q', 'L', 'R', 'C'];
export const ALL_DIMENSIONS: Dimension[] = ['Q', 'L', 'R', 'C', 'S'];

export const SCHEMA_VERSION = '1.5.0';

export type AssessmentMode = 'full' | 'readiness';

export type ScoringMode = 'strict' | 'portfolio';

export type DataQuality = 'high' | 'medium' | 'low';

export type ReportFormat = 'json' | 'html' | 'summary';

export interface SignalConfidence {
  sampleSize: number;
  timeWindowDays: number;
  truncated: boolean;
  completeness: 'full' | 'partial' | 'minimal';
}

// ---------------------------------------------------------------------------
// Weight profiles (QLRC only - S is supplemental, never weighted)
// ---------------------------------------------------------------------------

export type WeightProfileName =
  | 'reliability_first'
  | 'balanced'
  | 'quality_first'
  | 'speed_first'
  | 'cost_first';

export interface DimensionWeights {
  q: number;
  l: number;
  r: number;
  c: number;
}

export interface WeightProfile {
  name: WeightProfileName;
  weights: DimensionWeights;
  rationale: string;
}

export const WEIGHT_PROFILES: Record<WeightProfileName, WeightProfile> = {
  reliability_first: {
    name: 'reliability_first',
    weights: { q: 0.20, l: 0.20, r: 0.45, c: 0.15 },
    rationale:
      'Emphasizes production stability. Appropriate when service reliability is the primary business risk. R at 0.45 ensures that speed gains (L) and quality improvements (Q) cannot mask reliability degradation. Used by default because most enterprise AI adoption risks manifest first in production.',
  },
  balanced: {
    name: 'balanced',
    weights: { q: 0.25, l: 0.25, r: 0.25, c: 0.25 },
    rationale:
      'Equal weight across all four dimensions. Appropriate when no single dimension dominates business risk, or during initial assessments before a pattern emerges.',
  },
  quality_first: {
    name: 'quality_first',
    weights: { q: 0.40, l: 0.15, r: 0.25, c: 0.20 },
    rationale:
      'Emphasizes code quality and defect reduction. Appropriate for teams where AI-generated code quality is the primary concern, or where regulatory requirements demand defect-rate accountability.',
  },
  speed_first: {
    name: 'speed_first',
    weights: { q: 0.15, l: 0.40, r: 0.25, c: 0.20 },
    rationale:
      'Emphasizes delivery velocity. Appropriate when competitive pressure demands faster time-to-market, provided reliability guardrails (R at 0.25) prevent speed from masking instability.',
  },
  cost_first: {
    name: 'cost_first',
    weights: { q: 0.15, l: 0.20, r: 0.20, c: 0.45 },
    rationale:
      'Emphasizes ROI on AI tooling investment. Appropriate when executive sponsors require evidence that AI spend is generating measurable labor savings and infrastructure efficiency.',
  },
};

export const CUSTOM_WEIGHT_REJECTION =
  'Weight profiles are calibrated to ensure cross-customer comparability and prevent masking of risk dimensions. Contact your Postman representative to discuss a custom profile for your organization\'s specific measurement needs.';

// ---------------------------------------------------------------------------
// Signals and scores
// ---------------------------------------------------------------------------

export interface SignalResult {
  key: string;
  value: number;
  source: 'live' | 'fallback' | 'manual' | 'calibration';
  connector?: string;
  raw?: unknown;
}

export type DimensionStatus = 'scored' | 'calibrating' | 'unavailable';

export interface ProvenanceStep {
  signal: string;
  rawValue: unknown;
  normalizedValue: number;
  connector: string;
  apiEndpoint: string;
  timestamp: string;
  sampleSize: number;
  formulaPosition: string;
}

export interface DimensionScore {
  dimension: Dimension;
  score: number;
  status: DimensionStatus;
  signals: SignalResult[];
  connectorsSourcing: string[];
  calibrationMessage?: string;
  dataQuality?: DataQuality;
  provenance?: ProvenanceStep[];
}

export type ProductDomainTopicId = 'identity' | 'streaming' | 'contract_drift';

/** Shipped with every run: in-product support when execs ask about identity / streaming / contract drift vs the score */
export interface ProductDomainTopic {
  id: ProductDomainTopicId;
  title: string;
  inProduct: string;
  notCovered: string;
  connectorsThatHelp: ConnectorName[];
  suggestedNextStep: string;
}

export interface ProductDomainGuidance {
  intro: string;
  whenThisApplies: string;
  topics: ProductDomainTopic[];
  readinessHint?: string;
}

/** Per-connector fix suggestion when configured but not connected */
export interface ConnectorSetupHint {
  connector: ConnectorName;
  configured: boolean;
  connected: boolean;
  error?: string;
  nextFix: string;
}

export interface SetupGuidance {
  intro: string;
  connectorHints: ConnectorSetupHint[];
  minimalViableConnectors: ConnectorName[];
  configFileHint: string;
  validationReady: boolean;
}

export interface ScoreLiteracyGuidance {
  headline: string;
  bullets: string[];
  compositeInterpretation: string;
  comparability: string;
  scoringModeExplainer: string;
  supplementalSNote: string;
}

export interface WorkflowStep {
  order: number;
  label: string;
  detail: string;
}

export interface WorkflowGuidance {
  firstRun: WorkflowStep[];
  ciOrAgent: WorkflowStep[];
  reportFormats: { context: string; format: ReportFormat; reason: string }[];
}

export interface SignalHint {
  key: string;
  dimension: Dimension;
  plainEnglish: string;
  improvesWith: string;
  seenInThisRun: boolean;
}

export interface OpsGuidance {
  schemaVersion: string;
  telemetryEnabled: boolean;
  optionalFeaturesNote: string;
  clientCompatibility: string;
}

/** Structured in-product guidance: setup, score literacy, workflow, signals, ops, and product-domain objections */
export interface RunGuidance {
  productDomain: ProductDomainGuidance;
  setup: SetupGuidance;
  scoreLiteracy: ScoreLiteracyGuidance;
  workflow: WorkflowGuidance;
  signalHints: SignalHint[];
  ops: OpsGuidance;
}

export interface CompositeResult {
  schemaVersion: string;
  composite: number;
  dimensions: Record<Dimension, DimensionScore>;
  weights: DimensionWeights;
  weightProfile: WeightProfileName;
  calibrating: Dimension[];
  weakest: { dimension: Dimension; score: number } | null;
  strongest: { dimension: Dimension; score: number } | null;
  gap: number;
  timestamp: string;
  orgName: string;
  assessmentMode: AssessmentMode;
  scoringMode: ScoringMode;
  partialComposite: boolean;
  scoredCoreCount: number;
  epistemicNote?: string;
  /** Product copy for UIs/reports when domain gaps are raised; always set by runAssessment */
  productDomainGuidance?: ProductDomainGuidance;
  /** Full run guidance (includes productDomain duplicate for nested UIs); set by runAssessment */
  runGuidance?: RunGuidance;
}

// ---------------------------------------------------------------------------
// Narrative profiles (customer-agnostic reporter)
// ---------------------------------------------------------------------------

export interface NarrativeProfile {
  name: string;
  quotes: Partial<Record<string, string>>;
}

// ---------------------------------------------------------------------------
// Connector configs (all 21)
// ---------------------------------------------------------------------------

export interface AiDetectionConfig {
  labels?: string[];
  branchPatterns?: string[];
  titlePatterns?: string[];
}

export const DEFAULT_AI_DETECTION: Required<AiDetectionConfig> = {
  labels: ['ai-generated', 'ai-assisted', 'copilot', 'cursor', 'claude', 'ai'],
  branchPatterns: ['copilot/', 'ai/', 'cursor/'],
  titlePatterns: ['[ai]', '[copilot]', '[cursor]'],
};

export interface GithubConfig {
  token: string;
  org: string;
  repos: string[];
  aiDetection?: AiDetectionConfig;
}

export interface PostmanConfig {
  apiKey: string;
  workspaceId: string;
}

export interface GrafanaConfig {
  baseUrl: string;
  apiToken: string;
  datasourceUid?: string;
  serviceName?: string;
  errorRateMetric?: string;
  latencyMetric?: string;
}

export interface DatadogConfig {
  apiKey: string;
  appKey: string;
  site?: string;
}

export interface SonarQubeConfig {
  url: string;
  token: string;
  projectKey: string;
}

export interface Crunch42Config {
  apiToken: string;
  apiBase?: string;
  specUrl?: string;
  specJson?: string;
}

export interface PagerDutyConfig {
  apiKey: string;
}

export interface CloudflareConfig {
  apiToken: string;
  zoneId: string;
}

export interface NewRelicConfig {
  apiKey: string;
  appId: string;
}

export interface SplunkConfig {
  signalfxToken: string;
  signalfxRealm?: string;
}

export interface ServiceNowConfig {
  instance: string;
  username: string;
  password: string;
}

export interface VercelConfig {
  token: string;
  projectId?: string;
}

export interface SupabaseConfig {
  accessToken: string;
}

export interface GitLabConfig {
  token: string;
  projectId: string;
}

export interface LinearConfig {
  apiKey: string;
}

export interface JiraConfig {
  domain: string;
  email: string;
  apiToken: string;
  projectKey: string;
}

export interface JellyfishConfig {
  apiKey: string;
}

export interface OpenAIConfig {
  apiKey: string;
  orgId?: string;
}

export interface AnthropicConfig {
  apiKey: string;
}

export interface GoogleAIConfig {
  apiKey: string;
}

export interface PortkeyConfig {
  apiKey: string;
}

export interface FernConfig {
  token: string;
  orgId: string;
}

export interface GitHubActionsConfig {
  token: string;
  org: string;
  repos: string[];
}

export interface DynatraceConfig {
  baseUrl: string;
  apiToken: string;
}

export interface OpenTelemetryConfig {
  prometheusUrl: string;
  bearerToken?: string;
  basicUser?: string;
  basicPassword?: string;
  serviceName?: string;
  errorMetric?: string;
  durationMetric?: string;
}

export interface InngestConfig {
  signingKey: string;
  baseUrl?: string;
}

export interface StepFunctionsConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  stateMachineArns?: string[];
}

export interface ConnectorConfigs {
  github?: GithubConfig;
  postman?: PostmanConfig;
  grafana?: GrafanaConfig;
  datadog?: DatadogConfig;
  sonarqube?: SonarQubeConfig;
  crunch42?: Crunch42Config;
  pagerduty?: PagerDutyConfig;
  cloudflare?: CloudflareConfig;
  newrelic?: NewRelicConfig;
  splunk?: SplunkConfig;
  servicenow?: ServiceNowConfig;
  vercel?: VercelConfig;
  supabase?: SupabaseConfig;
  gitlab?: GitLabConfig;
  linear?: LinearConfig;
  jira?: JiraConfig;
  jellyfish?: JellyfishConfig;
  openai?: OpenAIConfig;
  anthropic?: AnthropicConfig;
  google_ai?: GoogleAIConfig;
  portkey?: PortkeyConfig;
  fern?: FernConfig;
  github_actions?: GitHubActionsConfig;
  dynatrace?: DynatraceConfig;
  opentelemetry?: OpenTelemetryConfig;
  inngest?: InngestConfig;
  step_functions?: StepFunctionsConfig;
}

export type ConnectorName = keyof ConnectorConfigs;

// ---------------------------------------------------------------------------
// Environment config
// ---------------------------------------------------------------------------

export interface EnvironmentConfig {
  orgName: string;
  assessorName?: string;
  assessmentDate?: string;
  weightProfile: WeightProfileName;
  connectors: ConnectorConfigs;
  narrativeProfile?: NarrativeProfile;
  monthlyAiCost?: number;
  baselineDefectRate?: number;
  baselineCycleTimeHours?: number;
  baselineSource?: 'measured' | 'industry';
  /** strict | portfolio | auto (default: auto - resolves from baselines and signals) */
  scoringMode?: ScoringMode | 'auto';
  targetRoi?: number;
  hourlyRate?: number;
  telemetry?: boolean;
  sEnabled?: boolean;
  configPath?: string;
  timeoutMs?: number;
  includeProvenance?: boolean;
}

// ---------------------------------------------------------------------------
// Validation result (used by setup, runner, MCP)
// ---------------------------------------------------------------------------

export interface ConnectorValidation {
  name: ConnectorName;
  configured: boolean;
  connected: boolean;
  error?: string;
  dimensions: Dimension[];
}

export interface ValidationResult {
  orgName: string;
  weightProfile: WeightProfileName;
  connectors: ConnectorValidation[];
  coverage: Record<Dimension, string[]>;
  warnings: string[];
  sAvailable: boolean;
  sEnabled: boolean;
  costSource: 'connectors' | 'manual' | 'none';
  ready: boolean;
}

// ---------------------------------------------------------------------------
// History records
// ---------------------------------------------------------------------------

export interface ScoreRecord {
  id: string;
  schemaVersion: string;
  timestamp: string;
  orgName: string;
  weightProfile: WeightProfileName;
  composite: number;
  scores: Record<Dimension, number>;
  s: { configured: boolean; score: number | null };
  calibrating: Dimension[];
  connectors: {
    connected: string[];
    failed: string[];
    fallback: string[];
  };
  signals: Record<string, { value: number; source: string }>;
}
