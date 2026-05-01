import { Dimension, ConnectorName, SignalConfidence } from './types.js';
import { Connector, ConnectorOutput, DiagnosticEntry } from './connectors/types.js';
import { ALL_CONNECTORS, CONNECTOR_MAP } from './connectors/registry.js';

export interface SignalSpec {
  key: string;
  dimension: Dimension;
  valueRange: [number, number];
  unit: 'ratio' | 'hours' | 'dollars' | 'count' | 'rate';
  description: string;
}

export interface ConnectorContract {
  name: string;
  version: string;
  dimensions: Dimension[];
  signalsProduced: SignalSpec[];
  confidenceContract: {
    requiresSampleSize: boolean;
    minimumSampleSize?: number;
    requiresTimeWindow: boolean;
    minimumTimeWindowDays?: number;
  };
  requiredCredentials: string[];
  testFixture?: {
    mockConfig: Record<string, unknown>;
    expectedSignals: Record<string, number>;
  };
}

export interface ContractViolation {
  field: string;
  expected: string;
  actual: string;
  severity: 'error' | 'warning';
}

export interface ContractValidationResult {
  connector: string;
  valid: boolean;
  violations: ContractViolation[];
  signalCoverage: {
    declared: string[];
    produced: string[];
    missing: string[];
    undeclared: string[];
  };
  confidenceCheck: {
    passed: boolean;
    details: string;
  };
}

const RUNTIME_CONNECTORS = new Map<string, { connector: Connector; contract: ConnectorContract }>();

export function contractFromBuiltin(conn: Connector): ConnectorContract {
  const KNOWN_SIGNALS: Record<string, Omit<SignalSpec, 'key'>> = {
    cfr_ai: { dimension: 'R', valueRange: [0, 1], unit: 'ratio', description: 'Change failure rate for AI-related changes' },
    slo_attainment: { dimension: 'R', valueRange: [0, 1], unit: 'ratio', description: 'SLO/monitor pass rate' },
    contract_catch_rate: { dimension: 'R', valueRange: [0, 1], unit: 'ratio', description: 'Contract test assertion pass rate' },
    uptime_ai: { dimension: 'R', valueRange: [0, 1], unit: 'ratio', description: 'Service uptime' },
    adaptability: { dimension: 'R', valueRange: [0, 1], unit: 'ratio', description: 'Operational adaptability proxy' },
    defect_rate_ai: { dimension: 'Q', valueRange: [0, 100], unit: 'rate', description: 'Defect density on AI-touched code' },
    defect_rate_nonai: { dimension: 'Q', valueRange: [0, 100], unit: 'rate', description: 'Non-AI defect baseline' },
    ai_test_pass_rate: { dimension: 'Q', valueRange: [0, 1], unit: 'ratio', description: 'Test pass rate' },
    rework_rate_ai: { dimension: 'Q', valueRange: [0, 1], unit: 'ratio', description: 'AI PR rework/revert rate' },
    cycle_time_ai: { dimension: 'L', valueRange: [0, 10000], unit: 'hours', description: 'AI-assisted cycle time' },
    cycle_time_nonai: { dimension: 'L', valueRange: [0, 10000], unit: 'hours', description: 'Non-AI cycle time baseline' },
    deploy_frequency: { dimension: 'L', valueRange: [0, 1000], unit: 'count', description: 'Deploys per day' },
    hours_saved_monthly: { dimension: 'C', valueRange: [0, 100000], unit: 'hours', description: 'Estimated labor hours saved' },
    review_overhead_hours_monthly: { dimension: 'C', valueRange: [0, 100000], unit: 'hours', description: 'Review overhead hours' },
    total_ai_cost: { dimension: 'C', valueRange: [0, 10000000], unit: 'dollars', description: 'Monthly AI spend' },
    spec_security_score: { dimension: 'S', valueRange: [0, 1], unit: 'ratio', description: 'API spec security posture' },
    dependabot_score: { dimension: 'S', valueRange: [0, 1], unit: 'ratio', description: 'Dependency hygiene' },
    code_scanning_score: { dimension: 'S', valueRange: [0, 1], unit: 'ratio', description: 'Code scanning coverage' },
  };

  const signalsProduced: SignalSpec[] = [];
  for (const [key, spec] of Object.entries(KNOWN_SIGNALS)) {
    if (conn.dimensions.includes(spec.dimension)) {
      signalsProduced.push({ key, ...spec });
    }
  }

  return {
    name: conn.name,
    version: '1.0.0',
    dimensions: [...conn.dimensions],
    signalsProduced,
    confidenceContract: {
      requiresSampleSize: true,
      minimumSampleSize: 1,
      requiresTimeWindow: false,
    },
    requiredCredentials: [...conn.requiredCredentials],
  };
}

