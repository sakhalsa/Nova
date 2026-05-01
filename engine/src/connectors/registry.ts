import { Dimension, ConnectorName, ConnectorConfigs, SignalResult, SignalConfidence } from '../types.js';
import { Connector, ConnectorOutput } from './types.js';

import { githubConnector } from './github.js';
import { postmanConnector } from './postman.js';
import { grafanaConnector } from './grafana.js';
import { datadogConnector } from './datadog.js';
import { sonarqubeConnector } from './sonarqube.js';
import { crunch42Connector } from './crunch42.js';
import { pagerdutyConnector } from './pagerduty.js';
import { cloudflareConnector } from './cloudflare.js';
import { newrelicConnector } from './newrelic.js';
import { splunkConnector } from './splunk.js';
import { servicenowConnector } from './servicenow.js';
import { vercelConnector } from './vercel.js';
import { supabaseConnector } from './supabase.js';
import { gitlabConnector } from './gitlab.js';
import { linearConnector } from './linear.js';
import { jiraConnector } from './jira.js';
import { jellyfishConnector } from './jellyfish.js';
import { openaiConnector } from './openai.js';
import { anthropicConnector } from './anthropic.js';
import { googleAiConnector } from './google_ai.js';
import { portkeyConnector } from './portkey.js';
import { fernConnector } from './fern.js';
import { githubActionsConnector } from './github-actions.js';
import { dynatraceConnector } from './dynatrace.js';
import { opentelemetryConnector } from './opentelemetry.js';
import { inngestConnector } from './inngest.js';
import { stepFunctionsConnector } from './step-functions.js';

export const ALL_CONNECTORS: Connector[] = [
  githubConnector,
  postmanConnector,
  grafanaConnector,
  datadogConnector,
  sonarqubeConnector,
  crunch42Connector,
  pagerdutyConnector,
  cloudflareConnector,
  newrelicConnector,
  splunkConnector,
  servicenowConnector,
  vercelConnector,
  supabaseConnector,
  gitlabConnector,
  linearConnector,
  jiraConnector,
  jellyfishConnector,
  openaiConnector,
  anthropicConnector,
  googleAiConnector,
  portkeyConnector,
  fernConnector,
  githubActionsConnector,
  dynatraceConnector,
  opentelemetryConnector,
  inngestConnector,
  stepFunctionsConnector,
];

export const CONNECTOR_MAP = new Map<ConnectorName, Connector>(
  ALL_CONNECTORS.map((c) => [c.name, c]),
);

// ---------------------------------------------------------------------------
// Signal priority chains: when multiple connectors produce the same formula
// input, the first available in the priority list wins. Lower-priority values
// are stored in diagnostics but do not override.
// ---------------------------------------------------------------------------

interface SignalRoute {
  formulaInput: string;
  dimension: Dimension;
  priorityOrder: ConnectorName[];
  mergeStrategy: 'first_available' | 'additive_sum';
}

