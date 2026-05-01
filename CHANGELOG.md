# Changelog

## 1.6.0 (2026-05-01)

### CLI
- Added `aiei demo` and `aiei score --demo` for no-credential first value.
- Added `--help --json` for structured agent discovery.
- Added CLI contract tests for help JSON, demo output, formula JSON, and signal descriptors.
- Added `aiei signals` for signal descriptors and AX pillar mapping.
- Added `aiei validate` for config/credential presence checks before scoring.
- Standardized agent-native output contract: data on stdout, diagnostics on stderr.
- Documented exit codes: config error, auth failure, partial score, no connectors, validation failure.

### MCP
- Updated MCP package to v1.6.0.
- Added `aiei_signals`, `aiei_formula`, and `aiei_validate` tools.
- Updated `aiei_query` with `formula` and `signals` topics.
- Added `--read-only` mode and `--tools=` allowlist for enterprise agent environments.

### Trust Onboarding
- Added `CONNECTOR_SCOPES.md` with least-privilege credential guidance for all 27 connectors.
- Added `docs/MCP_DEBUGGING.md` with MCP Inspector and safe-mode setup.
- Added `MIGRATION.md` for CLI/MCP/engine contract changes.
- Synced template and action package dependencies to engine v1.5.0.

## 1.5.0 (2026-04-29)

### Engine
- Added Inngest connector for workflow completion and retry durability.
- Added AWS Step Functions connector for execution success rate.
- Added Postman runtime/error contract signals:
  - `runtime_retry_behavior`
  - `runtime_idempotency`
  - `error_recovery_quality`
  - `error_contract_depth`
- Added Q-score runtime quality adjustment:
  - `(avg(runtime_signals) - 0.5) / 5`
- Expanded R-score `adaptability` source priority to `inngest > step_functions > splunk > supabase`.
- Added `secret_scanning_score` to S-score.

### Presentation
- Added AX pillar mapping for Access, Context, Tools, and Orchestration.
- Added `epistemicSummary` with live/fallback/missing signal counts and blind spots.
- Updated HTML template to render AX mapping and "What This Score Doesn't Know."

## 1.4.0 (2026-04-28)

### Architecture
- **Monorepo restructure**: 5 independent packages sharing one scoring engine
  - `@postmanlabs/aiei-engine` - Scoring engine, 25 connectors, signal routing
  - `@postmanlabs/aiei` - CLI (`npx @postmanlabs/aiei score`)
  - `@postmanlabs/aiei-mcp` - MCP server for coding agents (5 tools)
  - `@postmanlabs/aiei-action` - GitHub Action for PR commenting
  - `@postmanlabs/aiei-templates` - HTML report templates (Postman v12 design)
- **ESM module system** across all packages

### Formula Changes (v1.4.0)
All gated on signal availability - no signal means no modification:

- **Q-Score**: Added `collection_quality_adjustment` and `agent_score_adjustment`
  - Collection quality: `(cq - 70) / 300` (max +0.10 bonus)
  - Agent score: `(as - 70) / 500` (max +0.06 bonus)
- **L-Score**: Added `deploy_frequency_bonus`
  - `min(freq / 10, 0.15)` (DORA Elite at 10/day, 15% cap)
- **C-Score**: Added `cost_growth_penalty`
  - `(cost_growth - value_growth) / 100` (asymmetric, penalty only)

### Presentation Layer
- **Benchmarks**: DORA Accelerate 2025, State of the API 2020-2025, Forrester TEI
- **Stage classification**: Foundation / Growth / Scale / Leader
- **Per-dimension narratives**: Plain-English explanations with formula breakdowns
- **Factor analysis**: Input-level good/warn/bad classification
- **Hour multipliers**: Estimated hours recovered per dimension
- **Action recommendations**: Prioritized with estimated index-point lift
- **ROI with trajectory**: Cost growth penalty + crossover month calculation

### Design
- **Postman v12 palette**: Purple #7644FD, Orange #FF6C37, Pink #F37FFE
- Dark-mode HTML reports with gradient headers, expandable formulas

### Delivery Mechanisms
- CLI: `score`, `report`, `connectors`, `formula`, `init` commands
- MCP: 5 tools (`aiei_score`, `aiei_report`, `aiei_query`, `aiei_connectors`, `aiei_benchmarks`)
- GitHub Action: PR commenting with dimension table and recommendations
- HTML templates: Self-contained v12 reports
- Docker: Air-gapped environments

### Engine (carried from 1.3.0)
- 21 implemented connectors with typed configs
- Signal routing with `first_available` and `additive_sum` merge strategies
- Epistemic honesty model (assessmentMode, calibrating, epistemicNote, dataQuality)
- Score provenance chain (opt-in via `includeProvenance`)
- Counterfactual simulation (`POST /v1/simulate`)
- Drift detection (`POST /v1/diff`)
- Connector health contracts (`POST /v1/connectors/register`)
- Formula versioning with migration (`POST /v1/migrate`)
- 5 weight profiles with documented rationale

## 1.3.0 (2026-04-28)

- Counterfactual scoring simulation
- Score provenance chain
- Assessment drift detection
- Connector health contract system
- Formula versioning with migration
- 8 new HTTP endpoints

## 1.2.0 (2026-03)

- S (Security Posture) supplemental dimension
- 5 weight profiles
- Signal routing architecture
- 21 connectors

## 1.0.0 (2026-01)

- Initial release
- Q, L, R, C scoring
- 9 connectors