export function validateConnectorOutput(
  output: ConnectorOutput,
  contract: ConnectorContract,
): ContractValidationResult {
  const violations: ContractViolation[] = [];
  const declaredKeys = contract.signalsProduced.map((s) => s.key);
  const producedKeys = Object.keys(output.signals);
  const missing = declaredKeys.filter((k) => !producedKeys.includes(k) && output.connected);
  const undeclared = producedKeys.filter((k) => !declaredKeys.includes(k));

  for (const spec of contract.signalsProduced) {
    const val = output.signals[spec.key];
    if (val === undefined || val === null) continue;

    const [min, max] = spec.valueRange;
    if (val < min || val > max) {
      violations.push({
        field: `signals.${spec.key}`,
        expected: `${min} <= value <= ${max}`,
        actual: String(val),
        severity: 'error',
      });
    }
  }

  for (const key of undeclared) {
    violations.push({
      field: `signals.${key}`,
      expected: 'Signal declared in contract',
      actual: 'Undeclared signal produced',
      severity: 'warning',
    });
  }

  let confidencePassed = true;
  let confidenceDetails = 'OK';

  if (contract.confidenceContract.requiresSampleSize && output.confidence) {
    const min = contract.confidenceContract.minimumSampleSize ?? 1;
    if (output.confidence.sampleSize < min) {
      confidencePassed = false;
      confidenceDetails = `Sample size ${output.confidence.sampleSize} below minimum ${min}.`;
      violations.push({
        field: 'confidence.sampleSize',
        expected: `>= ${min}`,
        actual: String(output.confidence.sampleSize),
        severity: 'warning',
      });
    }
  }

  if (contract.confidenceContract.requiresTimeWindow && output.confidence) {
    const min = contract.confidenceContract.minimumTimeWindowDays ?? 1;
    if (output.confidence.timeWindowDays < min) {
      confidencePassed = false;
      confidenceDetails = `Time window ${output.confidence.timeWindowDays}d below minimum ${min}d.`;
    }
  }

  return {
    connector: contract.name,
    valid: violations.filter((v) => v.severity === 'error').length === 0,
    violations,
    signalCoverage: {
      declared: declaredKeys,
      produced: producedKeys,
      missing,
      undeclared,
    },
    confidenceCheck: { passed: confidencePassed, details: confidenceDetails },
  };
}

export function registerRuntimeConnector(
  contract: ConnectorContract,
  collectFn: (config: Record<string, unknown>) => Promise<ConnectorOutput>,
): { registered: boolean; contract: ConnectorContract; warnings: string[] } {
  const warnings: string[] = [];

  if (!contract.name || !contract.version) {
    throw new Error('Connector contract must include name and version.');
  }
  if (!contract.dimensions || contract.dimensions.length === 0) {
    throw new Error('Connector must declare at least one dimension.');
  }
  if (!contract.signalsProduced || contract.signalsProduced.length === 0) {
    throw new Error('Connector must declare at least one signal.');
  }

  if (CONNECTOR_MAP.has(contract.name as ConnectorName)) {
    warnings.push(`"${contract.name}" shadows a built-in connector. Built-in will be used in signal priority chains unless priority is overridden.`);
  }

  const connector: Connector = {
    name: contract.name as ConnectorName,
    dimensions: contract.dimensions,
    requiredCredentials: contract.requiredCredentials,
    async validate(config) {
      try {
        const output = await collectFn(config);
        return { connected: output.connected };
      } catch (e: unknown) {
        return { connected: false, error: (e as Error).message };
      }
    },
    collect: collectFn,
  };

  RUNTIME_CONNECTORS.set(contract.name, { connector, contract });

  return { registered: true, contract, warnings };
}

export function getRuntimeConnectors(): Map<string, { connector: Connector; contract: ConnectorContract }> {
  return RUNTIME_CONNECTORS;
}

export function getAllContracts(): ConnectorContract[] {
  const builtinContracts = ALL_CONNECTORS.map(contractFromBuiltin);
  const runtimeContracts = [...RUNTIME_CONNECTORS.values()].map((r) => r.contract);
  return [...builtinContracts, ...runtimeContracts];
}

export function getConnectorContract(name: string): ConnectorContract | null {
  const runtime = RUNTIME_CONNECTORS.get(name);
  if (runtime) return runtime.contract;

  const builtin = CONNECTOR_MAP.get(name as ConnectorName);
  if (builtin) return contractFromBuiltin(builtin);

  return null;
}
