# AIEI Agent-Native CLI Spec

Version: 1.6.0
Reference: Plaid CLI agent-native patterns (April 2026)

This spec defines the contract between the AIEI CLI and any caller - human or agent. Every command follows the same output, error, and discoverability rules.

---

## 1. Output Contract

### Rule: Data on stdout, diagnostics on stderr

Every command writes exactly one type of content to stdout:
- **Default mode**: Human-readable formatted output (tables, scorecards, text)
- **`--json` mode**: Structured JSON, parseable without post-processing

Diagnostics, progress, warnings, and status messages go to stderr exclusively.

| Stream | Content | Example |
|--------|---------|---------|
| stdout | Score result, connector list, formula output, config template | `{"composite": 0.68, ...}` |
| stderr | "Connecting to GitHub... OK", "Datadog: no credentials, skipping", "Report written to ./aiei-report.html" | Progress and status |

**Why**: An agent running `aiei score --json | jq '.composite'` must get clean JSON. Any diagnostic text on stdout breaks the pipe.

### Commands and their stdout output

| Command | Default (human) | `--json` |
|---------|-----------------|----------|
| `aiei score` | Terminal scorecard | Full `CompositeResult` |
| `aiei connectors` | Formatted table | `ConnectorDescriptor[]` |
| `aiei formula` | Readable text with derivations | `FormulaSpec` object |
| `aiei init` | Confirmation message | `{ "path": ".aiei.json", "connectors": 6 }` |
| `aiei signals` (new) | Signal reference table | `SignalDescriptor[]` |
| `aiei validate` (new) | Config validation report | `ValidationResult` |

---

## 2. Universal `--json` Flag

Every command accepts `--json`. No exceptions.

### Schema definitions

```typescript
// aiei connectors --json
interface ConnectorDescriptor {
  name: string;
  dimensions: string[];
  requiredCredentials: string[];
  optionalCredentials: string[];
  signalsProduced: string[];
  docsUrl: string;
}

// aiei formula --json
interface FormulaSpec {
  version: string;
  dimensions: {
    [key: string]: {
      expression: string;
      variables: { name: string; description: string; default: number | null }[];
      modifiers: { name: string; gate: string; expression: string; cap: number }[];
    };
  };
  composite: {
    expression: string;
    weightProfiles: { [name: string]: { q: number; l: number; r: number; c: number } };
  };
}

// aiei signals --json
interface SignalDescriptor {
  key: string;
  dimension: string;
  description: string;
  normalization: string;
  sources: string[];
  priorityOrder: string[];
  mergeStrategy: 'first_available' | 'additive_sum';
  defaultWhenMissing: number | null;
  axPillar: string;
}

// aiei validate --json
interface ValidationResult {
  configPath: string;
  valid: boolean;
  connectors: {
    name: string;
    configured: boolean;
    credentialsPresent: boolean;
    missingCredentials: string[];
  }[];
  dimensionCoverage: { [dim: string]: string[] };
  warnings: string[];
}

// aiei init --json
interface InitResult {
  path: string;
  connectorCount: number;
  template: object;
}
```

---

## 3. Exit Code Taxonomy

Agents use exit codes for control flow. A single `exit 1` for every failure is not sufficient.

| Code | Meaning | Agent Action |
|------|---------|-------------|
| 0 | Success. All requested operations completed. | Proceed. |
| 1 | Config error. No config file found or config is malformed. | Run `aiei init` or fix config. |
| 2 | Auth failure. One or more connectors rejected credentials. | Check env vars / tokens. |
| 3 | Partial score. Some connectors succeeded, others failed. Score is valid but incomplete. | Use result with caution. Check `calibrating` array. |
| 4 | No connectors available. Config exists but zero connectors could connect. | Verify credentials and network. |
| 5 | Validation failure. Config is syntactically valid but semantically wrong (e.g. unknown connector name). | Fix config. |

**Partial score (exit 3) is not an error.** It means the CLI produced a result but some dimensions are calibrating. The JSON output is on stdout and is valid. An agent can use it. The exit code tells the agent "this result has gaps" without requiring it to parse the JSON to discover that.

---

## 4. Progressive Help

