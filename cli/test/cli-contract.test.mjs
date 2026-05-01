import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const cli = resolve(here, '../dist/cli.js');

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
  });
}

function json(args) {
  const result = run(args);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

{
  const root = json(['--help', '--json']);
  assert.equal(root.command, 'aiei');
  assert.ok(root.commands.includes('demo'));
  assert.ok(root.commands.includes('validate'));
}

{
  const score = json(['score', '--help', '--json']);
  assert.equal(score.command, 'score');
  assert.ok(score.options.some((opt) => opt.flag === '--demo'));
}

{
  const init = json(['init', '--help', '--json']);
  assert.equal(init.command, 'init');
  const template = init.options.find((opt) => opt.flag === '--template');
  assert.ok(template);
  assert.deepEqual(template.choices, ['generic', 'fox']);
}

{
  const cwd = mkdtempSync(resolve(tmpdir(), 'aiei-init-fox-'));
  const result = spawnSync(process.execPath, [cli, 'init', '--template', 'fox', '--json'], {
    cwd,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.template, 'fox');
  assert.equal(payload.connectorCount, 4);
  rmSync(cwd, { recursive: true, force: true });
}

{
  const cwd = mkdtempSync(resolve(tmpdir(), 'aiei-validate-placeholders-'));
  const configPath = resolve(cwd, '.aiei.json');
  writeFileSync(configPath, JSON.stringify({
    orgName: 'fox-entertainment',
    weightProfile: 'reliability_first',
    connectors: {
      github: { token: '$GITHUB_TOKEN', org: 'fox-entertainment', repos: [] },
      postman: { apiKey: '$POSTMAN_API_KEY', workspaceId: 'REPLACE_WITH_FOX_WORKSPACE_ID' },
      grafana: { baseUrl: 'REPLACE_WITH_GRAFANA_URL', apiToken: '$GRAFANA_API_TOKEN' },
    },
  }, null, 2));
  const result = spawnSync(process.execPath, [cli, 'validate', '--config', configPath, '--json'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 5, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  const github = payload.connectors.find((connector) => connector.name === 'github');
  const postman = payload.connectors.find((connector) => connector.name === 'postman');
  const grafana = payload.connectors.find((connector) => connector.name === 'grafana');
  assert.ok(github.missingCredentials.includes('repos (empty array)'));
  assert.ok(postman.missingCredentials.some((credential) => credential.includes('REPLACE_WITH_FOX_WORKSPACE_ID')));
  assert.ok(grafana.missingCredentials.some((credential) => credential.includes('REPLACE_WITH_GRAFANA_URL')));
  rmSync(cwd, { recursive: true, force: true });
}

{
  const result = run(['demo', '--json']);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stderr, /demo assessment/);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.orgName, 'demo-org');
  assert.equal(payload.assessmentMode, 'full');
  assert.equal(payload.dimensions.S.status, 'scored');
}

{
  const formula = json(['formula', '--json']);
  assert.equal(formula.version, '1.5.0');
  assert.ok(formula.dimensions.Q.modifiers.some((m) => m.name === 'api_runtime_quality_adjustment'));
  assert.match(formula.dimensions.S.expression, /secret_scanning_score/);
}

{
  const connectors = json(['connectors', '--json']);
  assert.ok(connectors.every((connector) => Array.isArray(connector.optionalCredentials)));
  assert.ok(connectors.every((connector) => typeof connector.docsUrl === 'string'));
}

{
  const signals = json(['signals', '--json']);
  assert.ok(signals.some((signal) => signal.key === 'error_contract_depth' && signal.axPillar === 'Context'));
  assert.ok(signals.some((signal) => signal.key === 'adaptability' && signal.axPillar === 'Orchestration'));
  assert.ok(signals.every((signal) => typeof signal.description === 'string'));
  assert.ok(signals.every((signal) => typeof signal.normalization === 'string'));
  assert.ok(signals.every((signal) => Array.isArray(signal.priorityOrder)));
}
