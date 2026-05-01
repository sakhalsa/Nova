# Nova

> AI Engineering Effectiveness Index by Postman.

Measure how effectively your engineering organization uses AI tools. Connect your existing tools, get a score, see what to improve.

Nova is the product surface for AIEI - the underlying scoring engine, math, and connectors. Read the [thesis](THESIS.md) for the full positioning.

```bash
npx @postmanlabs/aiei init    # Create config
npx @postmanlabs/aiei demo    # No-credential sample assessment
npx @postmanlabs/aiei score   # Run assessment
npx @postmanlabs/aiei formula # See the math
```

## What You Get

```
  AIEI Score: 68  [Growth]
  ████████████████████████████░░░░░░░░░░░░░░

  Quality        (Q)  74  ██████████████████████████████░░░░░░░░░░  Scale
  Reliability    (R)  71  ██████████████████████████████░░░░░░░░░░  Scale
  Lead Time      (L)  62  ████████████████████████░░░░░░░░░░░░░░░░  Growth
  Cost           (C)  55  ██████████████████████░░░░░░░░░░░░░░░░░░  Growth

  Connectors: 4/4 core scored
  Mode: full | Scoring: strict | Profile: reliability_first

  Top action: Cut 14 hours of queue time to 5 (+8 index points - Lead Time)
```

The HTML report (`--format html`) generates a self-contained executive dashboard with per-dimension narratives, formula breakdowns, benchmark comparisons (DORA, State of the API, Forrester), and prioritized action recommendations - all in Postman v12 design.

## What It Measures

| Dimension | Question | Formula |
|-----------|----------|---------|
| **Q** Quality | Is AI-assisted code better or worse? | `(1 - defect_delta) x test_pass x (1 - rework) + [collection_quality] + [agent_score] + [runtime_quality]` |
| **L** Lead Time | Is AI making delivery faster? | `1 - (ai_time / baseline) + [deploy_frequency_bonus]` |
| **R** Reliability | Are AI changes breaking production? | `(1 - cfr) x slo x contract x uptime x adapt` (adapt now includes workflow durability from Inngest/Step Functions) |
| **C** Cost Efficiency | Is the AI investment paying off? | `(labor_saved - overhead) / cost / target_roi - [cost_growth_penalty]` |
| **S** Security | Are AI-generated APIs secure? | `spec_security x dependabot x code_scanning x secret_scanning` |

Adjustments in `[brackets]` are applied only when the signal is available. No signal = no modification. Every formula, weight, and constant is documented with its derivation in [SCORING.md](SCORING.md).

## How It Works

1. You point AIEI at the tools your team already uses (GitHub, Datadog, Postman, SonarQube, etc.)
2. AIEI pulls signals from each tool and routes them to the right dimension formula
3. Where multiple tools produce the same signal (e.g., Datadog and Grafana both provide uptime), a priority chain picks the best source without double-counting
4. Each dimension scores 0-100. The composite score uses your chosen weight profile.
5. Where there isn't enough data for a reliable score, AIEI says so instead of guessing. If fewer than 3 of 4 core dimensions can score, the result is marked `"readiness"` - not a full verdict, but an honest signal about where you stand and what to connect next.

## 27 Connectors

| Connector | Dimensions | API |
|-----------|-----------|-----|
| GitHub | Q, L, C, S | REST |
| GitLab | Q, L, C | GraphQL |
| SonarQube | Q | REST |
| Postman | Q, R | Collection Quality |
| 42Crunch | S | REST |
| Fern | Q | REST |
| Datadog | R, L | SLO + Events |
| Dynatrace | R | SLO + Problems |
| OpenTelemetry | R | PromQL |
| Grafana | R | Prometheus |
| PagerDuty | R | Incidents |
| Cloudflare | R, S | Analytics + WAF |
| New Relic | R | NerdGraph |
| Splunk | R | SignalFx |
| ServiceNow | R | Table API |
| Vercel | R, L | Deployments |
| Supabase | R | Management |
| Linear | L | GraphQL |
| Jira | L | REST |
| Jellyfish | L | REST |
| GitHub Actions | L | Workflow Runs |
| OpenAI | C | Usage |
| Anthropic | C | Usage |
| Google AI | C | Usage |
| Portkey | C | Gateway |
| Inngest | R | Workflow Runs |
| AWS Step Functions | R | Execution History |

12 more on the roadmap (Azure DevOps, Bitbucket, Snyk, Sentry, and others). See [CONNECTORS.md](CONNECTORS.md) for the full registry with signals produced, rationale for each connector, and a signal coverage matrix.

## Delivery Mechanisms

### CLI

```bash
npx @postmanlabs/aiei score                    # Terminal scorecard
npx @postmanlabs/aiei score --format json       # Machine-readable
npx @postmanlabs/aiei score --format html       # v12 HTML report
npx @postmanlabs/aiei demo                      # No-credential sample score
npx @postmanlabs/aiei validate                  # Check config + credential presence
npx @postmanlabs/aiei connectors               # List connectors
npx @postmanlabs/aiei signals                  # List scored signals
npx @postmanlabs/aiei formula                   # Show formulas
npx @postmanlabs/aiei init                      # Generate .aiei.json template
```

### MCP Server (for coding agents)