export const SIGNAL_ROUTES: SignalRoute[] = [
  { formulaInput: 'cfr_ai', dimension: 'R', priorityOrder: ['datadog', 'dynatrace', 'opentelemetry', 'vercel'], mergeStrategy: 'first_available' },
  { formulaInput: 'uptime_ai', dimension: 'R', priorityOrder: ['datadog', 'dynatrace', 'opentelemetry', 'pagerduty', 'servicenow', 'cloudflare', 'newrelic', 'grafana'], mergeStrategy: 'first_available' },
  { formulaInput: 'slo_attainment', dimension: 'R', priorityOrder: ['postman', 'datadog', 'dynatrace', 'opentelemetry'], mergeStrategy: 'first_available' },
  { formulaInput: 'contract_catch_rate', dimension: 'R', priorityOrder: ['postman'], mergeStrategy: 'first_available' },
  { formulaInput: 'adaptability', dimension: 'R', priorityOrder: ['inngest', 'step_functions', 'splunk', 'supabase'], mergeStrategy: 'first_available' },
  { formulaInput: 'defect_rate_ai', dimension: 'Q', priorityOrder: ['sonarqube'], mergeStrategy: 'first_available' },
  { formulaInput: 'defect_rate_nonai', dimension: 'Q', priorityOrder: [], mergeStrategy: 'first_available' },
  { formulaInput: 'ai_test_pass_rate', dimension: 'Q', priorityOrder: ['postman'], mergeStrategy: 'first_available' },
  { formulaInput: 'rework_rate_ai', dimension: 'Q', priorityOrder: ['github', 'gitlab'], mergeStrategy: 'first_available' },
  { formulaInput: 'cycle_time_ai', dimension: 'L', priorityOrder: ['github', 'gitlab', 'linear', 'jira', 'jellyfish'], mergeStrategy: 'first_available' },
  { formulaInput: 'cycle_time_nonai', dimension: 'L', priorityOrder: ['github', 'gitlab', 'linear', 'jira'], mergeStrategy: 'first_available' },
  { formulaInput: 'deploy_frequency', dimension: 'L', priorityOrder: ['datadog', 'vercel', 'github_actions'], mergeStrategy: 'first_available' },
  { formulaInput: 'hours_saved_monthly', dimension: 'C', priorityOrder: ['github', 'gitlab'], mergeStrategy: 'first_available' },
  { formulaInput: 'review_overhead_hours_monthly', dimension: 'C', priorityOrder: ['github', 'gitlab'], mergeStrategy: 'first_available' },
  { formulaInput: 'total_ai_cost', dimension: 'C', priorityOrder: ['portkey', 'openai'], mergeStrategy: 'additive_sum' },
  { formulaInput: 'spec_security_score', dimension: 'S', priorityOrder: ['crunch42'], mergeStrategy: 'first_available' },
  { formulaInput: 'dependabot_score', dimension: 'S', priorityOrder: ['github'], mergeStrategy: 'first_available' },
  { formulaInput: 'code_scanning_score', dimension: 'S', priorityOrder: ['github', 'cloudflare'], mergeStrategy: 'first_available' },
  { formulaInput: 'secret_scanning_score', dimension: 'S', priorityOrder: ['github'], mergeStrategy: 'first_available' },
  // v1.4.0: thesis signals - gated formula adjustments
  { formulaInput: 'collection_quality', dimension: 'Q', priorityOrder: ['postman'], mergeStrategy: 'first_available' },
  { formulaInput: 'agent_score', dimension: 'Q', priorityOrder: ['fern'], mergeStrategy: 'first_available' },
  { formulaInput: 'cost_growth_rate', dimension: 'C', priorityOrder: [], mergeStrategy: 'first_available' },
  { formulaInput: 'value_growth_rate', dimension: 'C', priorityOrder: [], mergeStrategy: 'first_available' },
  // v1.5.0: AX-level signals
  { formulaInput: 'runtime_retry_behavior', dimension: 'Q', priorityOrder: ['postman'], mergeStrategy: 'first_available' },
  { formulaInput: 'runtime_idempotency', dimension: 'Q', priorityOrder: ['postman'], mergeStrategy: 'first_available' },
  { formulaInput: 'error_recovery_quality', dimension: 'Q', priorityOrder: ['postman'], mergeStrategy: 'first_available' },
  { formulaInput: 'error_contract_depth', dimension: 'Q', priorityOrder: ['postman'], mergeStrategy: 'first_available' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function hasCred(config: ConnectorConfigs, name: ConnectorName): boolean {
  const c = config[name];
  if (!c) return false;
  const connector = CONNECTOR_MAP.get(name);
  if (!connector) return false;
  return connector.requiredCredentials.every((k) => {
    const val = (c as unknown as Record<string, unknown>)[k];
    return val !== undefined && val !== null && val !== '';
  });
}

export function getConfiguredConnectors(config: ConnectorConfigs): ConnectorName[] {
  return ALL_CONNECTORS.filter((c) => hasCred(config, c.name)).map((c) => c.name);
}

export function buildCoverageMap(config: ConnectorConfigs): Record<Dimension, ConnectorName[]> {
  const map: Record<Dimension, ConnectorName[]> = { Q: [], L: [], R: [], C: [], S: [] };
  for (const conn of ALL_CONNECTORS) {
    if (hasCred(config, conn.name)) {
      for (const dim of conn.dimensions) {
        if (!map[dim].includes(conn.name)) map[dim].push(conn.name);
      }
    }
  }
  return map;
}

const DEFAULT_SIGNAL_CONF: SignalConfidence = {
  sampleSize: 0,
  timeWindowDays: 0,
  truncated: false,
  completeness: 'minimal',
};

export interface MergedSignals {
  signals: Map<string, SignalResult>;
  confidenceBySignal: Map<string, SignalConfidence>;
}

// ---------------------------------------------------------------------------
// Signal merging: takes raw connector outputs and merges per priority chain
// ---------------------------------------------------------------------------

export function mergeSignals(connectorOutputs: Map<ConnectorName, ConnectorOutput>): MergedSignals {
  const merged = new Map<string, SignalResult>();
  const confidenceBySignal = new Map<string, SignalConfidence>();

  for (const route of SIGNAL_ROUTES) {
    if (route.mergeStrategy === 'first_available') {
      for (const connName of route.priorityOrder) {
        const output = connectorOutputs.get(connName);
        if (!output?.connected) continue;
        const val = output.signals[route.formulaInput];
        if (val !== undefined && val !== null) {
          merged.set(route.formulaInput, {
            key: route.formulaInput,
            value: val,
            source: 'live',
            connector: connName,
          });
          confidenceBySignal.set(
            route.formulaInput,
            output.confidence ?? DEFAULT_SIGNAL_CONF,
          );
          break;
        }
      }
    } else if (route.mergeStrategy === 'additive_sum') {
      let sum = 0;
      let found = false;
      const sources: string[] = [];
      let confidenceSource: ConnectorOutput | undefined;
      for (const connName of route.priorityOrder) {
        const output = connectorOutputs.get(connName);
        if (!output?.connected) continue;
        const val = output.signals[route.formulaInput];
        if (val !== undefined && val !== null && val > 0) {
          if (connName === 'portkey') {
            sum = val;
            sources.length = 0;
            sources.push(connName);
            confidenceSource = output;
            found = true;
            break;
          }
          sum += val;
          sources.push(connName);
          if (!confidenceSource) confidenceSource = output;
          found = true;
        }
      }
      if (found) {
        merged.set(route.formulaInput, {
          key: route.formulaInput,
          value: sum,
          source: 'live',
          connector: sources.join('+'),
        });
        confidenceBySignal.set(
          route.formulaInput,
          confidenceSource?.confidence ?? DEFAULT_SIGNAL_CONF,
        );
      }
    }
  }

  return { signals: merged, confidenceBySignal };
}
