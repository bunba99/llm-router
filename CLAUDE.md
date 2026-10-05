# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

```bash
go mod download
go run ./cmd/llm-router              # start backend only
./scripts/start.sh                    # backend + monitor frontend
./scripts/start.sh backend            # backend only
./scripts/start.sh monitor            # monitor frontend only
```

## Test

```bash
go test ./...                              # all tests
go test -race ./...                        # with race detection
go test -cover ./...                       # with coverage
go test ./src/services -run TestOpenAIChatCompletionsUsesModelPriorityForUnqualifiedModel -v  # single test
```

## Architecture

### Entry Point

`cmd/llm-router/main.go` → `src/api/app.go` → `api.Run(ctx)` — chi router, graceful shutdown via signal.NotifyContext.

### Layer Structure (all under `src/`)

| Package | Responsibility |
|---------|---------------|
| `api/` | HTTP routes, auth middleware, session store, health check |
| `services/` | Business logic — `CatalogService` is central (chat completions, embeddings, audio, claude messages, gemini content, monitor queries, pricing, oauth, api keys, provider accounts) |
| `providers/` | Provider adapters via registry pattern — OpenAI-compatible, Gemini, Claude, CLI code executors |
| `config/` | TOML config loading (pelletier/go-toml/v2), model config resolution |
| `db/` | Database store, models, PGX/sqlite session management, Redis client |
| `schemas/` | Shared schema types (Provider, Model, APIKey, MonitorInvocation, OAuthAccount, etc.) |
| `migrate/` | Startup migrations + SQLite bootstrap |
| `logging/` | Structured logging with request context |
| `plugins/` | TTS (Qwen) and ASR (FunASR) plugin integration |

### Key Patterns

- **`CatalogService`** — central service struct with all business logic, wraps DB store
- **Provider registry** — `src/providers/registry.go` maps provider types to client factories (OpenAI-compatible → `newOpenAICompatibleAlias`, Gemini/Claude have native clients, CLI types have their own)
- **Runtime sub-systems** (in `services/`):
  - `routingRuntime` — load balancing (round_robin/weighted/least_failure), circuit breaker, channel fallback
  - `providerAccountRuntime` — per-account token bucket rate limiting, inflight tracking, cooldown
  - `providerEndpointRuntime` — multi-endpoint ordering by latency + retryable error history
  - `providerDiscoveryRuntime` — cached provider model discovery
- **No ORM** — raw SQL queries with `$1`/`$2` parameter binding
- **Multi-protocol** — OpenAI-compatible (`/v1/chat/completions`), Gemini, Claude are all converted to internal OpenAI-compatible calls
- **Config priority** — env var > `router.toml` > default

### Provider Priority (Multi-Level)

The system supports priority at three levels, each independent:

1. **Model config `priority`** — set via `model.config.priority`. When a request uses an unqualified model name (no `provider/` prefix), targets are sorted by descending `priority`. Higher = preferred. See `orderChatTargetsByModelPriority` in `src/services/model_service.go:1082`.

2. **Provider account `accounts[].priority`** — within a provider's `settings.accounts` list, each account has a `priority` field. Accounts are sorted by `is_default` (true first), then descending `priority`. See `src/services/provider_accounts.go`.

3. **Endpoint ordering** — providers can have multiple `api_base_urls` in their settings. These are dynamically ordered by the endpoint runtime: cooling-down endpoints are deprioritized, degraded (high latency) next, then by observed average latency. See `src/services/provider_endpoints.go`.

Additionally, `router.toml` supports `[routing]` section with:
- `[[routing.pairs]]` — strong/weak model pairs for `/route` endpoint
- `load_balance_strategy` — `round_robin` (default), `weighted`, or `least_failure`
- `provider_weights` — per-provider weights for weighted strategy
- `channel_fallback` — ordered list of fallback providers when no match found
- `circuit_breaker` — configurable failure threshold, cooldown, half-open max

### DB

- Default: SQLite (`modernc.org/sqlite`), file at `data/llm_router.db`
- Also supports PostgreSQL via env vars (`LLM_ROUTER_PG_DSN`)
- SQLite bootstrap at startup via `src/migrate/bootstrap.go`

### Monitor Frontend

React + Vite app in `frontend/`. Start with `./scripts/start.sh monitor` or `cd frontend && npm run dev`.

### Deploy

```bash
cd scripts
./create_release.sh       # build release artifacts
./import-db.sh            # import SQLite to PostgreSQL
```
