# AIEI Connector Registry

27 data connectors across 4 tiers. Any combination produces valid scores. Mock data fills every gap.

## Dual-Mode Architecture

Every connector follows the same pattern:
```
hasCred(key) -> Real API Adapter -> Normalize to AIEI Schema
     | (no cred)
Mock Data Server -> Same AIEI Schema
```

`hasCred(key)` validates: key present, non-empty after trimming, doesn't start with `your_`.

## Starter Tier (2) - Zero External Dependencies

| # | Connector | Env Key | Dimensions | Signals |
|---|---|---|---|---|
| 1 | Postman API | `postman_api_key` | R, Q | SLO attainment, contract catch rate, test pass rates |
| 2 | Postman Monitor | `postman_api_key` | R, Q | SLO from scheduled runs, assertion pass rates |

## Professional Tier (3) - Tools Most Orgs Already Have

| # | Connector | Env Key | Dimensions | Signals |
|---|---|---|---|---|
| 3 | GitHub | `github_token` | Q, L, C | Rework rate, PR cycle times (AI vs non-AI), DORA throughput, hours saved |
| 4 | SonarQube | `sonarqube_token` | Q | Defect rates, quality gate status, code coverage |
| 5 | Datadog | `datadog_api_key` | R, L | CFR from deploy events, uptime from SLO status, DORA throughput fallback |

## Thesis Tier (2) - Novel Data Sources

| # | Connector | Env Key | Dimensions | Signals |
|---|---|---|---|---|
| 6 | Entire.io | `entireio_api_key` | R | AI adaptability (agent session success rate) |
| 7 | DX | `dx_api_key` | L, Cross | Cognitive load index, productivity paradox (35% perceived vs 18% measured) |

## Enterprise Tier - Cloud Monitoring (3)

| # | Connector | Env Keys | Dimensions | Signals |
|---|---|---|---|---|
| 8 | AWS CloudWatch | `aws_access_key_id`, `aws_secret_access_key`, `aws_region` | R, C | CloudWatch metrics, cost explorer |
| 9 | Azure Monitor | `azure_tenant_id`, `azure_client_id`, `azure_client_secret` | R, C | Monitor metrics, cost management |
| 10 | GCP Cloud Monitoring | `gcp_project_id`, `gcp_service_account_key` | R, C | Cloud monitoring, billing |

## Enterprise Tier - Incident & CDN (3)

| # | Connector | Env Keys | Dimensions | Signals |
|---|---|---|---|---|
| 11 | PagerDuty | `pagerduty_api_key` | R | Incident frequency, MTTR, on-call burden |
| 12 | ServiceNow | `servicenow_instance`, `servicenow_username`, `servicenow_password` | R, L | ITSM incident correlation, change request cycle times |
| 13 | Cloudflare | `cloudflare_api_token`, `cloudflare_zone_id` | R | Edge reliability, WAF events, TTFB, error rates |

## Enterprise Tier - DevOps & Project Management (4)

| # | Connector | Env Key | Dimensions | Signals |
|---|---|---|---|---|
| 14 | Vercel | `vercel_token` | L, R | Deploy times (preview to prod), edge function errors, cold starts |
| 15 | Supabase | `supabase_access_token` | R, C | DB uptime, query error rates, usage-based cost |
| 16 | Linear | `linear_api_key` | L, C | Issue cycle time, project velocity, effort estimation |
| 17 | Jira | `jira_api_token`, `jira_email`, `jira_base_url` | L, R | Sprint velocity, issue resolution |

## Enterprise Tier - AI Providers (4)

| # | Connector | Env Keys | Dimensions | Signals |
|---|---|---|---|---|
| 18 | OpenAI | `openai_api_key`, `openai_org_id` | C, R, Q | Token spend, API errors/latency, model output quality |
| 19 | Anthropic | `anthropic_api_key` | C, R | Token spend, API errors/latency |
| 20 | Google AI (Gemini) | `google_ai_api_key` | C, R | Token spend, API errors/latency |
| 21 | Portkey | `portkey_api_key` | C, R | AI gateway metrics, multi-model cost aggregation |

## Enterprise Tier - Observability & Engineering Intelligence (4)

| # | Connector | Env Keys | Dimensions | Signals |
|---|---|---|---|---|
| 22 | GitLab | `gitlab_token`, `gitlab_project_id` | Q, L, R, C | Full SDLC metrics, CI/CD pipeline data |
| 23 | Splunk | `splunk_host`, `splunk_token` | R, Q, L | Log analytics, error rates, deployment tracking |
| 24 | New Relic | `newrelic_api_key`, `newrelic_account_id` | R, Q, L, C | Full-stack observability, cost allocation |
| 25 | Jellyfish | `jellyfish_api_key` | L, C, Q | Engineering intelligence, resource allocation |

## Identified Additions (Not Yet Wired)

| # | Connector | Dimensions | Signals | Notes |
|---|---|---|---|---|
| 26 | Dynatrace | R, Q, L | Response time, failure rate, SLO, deployment frequency | Bidirectional MCP (14 tools). First MCP-native connector. |
| 27 | Qodo | Q | Violation rate per PR, merged-violation rate, rule adoption %, standards health | $70M Series B. Multi-agent code review with enforcement. Layer 1 feeding AIEI Layers 2-4. |

## Coverage by Dimension

| Dimension | Connector Count | Primary Sources |
|---|---|---|
| R (Reliability) | 17 | CloudWatch, Azure, GCP, Datadog, New Relic, PagerDuty |
| Q (Quality) | 9 | GitHub, SonarQube, GitLab, Qodo |
| L (Lead Time) | 12 | GitHub, DX, GitLab, Linear, Jira |
| C (Cost Efficiency) | 13 | Cloud billing, OpenAI, Anthropic, Google AI, Portkey |

## Progressive Connection Model

| Configuration | Real Signals | Everything Else |
|---|---|---|
| Nothing | - | All mock (demo mode) |
| Just GitHub | Q-Rework, L-Cycle, C-Hours | mock |
| + SonarQube | + Q-Defects | mock |
| + Datadog | + R-CFR, R-Uptime | mock |
| + Postman Monitor | + R-SLO, Q-TestPass | mock |
| + Entire.io | + R-Adaptability | mock |
| + DX | + L-CognitiveLoad | mock |
| All configured | Full coverage | - |

Scoring math is identical regardless of data source. The difference is provenance, not structure.