```json
{
  "mcpServers": {
    "aiei": {
      "command": "npx",
      "args": ["@postmanlabs/aiei-mcp", "--stdio"]
    }
  }
}
```

8 tools: `aiei_score`, `aiei_report`, `aiei_query`, `aiei_connectors`, `aiei_signals`, `aiei_formula`, `aiei_validate`, `aiei_benchmarks`

MCP safe mode:

```bash
npx @postmanlabs/aiei-mcp --stdio --read-only --tools=aiei_score,aiei_query,aiei_connectors,aiei_signals,aiei_validate
```

### GitHub Action

```yaml
- uses: postmanlabs/AIEI-Framework/action@v1
  with:
    config_path: .aiei.json
    hourly_rate: 175
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Comments AIEI scores directly on pull requests with dimension breakdown and top recommendation.

### Postman Collections

5 collections in [`collection/`](collection/) provide a complete API workflow:

1. **Setup & Configuration** - Validate connectors, configure weight profiles
2. **Scoring Pipeline** - Run assessments, generate reports
3. **Executive Package** - Formatted outputs for leadership review
4. **Operations** - Drift detection, simulation, formula inspection
5. **Mock Data Server** - Test the full pipeline without live credentials

### Docker

```bash
docker build -t aiei ./docker
docker run -v $(pwd)/.aiei.json:/app/.aiei.json aiei score
```

## Configuration

Create `.aiei.json` (or run `npx @postmanlabs/aiei init`):

```json
{
  "orgName": "your-org",
  "weightProfile": "reliability_first",
  "connectors": {
    "github": { "token": "$GITHUB_TOKEN", "org": "your-org", "repos": ["api-service"] },
    "postman": { "apiKey": "$POSTMAN_API_KEY", "workspaceId": "your-workspace-id" },
    "datadog": { "apiKey": "$DD_API_KEY", "appKey": "$DD_APP_KEY" }
  }
}
```

Tokens prefixed with `$` are resolved from environment variables. See [`examples/`](examples/) for sample configs.

## Weight Profiles

| Profile | Q | L | R | C | Use When |
|---------|---|---|---|---|----------|
| `reliability_first` | 20% | 20% | 45% | 15% | Default. Production stability is primary risk. |
| `balanced` | 25% | 25% | 25% | 25% | Initial assessments. |
| `quality_first` | 40% | 15% | 25% | 20% | Regulated environments. |
| `speed_first` | 15% | 40% | 25% | 20% | Competitive pressure on delivery. |
| `cost_first` | 15% | 20% | 20% | 45% | Executive ROI reporting. |

## Epistemic Honesty

Most scoring tools produce a number. AIEI tells you what the number doesn't know.

Every result includes what the score means and what it doesn't:

- **`assessmentMode`**: `full` (3+ dimensions scored) or `readiness` (< 3 dimensions - score is directional, not a verdict)
- **`calibrating`**: Which dimensions are awaiting baseline data
- **`epistemicNote`**: Explicit limitations of the measurement
- **`dataQuality`**: Per-dimension confidence (high/medium/low) based on sample size and completeness
- **`provenance`**: Trace every number back to the API call that produced it
- **`epistemicSummary`** (v1.5.0): Structured block with live/fallback/missing signal counts, AX pillar coverage, and a `what_this_score_does_not_know` array listing specific blind spots with remediation guidance
- **`axMapping`** (v1.5.0): Maps each AIEI dimension to Matt Biilmann's four AX pillars (Access, Context, Tools, Orchestration) with per-pillar coverage assessment

If we don't have enough data to score reliably, we say so. If a whole AX pillar has no signal coverage, the report tells you which connector to connect next.

## Documentation

| Document | What's In It |
|----------|-------------|
| [THESIS.md](THESIS.md) | Why AIEI exists, what it measures, what it does not |
| [SCORING.md](SCORING.md) | Every formula, every constant, every derivation |
| [SIGNALS.md](SIGNALS.md) | Every signal, source, normalization, and AI readiness argument |
| [CONNECTORS.md](CONNECTORS.md) | 27 implemented + 12 roadmap with rationale |
| [CONNECTOR_SCOPES.md](CONNECTOR_SCOPES.md) | Least-privilege credential guidance for all connectors |
| [docs/PILOT_RUNBOOK.md](docs/PILOT_RUNBOOK.md) | Three-command flow to run a pilot |
| [docs/MCP_DEBUGGING.md](docs/MCP_DEBUGGING.md) | MCP Inspector setup, safe mode, and troubleshooting |
| [MIGRATION.md](MIGRATION.md) | CLI/MCP/engine contract changes by version |
| [CHANGELOG.md](CHANGELOG.md) | Version history |

## Packages

| Package | Description |
|---------|-------------|
| [`@postmanlabs/aiei-engine`](engine/) | Scoring engine, connectors, presentation layer |
| [`@postmanlabs/aiei`](cli/) | CLI |
| [`@postmanlabs/aiei-mcp`](mcp-server/) | MCP server for coding agents |
| [`@postmanlabs/aiei-templates`](templates/) | HTML report templates (Postman v12) |
| [`@postmanlabs/aiei-action`](action/) | GitHub Action |

## License

MIT - see [LICENSE](LICENSE)

---

Built by [Postman](https://postman.com). Formulas are open, auditable, and versioned. Run `aiei formula` to see them.
