# AIEI Scoring Methodology

## Design Principles

1. **Comparative, not absolute.** Every metric compares AI-assisted vs non-AI baseline. A cycle time of 10 hours means nothing without the baseline.
2. **Multiplicative where failures cascade.** R-Score and Q-Score use products, not sums. Zero SLO attainment means zero reliability - no matter how good uptime is.
3. **Additive where dimensions are independent.** The composite uses weighted sum because Q, L, R, C measure orthogonal outcomes.
4. **Bounded 0-1.** All scores normalize to unit interval. C_norm caps at `min(C_raw / target_roi, 1.0)`.
5. **Deterministic and auditable.** Same inputs produce same outputs. Every variable is traceable. No ML black boxes.

## R-Score: Reliability

```
R = (1 - CFR_ai) x SLO_attainment x Contract_catch_rate x Uptime_ai x Adaptability
```

| Variable | Range | Primary Source |
|---|---|---|
| CFR_ai | 0-1 | Datadog deploy events |
| SLO_attainment | 0-1 | Postman Monitors |
| Contract_catch_rate | 0-1 | Postman CLI/CI |
| Uptime_ai | 0-1 | Datadog SLOs |
| Adaptability | 0-1 | Entire.io agent sessions |

Classification: > 0.70 = STRONG, 0.50-0.70 = MODERATE, < 0.50 = FRAGILE

## Q-Score: Quality

```
defect_component = 1 - (defect_rate_ai / defect_rate_nonai)
test_pass_delta = ai_test_pass_rate - manual_test_pass_rate
Q = defect_component x test_pass_delta x (1 - rework_rate_ai)
```

| Variable | Range | Primary Source |
|---|---|---|
| defect_rate_ai | 0-1 | SonarQube |
| defect_rate_nonai | 0-1 | SonarQube |
| ai_test_pass_rate | 0-1 | Postman CLI/CI |
| manual_test_pass_rate | 0-1 | Postman CLI/CI |
| rework_rate_ai | 0-1 | GitHub (reverted PRs) |

Classification: >= 0.70 = STRONG, 0.50-0.70 = MODERATE, < 0.50 = TECHNICAL DEBT

## L-Score: Lead Time

```
L = 1 - (cycle_time_ai_hours / cycle_time_nonai_hours)
```

Optional stage segmentation:
- `ideation_to_pr`: Issue creation to PR submission
- `review_to_merge`: PR submission to merge

| Variable | Unit | Primary Source |
|---|---|---|
| cycle_time_ai_hours | Hours | GitHub / Linear |
| cycle_time_nonai_hours | Hours | GitHub / Linear |

Classification: > 0.30 = STRONG, 0.15-0.30 = MODERATE, < 0.15 = BOTTLENECK

## C-Score: Cost Efficiency

```
labor_value_saved = hours_saved_monthly x blended_hourly_rate
overhead_value = review_overhead_hours_monthly x blended_hourly_rate
total_ai_cost = token_cost + infra_cost + tooling_cost

C_raw = (labor_value_saved - overhead_value) / total_ai_cost
C_norm = min(C_raw / target_roi, 1.0)
```

| Variable | Unit | Primary Source |
|---|---|---|
| hours_saved_monthly | Hours | GitHub / Linear |
| blended_hourly_rate | $/hour | Config (default $150) |
| review_overhead_hours_monthly | Hours | GitHub |
| token_cost | $/month | OpenAI / Anthropic / Google AI |
| infra_cost | $/month | Cloud billing APIs |
| tooling_cost | $/month | Procurement |
| target_roi | Ratio | Config (default 2.0x) |

Classification: C_raw > 3.0x = STRONG ROI, 1.0-3.0x = POSITIVE, < 1.0x = NEGATIVE ROI

## Composite Score

```
AIEI = (wQ x Q) + (wL x L) + (wR x R) + (wC x C_norm)
```

| Profile | wQ | wL | wR | wC |
|---|---|---|---|---|
| quality_first | 0.35 | 0.20 | 0.35 | 0.10 |
| speed_first | 0.20 | 0.40 | 0.25 | 0.15 |
| reliability_first | 0.20 | 0.20 | 0.45 | 0.15 |
| cost_first | 0.25 | 0.20 | 0.20 | 0.35 |

Classification: > 0.70 = AI-ENHANCED, 0.40-0.70 = OPTIMIZE WEAK COMPONENTS, < 0.40 = RE-EVALUATE AI STRATEGY

## Confidence Levels

| Level | Real Connectors | Meaning |
|---|---|---|
| DEMO | 0 | All mock data |
| LOW | 1 | One real source |
| MEDIUM | 2-3 | Mixed real/mock |
| HIGH | 4+ | Mostly real data |

## Benchmark Values (Mock Data)

| Dimension | Mock Score | Classification |
|---|---|---|
| R | 0.6962 | MODERATE |
| Q | 0.2483 | TECHNICAL DEBT |
| L | 0.3146 | STRONG |
| C | 2.7955x raw / 1.0000 norm | POSITIVE |
| Composite | 0.5759 | OPTIMIZE WEAK COMPONENTS |

Mock Q-Score is intentionally low. It creates a teaching moment: "AI is generating code with more rework than expected. Here's what to fix."
