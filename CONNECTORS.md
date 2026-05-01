# AIEI Connector Registry

27 implemented. 12 on the roadmap. Each connector is a single TypeScript file (~50-80 lines) that implements the `Connector` interface: `name`, `dimensions`, `requiredCredentials`, `collect()`.

## Implemented (27)

### Source Control & Delivery

| # | Connector | Dimensions | API | Signals Produced | Why |
|---|-----------|-----------|-----|-----------------|-----|
| 1 | **GitHub** | Q, L, C, S | REST | `defect_rate_ai`, `rework_rate_ai`, `cycle_time_ai`, `cycle_time_nonai`, `hours_saved_monthly`, `review_overhead_hours_monthly`, `dependabot_score`, `code_scanning_score`, `secret_scanning_score` | Primary signal source for most organizations. PR data drives Q, L, and C. Dependabot, code scanning, and secret scanning APIs drive S-score. Last 30 days of PRs with AI detection heuristics (labels, branch patterns, title patterns). |
| 2 | **GitLab** | Q, L, C | GraphQL | Same as GitHub | Enterprise alternative. Many regulated industries (FSI, defense) use GitLab self-hosted. Same signals, different API surface. |

### Quality & Security

| # | Connector | Dimensions | API | Signals Produced | Why |
|---|-----------|-----------|-----|-----------------|-----|
| 3 | **SonarQube** | Q | REST | `defect_rate_ai`, `ai_test_pass_rate` | Static analysis is the ground truth for code quality. SonarCloud and SonarQube self-hosted both supported. Measures/issues endpoint gives defect density per project. |
| 4 | **Postman** | Q, R | REST | `collection_quality`, `ai_test_pass_rate`, `slo_attainment`, `contract_catch_rate`, `runtime_retry_behavior`, `runtime_idempotency`, `error_recovery_quality`, `error_contract_depth` | Postman's own API. Collection quality score feeds the v1.4.0 Q-score adjustment. Contract test pass rate feeds R-score. Runtime and error contract documentation feed the v1.5.0 Q-score runtime quality adjustment. This is the thesis connector: better specs produce better AI output. |
| 5 | **42Crunch** | S | REST | `spec_security_score` | API security audit. Scores OpenAPI specs for OWASP Top 10, injection risks, authentication gaps. Only connector for the S-dimension spec security factor. |
| 6 | **Fern** | Q | REST | `agent_score` | Agent readiness scoring for API documentation. Fetches agent readiness scores from Fern's organization API. Feeds the v1.4.0 Q-score agent_score adjustment. |

### Observability & Reliability

| # | Connector | Dimensions | API | Signals Produced | Why |
|---|-----------|-----------|-----|-----------------|-----|
| 7 | **Datadog** | R, L | REST | `cfr_ai`, `slo_attainment`, `uptime_ai`, `deploy_frequency` | SLO API gives attainment data. Events API gives change failure correlation. Deploy frequency feeds the v1.4.0 L-score bonus. Most common observability tool in enterprise accounts. |
| 8 | **Dynatrace** | R | REST | `cfr_ai`, `slo_attainment`, `uptime_ai` | Enterprise APM. SLO v2 API for attainment. Problems API for change failure rate (derived from problem count over 30 days). Synthetic monitors as uptime fallback. Dominant alongside Datadog in enterprise. MCP integration announced March 2026. |
| 9 | **OpenTelemetry** | R | PromQL | `cfr_ai`, `slo_attainment`, `uptime_ai` | Open standard for observability. Queries any Prometheus-compatible backend (Mimir, Thanos, Tempo, VictoriaMetrics, native Prometheus) using OTel semantic convention metrics. Error rate for uptime, success rate for SLO proxy, 7d-vs-30d error trend for change failure rate. Covers the "I don't use Datadog, I use OTel" case. Supports Bearer, Basic auth, or unauthenticated. Configurable metric names for non-standard setups. |
| 10 | **Grafana** | R | Prometheus | `uptime_ai` | Open-source observability. Prometheus query for uptime metrics. Covers organizations that don't use commercial APM. |
| 11 | **PagerDuty** | R | REST | `uptime_ai` | Incident management. Uptime derived from incident frequency and duration. Organizations that use PagerDuty often don't expose Datadog directly. |
| 12 | **Cloudflare** | R, S | REST + GraphQL | `uptime_ai`, `code_scanning_score` | Edge observability and security. REST Analytics API provides request success rates for R-score uptime. GraphQL Analytics API provides WAF/firewall event data for S-score: blocked and challenged requests map to a threat ratio signal. Covers API-gateway-level security posture for organizations where Cloudflare is the edge layer. |
| 13 | **New Relic** | R | NerdGraph | `uptime_ai` | NerdGraph (GraphQL) for application performance. Alternative to Datadog in organizations with New Relic contracts. |
| 14 | **Splunk** | R | SignalFx | `adaptability` | SignalFx metrics API. Adaptability signal measures how quickly AI-generated services recover from anomalies. Splunk is dominant in FSI and government. |
| 15 | **ServiceNow** | R | REST | `uptime_ai` | ITSM platform. Table API queries incident records. ServiceNow is the system of record for reliability in many enterprises where engineering and ops tooling are separated. |

