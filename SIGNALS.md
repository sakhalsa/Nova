# AIEI Signal Reference v1.5.0

Every number in an AIEI report traces back to a named signal, a defined formula position, a documented normalization, and a stated reason for inclusion. This document is the complete registry.

## How to Read This Document

Each signal entry contains:
- **Key**: The identifier used in code, configs, and output
- **Measures**: What it captures in plain English
- **Dimension**: Which scoring formula it feeds
- **Formula position**: Where it appears in the math
- **Normalization**: How raw values become 0-1 scores
- **Sources**: Which connectors can produce it, in priority order
- **When missing**: What happens to the score without this signal
- **AI/Agent readiness argument**: Why this signal matters for organizations adopting AI-assisted development

---

## Dimensions

### Q - Quality

**Business question**: Is AI-assisted code better or worse than what came before?

**Formula**:
```
Q = (1 - defect_rate_ai / defect_rate_nonai) x ai_test_pass_rate x (1 - rework_rate_ai)
    + collection_quality_adjustment      [gated]
    + agent_score_adjustment             [gated]
    + api_runtime_quality_adjustment     [gated]
```

**Why this dimension exists**: AI tools generate code at unprecedented speed. Speed without quality measurement creates technical debt at scale. Organizations that cannot measure whether AI-generated code is better or worse than human-written code are making investment decisions blind. Q-score answers: "is the AI making your codebase better?"

**AX pillar mapping**: Context (collection_quality, agent_score, error_contract_depth) + Tools (defect rates, test pass, rework, runtime signals)

| Signal | Measures | Formula Position | Normalization | Sources | When Missing | AI Readiness Argument |
|--------|----------|-----------------|---------------|---------|--------------|----------------------|
| `defect_rate_ai` | Bugs per unit of AI-assisted code | Numerator of defect ratio | Raw ratio from quality scanner (e.g. bugs/KLOC) | SonarQube | Q cannot score in strict mode. Calibrating state. | AI-generated code ships faster than human code. Without defect measurement, organizations cannot distinguish "fast and good" from "fast and fragile." |
| `defect_rate_nonai` | Bugs per unit of human-written code | Denominator of defect ratio | Same unit as defect_rate_ai for direct comparison | Config baseline or SonarQube historical | Q cannot score in strict mode. Portfolio mode uses industry baseline (0.12). | The baseline is the control group. Without it, a defect rate of 0.08 means nothing - is that good or bad for this codebase? Strict mode requires both rates. Portfolio mode substitutes State of the API survey data. |
| `ai_test_pass_rate` | Proportion of tests passing on AI-generated code | Multiplicative factor | 0-1 (pass count / total). Defaults to 1.0 if absent. | Postman (collection test scripts), SonarQube | Assumed 1.0 (no penalty). Score reflects defect and rework only. | Agents generate code. Tests validate that code. If AI-generated code passes tests at a lower rate than human code, the AI is creating work, not saving it. |
| `rework_rate_ai` | Proportion of AI-generated PRs that require follow-up commits | Multiplicative penalty: (1 - rework) | 0-1 (PRs with follow-up / total AI PRs). Defaults to 0.0. | GitHub, GitLab | Assumed 0.0 (no penalty). | Rework is the hidden cost of AI coding. A PR that merges but needs 3 follow-up commits is not a productivity gain - it is a productivity transfer from writing to reviewing. |
| `collection_quality` | Combined Spectral + Governance score of Postman collections | Gated adjustment: (score - 70) / 300. Max +0.10. | 0-100 integer from Postman API, divided by 100 for 0-1. | Postman | No adjustment applied. Base Q score stands. | API specs are the input to AI code generation. GitHub Copilot, Cursor, and Claude all read API specs to generate integration code. A spec missing response examples, parameter types, or error definitions produces worse AI output. Collection quality directly predicts AI code generation quality. Median score (70) derived from 100,000+ State of the API respondents (2020-2025). |
| `agent_score` | Documentation agent-readiness score | Gated adjustment: (score - 70) / 500. Max +0.06. | 0-1 from Fern's agent readiness API. | Fern | No adjustment applied. | AI agents consume API documentation programmatically. An agent cannot retry on a 429 if the spec does not define the 429 response. Agent readiness measures whether your docs are written for machines, not just humans. |
| `runtime_retry_behavior` | Whether APIs return Retry-After headers on rate limit responses | Gated via runtime quality adjustment. | 1.0 if any collection documents Retry-After on 429/503 responses. 0.0 if none. | Postman (collection analysis) | No adjustment applied. | An agent that receives a 429 without Retry-After has to guess when to retry. Guessing wastes tokens, creates thundering herds, and produces unpredictable latency. Retry-After is the minimum contract between an API and an agent. |
| `runtime_idempotency` | Whether mutating operations define idempotency keys | Gated via runtime quality adjustment. | 0-1 (mutating ops with idempotency key / total mutating ops). | Postman (collection analysis) | No adjustment applied. | When an agent's POST request times out, it has two options: retry (risking duplicate creation) or fail (breaking the workflow). An idempotency key makes retry safe. Without it, agents cannot reliably perform write operations. |
| `error_recovery_quality` | Whether error responses contain machine-actionable recovery fields | Gated via runtime quality adjustment. | 0-1 (error responses with actionable fields / total error responses). Checks for retry_after, action, error_code, remediation. | Postman (collection analysis) | No adjustment applied. | A human reads "Internal Server Error" and opens a ticket. An agent reads "Internal Server Error" and halts. An agent reads `{"error_code": "RATE_EXCEEDED", "retry_after": 30, "action": "retry"}` and recovers. Error recovery quality measures whether your APIs speak agent. |
| `error_contract_depth` | Proportion of error responses with structured, machine-parseable recovery metadata | Gated via runtime quality adjustment. | 0-1 (error responses with actionable fields / total error responses). | Postman (collection analysis) | No adjustment applied. | Depth beyond presence. Not just "does a 400 exist" but "does the 400 tell an agent what to do next." This is the difference between an error contract (spec says errors exist) and an error protocol (spec tells agents how to recover). |

