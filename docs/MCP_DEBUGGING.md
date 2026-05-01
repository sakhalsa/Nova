# MCP Debugging

This guide mirrors Stripe's MCP debugging pattern: run the server locally, inspect tools with MCP Inspector, and verify the exact tool surface before connecting an agent.

## Build

```bash
npm run build --workspace=mcp-server
```

## Run With MCP Inspector

```bash
npx @modelcontextprotocol/inspector node mcp-server/dist/server.js --read-only
```

## Run With Tool Allowlist

Use `--tools` to expose only specific tools to an agent:

```bash
npx @modelcontextprotocol/inspector node mcp-server/dist/server.js --read-only --tools=aiei_query,aiei_connectors,aiei_signals,aiei_validate
```

## Local Agent Config

```json
{
  "mcpServers": {
    "aiei": {
      "command": "npx",
      "args": [
        "@postmanlabs/aiei-mcp",
        "--stdio",
        "--read-only",
        "--tools=aiei_score,aiei_query,aiei_connectors,aiei_signals,aiei_validate,aiei_formula"
      ]
    }
  }
}
```

## Tool Surface

| Tool | Purpose | Safe in `--read-only` |
|------|---------|-----------------------|
| `aiei_score` | Run assessment and return score JSON | Yes |
| `aiei_report` | Generate HTML report | Yes, unless `output_path` is provided |
| `aiei_query` | Query dimensions, weights, connectors, formula, signals, status | Yes |
| `aiei_connectors` | List connectors and required credentials | Yes |
| `aiei_signals` | List signal descriptors and AX pillar mapping | Yes |
| `aiei_formula` | Return scoring formulas and modifiers | Yes |
| `aiei_validate` | Validate config shape and credential presence | Yes |
| `aiei_benchmarks` | Return benchmark data | Yes |

## Read-Only Mode

`--read-only` prevents filesystem writes through MCP tools. Specifically, `aiei_report` rejects `output_path` and returns HTML inline instead.

This matters for enterprise agent environments where a tool should be allowed to inspect and report but not write artifacts unless explicitly permitted.

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Inspector shows no tools | Server failed to start | Run `npm run build --workspace=mcp-server`, then retry |
| Tool missing | `--tools` allowlist excluded it | Add the tool name to the comma-separated allowlist |
| `aiei_validate` reports missing env vars | `.aiei.json` uses `$ENV_VAR` placeholders | Export the env vars or replace placeholders with secret manager-injected values |
| `aiei_score` returns config error | No `.aiei.json` in working directory | Pass `config_path` or run `aiei init` first |
| `aiei_report` rejects output path | Server started with `--read-only` | Omit `output_path` or run without `--read-only` in trusted local context |

## Notes

AIEI MCP tools are read-heavy by design. Scoring should not require write access to customer systems. If a connector or workflow appears to require write permissions, treat that as a connector or deployment-design issue, not an AIEI requirement.
