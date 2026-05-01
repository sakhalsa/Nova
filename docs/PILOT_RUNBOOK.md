# AIEI Pilot Runbook

Steps to evaluate AIEI against one or two services in your environment.

## What AIEI Is

AIEI measures whether AI-assisted engineering work is improving outcomes across the tools your team already uses. It connects to systems like GitHub, Postman, Datadog, Grafana, and others, then scores the evidence across four core dimensions plus one supplemental security dimension.

| Dimension | Question | What It Tells You |
|-----------|----------|-------------------|
| Q - Quality | Is AI-assisted code better or worse? | Are AI-assisted changes creating fewer defects, better tests, and better API contracts? |
| L - Lead Time | Is AI making delivery faster? | Are AI-assisted PRs moving through review and merge faster than the baseline? |
| R - Reliability | Are AI-assisted changes breaking production? | Are monitored services meeting uptime/SLO/contract expectations? |
| C - Cost Efficiency | Is the AI investment paying off? | Are saved engineering hours worth more than AI/tooling spend? |
| S - Security | Are AI-generated APIs secure? | Are specs, dependencies, code scanning, and secrets keeping up with AI-assisted delivery? |

S is supplemental. It appears in the report but does not affect the composite Q/L/R/C score.

## What AIEI Means

| AIEI Output | Meaning |
|-------------|---------|
| Composite score | Weighted score across Q, L, R, and C. |
| Dimension score | Evidence-backed score for one part of engineering health. |
| `assessmentMode: "full"` | At least 3 of 4 core dimensions have enough signal to treat the composite as a score. |
| `assessmentMode: "readiness"` | Fewer than 3 core dimensions have enough signal. The result is directional, not a verdict. |
| `calibrating` | A dimension needs baseline data or a missing connector before it can score. |
| `epistemicSummary` | What the score knows, what it does not know, and which blind spots remain. |

If AIEI cannot see enough, it says so.

## Three Commands

```bash
aiei init
aiei validate
aiei score --format html
```

That is the full flow. `init` creates the config. `validate` checks credentials. `score` runs the assessment.

To start from a customer-shaped template instead of the generic config:

```bash
aiei init --template fox
```

Available templates: `generic` (default), `fox`. Templates are starting points - edit the generated `.aiei.json` to match your environment.

To see a sample result before connecting anything:

```bash
aiei demo
```

If the npm package is not yet available in your environment, run from source:

```bash
git clone https://github.com/postmanlabs/AIEI-Framework.git
cd AIEI-Framework
npm install
npm run build --workspace=engine
npm run build --workspace=templates
npm run build --workspace=cli
node cli/dist/cli.js init
node cli/dist/cli.js validate
node cli/dist/cli.js score --format html
```

## Access Required

Use least-privilege, read-only access. AIEI does not need write permissions to score.

| Tool | Required For | Pilot Access |
|------|--------------|--------------|
| GitHub | Q, L, C, S | Fine-grained read token for selected pilot repos. Needs PR metadata, actions read, Dependabot/code scanning/secret scanning read if security signals are enabled. |
| Postman | Q, R | API key scoped to the workspace with target collections/monitors. |
| One reliability source | R | Read-only token for Datadog, Grafana, Dynatrace, OpenTelemetry, or PagerDuty. |
| Optional security source | S | Read-only token for 42Crunch or GitHub Advanced Security. |
| Optional cost source | C | Portkey, OpenAI, or manual `monthlyAiCost` in config. |

AIEI uses read-only access only. It does not need write, delete, admin, or deployment permissions for any connector.

## Configure

After running `aiei init`, fill in the placeholders in `.aiei.json`:

| Config Field | What To Provide |
|--------------|-----------------|
| `connectors.github.repos` | Array of pilot repo names, e.g. `["api-service", "checkout-api"]` |
| `connectors.postman.workspaceId` | Postman workspace ID |
| `connectors.<reliability>.<credential>` | Whichever reliability source you connected |

Set environment variables:

```bash
export GITHUB_TOKEN=...
export POSTMAN_API_KEY=...
export DD_API_KEY=...
export DD_APP_KEY=...
```

Keep secrets in environment variables. Do not paste secrets into `.aiei.json`.

## Validate Before Scoring

```bash
aiei validate
```

| Validation Output | Meaning | Action |
|-------------------|---------|--------|
| All connectors ready | Credentials present. | Run scoring. |
| `missingCredentials` includes env var | Env var is not set locally. | Export the variable. |
| `repos (empty array)` | No pilot repos configured. | Add repo names. |
| `REPLACE_WITH_*` | Template placeholder still exists. | Replace with real value. |

## Run Assessment

```bash
aiei score --format html
```

This writes `aiei-report.html`.

Other formats:

