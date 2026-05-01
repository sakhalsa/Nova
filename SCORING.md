# AIEI Scoring Methodology v1.5.0

The AI Effectiveness & Efficiency Index measures four core dimensions (Quality, Lead Time, Reliability, Cost Efficiency) and one supplemental dimension (Security Posture). Every formula is explicit, versioned, and auditable. Run `aiei formula` to inspect.

## Dimensions

### Q - Quality

**Formula:**

```
Q = (1 - defect_rate_ai / defect_rate_nonai) x ai_test_pass_rate x (1 - rework_rate_ai)
    + collection_quality_adjustment    [if collection_quality signal present]
    + agent_score_adjustment           [if agent_score signal present]
```

**Signal-gated adjustments (v1.4.0):**

- `collection_quality_adjustment = (collection_quality - 70) / 300`
  - **70**: Median collection quality score across 100,000+ State of the API respondents (2020-2025). Collections below 70 have incomplete specs, missing response examples, or no governance rules.
  - **/300**: Normalizes the maximum adjustment to +0.10 at score=100. At the median (70), adjustment is 0. This prevents spec quality from dominating defect metrics while rewarding investment in API governance.
  - **Gate**: Only applied when the Postman connector returns a `collection_quality` signal. No signal = no adjustment.

- `agent_score_adjustment = (agent_score - 70) / 500`
  - **70**: Threshold for documentation that AI agents can reliably consume (structured endpoints, typed parameters, response examples).
  - **/500**: Normalizes to +0.06 max, reflecting that agent readiness is a secondary quality signal behind defect rates and test coverage.
  - **Gate**: Only applied when a connector returns an `agent_score` signal. No signal = no adjustment.

**Signal-gated adjustment (v1.5.0):**

- `api_runtime_quality_adjustment = (avg(runtime_signals) - 0.5) / 5`
  - Averages up to four runtime signals: `runtime_retry_behavior`, `runtime_idempotency`, `error_recovery_quality`, `error_contract_depth`
  - **0.5**: Midpoint baseline. APIs at 50% runtime quality get no adjustment. Below penalizes, above rewards.
  - **/5**: Normalizes to +0.10 max. Runtime quality matters but should not dominate defect-rate and test-pass signals.
  - **Gate**: Only applied when at least one runtime signal is present. No signals = no adjustment.
  - **Why this matters**: Spec presence is not runtime correctness. An API spec can document idempotency without implementing it. These signals close the gap between documented and actual API behavior.
  - **Source**: Postman connector - collection responses, monitor runs, and error response analysis.

**Scoring modes:**
- `strict`: Requires both AI and non-AI defect rates for direct comparison.
- `portfolio`: Uses State of the API baseline (defect rate = 0.12) when org-specific non-AI data is unavailable.

### L - Lead Time

**Formula:**

```
L = 1 - (cycle_time_ai / cycle_time_nonai)
    + deploy_frequency_bonus           [if deploy_frequency signal present]
```

**Signal-gated adjustment (v1.4.0):**

- `deploy_frequency_bonus = min(deploy_frequency / 10, 0.15)`
  - **10**: DORA Elite threshold for deploy frequency (2025 Accelerate report). Elite teams deploy 10+ times per day.
  - **0.15**: Cap ensures deploy frequency contributes at most 15% of the L-score. Cycle time reduction remains the dominant signal.
  - **Gate**: Only applied when a connector returns a `deploy_frequency` signal. No signal = no bonus.

**Why deploy frequency matters:** A team that deploys 10x/day at 18hr cycle time is operationally different from one deploying 1x/week. Cycle time alone misses deployment maturity.

### R - Reliability

**Formula:**

```
R = (1 - cfr_ai) x slo_attainment x contract_catch_rate x uptime_ai x adaptability
```

All five factors are multiplicative. Each factor can independently zero out the score, reflecting that reliability failures in any dimension are systemic.

**v1.5.0: `adaptability` signal sources expanded.** The `adaptability` factor now accepts workflow-layer signals from orchestration providers (Inngest workflow completion rate, AWS Step Functions execution success rate) in addition to the existing Splunk and Supabase sources. Priority chain: `inngest > step_functions > splunk > supabase`. No formula change - the factor definition and multiplicative role are unchanged.

### C - Cost Efficiency

**Formula:**

```
C = (hours_saved x hourly_rate - overhead x hourly_rate) / total_ai_cost / target_roi
    - cost_growth_penalty              [if cost_growth_rate > value_growth_rate]
```

**Signal-gated adjustment (v1.4.0):**

- `cost_growth_penalty = (cost_growth_rate - value_growth_rate) / 100`
  - Expressed as percentage-point delta divided by 100 to normalize to 0-1 scale.
  - A 10% gap produces a -0.10 penalty: material but not catastrophic.
  - **Asymmetric by design**: Growing costs are a risk signal. Growing value faster than cost is already captured in the base formula's numerator.
  - **Gate**: Only applied when both `cost_growth_rate` and `value_growth_rate` signals are present AND cost growth exceeds value growth.

### S - Security Posture (Supplemental)

**Formula:**

```
S = spec_security_score x dependabot_score x code_scanning_score x secret_scanning_score
```

**Signals:**

- `spec_security_score` (0-1): API spec audit against OWASP Top 10. Source: 42Crunch.
- `dependabot_score` (0-1): Dependency vulnerability posture. Each critical vulnerability deducts 0.10, floored at 0. Source: GitHub Dependabot.
- `code_scanning_score` (0-1): Static analysis posture. Each high/critical finding deducts 0.05, floored at 0. Source: GitHub Advanced Security.
- `secret_scanning_score` (0-1): Exposed credential posture. Each open secret deducts 0.20, floored at 0. Penalty is aggressive because exposed credentials are binary risk. Source: GitHub secret scanning.

