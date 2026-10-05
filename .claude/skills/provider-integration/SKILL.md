---
name: provider-integration
description: Add a new AI provider to LLM Router. Covers the registry pattern, settings struct, adapter implementation, model discovery, and wiring into CatalogService. Use when integrating a new external API, local CLI tool, or inference backend.
---

# Provider Integration

How to add a new provider type to the LLM Router codebase.

## When to Activate

- Adding a new remote API provider (e.g., a new OpenAI-compatible service)
- Adding a new local CLI tool provider
- Adding a new local inference backend
- Modifying an existing provider's adapter or settings

## Architecture

```
src/providers/
├── registry.go          # Provider factory registry (map type → factory)
├── openai_compatible.go # Generic OpenAI-compatible client
├── claude.go            # Anthropic Messages API client
├── gemini.go            # Google Gemini client
├── codex_cli.go         # Codex CLI wrapper
└── ...
```

## Adding a New Provider

### 1. Define Settings Struct (if needed)

In `src/providers/`, add provider-specific settings. For most OpenAI-compatible providers, no new struct is needed — use the generic settings.

### 2. Create the Client Factory

In `src/providers/registry.go`, add a case to the factory switch:

```go
case "newprovider":
    return newOpenAICompatibleAlias(cfg)
```

For non-OpenAI-compatible providers, implement a dedicated client implementing the relevant interface.

### 3. OpenAI-Compatible Providers (Simplest)

If the provider uses an OpenAI-compatible API:

- Add a `[[providers]]` entry in `router.toml` with `type = "openai"` (uses existing adapter)
- Or register a named type if it needs special handling (base URL defaults, header injection, etc.)

Look at `src/providers/openai_compatible.go` for the generic adapter.

### 4. Non-OpenAI Providers

Implement a provider struct that satisfies the client interface:

- `ChatCompletion(ctx, req) (resp, err)` — for chat
- Optionally: `Embeddings`, `Models`, audio endpoints

Reference implementations:
- `src/providers/claude.go` — Anthropic Messages API with format translation
- `src/providers/gemini.go` — Gemini API with format translation
- `src/providers/codex_cli.go` — CLI wrapper pattern (shells out to local binary)

### 5. Model Discovery (Optional)

If the provider has a `/v1/models` endpoint, it works automatically via the OpenAI-compatible path. For providers needing custom model fetching, implement in `src/services/model_service.go`.

For providers without stable model list APIs, add a JSON fallback file to `data/model_sources/<provider>.json`.

### 6. Pricing Data (Optional)

Add pricing data in `data/model_sources/` or configure a remote pricing source URL via `LLM_ROUTER_PRICING_SOURCE_URLS`.

## Provider Settings Reference

Common settings fields in `[providers.settings]`:

| Field | Type | Notes |
|-------|------|-------|
| `endpoint` | string | Custom API endpoint path |
| `accounts` | array | Multi-account with priority/API key per account |
| `api_base_urls` | array | Multiple base URLs for endpoint-level routing |
| `executable` | string | CLI tool binary name (CLI types only) |
| `timeout` | int | Request timeout in seconds (CLI types) |
| `workspace_root` | string | Permission boundary (CLI types) |
| `enforce_workspace_scope` | bool | Reject paths outside workspace_root |

## Registry Pattern

The registry in `registry.go` maps provider type strings to factory functions. Adding a new type requires:
1. A factory function `func(cfg ProviderConfig) (Client, error)`
2. A case in the switch statement
3. The type string used in `router.toml` `[[providers]].type`

## Key Files

- `src/providers/registry.go` — provider factory registry
- `src/providers/openai_compatible.go` — generic OpenAI-compatible adapter
- `src/providers/claude.go` — Anthropic adapter (format translation reference)
- `src/providers/gemini.go` — Gemini adapter
- `src/providers/codex_cli.go` — CLI wrapper pattern
- `src/services/model_service.go` — model discovery and catalog logic
- `src/schemas/` — shared type definitions
