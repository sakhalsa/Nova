# AIEI Migration Guide

This document records public contract changes for CLI, MCP, packages, and scoring outputs.

## Current Versions

| Package | Version | Contract |
|---------|---------|----------|
| `@postmanlabs/aiei-engine` | 1.5.0 | Scoring formulas, connectors, presentation output |
| `@postmanlabs/aiei` | 1.6.0 | Agent-native CLI contract |
| `@postmanlabs/aiei-mcp` | 1.6.0 | MCP tool surface, read-only mode, tool allowlist |
| `@postmanlabs/aiei-templates` | 1.5.0 | HTML report rendering for AX mapping and epistemic summary |
| `@postmanlabs/aiei-action` | 1.5.0 | GitHub Action on engine 1.5.0 |

Package names may temporarily use the `@sachsk23` scope until the Postman npm org publish path is approved. The intended public contract is `@postmanlabs`.

## 1.6.0 CLI Changes

### Added

- `aiei demo`: no-credential sample assessment for first value in under five minutes.
- `aiei score --demo`: same demo path through the existing scoring command.
- `--help --json`: structured command metadata for agents.
- `--json` on all commands.
- `aiei signals`: signal descriptors, source priority chains, merge strategies, and AX pillar mapping.
- `aiei validate`: config and credential presence validation before scoring.
- `--profile` on `aiei score`: choose weight profile without editing config.
- Exit code taxonomy:
  - `0`: success
  - `1`: config error
  - `2`: auth failure
  - `3`: partial score
  - `4`: no connectors available
  - `5`: validation failure

### Changed

- Diagnostics belong on stderr.
- Machine-readable data belongs on stdout.
- `aiei formula` now reflects engine v1.5.0, including `api_runtime_quality_adjustment` and `secret_scanning_score`.

### Compatibility Notes

Existing commands still work:

```bash
aiei score
aiei score --format json
aiei score --format html
aiei connectors
aiei formula
aiei init
```

Agents that assumed only exit code `0` or `1` should update to handle `3` as a valid partial-result state.

## 1.6.0 MCP Changes

### Added Tools

- `aiei_signals`
- `aiei_formula`
- `aiei_validate`

### Updated Tools

- `aiei_query` now supports `formula` and `signals` topics.
- `aiei_connectors` now returns produced signals, not just required credentials.
- `aiei_score` returns v1.5.0 presentation output with AX mapping and epistemic summary.

### Server Flags

```bash
aiei-mcp --read-only
aiei-mcp --tools=aiei_score,aiei_query,aiei_validate
```

`--read-only` prevents filesystem writes through MCP tools. `aiei_report` rejects `output_path` in read-only mode and returns HTML inline instead.

`--tools` restricts the exposed tool surface to a comma-separated allowlist.

## 1.5.0 Engine Changes

### Added

- Inngest connector for workflow durability.
- AWS Step Functions connector for workflow execution success.
- Runtime validation signals in the Postman connector:
  - `runtime_retry_behavior`
  - `runtime_idempotency`
  - `error_recovery_quality`
  - `error_contract_depth`
- AX pillar mapping in presentation output.
- `epistemicSummary` with live/fallback/missing signal counts and blind spots.

### Formula Changes

Q-score added gated runtime adjustment:

```text
api_runtime_quality_adjustment = (avg(runtime_signals) - 0.5) / 5
```

R-score `adaptability` source priority now starts with orchestration providers:

```text
Inngest > Step Functions > Splunk > Supabase
```

S-score includes secret scanning:

```text
S = spec_security_score x dependabot_score x code_scanning_score x secret_scanning_score
```

## Upgrade Checklist

1. Rebuild packages:

```bash
npm run build --workspace=engine
npm run build --workspace=templates
npm run build --workspace=cli
npm run build --workspace=mcp-server
npm run build --workspace=action
```

2. Validate CLI contract:

```bash
npm test --workspace=cli
```

3. Validate MCP server:

```bash
npm run build --workspace=mcp-server
npx @modelcontextprotocol/inspector node mcp-server/dist/server.js --read-only
```

4. Validate config before first customer run:

```bash
aiei validate --config .aiei.json
```

5. Run a demo before running live connectors:

```bash
aiei demo
aiei demo --json
```