**Runtime quality adjustment formula**: `api_runtime_quality_adjustment = (avg(present_runtime_signals) - 0.5) / 5`
- Averages whichever of the 4 runtime signals are present
- 0.5 midpoint: APIs at 50% runtime quality get no adjustment
- /5 normalization: max adjustment is +/-0.10
- Gated: if zero runtime signals are present, no adjustment is applied

---

### L - Lead Time

**Business question**: Is AI making delivery faster?

**Formula**:
```
L = 1 - (cycle_time_ai / cycle_time_nonai)
    + deploy_frequency_bonus    [gated]
```

**Why this dimension exists**: Faster delivery is the most visible promise of AI tooling. But "faster" without measurement is anecdotal. L-score quantifies the improvement: how much faster is code reaching production with AI assistance versus without? Organizations that cannot answer this cannot justify their AI investment to engineering leadership.

**AX pillar mapping**: Tools

| Signal | Measures | Formula Position | Normalization | Sources | When Missing | AI Readiness Argument |
|--------|----------|-----------------|---------------|---------|--------------|----------------------|
| `cycle_time_ai` | Hours from commit to production for AI-assisted PRs | Numerator of cycle time ratio | Raw hours from PR merge-to-deploy analysis | GitHub, GitLab, Linear, Jira, Jellyfish | L cannot score. Calibrating state. | The core measurement. If you cannot separate AI-assisted PR cycle time from human PR cycle time, you are measuring average delivery speed, not AI impact. |
| `cycle_time_nonai` | Hours from commit to production for human-written PRs | Denominator of cycle time ratio | Raw hours, same methodology as cycle_time_ai | GitHub, GitLab, Linear, Jira, or config baseline | L cannot score in strict mode. Portfolio mode uses configured baseline. | The control group. AI detection uses labels, branch patterns, and title patterns (configurable per org) to classify PRs. Without a baseline, "18 hours" means nothing. |
| `deploy_frequency` | Deploys per day across monitored services | Gated bonus: min(frequency / 10, 0.15) | Raw count of deployments in last 30 days, divided by 30. | Datadog, Vercel, GitHub Actions | No bonus applied. L score reflects cycle time only. | DORA's Accelerate research (39,000 respondents) identifies deploy frequency as a key indicator of delivery maturity. A team deploying 10x/day at 18hr cycle time is operationally different from one deploying 1x/week. The bonus is capped at 0.15 to keep cycle time as the dominant signal. 10 deploys/day = DORA Elite threshold. |

