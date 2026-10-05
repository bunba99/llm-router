---
name: routing-debug
description: Debug LLM Router request routing — trace how requests flow through tag matching, provider priority, load balancing, circuit breaker, and fallback. Use when requests route to unexpected providers or fail to match.
---

# Routing Debug

How to trace and debug request routing through the LLM Router.

## When to Activate

- Requests route to an unexpected provider or model
- "No model found" or "no provider matched" errors
- Circuit breaker unexpectedly rejecting a healthy provider
- Load balancing not distributing as expected
- Channel fallback not triggering
- Understanding why a specific routing decision was made

## Routing Flow

```
Request enters CatalogService
  → extract provider/model from request body or URL path
  → lookup model in DB catalog
  → check API key permissions (model allowlist, rate limits)
  → resolve provider accounts (priority, is_default)
  → resolve provider endpoints (ordered by latency/health)
  → apply load balance strategy (round_robin | weighted | least_failure)
  → check circuit breaker state
  → if open → try next target
  → if all targets failed → channel fallback
  → execute request on selected target
```

## Key Routing Decisions

### 1. Model Priority (unqualified model names)

When request uses a bare model name (no `provider/` prefix), targets are sorted by descending model config `priority`. Higher priority = preferred.

Code: `src/services/model_service.go:1082` — `orderChatTargetsByModelPriority`

### 2. Provider Account Priority

Within a provider with multiple accounts, sort order:
1. `is_default = true` first
2. Then descending `priority`

Code: `src/services/provider_accounts.go`

### 3. Endpoint Ordering

Dynamic ordering by:
1. Cooling-down endpoints (deprioritized)
2. Degraded endpoints (high latency, recent errors)
3. Ascending average latency

Code: `src/services/provider_endpoints.go`

### 4. Circuit Breaker

States: CLOSED (normal) → OPEN (cooldown) → HALF_OPEN (probing)

- `failure_threshold`: consecutive failures before opening
- `cooldown_seconds`: time in OPEN state before half-open
- `half_open_max_requests`: max probes in half-open state

### 5. Channel Fallback

When no provider matches the model or all targets are unavailable, fall back to providers in `[routing].channel_fallback` order.

## Debugging Techniques

### Enable Request Logging

Check the structured logs (stdout) for routing decisions. Each request logs:
- Model resolution path
- Provider selected
- Account and endpoint chosen
- Circuit breaker state

### Check the Monitor Dashboard

The monitor at `http://localhost:4022` shows invocation history with provider, model, status, and latency per request.

### Verify Model Catalog

```bash
curl http://localhost:18000/v1/models | jq '.data[] | {id, owned_by}'
```

Check that the model exists and is active in the database.

### Test Specific Provider Routes

```bash
# Provider-scoped endpoint — bypasses model priority routing
curl -X POST http://localhost:18000/openrouter/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "glm-4.5-air", "messages": [{"role": "user", "content": "test"}]}'
```

### Check Circuit Breaker State

Circuit breaker state is in-memory (not persisted). Restart clears all breaker state. Check logs for "circuit breaker" entries.

## Key Files

- `src/services/model_service.go` — model resolution, tag matching, routing orchestration
- `src/services/provider_accounts.go` — account priority and token bucket rate limiting
- `src/services/provider_endpoints.go` — endpoint ordering and health tracking
- `src/services/routing_runtime.go` — load balancing, circuit breaker, fallback
- `src/services/catalog_service.go` — main CatalogService orchestrating everything
