# Agent Governance Assessment (Part B)

API readiness is not just about the API surface. It's about the agents themselves: how they're composed, governed, versioned, monitored, and improved.

## Six Governance Pillars

| # | Pillar | What It Measures | Failure Mode Without It |
|---|---|---|---|
| 9 | Agent Composition | AGENTS.md, skills, tool definitions, prompt architecture, model selection documented | Agent is a black box. Cannot audit, debug, or improve. |
| 10 | Agent Identity & Access | Own identity, scoped permissions, credential management via vault | Agent operates with human credentials, overprivileged access |
| 11 | Agent Lifecycle | Versioned, promotable, rollbackable, decommissionable | No way to revert bad agent updates. No staging/prod separation. |
| 12 | Agent Observability | Execution traces captured, tool invocations logged, decisions explainable | Agent fails silently. Cannot prove compliance. |
| 13 | Agent Boundaries | Tool invocations constrained, rate limits, approval workflows for destructive ops | Unconstrained agent actions. Autonomy without guardrails. |
| 14 | Agent Evolution | Config changes tracked, AGENTS.md versioned, skill additions audited, performance baselines | Config drift. Cannot correlate agent changes to outcome changes. |

## Agent Composition: The "Genetic Makeup"

A production agent's composition includes:

| Component | What It Is | Governance Concern |
|---|---|---|
| AGENTS.md | Human-readable instructions, architectural decisions | The "why" |
| Skills / SKILL.md | Reusable capabilities | Adding a skill changes behavior |
| Tool Definitions | MCP servers, API collections, functions | What the agent can do in the world |
| Model Selection | Which LLMs, for which tasks | Cost, capability, determinism. Model changes = behavior changes. |
| Prompt Architecture | System prompts, few-shot examples, CoT patterns | How the agent reasons |
| Guardrails | Input/output validation, banned actions, approval workflows | What the agent cannot do |
| Memory / Context | Knowledge bases, retrieval config, context management | What the agent knows |

Material changes to any component should be tracked, versioned, and correlated with outcome changes.

## Agent Lifecycle Maturity Levels

| Level | Name | Description |
|---|---|---|
| 1 | Ad Hoc | Agents exist but aren't documented. No version control. No registry. |
| 2 | Documented | Composition documented (AGENTS.md, skills manifest). Basic identity separation. |
| 3 | Governed | Versioned. Permissions scoped. Changes tracked. Execution logged. |
| 4 | Managed | Centralized registry. Performance baselines. Automated testing. Promotion workflows. |
| 5 | Autonomous Oversight | Agents monitor other agents. Automated anomaly detection. Self-healing governance. |

## Connection to AIEI

The three layers form a complete measurement stack:

```
AIEI (Outcomes)             Is AI making us better?      Q / L / R / C scores
API Readiness (Part A)      Can AI use our APIs?         8 pillars, 5 levels
Agent Governance (Part B)   Can we manage our AI?        6 pillars, 5 levels
```

Post-deployment: AIEI measures whether the agent is effective. Agent Governance monitors for drift. Combined: AIEI (outcomes) + API Readiness (surface) + Agent Governance (oversight) = complete measurement stack.