---

### R - Reliability

**Business question**: Are AI-assisted changes breaking production?

**Formula**:
```
R = (1 - cfr_ai) x slo_attainment x contract_catch_rate x uptime_ai x adaptability
```

**Why this dimension exists**: AI-generated code deploys faster (L-score) and may have fewer defects (Q-score). But if it breaks production more often, the speed is a liability. R-score measures whether AI-assisted changes are stable in production. All five factors are multiplicative: a zero in any factor drives R toward zero. This reflects reality - a single reliability failure mode can be systemic regardless of other strengths.

**AX pillar mapping**: Orchestration

| Signal | Measures | Formula Position | Normalization | Sources | When Missing | AI Readiness Argument |
|--------|----------|-----------------|---------------|---------|--------------|----------------------|
| `cfr_ai` | Change failure rate for AI-assisted deployments | (1 - cfr) multiplicative factor | 0-1 (failed deploys / total deploys). Inverted: lower CFR = higher score. | Datadog, Dynatrace, OpenTelemetry, Vercel | Defaults to 0. (1-0) = 1.0, no penalty. | DORA's primary stability metric. If AI-generated code causes more production incidents per deployment than human code, the AI is creating risk. CFR is the earliest signal that AI-assisted delivery is trading stability for speed. DORA classifications: <5% Elite, <10% High, <15% Medium, >15% Low. |
| `slo_attainment` | Percentage of Service Level Objectives met | Multiplicative factor | 0-1 (SLOs met / SLOs tracked). | Postman (monitor pass rate), Datadog, Dynatrace, OpenTelemetry | Defaults to 1.0, no penalty. | SLOs are the contract between engineering and the business. If AI-assisted changes cause SLO misses, the business impact is measurable in missed commitments. The gap between 100% and actual attainment is where incidents concentrate. |
| `contract_catch_rate` | Proportion of API contract violations caught before production | Multiplicative factor | 0-1 (assertions passed / assertions total) from Postman monitors. | Postman | Defaults to 1.0, no penalty. | API contracts are the test suite for service boundaries. AI generates code that calls APIs. If those APIs change and the contracts are not tested, AI-generated integration code breaks silently. Contract tests are the last gate before production for API-dependent code. |
| `uptime_ai` | Uptime of services with AI-assisted code in production | Multiplicative factor | 0-1 (e.g. 0.999 = 99.9%). | Datadog, Dynatrace, OpenTelemetry, PagerDuty, ServiceNow, Cloudflare, New Relic, Grafana | Defaults to 1.0, no penalty. | The ultimate production health signal. If AI-assisted services have lower uptime than human-maintained services, the AI is a net negative regardless of code quality or delivery speed. |
| `adaptability` | How well services recover from failures and adapt to changing conditions | Multiplicative factor | 0-1 from orchestration providers. Inngest: workflow completion rate. Step Functions: execution success rate. Splunk: anomaly recovery ratio. | Inngest, Step Functions, Splunk, Supabase | Defaults to 1.0, no penalty. | AI agents run multi-step workflows. If step 14 of 20 fails, what happens? Adaptability measures whether your infrastructure can recover from partial failures. Orchestration providers (Inngest, Step Functions) measure this directly: workflow completion rate and step retry success rate. Without this signal, R-score assumes perfect adaptability, which is generous. |

