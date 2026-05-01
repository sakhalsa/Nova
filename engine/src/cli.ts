#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'process';
import { runAssessment } from './runner.js';
import { renderReport } from './reporter.js';
import { EnvironmentConfig, ReportFormat, WEIGHT_PROFILES, WeightProfileName, ConnectorConfigs } from './types.js';
import { DIMENSIONS } from './dimensions.js';
import { ALL_CONNECTORS } from './connectors/registry.js';

async function main() {
  const args = process.argv.slice(2);
  const flags = parseFlags(args);

  if (flags.help) {
    printUsage();
    process.exit(0);
  }

  const envPath = resolve(flags.config || flags.env || 'aiei-env.json');

  if (flags.setup || !existsSync(envPath)) {
    await setupWizard(envPath);
    if (flags.setup) process.exit(0);
  }

  let config: EnvironmentConfig;
  try {
    config = JSON.parse(readFileSync(envPath, 'utf-8')) as EnvironmentConfig;
    config.configPath = envPath;
  } catch (err) {
    console.error(`Failed to load config from ${envPath}: ${err}`);
    process.exit(1);
  }

  // Validate weight profile
  if (!WEIGHT_PROFILES[config.weightProfile]) {
    console.error(
      `Weight profile '${config.weightProfile}' not recognized. Contact your Postman representative to configure a custom profile.`,
    );
    process.exit(1);
  }

  const format = (flags.format || 'summary') as ReportFormat;

  console.error(`Running AIEI assessment for ${config.orgName}...`);
  console.error(`Weight profile: ${config.weightProfile}`);

  const { validation, result } = await runAssessment(config);

  // Show validation status
  for (const cv of validation.connectors) {
    if (cv.configured) {
      const status = cv.connected ? 'connected' : `FAILED - ${cv.error}`;
      console.error(`  ${cv.name}: ${status} (${cv.dimensions.join(', ')})`);
    }
  }

  if (validation.warnings.length > 0) {
    console.error('');
    for (const w of validation.warnings) {
      console.error(`  Warning: ${w}`);
    }
  }

  console.error('');

  const output = renderReport(result, format, config.narrativeProfile);

  if (flags.out) {
    writeFileSync(resolve(flags.out), output, 'utf-8');
    console.error(`Report written to ${flags.out}`);
  } else {
    console.log(output);
  }

  // S opt-in prompt if available but not configured
  if (!config.sEnabled && validation.sAvailable) {
    console.error('');
    console.error(
      'Security posture (S-Score) is available as a supplemental layer.',
    );
    console.error('Run with --setup to enable, or set "sEnabled": true in your config.');
  }

  console.error(`\nComposite: ${result.composite.toFixed(3)} | Profile: ${result.weightProfile}`);
}

// ---------------------------------------------------------------------------
// Setup wizard using readline/promises
// ---------------------------------------------------------------------------

