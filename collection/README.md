# AIEI Postman Collections

The source of truth. All other delivery mechanisms (npm, MCP, GitHub Action, Docker) wrap these collections.

## Files

| File | Purpose |
|------|---------|
| `01 AIEI Setup & Configuration.postman_collection.json` | Setup Wizard, connector registry, auto-detection |
| `02 AIEI Scoring Pipeline.postman_collection.json` | Core scoring: R, Q, L, C dimensions + 38 connectors |
| `03 AIEI Executive Package.postman_collection.json` | Reports, dashboards, export |
| `04 AIEI Operations.postman_collection.json` | Monitors, trend analysis, maturity |
| `05 AIEI Mock Data Server.postman_collection.json` | Mock server for demo/fallback mode |
| `AIEI_Environment_Template.postman_environment.json` | All ~80 environment variables with descriptions |

## Quick Start

1. Import all 5 collections + environment template into Postman
2. Run `01 Setup & Configuration` - auto-detects configured connectors
3. Run `02 Scoring Pipeline` - scores all four dimensions
4. Run `03 Executive Package` - generates report

## Minimum Viable Score (4 env vars)

```
postman_api_key                 -> R-Score (monitors) + Q-Score (collection quality)
aiei_target_collection_id       -> Q-Score (collection quality - thesis connector)
github_token + github_owner     -> L-Score (PR cycle time) + Q-Score (rework)
openai_api_key                  -> C-Score (LLM cost)
```

## 38 Connectors

See `02 Scoring Pipeline` pre-request scripts for full implementation. All connectors auto-detect credentials and fall back to mock data when not configured.