---

### C - Cost Efficiency

**Business question**: Is the AI investment paying off?

**Formula**:
```
C = (hours_saved x hourly_rate - overhead x hourly_rate) / total_ai_cost / target_roi
    - cost_growth_penalty    [gated]
```

**Why this dimension exists**: AI tooling is not free. Token costs, API subscriptions, infrastructure, and review overhead are real expenses. C-score answers: "for every dollar spent on AI, how many dollars of engineering value are you getting back?" Without this measurement, organizations cannot distinguish between AI tools that save money and AI tools that create a new cost center.

**AX pillar mapping**: Tools

| Signal | Measures | Formula Position | Normalization | Sources | When Missing | AI Readiness Argument |
|--------|----------|-----------------|---------------|---------|--------------|----------------------|
| `hours_saved_monthly` | Engineering hours saved by AI-assisted development per month | Numerator of ROI (multiplied by hourly rate) | Raw hours estimated from PR analysis (AI PRs x average time savings). | GitHub, GitLab | C cannot score. Calibrating state. | The value side of the equation. Derived from AI-assisted PR count and estimated time savings per PR. Without this, cost efficiency is unmeasurable. |
| `review_overhead_hours_monthly` | Additional review hours required for AI-generated code | Subtracted from labor value | Raw hours estimated from review time on AI-flagged PRs. Defaults to 0. | GitHub, GitLab | Assumed 0 (no overhead). Score may overstate savings. | AI code that requires 2x the review time of human code is not saving as much as it appears. Review overhead is the hidden cost that makes "AI saved 100 hours" misleading when 40 of those hours were consumed in additional review. |
| `total_ai_cost` | Monthly spend on AI tooling (tokens, subscriptions, infrastructure) | Denominator of ROI | Raw dollar amount. Portkey overrides individual providers when connected (has the complete spend picture). | Portkey (gateway aggregator), OpenAI, Anthropic, Google AI | C cannot score. Calibrating state. | You cannot calculate ROI without knowing the investment. Organizations using multiple AI providers (OpenAI for generation, Anthropic for review, Google for embeddings) need aggregated cost. Portkey is prioritized because as a gateway it sees all providers. |
| `cost_growth_rate` | Month-over-month percentage growth in AI spend | Gated penalty: (cost_growth - value_growth) / 100. Only when cost grows faster than value. | Percentage points. | Config or derived from historical runs. | No penalty applied. | Token costs, API calls, and infrastructure spend compound. A 15% month-over-month cost increase with 5% value growth means cost overtakes value. The penalty catches this divergence early. |
| `value_growth_rate` | Month-over-month percentage growth in AI-delivered value | Gate condition: penalty only applied when cost_growth > value_growth. | Percentage points. | Config or derived from historical runs. | No penalty applied. Cost growth signal alone is insufficient to trigger penalty. | The asymmetry is intentional. Growing value faster than cost is healthy and already reflected in the base formula. Only growing cost faster than value is penalized, because that trajectory leads to negative ROI. |

---

### S - Security Posture (Supplemental)

**Business question**: Are AI-generated APIs secure?

**Formula**:
```
S = spec_security_score x dependabot_score x code_scanning_score x secret_scanning_score
```

**Why this dimension exists**: AI generates code that defines API surfaces. Those surfaces are attack vectors. S-score measures whether the security toolchain is catching what AI produces. Multiplicative by design: a single zero (e.g. exposed secrets) drives the entire score toward zero. Security is binary at the extremes - one critical gap invalidates otherwise strong coverage.

**Why supplemental**: S is scored and displayed but never enters the composite weight calculation. This prevents organizations from gaming the composite by connecting only security tools. A perfect S-score does not improve your composite. A terrible S-score is a warning that stands alongside the composite, not inside it.