```bash
aiei score                    # Terminal scorecard
aiei score --format json      # Machine-readable JSON
```

## Sample Terminal Output

```text
AIEI Score: 68  [Growth]

Quality        (Q)   74  Scale
Reliability    (R)   71  Scale
Lead Time      (L)   62  Growth
Cost           (C)   55  Growth
Security       (S)   73  supplemental

Connectors: all dimensions scored
Mode: full | Scoring: strict | Profile: reliability_first
```

C can calibrate during the first run if AI cost data is not connected. That does not block the pilot if Q, L, and R are scoring.

## What The HTML Report Shows

| Section | Purpose |
|---------|---------|
| Composite Score | Overall Q/L/R/C score and stage. |
| Dimension Breakdown | Q, L, R, C, and supplemental S. |
| Formula Breakdown | Formula used, inputs present, and result. |
| Benchmarks | DORA, Postman State of the API, and Forrester comparisons. |
| AX Pillar Mapping | Access, Context, Tools, and Orchestration coverage. |
| What This Score Does Not Know | Explicit blind spots and missing signals. |
| Recommended Actions | Prioritized next moves with expected score lift. |

## Reading The Result

| Result Pattern | Interpretation |
|----------------|----------------|
| High Q, low L | AI-assisted code quality is acceptable, but delivery flow is still slow. Look at review queues and deploy frequency. |
| Low Q, high L | AI may be speeding up delivery while creating rework or defects. Tighten tests, contracts, and review gates. |
| High L, low R | Teams are moving faster but stability is suffering. Add monitor/SLO coverage and contract tests. |
| C calibrating | Cost data is missing. Add Portkey/OpenAI or set manual `monthlyAiCost`. |
| S low | Security posture is not keeping up with speed. Review spec security, dependency alerts, code scanning, and secret scanning. |
| `readiness` mode | Not enough evidence for a full verdict. Use the blind spots section as the next-connector checklist. |

## Known Limits

AIEI measures the API and engineering toolchain layer. It does not directly measure every system in a complex platform.

**What AIEI does not score directly:**

| Area | Why | Workaround |
|------|-----|------------|
| Video QoE, DRM, bitrate ladders, media pipeline internals | Below the API layer. AIEI scores HTTP contracts. | None today. |
| Event-driven queue drain health (SNS/SQS, Kafka) | Event-driven pipelines are not auto-detected. If a queue stops draining while HTTP endpoints return 200, AIEI will not catch it. | Encode critical queue contracts as Postman tests. Those tests enter Q and R scoring. |
| Client-side playback, bootstrap timing | Client-side metrics are outside the connector surface. | Instrument through connected observability if client health correlates with API health. |

**What AIEI does score:**

| Area | Through |
|------|---------|
| HTTP API contracts | Postman collections, tests, monitors |
| PR and delivery flow | GitHub, GitLab, Linear, Jira |
| API reliability | Grafana, Datadog, Dynatrace, OpenTelemetry, PagerDuty |
| API security posture | 42Crunch, GitHub Dependabot/code scanning/secret scanning |
| Workflow durability | Inngest, AWS Step Functions |

## Recommended Flow

| Step | Owner | Output |
|------|-------|--------|
| 1. Pick one or two services | Engineering team | Repo names and API/workspace targets |
| 2. Run `aiei init` (or `aiei init --template <name>`) | Engineer running the pilot | `.aiei.json` |
| 3. Fill config and export env vars | Engineer running the pilot | Completed `.aiei.json` |
| 4. Run `aiei validate` | Engineer running the pilot | Clean validation or clear missing-item list |
| 5. Run `aiei score --format html` | Engineer running the pilot | `aiei-report.html` |
| 6. Review results | Pilot team + leadership | Score interpretation, blind spots, next connectors |

## Next Steps

| Question | Where To Go |
|----------|-------------|
| What does a specific score or signal mean? | Run `aiei formula` to see the math. Run `aiei signals` to see what each signal measures. |
| Config or credential troubleshooting | Run `aiei validate` to see exactly what is missing. |
| Adding connectors not in the pilot config | Run `aiei connectors` to see all available connectors and their required credentials. |
| Understanding what the score does not know | Check the "What This Score Does Not Know" section in the HTML report. |
| Sharing results with leadership | The HTML report (`--format html`) is self-contained. No additional tools needed to open it. |

## Success Criteria

| Criteria | Target |
|----------|--------|
| One or two services assessed | Yes |
| Q, L, and R scoring | Yes |
| S visible | Yes, if a security connector is configured |
| C either scored or explicitly calibrating | Acceptable |
| Blind spots named | Required |
| Next action list produced | Required |

The pilot succeeds if the team learns what AIEI can see, what it cannot see, and what to connect next. A perfect score is not the goal.