### Platform & Infrastructure

| # | Connector | Dimensions | API | Signals Produced | Why |
|---|-----------|-----------|-----|-----------------|-----|
| 16 | **Vercel** | R, L | REST | `cfr_ai`, `deploy_frequency` | Deployment platform. Deployments API gives deploy frequency and rollback rates. Covers Next.js/frontend organizations where Vercel is the deployment target. |
| 17 | **Supabase** | R | REST | `adaptability` | Database platform. Management API provides service health and adaptation metrics. Covers the growing segment of organizations using Supabase as their backend. |

### Project Management

| # | Connector | Dimensions | API | Signals Produced | Why |
|---|-----------|-----------|-----|-----------------|-----|
| 18 | **Linear** | L | GraphQL | `cycle_time_ai`, `cycle_time_nonai` | Engineering project management. Issue cycle time from state transitions. Linear is increasingly the default for startups and growth-stage companies. |
| 19 | **Jira** | L | REST | `cycle_time_ai`, `cycle_time_nonai` | Enterprise project management. Status transition timestamps give cycle time. Jira is in every Fortune 500 company. Not having a Jira connector is a credibility gap. |
| 20 | **Jellyfish** | L | REST | `cycle_time_ai`, `cycle_time_nonai` | Engineering intelligence platform. Aggregated cycle time metrics. Jellyfish customers already measure engineering efficiency, making AIEI a natural extension. |
| 21 | **GitHub Actions** | L | REST | `deploy_frequency` | Workflow runs API. Deploy frequency from CI/CD runs across repos. Covers organizations that deploy via GitHub Actions rather than Datadog DORA or Vercel. |

### AI Cost

| # | Connector | Dimensions | API | Signals Produced | Why |
|---|-----------|-----------|-----|-----------------|-----|
| 22 | **OpenAI** | C | REST | `total_ai_cost` | Usage/billing API. Direct cost measurement for GPT-based AI tooling. |
| 23 | **Anthropic** | C | REST | Diagnostics only | Validates Anthropic connectivity and confirms Claude usage. Anthropic does not expose a public cost API, so C-score cost must come from Portkey or manual `monthlyAiCost`. |
| 24 | **Google AI** | C | REST | Diagnostics only | Validates Google AI/Gemini connectivity and model availability. Google AI usage/cost is not routed directly; C-score cost must come from Portkey, provider billing exports, or manual `monthlyAiCost`. |
| 25 | **Portkey** | C | REST | `total_ai_cost` | AI gateway. Aggregates spend across multiple LLM providers. When Portkey is connected, it takes priority over individual provider connectors (additive_sum override) because it has the complete picture. |