**AX pillar mapping**: Access

| Signal | Measures | Formula Position | Normalization | Sources | When Missing | AI Readiness Argument |
|--------|----------|-----------------|---------------|---------|--------------|----------------------|
| `spec_security_score` | API spec compliance with OWASP API Security Top 10 | Multiplicative factor | 0-1 from 42Crunch security audit. | 42Crunch | S cannot score if all signals are missing. | AI-generated API endpoints inherit the security posture of the spec they were generated from. A spec without authentication definitions produces an endpoint without authentication. OWASP compliance of the spec is the floor for AI-generated API security. |
| `dependabot_score` | Dependency vulnerability posture | Multiplicative factor | 1 - (critical_count x 0.10), floored at 0. Each critical vulnerability deducts 10%. | GitHub Dependabot | Factor defaults to 1.0 if absent from the multiplicative chain. | AI-generated code imports dependencies. If those dependencies have known vulnerabilities, the AI is introducing risk at scale. Dependabot score measures whether the dependency chain is clean. |
| `code_scanning_score` | Static analysis posture across the codebase | Multiplicative factor | 1 - (high_critical_count x 0.05), floored at 0. Each finding deducts 5%. | GitHub Advanced Security, Cloudflare (WAF events) | Factor defaults to 1.0. | AI generates code patterns. Static analysis catches patterns that are syntactically valid but semantically dangerous (SQL injection, XSS, insecure deserialization). Without scanning, AI-generated vulnerabilities ship at AI speed. |
| `secret_scanning_score` | Exposed credential posture | Multiplicative factor | 1 - (active_secrets x 0.20), floored at 0. Each exposed secret deducts 20%. | GitHub secret scanning | Factor defaults to 1.0. | The penalty is aggressive by design. An exposed API key is not a "medium" finding. It is a binary breach vector. AI tools that generate code with hardcoded credentials create immediate, measurable risk. One exposed secret brings S-score from 1.0 to 0.8. Five secrets = 0.0. |

---

## AX Pillar Mapping

AIEI maps its dimensions to the four Agent Experience (AX) pillars defined by Matt Biilmann:

| AX Pillar | Question | AIEI Dimensions | Coverage Signals | Why This Mapping |
|-----------|----------|----------------|-----------------|-----------------|
| **Access** | Can agents authenticate and connect securely? | S | spec_security, dependabot, code_scanning, secret_scanning | Agents need secure access. If credentials are exposed, if APIs lack auth definitions, if dependencies are vulnerable - agents inherit those risks. S-score measures whether the access layer is safe for machine consumers. |
| **Context** | Can agents understand your APIs? | Q (subset) | collection_quality, agent_score, error_contract_depth | Agents read API specs to decide what to do. Collection quality measures spec completeness. Agent score measures machine-readability. Error contract depth measures whether errors tell agents how to recover. Without context signals, agents guess. |
| **Tools** | Can agents use your platform effectively? | Q + L + C | defect_rate, test_pass, rework, runtime signals, cycle_time, deploy_frequency, hours_saved, ai_cost | The broadest pillar. Measures whether AI-assisted tooling is producing value: better code, faster delivery, positive ROI. If Tools pillar coverage is low, the organization is using AI but not measuring whether it works. |
| **Orchestration** | Can your platform coordinate agent workflows reliably? | R | cfr_ai, slo_attainment, contract_catch_rate, uptime_ai, adaptability | The hardest pillar to measure. Orchestration asks: when an agent runs a 20-step workflow and step 14 fails, does the system recover? R-score's five multiplicative factors capture change safety, SLO compliance, contract enforcement, uptime, and workflow durability. |

**Coverage levels**:
- **Full**: 50%+ of the pillar's signals are live. The score for this pillar is reliable.
- **Partial**: Some signals present but gaps remain. The score is directional, not definitive.
- **None**: No signals for this pillar. The report names the gap and recommends which connector to connect.

