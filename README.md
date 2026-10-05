<div align="center">

# LLM Router

**One endpoint, every AI model. Route requests across 30+ providers with intelligent load balancing, tag-based routing, and real-time monitoring.**

**Connect any OpenAI-compatible client to OpenAI, Claude, Gemini, GLM, Qwen, Kimi, DeepSeek, OpenRouter, local models, and CLI code executors — all through a single unified API.**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Frinbarpen%2Fllm-router&env=LLM_ROUTER_HOST,LLM_ROUTER_PORT&project-name=llm-router-monitor&framework=other)
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/rinbarpen/llm-router)

[🚀 Quick Start](#-quick-start) • [💡 Features](#-key-features) • [📖 Docs](docs/) • [🌐 Providers](#-supported-providers)

[🇨🇳 中文文档](README.md)

</div>

---

## 🤔 Why LLM Router?

**Stop juggling multiple SDKs, API keys, and rate limits:**

- ❌ Every provider has its own SDK, format, and quirks
- ❌ Rate limits stop you mid-task with no fallback
- ❌ No unified view of costs, usage, and error rates across providers
- ❌ Local inference tools (Ollama, vLLM) and CLI agents (Claude Code, Codex) each need separate integration
- ❌ Team API key management becomes a spreadsheet nightmare
- ❌ Agent systems can't dynamically route between strong/weak models

**LLM Router solves this:**

- ✅ **One OpenAI-compatible API** — Drop-in replacement for any OpenAI SDK client
- ✅ **Intelligent routing** — Tag-based, priority-based, load-balanced, with circuit breaker fallback
- ✅ **Multi-protocol translation** — OpenAI, Gemini, Claude formats all normalized internally
- ✅ **Local + remote hybrid** — Mix remote APIs with local Ollama/vLLM/Transformers and CLI code executors
- ✅ **Fine-grained access control** — Per-key model allowlists, rate limits, IP ranges, quota tracking
- ✅ **Built-in monitoring** — React dashboard with invocation history, cost tracking, and provider health

---

## 🔄 How It Works

```
┌──────────────────┐
│  Your App / CLI  │  (OpenAI SDK, langchain, custom client...)
│  Any HTTP client │
└────────┬─────────┘
         │ http://localhost:18000/v1
         ↓
┌────────────────────────────────────────────────────┐
│              LLM Router (Go Backend)               │
│  • Tag-based model selection                       │
│  • Provider priority + load balancing              │
│  • Circuit breaker (cooldown / half-open)          │
│  • Format translation (OpenAI ↔ Claude ↔ Gemini)   │
│  • API key auth + session management               │
│  • Rate limiting + quota tracking                  │
└────────┬───────────────────────────────────────────┘
         │
         ├─→ [Remote APIs]    OpenAI, Claude, Gemini, GLM, Qwen,
         │                    Kimi, DeepSeek, OpenRouter, Groq, xAI...
         │
         ├─→ [Local CLI]      Claude Code CLI, Codex CLI, OpenCode CLI,
         │                    Kimi Code CLI, Qwen Code CLI
         │
         └─→ [Local Infer]    Ollama, vLLM, Transformers

Monitor: React dashboard at http://localhost:4022 — usage, costs, provider health
```

---

## ⚡ Quick Start

**1. Clone and install dependencies:**

```bash
git clone https://github.com/rinbarpen/llm-router.git
cd llm-router
go mod download
```

**2. Configure your API keys:**

```bash
cp .env.example .env
# Edit .env — add keys for providers you want to use
```

**3. Start the server + monitor:**

```bash
./scripts/start.sh
```

Backend at `http://localhost:18000` · Monitor at `http://localhost:4022`

**Verify it works:**

```bash
curl http://localhost:18000/health

# Test a chat completion (localhost skips auth)
curl -X POST http://localhost:18000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "openai/gpt-5.1", "messages": [{"role": "user", "content": "Hello"}]}'
```

> **Using it as an OpenAI drop-in:** Set `baseURL` to `http://localhost:18000/v1` in any OpenAI SDK client. See [Quick Start Guide](docs/QUICKSTART.md) for details.

---

## 🌐 Supported Providers

### 🔑 Remote API Providers

| Provider | Type | Notes |
|----------|------|-------|
| **OpenAI** | `openai` | GPT-5.2, GPT-5.1, GPT-4o, etc. |
| **Azure OpenAI** | `azure_openai` | Azure-hosted OpenAI models |
| **Claude (Anthropic)** | `claude` | Opus 4.7, Sonnet 4.6, Haiku 4.5 |
| **Gemini (Google)** | `gemini` | Gemini 3.1 Pro, 3 Flash, 2.5 Pro/Flash |
| **DeepSeek** | `deepseek` | DeepSeek Chat, DeepSeek Reasoner |
| **GLM (Zhipu)** | `glm` | GLM-5.1, GLM-5, GLM-4.7 (CN + Global) |
| **Qwen (Alibaba)** | `qwen` | Qwen Plus, Max, Turbo, Qwen3 TTS |
| **Kimi (Moonshot)** | `kimi` | Kimi K2.5, K2 Flash |
| **Doubao (ByteDance)** | `doubao` | Doubao Pro |
| **MiniMax** | `minimax` | MiniMax M2.7, M2.5 |
| **OpenRouter** | `openrouter` | 100+ models via unified API |
| **Groq** | `groq` | Llama, GPT-OSS on fast inference |
| **SiliconFlow** | `siliconflow` | DeepSeek V3, Qwen series |
| **AiHubMix** | `aihubmix` | API gateway |
| **Volcengine** | `volcengine` | Doubao on Volcengine |
| **xAI (Grok)** | `xai` | Grok models |
| **HuggingFace** | `huggingface` | Inference API |

All remote providers support streaming, and most support vision/multi-modal capabilities.

### 💻 Local CLI Code Executors

Use your existing CLI tool subscriptions — LLM Router wraps them as API endpoints:

| Provider | Type | Notes |
|----------|------|-------|
| **Claude Code CLI** | `claude_code_cli` | Uses local `claude` binary with your login session |
| **Codex CLI** | `codex_cli` | Uses local `codex` binary (OpenAI Responses API) |
| **OpenCode CLI** | `opencode_cli` | Uses local `opencode` binary |
| **Kimi Code CLI** | `kimi_code_cli` | Uses local Kimi Code binary |
| **Qwen Code CLI** | `qwen_code_cli` | Uses local Qwen Code binary |

Supports workspace scoping, sandbox modes, and permission policy per provider.

### 🏠 Local Inference Services

| Provider | Type | Notes |
|----------|------|-------|
| **Ollama** | `ollama` | Local LLM inference |
| **vLLM** | `vllm` | High-throughput local inference |
| **Transformers** | `transformers` | HuggingFace local pipeline |

---

## 💡 Key Features

| Feature | What It Does | Why It Matters |
|---------|--------------|----------------|
| 🔌 **Unified OpenAI API** | Single `/v1/chat/completions` endpoint for all providers | Drop-in replacement — no SDK changes needed |
| 🏷️ **Tag-Based Routing** | Route by task tags (`coding`, `high-quality`, `fast`) | Agent systems auto-select the right model |
| ⚖️ **Load Balancing** | Round-robin, weighted, or least-failure across providers | Maximize throughput, minimize latency |
| 🔥 **Circuit Breaker** | Auto-cooldown failing providers, half-open retry | Graceful degradation, no cascading failures |
| 🔄 **Channel Fallback** | Ordered fallback chain when no provider matches | Requests never fail silently |
| 🔑 **API Key Management** | Per-key model allowlists, rate limits, IP ranges, quotas | Safe multi-user and team deployments |
| 📊 **Usage Monitor** | React dashboard with invocations, cost tracking, errors | Full visibility across all providers |
| 🔄 **Model Auto-Update** | Sync model lists from provider APIs on schedule | Catalog stays current without manual edits |
| 💰 **Pricing Tracking** | Built-in pricing DB with remote source support | Estimate costs, track spending per model |
| 📡 **Streaming** | SSE streaming for chat completions | Real-time token-by-token output |
| 🖼️ **Multi-Modal** | Vision, audio, video capability tags | Route to the right model for each content type |
| 🏠 **Local + Remote Hybrid** | Mix cloud APIs with local Ollama/vLLM/CLI tools | Use subscriptions, free tiers, and local models together |

<details>
<summary><b>📖 Feature Details</b></summary>

### 🔌 Unified OpenAI-Compatible API

All providers speak one protocol. Set `baseURL: "http://localhost:18000/v1"` and use any OpenAI SDK — Python, JS, langchain, etc. Models are referenced as `provider/model` (e.g., `openai/gpt-5.1`, `claude/claude-opus-4-7`). Provider-prefixed paths like `/openrouter/v1/chat/completions` are also supported, where the model field only needs the model name.

### 🏷️ Tag-Based Intelligent Routing

Assign tags to models (`coding`, `vision`, `high-quality`, `fast`, `reasoning`) and route requests by tag. The system selects the best available model matching your constraints:

```bash
curl -X POST http://localhost:18000/route/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "query": {"tags": ["coding", "high-quality"]},
    "request": {"prompt": "Write a quicksort in Python"}
  }'
```

### ⚖️ Multi-Level Priority System

Three independent priority layers control routing:

1. **Model priority** — higher priority targets preferred for unqualified model names
2. **Account priority** — within a provider, accounts sorted by `is_default` then priority
3. **Endpoint ordering** — dynamic ordering by latency, error history, and cooldown state

Supported load balance strategies: `round_robin`, `weighted`, `least_failure`.

### 🔥 Circuit Breaker + Channel Fallback

Configurable failure thresholds, cooldown periods, and half-open probing. When a provider fails, it enters cooldown — requests route to the next available target. Channel fallback provides an ordered list of fallback providers when no direct match is found:

```toml
[routing]
channel_fallback = ["openrouter", "aihubmix"]
```

### 🔑 Fine-Grained Access Control

Each API key can be scoped with:
- Allowed models and providers
- Request rate limits (max requests per time window)
- IP address ranges
- Token/token quota
- Parameter constraints (max_tokens caps, temperature limits)
- Expiration dates

Localhost requests bypass authentication by default.

### 🔄 Model Auto-Update

Scheduled sync from provider APIs keeps your model catalog current. New models are auto-enabled; removed models are disabled (not deleted). Configure in `router.toml`:

```toml
[model_updates]
enabled = true
startup_sync = true
interval_hours = 24
```

Providers without stable models APIs use versioned fallback files in `data/model_sources/*.json`.

### 📊 Monitoring Dashboard

React + Vite dashboard at `http://localhost:4022` provides:
- Invocation history with request/response inspection
- Per-model and per-provider usage statistics
- Cost estimation from pricing data
- Provider health status
- Manual model sync triggers

</details>

---

## 🎯 Use Cases

### Case 1: Multi-Provider Agent System

**Problem:** Your AI agent needs different models for different tasks — planning needs Opus, execution needs fast/cheap models, vision tasks need multimodal support.

**Solution:**
```
Route /route endpoint:
  role=planner  → claude/claude-opus-4-7     (best reasoning)
  role=worker   → deepseek/deepseek-v4-pro   (strong, cost-effective)
  task=vision   → openai/gpt-5.1             (reliable vision)
  task=summary  → gemini/gemini-3-flash      (fast, free tier)

Fallback chain:
  Primary fails → Circuit breaker opens → Channel fallback to OpenRouter
```

### Case 2: Maximize Existing Subscriptions

**Problem:** You have Claude Pro and Codex subscriptions, but quotas reset on different schedules and you keep hitting limits.

**Solution:**
```
Model priority routing:
  1. claude_code_cli/opus  (your Claude Pro — use quota first)
  2. codex_cli/gpt-5.3     (your Codex — fallback #1)
  3. deepseek/v4-pro       (cheap API — fallback #2)
  4. openrouter/auto       (free models — emergency fallback)

Local CLI providers use your existing login sessions — no extra API keys.
```

### Case 3: Team API Management

**Problem:** 10 developers, 6 providers, 30 models — you need per-person access control without sharing admin keys.

**Solution:**
```
Admin creates scoped API keys:
  intern-key:    models=gemini/gemini-3-flash, rate=50/hour
  developer-key: models=coding-tag, rate=500/hour
  lead-key:      all models, no rate limit

All requests through one endpoint: http://llm-router.internal:18000/v1
Usage tracked per key in the monitor dashboard.
```

### Case 4: Local + Cloud Hybrid

**Problem:** Sensitive code stays local, but you want cloud models for general tasks.

**Solution:**
```
Sensitive code tasks    → ollama/gpt-oss-20b        (local, air-gapped)
General coding          → openai/gpt-5.1            (cloud)
Quick iterations        → groq/llama-3.3-70b         (fast cloud inference)
Documentation           → claude/claude-sonnet-4-6   (best writing)

All through the same /v1/chat/completions endpoint.
```

---

## 📖 API Usage

### OpenAI-Compatible Chat Completions

```bash
# Standard endpoint — model uses provider/model format
curl -X POST http://localhost:18000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-5.1",
    "messages": [{"role": "user", "content": "Hello, how are you?"}],
    "stream": true
  }'

# Provider-scoped endpoint — model name only
curl -X POST http://localhost:18000/openrouter/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "glm-4.5-air", "messages": [{"role": "user", "content": "Hello"}]}'
```

### JavaScript SDK

```javascript
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://localhost:18000/v1",
  apiKey: "your-api-key", // optional for localhost
});

const response = await client.chat.completions.create({
  model: "openai/gpt-5.1",
  messages: [{ role: "user", content: "Hello!" }],
});
```

### Python SDK

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:18000/v1",
    api_key="your-api-key",
)