### Level 1: Root help

```
$ aiei --help

AIEI - AI Effectiveness & Efficiency Index v1.6.0

Measure how effectively your engineering organization uses AI tools.

Commands:
  score       Run full AIEI scoring assessment
  connectors  List available connectors and their signals
  formula     Show current scoring formulas and derivations
  signals     Show signal reference (what each signal measures)
  validate    Check config file and connector credentials
  init        Create .aiei.json config template

Options:
  --json      Output structured JSON (available on all commands)
  --version   Show version
  --help      Show help

Examples:
  aiei score                       Run with default config, terminal output
  aiei score --json                Machine-readable result
  aiei score --format html         Generate v12 HTML executive report
  aiei connectors --json           List connectors as structured data
  aiei validate                    Check config before running

Docs: https://github.com/postmanlabs/AIEI-Framework
```

### Level 2: Subcommand help

```
$ aiei score --help

Run full AIEI scoring assessment

Usage: aiei score [options]

Options:
  -c, --config <path>    Path to config file (default: .aiei.json)
  -r, --rate <number>    Blended hourly engineering rate in USD (default: 75)
  -f, --format <type>    Output format (choices: text, json, scorecard, html)
  -p, --profile <name>   Weight profile (choices: reliability_first, balanced,
                         quality_first, speed_first, cost_first)
  --json                 Equivalent to --format json
  --help                 Show help

Exit codes:
  0  All dimensions scored successfully
  1  Config file not found or malformed
  2  One or more connector auth failures
  3  Partial score (some connectors failed, result still valid)
  4  No connectors available

Examples:
  aiei score                                      Default config, terminal scorecard
  aiei score --config ./prod.aiei.json            Custom config path
  aiei score --json                               JSON to stdout, diagnostics to stderr
  aiei score --format html --rate 175             HTML report with $175/hr rate
  aiei score --json 2>/dev/null                   JSON only, suppress diagnostics
  aiei score --json | jq '.dimensions.Q.score'    Extract Q-score
```

### Level 3: Help as JSON (for agents)

```
$ aiei score --help --json
{
  "command": "score",
  "description": "Run full AIEI scoring assessment",
  "options": [
    { "flag": "--config", "alias": "-c", "type": "string", "default": ".aiei.json", "required": false },
    { "flag": "--rate", "alias": "-r", "type": "number", "default": 75, "required": false },
    { "flag": "--format", "alias": "-f", "type": "enum", "choices": ["text", "json", "scorecard", "html"], "default": "text" },
    { "flag": "--profile", "alias": "-p", "type": "enum", "choices": ["reliability_first", "balanced", "quality_first", "speed_first", "cost_first"], "default": "reliability_first" },
    { "flag": "--json", "type": "boolean", "default": false }
  ],
  "exitCodes": {
    "0": "Success",
    "1": "Config error",
    "2": "Auth failure",
    "3": "Partial score",
    "4": "No connectors"
  }
}
```

An agent discovering the CLI runs: `aiei --help --json` to get the command tree, then `aiei score --help --json` to get the full schema. No docs page needed. No context window wasted on prose.

---

## 5. New Commands

### `aiei signals`

Outputs the signal reference table. Human mode shows a formatted table. JSON mode outputs `SignalDescriptor[]`.

