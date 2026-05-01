import {
  contractFromBuiltin,
  validateConnectorOutput,
  registerRuntimeConnector,
  getConnectorContract,
  getAllContracts,
  ConnectorContract,
} from '../connector-contract.js';
import { githubConnector } from '../connectors/github.js';
import { ConnectorOutput } from '../connectors/types.js';
import { ALL_CONNECTORS } from '../connectors/registry.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${label}`);
  }
}

console.log('--- Connector Contract Tests ---');

// contractFromBuiltin generates valid contract from github connector
{
  const contract = contractFromBuiltin(githubConnector);
  assert(contract.name === 'github', 'Contract name matches connector');
  assert(contract.dimensions.length > 0, 'Has dimensions');
  assert(contract.signalsProduced.length > 0, 'Has signal specs');
  assert(contract.requiredCredentials.length > 0, 'Has required credentials');
  assert(contract.version === '1.0.0', 'Default version');
}

// All built-in connectors produce valid contracts
{
  for (const conn of ALL_CONNECTORS) {
    const contract = contractFromBuiltin(conn);
    assert(contract.name === conn.name, `${conn.name} contract name matches`);
    assert(contract.dimensions.length > 0, `${conn.name} has dimensions`);
  }
}

// validateConnectorOutput catches out-of-range signals
{
  const contract: ConnectorContract = {
    name: 'test',
    version: '1.0.0',
    dimensions: ['R'],
    signalsProduced: [
      { key: 'cfr_ai', dimension: 'R', valueRange: [0, 1], unit: 'ratio', description: 'CFR' },
    ],
    confidenceContract: { requiresSampleSize: false, requiresTimeWindow: false },
    requiredCredentials: [],
  };

  const output: ConnectorOutput = {
    signals: { cfr_ai: 1.5 },
    diagnostics: [],
    connected: true,
  };

  const result = validateConnectorOutput(output, contract);
  assert(!result.valid, 'Invalid due to out-of-range signal');
  assert(result.violations.length > 0, 'Has violations');
  assert(result.violations[0].field === 'signals.cfr_ai', 'Violation on cfr_ai');
}

// validateConnectorOutput passes valid output
{
  const contract: ConnectorContract = {
    name: 'test',
    version: '1.0.0',
    dimensions: ['R'],
    signalsProduced: [
      { key: 'cfr_ai', dimension: 'R', valueRange: [0, 1], unit: 'ratio', description: 'CFR' },
    ],
    confidenceContract: { requiresSampleSize: false, requiresTimeWindow: false },
    requiredCredentials: [],
  };

  const output: ConnectorOutput = {
    signals: { cfr_ai: 0.05 },
    diagnostics: [],
    connected: true,
  };

  const result = validateConnectorOutput(output, contract);
  assert(result.valid, 'Valid output passes');
  assert(result.violations.filter((v) => v.severity === 'error').length === 0, 'No error violations');
}

// Undeclared signals produce warnings
{
  const contract: ConnectorContract = {
    name: 'test',
    version: '1.0.0',
    dimensions: ['R'],
    signalsProduced: [],
    confidenceContract: { requiresSampleSize: false, requiresTimeWindow: false },
    requiredCredentials: [],
  };

  const output: ConnectorOutput = {
    signals: { mystery_signal: 0.5 },
    diagnostics: [],
    connected: true,
  };

  const result = validateConnectorOutput(output, contract);
  assert(result.signalCoverage.undeclared.includes('mystery_signal'), 'Undeclared signal detected');
  assert(result.violations.some((v) => v.severity === 'warning'), 'Warning for undeclared');
}

// registerRuntimeConnector works
{
  const contract: ConnectorContract = {
    name: 'custom-monitoring',
    version: '0.1.0',
    dimensions: ['R'],
    signalsProduced: [
      { key: 'uptime_ai', dimension: 'R', valueRange: [0, 1], unit: 'ratio', description: 'Custom uptime' },
    ],
    confidenceContract: { requiresSampleSize: true, minimumSampleSize: 10, requiresTimeWindow: false },
    requiredCredentials: ['CUSTOM_API_KEY'],
  };

  const result = registerRuntimeConnector(contract, async () => ({
    signals: { uptime_ai: 0.999 },
    diagnostics: [],
    connected: true,
  }));

  assert(result.registered, 'Runtime connector registered');
  assert(result.contract.name === 'custom-monitoring', 'Contract preserved');
}

// getConnectorContract retrieves built-in and runtime
{
  const ghContract = getConnectorContract('github');
  assert(ghContract !== null, 'GitHub contract found');
  assert(ghContract!.name === 'github', 'GitHub name matches');

  const customContract = getConnectorContract('custom-monitoring');
  assert(customContract !== null, 'Custom runtime contract found');
}

// getAllContracts includes both built-in and runtime
{
  const all = getAllContracts();
  assert(all.length >= ALL_CONNECTORS.length + 1, 'All contracts includes builtins + runtime');
}

// registerRuntimeConnector rejects bad contracts
{
  let threw = false;
  try {
    registerRuntimeConnector(
      { name: '', version: '1.0.0', dimensions: [], signalsProduced: [], confidenceContract: { requiresSampleSize: false, requiresTimeWindow: false }, requiredCredentials: [] },
      async () => ({ signals: {}, diagnostics: [], connected: true }),
    );
  } catch {
    threw = true;
  }
  assert(threw, 'Rejects contract without name');
}

console.log(`\nConnector Contract: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
