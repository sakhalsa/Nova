# AIEI Connector Scope Reference

This document lists the recommended minimum permissions for each AIEI connector. The goal is Stripe-style least privilege: give AIEI read-only access to the signals it scores, not broad admin access.

Use read-only tokens wherever the provider supports them. AIEI should not need write, delete, billing admin, user admin, or deployment permissions to run an assessment.

## Quick Rules

- Prefer service accounts over personal tokens.
- Prefer read-only scopes over admin scopes.
- Prefer repository/project-level tokens over organization-wide tokens when possible.
- Rotate tokens used for trials.
- Store tokens in environment variables or a secrets manager. Do not commit them in `.aiei.json`.
- Run `aiei validate` before `aiei score` to confirm credentials are present.

## Connector Scopes

| Connector | AIEI Signals | Recommended Minimum Access | Avoid |
|-----------|--------------|----------------------------|-------|
| GitHub | `rework_rate_ai`, `cycle_time_ai`, `cycle_time_nonai`, `hours_saved_monthly`, `review_overhead_hours_monthly`, `dependabot_score`, `code_scanning_score`, `secret_scanning_score` | Fine-grained PAT or GitHub App with repository metadata read, pull requests read, actions read, code scanning alerts read, Dependabot alerts read, secret scanning alerts read. Limit to selected repos. | `repo` all-repo classic token where fine-grained token works, admin/org owner scopes, workflow write. |
| GitLab | `rework_rate_ai`, `cycle_time_ai`, `cycle_time_nonai`, `hours_saved_monthly`, `review_overhead_hours_monthly` | Project or group access token with `read_api` and project read access for merge requests and pipelines. | `api` write/admin permissions if `read_api` is enough. |
| Postman | `slo_attainment`, `contract_catch_rate`, `ai_test_pass_rate`, `collection_quality`, runtime/error-contract signals | Postman API key scoped to the workspace containing collections/monitors used for assessment. Read-only workspace role where available. | Workspace admin unless needed to create/update assets. |
| Grafana | `uptime_ai` | Service account token with Viewer role and datasource query access for the monitored datasource. | Editor/Admin role. |
| Datadog | `cfr_ai`, `uptime_ai`, `slo_attainment`, `deploy_frequency` | API key + application key with read access to SLOs, monitors/events, deployments, and metrics. | Write monitors, dashboard admin, org management. |
| SonarQube | `defect_rate_ai` | User/project token with Browse permission and read access to measures/issues for selected project. | Administer System, project admin. |
| 42Crunch | `spec_security_score` | API token with read access to API security audit results for selected APIs/specs. | Organization admin or write access to API definitions. |
| PagerDuty | `uptime_ai` | REST API token with read-only access to incidents, services, and escalation metadata. | Incident write/manage users. |
| Cloudflare | `uptime_ai`, `code_scanning_score` | API token limited to selected zone with Analytics Read and Firewall/WAF Events Read. | Zone edit, DNS edit, account admin. |
| New Relic | `uptime_ai` | User or ingest/query key with NerdGraph read access to the relevant application/entity. | Account admin, write settings. |
| Splunk SignalFx | `adaptability` | Access token with read-only detector/metric query access for relevant org/project. | Detector write/admin. |
| ServiceNow | `uptime_ai` | Integration user with table read access to incidents/problems/service records used for uptime proxy. | ITIL admin, record write/delete. |
| Vercel | `cfr_ai`, `deploy_frequency` | Token with read access to selected project deployments. | Team/project admin or deploy/write permissions. |
| Supabase | `adaptability` | Access token with project read access for health/log signals used by the connector. | Database write/admin. |
| Linear | `cycle_time_ai`, `cycle_time_nonai` | API key with read access to issues, comments, cycles, and projects. | Write/admin workspace permissions. |
| Jira | `cycle_time_ai`, `cycle_time_nonai` | API token for a user/service account with Browse Projects and issue read access for target projects. | Project admin, issue write/delete. |
| Jellyfish | `cycle_time_ai` | API key with read access to delivery/engineering metrics. | Administrative or write permissions. |
| OpenAI | `total_ai_cost` | Admin/usage-read credential capable of reading usage and cost data. If unavailable, provide monthly AI cost manually in config. | Model invocation keys when only usage/cost is needed. |
| Anthropic | Diagnostics only today; C-score cost via Portkey/manual config | Model list/read connectivity token. Anthropic does not expose public cost data through this connector today. | Production model invocation keys when only usage/cost is needed. |
| Google AI | Diagnostics only today; C-score cost via Portkey/manual config | Model list/read connectivity token. Google AI direct cost data is not routed by this connector today. | Owner/editor cloud roles. |
| Portkey | `total_ai_cost` | API key with read access to gateway usage/cost analytics. Preferred over individual provider keys when Portkey is the gateway. | Gateway configuration write/admin. |
| Fern | `agent_score` | Token with read access to docs/API agent readiness score for the target org/project. | Docs write/admin. |
| GitHub Actions | `deploy_frequency` | Fine-grained PAT or GitHub App with actions/workflow runs read for selected repos. | Workflow write, repo admin. |
| Dynatrace | `cfr_ai`, `uptime_ai`, `slo_attainment` | API token with read access to metrics, problems, entities, and SLOs. | Settings write/admin scopes. |
| OpenTelemetry | `cfr_ai`, `uptime_ai`, `slo_attainment` | Read/query access to Prometheus-compatible endpoint or metrics backend. Bearer/basic credentials should be query-only. | Remote write or admin credentials. |
| Inngest | `adaptability` | Signing/API key with read access to function/workflow run statistics. | Function deploy/manage permissions. |
| AWS Step Functions | `adaptability` | IAM principal with `states:ListExecutions`, `states:DescribeExecution`, `states:GetExecutionHistory`, and optional `states:ListStateMachines` scoped to target state machine ARNs. | `states:*`, IAM admin, Lambda write/deploy. |

## Trial Access Pattern

For a customer trial, ask for the smallest useful connector set first:

1. GitHub read-only token for one or two repos.
2. Postman API key for one workspace.
3. One reliability source (Datadog, Dynatrace, OpenTelemetry, Grafana, PagerDuty, or Cloudflare).
4. Optional cost source (Portkey/OpenAI) or manual `monthlyAiCost`.

This usually scores Q, L, R, and C directionally without requiring broad enterprise access.

## Security Note

AIEI does not need write access to customer systems for scoring. If a connector appears to require write access, treat it as a connector bug or provider limitation and document the exception before running it in a customer environment.