Multiplicative by design: a single dimension at zero (e.g., exposed secrets) drives the entire S-score toward zero. This reflects real-world security posture where one critical gap invalidates otherwise strong coverage.

S is supplemental: it is scored and displayed but never included in the composite weight calculation. This prevents organizations from gaming the composite by connecting only security tools.

## Composite Score

```
Composite = sum(weight[d] x score[d]) for d in {Q, L, R, C}
```

Weights are normalized if fewer than 4 dimensions score. If only Q and R are scored, their weights are proportionally increased to sum to 1.0.

## Weight Profiles

| Profile | Q | L | R | C | Rationale |
|---------|---|---|---|---|-----------|
| reliability_first | 0.20 | 0.20 | 0.45 | 0.15 | Default. Production stability is the primary business risk for most enterprise AI adoption. |
| balanced | 0.25 | 0.25 | 0.25 | 0.25 | Equal weight. Use during initial assessments. |
| quality_first | 0.40 | 0.15 | 0.25 | 0.20 | Code quality focus. For regulated environments. |
| speed_first | 0.15 | 0.40 | 0.25 | 0.20 | Velocity focus. R at 0.25 prevents masking instability. |
| cost_first | 0.15 | 0.20 | 0.20 | 0.45 | ROI focus. For executive sponsors requiring measurable returns. |

Custom profiles are rejected by default to maintain cross-customer comparability.

## Stage Classification

| Index | Stage | Meaning |
|-------|-------|---------|
| 85-100 | Leader | Top-quartile AI engineering maturity |
| 70-84 | Scale | Consistent, measured AI-augmented delivery |
| 50-69 | Growth | AI tools adopted, measurement emerging |
| 0-49 | Foundation | Early adoption, calibration needed |

## Hour Multipliers

Estimated engineering hours recovered per month at full dimension score:

| Dimension | Hours | Derivation |
|-----------|-------|------------|
| Q | 85 | Defect triage (40) + rework avoidance (30) + review reduction (15) |
| R | 90 | Incident response (50) + SLO investigation (25) + rollback avoidance (15) |
| L | 95 | Cycle time savings (55) + queue reduction (25) + deployment automation (15) |
| C | 70 | Cost optimization (35) + tool consolidation (20) + billing investigation (15) |

Source: Forrester TEI 2024 analysis of 500-person engineering organizations.

## Benchmarks

| Dimension | Industry Avg | Top Reference | Source |
|-----------|-------------|---------------|--------|
| Quality | 62 | 82 (Top Quartile) | Postman State of the API 2020-2025 |
| Reliability | 58 | 75 (DORA High) | DORA Accelerate 2025 |
| Lead Time | 35 | 85 (DORA Elite) | DORA Accelerate 2025 |
| Cost | 45 | 78 (Forrester) | Forrester TEI 2024 |

## Data Sources

- DORA Accelerate State of DevOps Report 2025 (39,000 respondents)
- Postman State of the API Report 2020-2025 (100,000+ cumulative respondents)
- Forrester Total Economic Impact of AI-Assisted Development 2024

## AX Pillar Mapping (v1.5.0)

AIEI maps its dimensions to Matt Biilmann's four Agent Experience (AX) pillars:

| AX Pillar | AIEI Dimensions | Key Signals |
|-----------|----------------|-------------|
| **Access** (can agents authenticate?) | S | spec_security_score, dependabot_score, code_scanning_score, secret_scanning_score |
| **Context** (can agents understand?) | Q | collection_quality, agent_score, error_contract_depth |
| **Tools** (can agents use your platform?) | Q, L, C | defect_rate, test_pass, rework, runtime_retry, runtime_idempotency, cycle_time, deploy_frequency, hours_saved, ai_cost |
| **Orchestration** (can your platform coordinate workflows?) | R | cfr_ai, slo_attainment, contract_catch_rate, uptime_ai, adaptability |

Every AIEI report includes per-pillar coverage assessment: full, partial, or none. This makes AIEI the cross-pillar measurement layer that tells you whether all four AX pillars are working, not just whether individual tools are connected.

## Epistemic Model

Every AIEI result includes:
- `assessmentMode`: 'full' (3+ dimensions) or 'readiness' (< 3 dimensions)
- `calibrating`: Array of dimensions awaiting baseline data
- `epistemicNote`: Explicit limitations of the measurement
- `dataQuality`: Per-dimension quality assessment (high/medium/low)
- `provenance`: Optional per-signal trace to raw API response
- `epistemicSummary` (v1.5.0): Structured block with live/fallback/missing signal counts, AX pillar coverage count, an auto-generated honesty statement, and a `what_this_score_does_not_know` array listing specific blind spots with remediation guidance.

Scores aggregate connector signals as proxies for outcomes, not proof of causation. The epistemic summary makes this explicit: it tells you what was measured, what was not, and what to connect to close the gap.

## Formula Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01 | Initial Q, L, R, C formulas |
| 1.2.0 | 2026-03 | Added S dimension, weight profiles, signal routing |
| 1.3.0 | 2026-04 | Added simulation, provenance, diff, connector contracts, formula versioning |
| 1.4.0 | 2026-04 | Added collection quality/agent score to Q, deploy frequency to L, cost growth penalty to C. Monorepo with presentation layer, benchmarks, stage classification, v12 templates. |
| 1.5.0 | 2026-04 | API runtime quality adjustment to Q. Inngest + Step Functions connectors for R adaptability. AX pillar mapping. Epistemic summary with blind spots. Error contract depth signal. Agent Readiness checks 3.7, 6.6, 6.7. |