response = client.chat.completions.create(
    model="claude/claude-sonnet-4-6",
    messages=[{"role": "user", "content": "Hello!"}],
)
```

### Smart Route Endpoint

Let LLM Router pick the model — your agent just describes what it needs:

```bash
curl -X POST http://localhost:18000/route \
  -H "Content-Type: application/json" \
  -d '{
    "role": "planner",
    "task": "worker",
    "trace_id": "trace-123",
    "model_hint": "openrouter/gpt-4o"
  }'
```

Response includes the selected model, base URL, and recommended parameters.

### List All Models

```bash
curl http://localhost:18000/v1/models
# Returns all providers + models in OpenAI format
```

---

## ⚙️ Configuration

### Minimal `router.toml`

```toml
[server]
host = "0.0.0.0"
port = 18000

[[providers]]
name = "openai"
type = "openai"
api_key_env = "OPENAI_API_KEY"
base_url = "https://api.openai.com/v1"

[[providers]]
name = "deepseek"
type = "deepseek"
api_key_env = "DEEPSEEK_API_KEY"
base_url = "https://api.deepseek.com"
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_ROUTER_HOST` | `0.0.0.0` | Server bind host |
| `LLM_ROUTER_PORT` | `18000` | Server port |
| `LLM_ROUTER_SQLITE_PATH` | `data/llm_router.db` | SQLite database path |
| `LLM_ROUTER_PG_DSN` | — | PostgreSQL DSN (overrides SQLite) |
| `LLM_ROUTER_PRICING_SOURCE_URLS` | — | JSON map of provider → pricing URL |

**Config priority:** Environment variables > `router.toml` > defaults.

For complete configuration reference, see `router.toml` in the repository root and the [docs/](docs/) directory.

---

## 🚀 Deployment

### Local Development

```bash
./scripts/start.sh
```

### VPS / Production

```bash
go build -o llm-router ./cmd/llm-router
LLM_ROUTER_PORT=18000 ./llm-router
```

Use a reverse proxy (nginx, caddy) for TLS termination. Enable authentication for non-localhost access.

### Docker

```bash
docker build -t llm-router .
docker run -d \
  --name llm-router \
  -p 18000:18000 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/.env:/app/.env \
  -v $(pwd)/router.toml:/app/router.toml \
  llm-router
