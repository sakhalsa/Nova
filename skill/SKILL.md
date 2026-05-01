# AIEI Assessment Skill

## Overview

This skill teaches an AI agent how to measure AI engineering effectiveness using the AIEI (AI Engineering Intelligence & Effectiveness Index) framework. Four orthogonal dimensions - Quality (Q), Lead Time (L), Reliability (R), Cost Efficiency (C) - composited into a single auditable score.

The agent uses this skill to: assess an organization's AI effectiveness posture, compute scores from available data sources, generate executive reports, and recommend improvement actions.

## Prerequisites

- Access to at least one data source (GitHub, Postman API, SonarQube, Datadog, or equivalent)
- For Postman-native execution: AIEI workspace forked with environment variables configured
- For agent-native execution: ability to call APIs and perform arithmetic

## Core Methodology

### The Four Dimensions

Compute each dimension independently. Every score normalizes to 0-1.

**R-Score (Reliability):** Multiplicative - failures cascade.
```
R = (1 - CFR_ai) x SLO_attainment x Contract_catch_rate x Uptime_ai x Adaptability
```

**Q-Score (Quality):** Multiplicative - failures cascade.
```
Q = defect_component x test_pass_delta x (1 - rework_rate_ai)
where defect_component = 1 - (defect_rate_ai / defect_rate_nonai)
      test_pass_delta = ai_test_pass_rate - manual_test_pass_rate
```

**L-Score (Lead Time):** Comparative - AI vs baseline.
```
L = 1 - (cycle_time_ai_hours / cycle_time_nonai_hours)
```

**C-Score (Cost Efficiency):** Two-stage normalization.
```
C_raw = (labor_value_saved - overhead_value) / total_ai_cost
C_norm = min(C_raw / target_roi, 1.0)
where labor_value_saved = hours_saved_monthly x blended_hourly_rate
      overhead_value = review_overhead_hours x blended_hourly_rate
      total_ai_cost = token_cost + infra_cost + tooling_cost
```

### Composite Score

```
AIEI = (wQ x Q) + (wL x L) + (wR x R) + (wC x C_norm)
```

### Weight Profiles

Select based on organizational priorities:

| Profile | wQ | wL | wR | wC | Best For |
|---|---|---|---|---|---|
| quality_first | 0.35 | 0.20 | 0.35 | 0.10 | Regulated industries (FSI, healthcare) |
| speed_first | 0.20 | 0.40 | 0.25 | 0.15 | Startups, rapid iteration |
| reliability_first | 0.20 | 0.20 | 0.45 | 0.15 | Platform engineering, SRE |
| cost_first | 0.25 | 0.20 | 0.20 | 0.35 | Cost optimization mandates |

## Assessment Workflow

### Step 1: Establish Measurement Contract

Before computing any score, verify six non-negotiables:

1. **Attribution** - AI vs non-AI work is tagged at the commit/PR level
2. **Baseline Cohort** - Control group from same period, service, and complexity tier
3. **Criticality Weighting** - Services tagged as critical/standard/low with >=90% coverage
4. **Join Completeness** - Data source joins are connected for each claimable score
5. **Guardrail Coverage** - Override tracking, hallucination detection, security scanning active
6. **Anti-Vanity Compliance** - No activity metrics (lines of code, acceptance rates) in scoring

Verdict levels: FULLY CLAIMABLE / CLAIMABLE WITH CAVEATS / PARTIALLY CLAIMABLE / NOT CLAIMABLE.

### Step 2: Start with R-Score

R-Score is the fastest to compute (requires only Postman Monitor data or equivalent SLO source) and produces the most immediately useful signal.

Gather:
- Change Failure Rate for AI-assisted deploys (CFR_ai)
- SLO attainment percentage
- Contract catch rate (API contract violations caught before production)
- Uptime of AI-managed endpoints
- Adaptability (agent session success rate, if available)

### Step 3: Add Q and L Scores

**Q-Score inputs (primary sources: GitHub, SonarQube):**
- Defect rate in AI-generated code vs human-written code
- Test pass rates for AI-generated code paths vs manual
- Rework rate (% of AI PRs requiring rework/revert)

**L-Score inputs (primary sources: GitHub, Linear, Jira):**
- End-to-end cycle time for AI-assisted work
- Baseline cycle time for non-AI work
- Optional: stage segmentation (ideation_to_pr, review_to_merge)

### Step 4: Add C-Score

**C-Score inputs:**
- Developer hours saved by AI tools (monthly)
- Blended hourly developer rate (default $150)
- Review overhead hours (additional review burden from AI output)
- Monthly costs: token spend, infrastructure, tooling licenses
- Target ROI multiplier (default 2.0x)

### Step 5: Compute Composite and Classify

Apply weight profile. Classify the result:

| Composite | Classification |
|---|---|
| > 0.70 | AI-ENHANCED |
| 0.40 - 0.70 | OPTIMIZE WEAK COMPONENTS |
| < 0.40 | RE-EVALUATE AI STRATEGY |

Per-dimension classifications:

| Dimension | Strong | Moderate | Weak |
|---|---|---|---|
| R | > 0.70 | 0.50-0.70 | < 0.50 (FRAGILE) |
| Q | >= 0.70 | 0.50-0.70 | < 0.50 (TECHNICAL DEBT) |
| L | > 0.30 | 0.15-0.30 | < 0.15 (BOTTLENECK) |
| C | > 3.0x raw (STRONG ROI) | 1.0-3.0x (POSITIVE) | < 1.0x (NEGATIVE ROI) |

### Step 6: Generate Executive Report

The report includes:
1. Composite score and classification
2. Per-dimension scores with classification and data sources
3. Weakest dimension identification with root cause
4. Confidence level (DEMO/LOW/MEDIUM/HIGH based on real vs mock data sources)
5. Weight profile disclosure
6. Recommended actions prioritized by impact
7. Maturity level assessment (0-5)

## Maturity Model

| Level | Name | Board Statement |
|---|---|---|
| 0 | Anecdotes | "We've adopted AI coding assistants." |
| 1 | Signals | "AI-assisted PRs have 14% fewer defects (n=156, 14-day window)." |
| 2 | Joins | "AI changes to payments API have 3.2% CFR vs 5.1% for non-AI, weighted by criticality." |
| 3 | Guardrails + Unit Economics | "AI saves $12,400/mo net of review overhead and tooling costs." |
| 4 | Predictive | "Based on 6-month trend, Q-Score will cross 0.70 in 3 sprints." |
| 5 | Benchmarks | "Our AIEI of 0.72 is P75 for Series B fintech companies." |

## Connector Registry

See `references/connectors.md` for the full 27-connector registry. Any combination of connectors produces a valid result. Mock data fills gaps automatically. The scoring math is identical regardless of data source.

## Falsifiability Checks

After computing scores, run these contradiction detectors:
1. **Velocity-quality divergence** - L improves but Q drops (shipping faster but worse)
2. **Trust-but-verify tax** - C looks good but review overhead is rising
3. **Cost inflation** - C_raw declining while confidence stays HIGH
4. **Interface drift** - R drops when L improves (speed breaking contracts)
5. **Guardrail erosion** - Guardrail coverage declining while scores improve

Flag any contradictions in the executive report.

## References

- `references/scoring.md` - Full formula specifications and design principles
- `references/connectors.md` - 27 data connectors, tiers, signals, environment variables
- `references/governance.md` - Agent Governance assessment (Part B)
- `references/verticals.md` - Vertical-specific weight profiles and framing