### Orchestration Providers (v1.5.0)

| # | Connector | Dimensions | API | Signals Produced | Why |
|---|-----------|-----------|-----|-----------------|-----|
| 26 | **Inngest** | R | REST | `adaptability` (workflow_completion_rate, step_retry_success_rate) | Durable workflow orchestration. Measures whether agent workflows survive failures - the AX Pillar 4 signal nobody else provides. Workflow completion rate feeds R-score adaptability. Step retry success rate captured in diagnostics. Priority source for adaptability over Splunk/Supabase because it directly measures workflow durability. |
| 27 | **AWS Step Functions** | R | AWS API | `adaptability` (execution_success_rate) | AWS-native workflow orchestration. Execution success rate across state machines feeds R-score adaptability. Covers enterprise organizations running agentic workflows on AWS infrastructure. |

---

## Roadmap (12)

### Tier 1: Enterprise Coverage (next sprint)

These close the most common "we use X, not Y" objections in enterprise accounts.

| # | Connector | Dimensions | Signals | Why Now | Effort |
|---|-----------|-----------|---------|---------|--------|
| 28 | **Azure DevOps** | Q, L, C | Same as GitHub/GitLab | Microsoft shops. Azure DevOps is the third major source control platform after GitHub and GitLab. Every FSI account asks about it. REST API, well documented. | 1 day |
| 29 | **Bitbucket** | Q, L, C | Same as GitHub/GitLab | Atlassian ecosystem. Organizations using Jira almost always use Bitbucket. REST API v2. | 1 day |
| 30 | **Snyk** | S | `dependabot_score`, `secret_scanning_score` | Dedicated security scanning. Many organizations use Snyk instead of GitHub Advanced Security. Fills S-dimension gaps for non-GitHub shops. Also provides secret detection. | 1 day |
| 31 | **Sentry** | R | `cfr_ai`, `uptime_ai` | Error tracking. Sentry captures production errors that APM tools miss. Common in mid-market and growth companies that don't have Datadog budgets. | 1 day |

### Tier 2: AI Provider Coverage

These connectors close the C-score gap for organizations using less common AI providers.

| # | Connector | Dimensions | Signals | Why | Effort |
|---|-----------|-----------|---------|-----|--------|
| 32 | **Cohere** | C | `total_ai_cost` | Enterprise AI provider. Usage API for cost tracking. Growing in RAG/search use cases. | 0.5 day |
| 33 | **Mistral** | C | `total_ai_cost` | European AI provider. Usage API. Growing in EU-regulated industries due to data sovereignty. | 0.5 day |
| 34 | **AWS Bedrock** | C | `total_ai_cost` | AWS customers route AI through Bedrock. CloudWatch metrics for cost. Covers the "we don't call OpenAI directly" case. | 1 day |
| 35 | **Azure OpenAI** | C | `total_ai_cost` | Microsoft enterprise customers use Azure OpenAI, not direct OpenAI. Different API surface, different billing. | 1 day |

### Tier 3: Quality & Governance

These extend Q-score and S-score coverage beyond the current connector set.

| # | Connector | Dimensions | Signals | Why | Effort |
|---|-----------|-----------|---------|-----|--------|
| 36 | **Qodo** | Q | `defect_rate_ai`, `ai_test_pass_rate` | Code verification and governance platform ($70M Series B). Provides AI-specific test generation and quality metrics. Only tool that measures AI code quality as a first-class concern. | 1-2 days |
| 37 | **Checkmarx** | S | `spec_security_score`, `code_scanning_score` | Enterprise SAST/DAST. Alternative to 42Crunch and Snyk for organizations with Checkmarx contracts. Common in defense and financial services. | 1 day |
| 38 | **Semgrep** | S | `code_scanning_score` | Open-source static analysis. Growing rapidly as a Snyk alternative. Covers organizations that use open-source security tooling. | 1 day |

### Tier 4: Engineering Intelligence

