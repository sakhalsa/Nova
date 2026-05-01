// Types
export type {
  Dimension, DimensionScore, DimensionWeights, DimensionStatus,
  WeightProfileName, WeightProfile, SignalResult, SignalConfidence,
  CompositeResult, AssessmentMode, ScoringMode, DataQuality, ReportFormat,
  ProvenanceStep, ProductDomainGuidance, ProductDomainTopic, ProductDomainTopicId,
  RunGuidance, SetupGuidance, ScoreLiteracyGuidance, WorkflowGuidance,
  WorkflowStep, SignalHint, OpsGuidance, ConnectorSetupHint,
  NarrativeProfile, ConnectorConfigs, ConnectorName, ConnectorValidation,
  ValidationResult, EnvironmentConfig, ScoreRecord,
  AiDetectionConfig, GithubConfig, PostmanConfig, GrafanaConfig,
  DatadogConfig, SonarQubeConfig, Crunch42Config, PagerDutyConfig,
  CloudflareConfig, NewRelicConfig, SplunkConfig, ServiceNowConfig,
  VercelConfig, SupabaseConfig, GitLabConfig, LinearConfig,
  JiraConfig, JellyfishConfig, OpenAIConfig, AnthropicConfig,
  GoogleAIConfig, PortkeyConfig,
} from './types.js';
export {
  CORE_DIMENSIONS, ALL_DIMENSIONS, SCHEMA_VERSION,
  WEIGHT_PROFILES, CUSTOM_WEIGHT_REJECTION, DEFAULT_AI_DETECTION,
} from './types.js';

// Scorer
export {
  scoreQ, scoreL, scoreR, scoreC, scoreS,
  resolveWeights, computeComposite, annotateDimensionsDataQuality,
} from './scorer.js';
export type { ScoreQOptions, ScoreLOptions } from './scorer.js';

// Runner
export { runAssessment } from './runner.js';
export type { AssessmentResult } from './runner.js';

// Reporter
export { renderReport } from './reporter.js';

// Dimensions
export { DIMENSIONS, INDUSTRY_DEFAULTS, STATE_OF_API_BASELINES } from './dimensions.js';

// History
export { appendLocal, uploadToTurbopuffer, getLocalHistory } from './history.js';

// Connectors
export { ALL_CONNECTORS, CONNECTOR_MAP, SIGNAL_ROUTES, mergeSignals, hasCred, getConfiguredConnectors, buildCoverageMap } from './connectors/registry.js';

// Individual connectors
export { githubConnector } from './connectors/github.js';
export { postmanConnector } from './connectors/postman.js';
export { grafanaConnector } from './connectors/grafana.js';
export { datadogConnector } from './connectors/datadog.js';
export { sonarqubeConnector } from './connectors/sonarqube.js';
export { crunch42Connector } from './connectors/crunch42.js';
export { pagerdutyConnector } from './connectors/pagerduty.js';
export { cloudflareConnector } from './connectors/cloudflare.js';
export { newrelicConnector } from './connectors/newrelic.js';
export { splunkConnector } from './connectors/splunk.js';
export { servicenowConnector } from './connectors/servicenow.js';
export { vercelConnector } from './connectors/vercel.js';
export { supabaseConnector } from './connectors/supabase.js';
export { gitlabConnector } from './connectors/gitlab.js';
export { linearConnector } from './connectors/linear.js';
export { jiraConnector } from './connectors/jira.js';
export { jellyfishConnector } from './connectors/jellyfish.js';
export { openaiConnector } from './connectors/openai.js';
export { anthropicConnector } from './connectors/anthropic.js';
export { googleAiConnector } from './connectors/google_ai.js';
export { portkeyConnector } from './connectors/portkey.js';

// Simulation
export { simulateAssessment } from './simulate.js';
export type { SimulationRequest, SimulationResult, DimensionDelta, SignalDelta } from './simulate.js';

// Diff
export { diffAssessments, diffByRefs, resolveRecordId } from './diff.js';
export type { AssessmentDiff, ScoreDiff, SignalChange, ConnectorChanges } from './diff.js';

// Connector contracts
export {
  getAllContracts, getConnectorContract, registerRuntimeConnector,
  validateConnectorOutput, contractFromBuiltin,
} from './connector-contract.js';
export type { ConnectorContract, SignalSpec, ContractValidationResult, ContractViolation } from './connector-contract.js';

// Formula versioning
export { getCurrentFormula, getFormulaHistory, getFormulaById, migrateResult } from './formula-version.js';
export type { FormulaVersion, MigrationRequest, MigrationResult } from './formula-version.js';

// MCP tools
export { TOOL_DEFINITIONS, handleTool, setConfig, setConfigPath } from './mcp.js';

// Presentation layer (v1.4.0)
export { buildPresentation, toIndex, toStage, HOUR_MULTIPLIERS } from './presentation.js';
export type {
  Stage, PresentationResult, DimensionNarrative,
  Factor, MeasuredItem, BenchmarkEntry, ActionRecommendation,
} from './presentation.js';

// Benchmarks
export { BENCHMARKS } from './benchmarks.js';
export type { BenchmarkDimension } from './benchmarks.js';

// Provenance types from connectors
export type { ProvenanceEntry } from './connectors/types.js';