---

## Signal Routing

When multiple connectors produce the same signal, AIEI uses priority chains to pick the best source without double-counting.

**Strategy: `first_available`** - The first connected connector in the priority list wins. Lower-priority values are stored in diagnostics but do not override the score.

**Strategy: `additive_sum`** - Signals from multiple providers are summed (used for `total_ai_cost` when individual AI providers are connected without a gateway). Exception: Portkey overrides all individual providers because as a gateway it has the complete cost picture.

| Signal | Priority Chain | Strategy | Rationale |
|--------|---------------|----------|-----------|
| `cfr_ai` | Datadog > Dynatrace > OpenTelemetry > Vercel | first_available | APM tools have the richest deployment-level data. Vercel as fallback for JAMstack shops. |
| `uptime_ai` | Datadog > Dynatrace > OpenTelemetry > PagerDuty > ServiceNow > Cloudflare > New Relic > Grafana | first_available | Long chain because uptime is the most commonly available signal. APM tools prioritized over incident tools. |
| `slo_attainment` | Postman > Datadog > Dynatrace > OpenTelemetry | first_available | Postman monitors measure API contract compliance directly. APM tools measure infrastructure SLOs. Both valid, contract-level SLOs preferred. |
| `adaptability` | Inngest > Step Functions > Splunk > Supabase | first_available | Orchestration providers measure workflow durability directly. Splunk and Supabase provide weaker proxy signals. |
| `total_ai_cost` | Portkey > OpenAI | additive_sum (Portkey overrides) | Portkey sees all AI spend through its gateway. Individual providers only see their own. |
| `cycle_time_ai` | GitHub > GitLab > Linear > Jira > Jellyfish | first_available | Source control has the most accurate commit-to-deploy data. Project tools provide PR-level approximations. |
| `deploy_frequency` | Datadog > Vercel > GitHub Actions | first_available | Datadog tracks deployment events natively. Vercel for frontend deploys. GitHub Actions for CI-based deploy counting. |
| `rework_rate_ai` | GitHub > GitLab | first_available | Rework detection requires follow-up commit analysis on merged PRs. Only source control has this data. |

---

## Composite Score

```
Composite = sum(weight[d] x score[d]) for d in {Q, L, R, C}
```

S is never weighted. If fewer than 4 dimensions score, weights are renormalized to sum to 1.0 across scored dimensions only.

**Assessment mode**:
- `full`: 3+ core dimensions scored. The composite is a verdict.
- `readiness`: <3 core dimensions scored. The composite is directional. The report says so explicitly.

---

## Epistemic Model

Every AIEI result includes an `epistemicSummary` that states:
- How many signals are live vs. fallback vs. missing
- How many AX pillars have coverage
- An auto-generated honesty statement in direct language
- A `what_this_score_does_not_know` array listing specific blind spots with the connector needed to close each gap

The epistemic model exists because scoring tools that produce a number without stating limitations create false confidence. An organization that sees "Score: 72" and has no visibility into which signals are missing will assume the score reflects their full picture. It does not. The epistemic summary makes the gaps visible, specific, and actionable.

---

## Data Sources

| Source | Used For | Citation |
|--------|---------|----------|
| DORA Accelerate State of DevOps 2025 | CFR thresholds, deploy frequency Elite benchmark (10/day), lead time classification | 39,000 respondents across industries |
| Postman State of the API 2020-2025 | Collection quality median (70), quality benchmark (62 avg, 82 top quartile), API priority ranking | 100,000+ cumulative respondents |
| Forrester TEI 2024 | Hour multipliers (Q:85, R:90, L:95, C:70 hrs/mo), cost benchmark (45 avg, 78 Forrester) | Analysis of 500-person engineering organizations |

---

## Version

This document describes AIEI v1.5.0 signals. See [SCORING.md](SCORING.md) for formula derivations and version history.