```

### Deploy to Cloud

Use the deploy buttons at the top of this README for one-click Vercel or Cloudflare Workers deployment of the monitor frontend. The Go backend can run on any VPS, bare metal, or container platform.

For HA deployment with multiple instances, load balancer setup, and PostgreSQL configuration, see [docs/DEPLOYMENT_HA.md](docs/DEPLOYMENT_HA.md).

---

## 🛠️ Tech Stack

- **Backend**: Go 1.24+, [chi](https://github.com/go-chi/chi) router
- **Database**: SQLite (`modernc.org/sqlite`) or PostgreSQL (pgx)
- **Monitor Frontend**: React 19 + TypeScript + Vite
- **Configuration**: TOML (pelletier/go-toml)
- **Streaming**: Server-Sent Events (SSE)
- **Auth**: API Keys + JWT Session Tokens

---

## ❓ FAQ

<details>
<summary><b>Do I need all API keys configured?</b></summary>

No. Only configure the providers you want to use. LLM Router starts fine with an empty `.env`. If you route to a provider with a missing key, you'll get a clear error in the response.
</details>

<details>
<summary><b>How is this different from OpenRouter?</b></summary>

OpenRouter is a hosted service that routes to providers. LLM Router is **self-hosted** — it runs on your infrastructure, you control the keys, and it additionally supports local CLI tools (Claude Code, Codex), local inference (Ollama, vLLM), tag-based routing policies, and per-API-key access control.
</details>

<details>
<summary><b>Does localhost really skip authentication?</b></summary>

Yes — requests from `127.0.0.1` or `::1` bypass auth by default. This makes local development frictionless. Remote requests require an API key or session token. You can disable the localhost bypass in configuration.
</details>

<details>
<summary><b>Can I use this with langchain / llamaindex / etc?</b></summary>

Any library that supports custom OpenAI-compatible base URLs works. Set the base URL to `http://your-host:18000/v1` and use `provider/model` format for model names.
</details>

<details>
<summary><b>How do local CLI providers work?</b></summary>

LLM Router shells out to locally installed CLI tools (`claude`, `codex`, `opencode`, etc.) and wraps them as HTTP endpoints. Your existing login sessions and subscriptions are used — no extra API keys needed. Workspace scoping and sandbox modes are configurable per provider.
</details>

<details>
<summary><b>How does model auto-update work?</b></summary>

A scheduled background job calls each provider's `/v1/models` endpoint, diffs the results against the database, and enables/disables models accordingly. Auto-discovered models are enabled by default; models no longer returned by the upstream are disabled (not deleted). Providers without stable model list APIs use versioned JSON fallback files in `data/model_sources/`.
</details>

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

Copyright (c) 2025 rinbarpen

---

<div align="center">
  <sub>Built for developers who need every model, one endpoint, zero friction</sub>
</div>