async function setupWizard(envPath: string): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });

  console.log('\n=== AIEI Setup ===\n');

  const orgName = (await rl.question('Organization name: ')).trim() || 'My Organization';

  // Weight profile selection
  console.log('\nWeight Profiles:');
  const profileNames = Object.keys(WEIGHT_PROFILES) as WeightProfileName[];
  for (let i = 0; i < profileNames.length; i++) {
    const p = WEIGHT_PROFILES[profileNames[i]];
    const def = profileNames[i] === 'reliability_first' ? ' (default)' : '';
    console.log(`  [${i + 1}] ${profileNames[i]}${def}`);
    console.log(`      ${p.rationale.slice(0, 100)}...`);
  }
  const profileChoice = parseInt((await rl.question('\nSelect profile [1]: ')).trim() || '1');
  const weightProfile = profileNames[Math.max(0, Math.min(profileChoice - 1, profileNames.length - 1))];
  console.log(`  Selected: ${weightProfile}`);

  // Connector configuration by dimension
  const connectors: ConnectorConfigs = {};

  const dimConnectorMap: Record<string, { connName: string; label: string; dims: string[] }[]> = {
    Q: [
      { connName: 'github', label: 'GitHub', dims: ['Q', 'L', 'C', 'S'] },
      { connName: 'gitlab', label: 'GitLab', dims: ['Q', 'L', 'C'] },
      { connName: 'sonarqube', label: 'SonarQube', dims: ['Q'] },
      { connName: 'postman', label: 'Postman', dims: ['Q', 'R'] },
    ],
    L: [
      { connName: 'datadog', label: 'Datadog', dims: ['R', 'L'] },
      { connName: 'linear', label: 'Linear', dims: ['L'] },
      { connName: 'jira', label: 'Jira', dims: ['L'] },
      { connName: 'jellyfish', label: 'Jellyfish', dims: ['L'] },
      { connName: 'vercel', label: 'Vercel', dims: ['R', 'L'] },
    ],
    R: [
      { connName: 'grafana', label: 'Grafana', dims: ['R'] },
      { connName: 'pagerduty', label: 'PagerDuty', dims: ['R'] },
      { connName: 'cloudflare', label: 'Cloudflare', dims: ['R'] },
      { connName: 'newrelic', label: 'New Relic', dims: ['R'] },
      { connName: 'splunk', label: 'Splunk/SignalFx', dims: ['R'] },
      { connName: 'servicenow', label: 'ServiceNow', dims: ['R'] },
      { connName: 'supabase', label: 'Supabase', dims: ['R'] },
    ],
    C: [
      { connName: 'openai', label: 'OpenAI', dims: ['C'] },
      { connName: 'anthropic', label: 'Anthropic', dims: ['C'] },
      { connName: 'google_ai', label: 'Google AI', dims: ['C'] },
      { connName: 'portkey', label: 'Portkey', dims: ['C'] },
    ],
  };

  const configured = new Set<string>();

  for (const [dim, options] of Object.entries(dimConnectorMap)) {
    const info = DIMENSIONS[dim as keyof typeof DIMENSIONS];
    console.log(`\n--- ${dim}: ${info.name} ---`);
    console.log(info.explanation);
    console.log(`Without it: ${info.withoutIt}`);
    console.log('');

    for (const opt of options) {
      if (configured.has(opt.connName)) {
        console.log(`  ${opt.label}: already configured (also feeds ${opt.dims.join(', ')})`);
        continue;
      }
      const answer = (await rl.question(`  Configure ${opt.label}? [y/N]: `)).trim().toLowerCase();
      if (answer === 'y' || answer === 'yes') {
        const connector = ALL_CONNECTORS.find((c) => c.name === opt.connName);
        if (connector) {
          const creds: Record<string, string> = {};
          for (const key of connector.requiredCredentials) {
            creds[key] = (await rl.question(`    ${key}: `)).trim();
          }
          (connectors as Record<string, unknown>)[opt.connName] = creds;
          configured.add(opt.connName);
          console.log(`    ${opt.label} configured.`);
        }
      }
    }
  }

  // S opt-in
  console.log(`\n--- S: ${DIMENSIONS.S.name} (Supplemental) ---`);
  console.log(DIMENSIONS.S.explanation);
  console.log(`${DIMENSIONS.S.withoutIt}`);
  const sAnswer = (await rl.question('\nAdd Security analysis? [y/N]: ')).trim().toLowerCase();
  let sEnabled = false;
  if (sAnswer === 'y' || sAnswer === 'yes') {
    sEnabled = true;
    if (!configured.has('crunch42')) {
      const c42 = (await rl.question('  Configure 42Crunch? [y/N]: ')).trim().toLowerCase();
      if (c42 === 'y') {
        const token = (await rl.question('    apiToken: ')).trim();
        connectors.crunch42 = { apiToken: token };
        configured.add('crunch42');
      }
    }
  }

  // Manual AI cost fallback
  let monthlyAiCost: number | undefined;
  if (!configured.has('portkey') && !configured.has('openai')) {
    console.log('\nNo cost provider configured. You can provide a manual monthly AI cost.');
    const costInput = (await rl.question('Monthly AI cost ($, or press Enter to skip): ')).trim();
    if (costInput) monthlyAiCost = parseFloat(costInput);
  }

  // Baselines
  console.log('\nBaseline configuration:');
  const baselineChoice = (
    await rl.question('  Use industry defaults for baselines? [Y/n]: ')
  ).trim().toLowerCase();
  const useIndustry = baselineChoice !== 'n' && baselineChoice !== 'no';

  // Telemetry
  const telAnswer = (
    await rl.question('\nAllow Postman to collect anonymized score data for benchmarking? [y/N]: ')
  ).trim().toLowerCase();
  const telemetry = telAnswer === 'y' || telAnswer === 'yes';

  const config: EnvironmentConfig = {
    orgName,
    weightProfile,
    connectors,
    sEnabled,
    monthlyAiCost,
    baselineSource: useIndustry ? 'industry' : undefined,
    telemetry,
  };

  writeFileSync(envPath, JSON.stringify(config, null, 2), 'utf-8');
  console.log(`\nConfig saved to ${envPath}`);

  rl.close();
}

// ---------------------------------------------------------------------------
// Flag parsing
// ---------------------------------------------------------------------------

function parseFlags(args: string[]): Record<string, string> & { help?: boolean; setup?: boolean } {
  const flags: Record<string, string> & { help?: boolean; setup?: boolean } = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') flags.help = true;
    else if (arg === '--setup') flags.setup = true;
    else if (arg === '--env' && args[i + 1]) flags.env = args[++i];
    else if (arg === '--config' && args[i + 1]) flags.config = args[++i];
    else if (arg === '--format' && args[i + 1]) flags.format = args[++i];
    else if (arg === '--out' && args[i + 1]) flags.out = args[++i];
  }
  return flags;
}

function printUsage() {
  console.log(`
@postmanlabs/aiei-core - AI Effectiveness & Efficiency Scoring

Usage:
  npx @postmanlabs/aiei report [--config <path>] [--format json|html|summary] [--out <file>]
  npx @postmanlabs/aiei --setup [--config <path>]

Options:
  --config <path>  Path to environment config JSON (default: aiei-env.json)
  --format <fmt>   Output format: json, html, summary (default: summary)
  --out <path>     Write output to file instead of stdout
  --setup          Run the setup wizard (interactive)
  --help           Show this help

Dimensions: Quality (Q), Lead Time (L), Reliability (R), Cost (C), Security (S - supplemental)
Scoring: 0-1 multiplicative QLRC composite. S is independent.
Weight profiles: reliability_first (default), balanced, quality_first, speed_first, cost_first
`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