These are aggregation platforms that could provide multiple signals from a single connection.

| # | Connector | Dimensions | Signals | Why | Effort |
|---|-----------|-----------|---------|-----|--------|
| 37 | **Swarmia** | L, C | `cycle_time_ai`, `hours_saved_monthly` | Engineering intelligence. Already aggregates data from GitHub, Jira, Slack. Could be a one-connector-many-signals source for organizations that use it. | 1-2 days |
| 38 | **Sleuth** | L, R | `cycle_time_ai`, `deploy_frequency`, `cfr_ai` | DORA metrics platform. Directly measures the signals AIEI needs for L and R. Customers already have the data in the format we need it. | 1 day |
| 39 | **Faros AI** | L, C, Q | Multiple | Engineering intelligence platform. Aggregates across 50+ tools. A single Faros connection could feed Q, L, and C simultaneously. | 2 days |

---

## Signal Coverage Matrix

Which signals can come from which connectors (implemented + roadmap):

| Signal | Primary | Alternatives | Roadmap |
|--------|---------|-------------|---------|
| `defect_rate_ai` | SonarQube | - | Qodo, Faros AI |
| `defect_rate_nonai` | (config) | - | Faros AI |
| `ai_test_pass_rate` | Postman, SonarQube | - | Qodo |
| `rework_rate_ai` | GitHub | GitLab | Azure DevOps, Bitbucket |
| `collection_quality` | Postman | - | - |
| `agent_score` | Fern | - | - |
| `cycle_time_ai` | GitHub | GitLab, Linear, Jira, Jellyfish | Azure DevOps, Bitbucket, Swarmia, Sleuth, Faros AI |
| `cycle_time_nonai` | GitHub | GitLab, Linear, Jira | Azure DevOps, Bitbucket, Faros AI |
| `deploy_frequency` | Datadog | Vercel, GitHub Actions | Sleuth |
| `cfr_ai` | Datadog | Dynatrace, OpenTelemetry, Vercel | Sentry, Sleuth |
| `slo_attainment` | Postman, Datadog | Dynatrace, OpenTelemetry | - |
| `uptime_ai` | Datadog | Dynatrace, OpenTelemetry, PagerDuty, ServiceNow, Cloudflare, New Relic, Grafana | Sentry |
| `contract_catch_rate` | Postman | - | - |
| `adaptability` | Inngest | Step Functions, Splunk, Supabase | - |
| `runtime_retry_behavior` | Postman | - | - |
| `runtime_idempotency` | Postman | - | - |
| `error_recovery_quality` | Postman | - | - |
| `error_contract_depth` | Postman | - | - |
| `hours_saved_monthly` | GitHub | GitLab | Swarmia, Faros AI |
| `total_ai_cost` | Portkey | OpenAI, manual `monthlyAiCost` | Cohere, Mistral, AWS Bedrock, Azure OpenAI |
| `spec_security_score` | 42Crunch | - | Checkmarx |
| `dependabot_score` | GitHub | - | Snyk |
| `code_scanning_score` | GitHub | Cloudflare | Snyk, Checkmarx, Semgrep |
| `secret_scanning_score` | GitHub | - | Snyk |

## Adding a Connector

Each connector is a single file in `engine/src/connectors/`. The pattern:

```typescript
import { Connector, ConnectorOutput } from './types.js';

export const myConnector: Connector = {
  name: 'my_tool',
  dimensions: ['R'],
  requiredCredentials: ['apiKey'],
  async collect(config: Record<string, unknown>): Promise<ConnectorOutput> {
    const apiKey = config.apiKey as string;
    // Make API call, return signals
    return {
      signals: { uptime_ai: 0.999 },
      diagnostics: [],
      connected: true,
    };
  },
};
```

Register in `registry.ts`, add the type to `ConnectorConfigs` in `types.ts`, add signal routes if new signals are introduced.

Third-party connectors can also be registered at runtime via the Connector Health Contract system (`POST /v1/connectors/register`).