```
$ aiei signals

AIEI Signal Reference (27 signals across 5 dimensions)

Dimension  Signal                     Sources                          AX Pillar
Q          defect_rate_ai             SonarQube                        Tools
Q          defect_rate_nonai          config baseline                  Tools
Q          ai_test_pass_rate          Postman                          Tools
Q          rework_rate_ai             GitHub, GitLab                   Tools
Q          collection_quality         Postman                          Context
Q          agent_score                Fern                             Context
Q          runtime_retry_behavior     Postman                          Tools
Q          runtime_idempotency        Postman                          Tools
Q          error_recovery_quality     Postman                          Tools
Q          error_contract_depth       Postman                          Context
L          cycle_time_ai              GitHub, GitLab, Linear, ...      Tools
L          cycle_time_nonai           GitHub, GitLab, Linear, ...      Tools
L          deploy_frequency           Datadog, Vercel, GH Actions      Tools
R          cfr_ai                     Datadog, Dynatrace, OTel, ...    Orchestration
R          slo_attainment             Postman, Datadog, Dynatrace      Orchestration
R          contract_catch_rate        Postman                          Orchestration
R          uptime_ai                  Datadog, Dynatrace, PD, ...      Orchestration
R          adaptability               Inngest, Step Functions, ...     Orchestration
C          hours_saved_monthly        GitHub, GitLab                   Tools
C          review_overhead_hours      GitHub, GitLab                   Tools
C          total_ai_cost              Portkey, OpenAI                  Tools
C          cost_growth_rate           config                           Tools
C          value_growth_rate          config                           Tools
S          spec_security_score        42Crunch                         Access
S          dependabot_score           GitHub                           Access
S          code_scanning_score        GitHub, Cloudflare               Access
S          secret_scanning_score      GitHub                           Access

27 signals. Run 'aiei signals --json' for full schema with normalization and defaults.
```

### `aiei validate`

Validates config without running scoring. Checks file syntax, connector names, credential presence, and dimension coverage.

```
$ aiei validate

Config: .aiei.json (valid)

Connector           Configured  Credentials  Status
github              yes         2/2          ready
postman             yes         2/2          ready
datadog             yes         2/2          ready
sonarqube           yes         0/2          missing: token, url
pagerduty           no          -            not configured

Dimension coverage:
  Q: github, postman, sonarqube (sonarqube not ready)
  L: github
  R: datadog (partial - need pagerduty or cloudflare for uptime)
  C: github (need openai/anthropic/portkey for AI cost)
  S: github (partial - need 42crunch for spec security)

Warnings:
  - sonarqube configured but credentials missing (SONAR_TOKEN not set)
  - S dimension has 1 of 4 signals available

Run 'aiei score' to begin assessment.
```

---

## 6. Failure Modes

### No hanging, ever

If a connector requires interactive input (none currently do, but guard against future additions), the CLI must fail with a clear error instead of waiting.

```
stderr: "Error: connector 'example' requires interactive login. Run 'aiei auth example' separately."
exit code: 2
```

### Connector failures are isolated

One connector failing does not abort the run. The CLI continues with available connectors, scores what it can, and reports which connectors failed.

```
stderr: "github: connected (42 PRs fetched)"
stderr: "datadog: auth failed (401 Unauthorized)"
stderr: "postman: connected (collection quality: 78)"
stderr: ""
stderr: "3 of 4 connectors connected. Scoring with available data."
stdout: { ... partial result ... }
exit code: 3
```

### Config errors fail fast

If the config file is missing, malformed, or references unknown connector names, the CLI exits immediately with a specific message. No partial execution.

```
stderr: "Error: unknown connector 'datadawg' in .aiei.json. Did you mean 'datadog'?"
stderr: "Run 'aiei connectors' to see available connectors."
exit code: 5
```

---

## 7. Implementation Checklist

| Change | Files | Breaking? |
|--------|-------|-----------|
| Add `--json` flag to all commands | `cli.ts` | No. New flag, existing behavior unchanged. |
| Route all diagnostics to stderr | `cli.ts` | No. `connectors` and `formula` commands currently use stdout for everything. |
| Exit code taxonomy | `cli.ts` | Soft break. Agents relying on `exit 0` or `exit 1` only need to handle new codes. |
| Add `aiei signals` command | `cli.ts` + new formatter | No. New command. |
| Add `aiei validate` command | `cli.ts` + uses `hasCred`, `buildCoverageMap` from engine | No. New command. |
| Progressive `--help` with examples | `cli.ts` commander config | No. Help text changes only. |
| `--help --json` structured help | `cli.ts` custom help handler | No. New flag combination. |
| Update `formula` to v1.5.0 | `cli.ts` formula text | No. Content update. |
| `--profile` flag on `score` | `cli.ts` | No. New option, default unchanged. |

Zero engine changes. All modifications are in the CLI package.

---

## 8. Version

These changes ship as CLI v1.6.0. The engine remains at v1.5.0. The CLI version tracks independently because the output contract is a CLI concern, not a scoring concern.
