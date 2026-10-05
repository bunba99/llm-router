---
name: router-configuration
description: Configure LLM Router — router.toml, providers, models, routing pairs, load balancing, circuit breaker, env vars, and server settings. Use when adding providers, setting up routing, or modifying configuration.
---

# Router Configuration

Configuration reference for the LLM Router project.

## When to Activate

- Adding or modifying providers in `router.toml`
- Setting up routing pairs, load balancing, or fallback chains
- Configuring model auto-update or pricing sources
- Adding environment variables for API keys
- Debugging configuration or startup issues
- Setting up multi-account provider configurations

## Configuration Priority

Env vars > `router.toml` > defaults. Always prefer `api_key_env` over hardcoded `api_key` in provider configs.

## Provider Configuration

### Remote API Provider (standard)

```toml
[[providers]]
name = "openai"
type = "openai"
api_key_env = "OPENAI_API_KEY"
base_url = "https://api.openai.com/v1"
is_active = true
```

### Remote API Provider (multi-account)

```toml
[[providers]]
name = "openai"
type = "openai"
[providers.settings]
[[providers.settings.accounts]]
api_key_env = "OPENAI_API_KEY_1"
is_default = true
priority = 100
[[providers.settings.accounts]]
api_key_env = "OPENAI_API_KEY_2"
priority = 50
```

### Local CLI Provider

```toml
[[providers]]
name = "claude_code_cli"
type = "claude_code_cli"
[providers.settings]
executable = "claude"
permission_mode = "bypassPermissions"
workspace_root = "/abs/path/to/project"
default_workspace_path = "/abs/path/to/project"
enforce_workspace_scope = true
```

Supported CLI types: `claude_code_cli`, `codex_cli`, `opencode_cli`, `kimi_code_cli`, `qwen_code_cli`.

### Local Inference Provider

```toml
[[providers]]
name = "ollama"
type = "ollama"
base_url = "http://localhost:11434"
```

Supported local types: `ollama`, `vllm`, `transformers`.

## Routing Configuration

### Routing Pairs (for /route endpoint)

```toml
[routing]
default_pair = "gemini-3"
load_balance_strategy = "round_robin"  # round_robin | weighted | least_failure
channel_fallback = ["openrouter", "aihubmix"]

[[routing.pairs]]
name = "gemini-3"
strong_model = "gemini/gemini-3.1-pro"
weak_model = "gemini/gemini-3-flash"
```

### Load Balance Strategies

- `round_robin` — cycles through available targets
- `weighted` — uses `[routing.provider_weights]` for proportional distribution
- `least_failure` — prefers providers with fewer recent failures

### Circuit Breaker

```toml
[routing.circuit_breaker]
enabled = true
failure_threshold = 3
cooldown_seconds = 30
half_open_max_requests = 1
```

## Model Auto-Update

```toml
[model_updates]
enabled = true
startup_sync = true
interval_hours = 24
default_new_model_active = true
removed_model_policy = "disable_auto_managed"
source_dir = "data/model_sources"
startup_delay_seconds = 5
```

## Server Configuration

```toml
[server]
host = "0.0.0.0"
port = 18000
```

Env var equivalents: `LLM_ROUTER_HOST`, `LLM_ROUTER_PORT`.

## Database

- Default: SQLite at `data/llm_router.db` (or `LLM_ROUTER_SQLITE_PATH`)
- PostgreSQL: set `LLM_ROUTER_PG_DSN`

## Pricing Sources

```bash
export LLM_ROUTER_PRICING_SOURCE_URLS='{
  "openai":"https://example.com/openai-pricing.json",
  "claude":"https://example.com/claude-pricing.json"
}'
```

Supports `file://` and absolute paths for local pricing files.

## Key Files

- `router.toml` — main configuration (repo root)
- `.env` — API keys and env vars (repo root, gitignored)
- `.env.example` — template for .env
- `src/config/` — Go config loading and model resolution
- `data/model_sources/*.json` — versioned model list fallbacks
