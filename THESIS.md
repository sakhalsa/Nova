# The AIEI Thesis

## Why this exists

Most organizations cannot answer a simple question: is AI making our engineering work better, or just faster?

They have the tools. GitHub sees commits. Postman sees APIs. Datadog sees production. The signals exist. Nobody is reading them together.

The audience for engineering tools changed too. Code is now written by humans and agents, consumed by humans and agents, evaluated by humans and agents. A measurement tool that only speaks to one is half a tool.

AIEI reads the signals together. It connects to the engineering systems an organization already uses, computes a measured score across four dimensions, and tells the truth about what the score does and does not know. It is operated by humans through a CLI and by agents through MCP. The same numbers come out either way.

## What we measure

Four questions. Every dimension answers one.

**Quality.** Is AI-assisted code better or worse than what came before?

**Lead Time.** Is AI making delivery faster?

**Reliability.** Are AI-assisted changes breaking production? Including whether AI-orchestrated workflows survive failure - retries that complete, idempotency that holds, errors that recover.

**Cost Efficiency.** Is the AI investment paying off?

A fifth dimension, Security, runs alongside as supplemental. It does not affect the composite. It cannot be ignored.

## Why these four

Pick any other framing. SPACE, DORA, Flow Framework, the Amazon working backwards memo. They all converge on the same principle: speed without quality is debt, quality without delivery is theater, both without reliability is risk, all of it without cost discipline is unsustainable.

Q, L, R, C is that convergence reduced to its smallest defensible form. Each dimension is computable. Each is attributable. Each captures a failure mode the others cannot.

If you cannot measure all four, you cannot prove your AI investment is working. You can only believe it is.

## The three axes

The bar for engineering tools changed. They are now consumed by both humans and agents, and they have to be honest about what they can and cannot do.

AIEI sits in that intersection on three axes:

1. **The product is consumed by agents.** The CLI emits structured JSON on every command. Diagnostics go to stderr, data to stdout. Exit codes encode partial results. An agent can pipe `aiei score --json` into the next step of a workflow without parsing prose.

2. **The product measures agent-readiness in customer systems.** R-score's adaptability factor pulls from workflow orchestration providers because durability is the new reliability frontier. Q-score's runtime quality adjustment pulls from API contracts because retry behavior, idempotency, and machine-actionable errors are now table stakes for any API an agent will consume.

3. **The product is honest about what it does and does not measure.** Every result includes an epistemic summary listing live signals, missing signals, and specific blind spots. AX pillar coverage maps each AIEI dimension to Access, Context, Tools, and Orchestration. If fewer than three of four core dimensions can score, the result is labeled `readiness` instead of pretending to be a verdict.

Most measurement tools pick one of these. AIEI does all three because they reinforce each other.

## Why connected tools, not surveys

A survey tells you what people remember. A connector tells you what happened.

When AIEI scores Reliability, it pulls change failure rate from your APM, SLO attainment from your monitors, contract violations from your test suite, and workflow completion from your orchestration provider. The numbers come from systems that record events as they occur. They cannot be polished by a quarterly retrospective.

This is also why AIEI cannot be gamed by talking about it. The tools either show the work or they do not.

## What the score knows it does not know

Most scoring tools produce a number and let the reader assume confidence. AIEI does the opposite.

Every result includes an epistemic summary: how many signals are live, how many are missing, which dimensions are calibrating, and what specific blind spots remain. If a whole AX pillar has no signal coverage, the report tells you which connector to connect next.

The principle: a score that overstates its confidence creates worse decisions than no score at all.

## What AIEI is not

AIEI does not score whether your documentation site is agent-friendly. Tools like Fern Agent Score do that. Both can matter to the same organization. They are not substitutes.

AIEI does not replace agent gateways, MCP servers, or workflow orchestration platforms. It measures whether they are working. Inngest runs your workflows; AIEI tells you whether they complete. An MCP server exposes your APIs; AIEI tells you whether those APIs are documented well enough for agents to use them.

AIEI does not score video QoE, queue drain health, or client-side rendering. It scores the API and engineering toolchain layer. Where that layer ends, the score ends.

AIEI does not replace product analytics, customer health metrics, or financial reporting. It is one signal among many that engineering leaders use to decide where to invest.

## The math is open

Every formula is documented. Every constant has a derivation. Every weight profile has a stated rationale.

```
Q = (1 - defect_rate_ai / defect_rate_nonai) x ai_test_pass_rate x (1 - rework_rate_ai)
L = 1 - (cycle_time_ai / cycle_time_nonai)
R = (1 - cfr_ai) x slo_attainment x contract_catch_rate x uptime_ai x adaptability
C = (hours_saved x hourly_rate - overhead x hourly_rate) / total_ai_cost / target_roi
```

Run `aiei formula` to see the current version. The math does not change between releases without an entry in the changelog and a migration note.

## Why now

AI is generating code at a pace organizations have not previously had to govern. Most teams are deploying AI tools faster than they are deploying the measurement infrastructure to evaluate them. The gap compounds.

AIEI closes the gap by treating AI effectiveness as an engineering measurement problem, not a vendor evaluation problem. The same tools that produce the work also produce the evidence. The only thing missing is a framework to read them together.

That is what this is.
