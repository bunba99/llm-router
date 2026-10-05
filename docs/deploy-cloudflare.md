# Cloudflare Deployment

LLM Router supports deployment through Cloudflare's network using Cloudflare Tunnel for the backend and Cloudflare Pages for the monitor frontend.

## Architecture

```
                     ┌──────────────┐
                     │  Cloudflare   │
                     │  Network      │
                     └──────┬───────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
    ┌─────────┴─────────┐    ┌───────────┴───────────┐
    │  Cloudflare Pages  │    │  Cloudflare Tunnel     │
    │  (Monitor Frontend)│    │  (Backend Exposure)    │
    │  router.example.com│    │  api.router.example.com│
    └───────────────────┘    └───────────┬───────────┘
                                         │
                               ┌─────────┴─────────┐
                               │  Docker Host (VPS) │
                               │  ┌──────────────┐ │
                               │  │ nginx :4022   │ │
                               │  │ llm-router    │ │
                               │  │  :18000       │ │
                               │  └──────────────┘ │
                               └───────────────────┘
```

## Option A: Cloudflare Tunnel (Easiest — No Code Changes)

Cloudflare Tunnel exposes your existing Docker-based backend through Cloudflare's network with TLS, DDoS protection, and no open firewall ports.

### Setup

```bash
# 1. Install cloudflared
#    https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

# 2. Authenticate
cloudflared tunnel login

# 3. Create a tunnel
cloudflared tunnel create llm-router

# 4. Export the credentials file
cloudflared tunnel token --file cloudflared/credentials.json llm-router

# 5. Configure DNS (in Cloudflare dashboard)
#    Add a CNAME record: your-domain.com → <tunnel-id>.cfargotunnel.com

# 6. Set environment variables
echo "TUNNEL_ID=<your-tunnel-uuid>" >> .env
echo "TUNNEL_DOMAIN=your-domain.com" >> .env

# 7. Start the stack
./scripts/start-cloudflare.sh
```

### Configuration Files

- `cloudflared/config.yml` — Tunnel ingress rules (routes to nginx on port 4022)
- `cloudflared/docker-compose.cloudflared.yml` — Adds cloudflared sidecar to existing stack

## Option B: Cloudflare Pages (Monitor Frontend)

Deploy the monitor React frontend to Cloudflare Pages (static site hosting).

### Setup

```bash
cd frontend

# Build the frontend
npm ci
npm run build

# Deploy to Cloudflare Pages
npx wrangler pages deploy dist --project-name llm-router-monitor
```

### Environment Variables (set in Pages dashboard)

| Variable | Description |
|----------|-------------|
| `VITE_API_BASE_URL` | Backend API URL, e.g. `https://api.router.example.com` |

## Option C: Cloudflare Worker (Edge Proxy)

An optional thin Worker that sits in front of your backend:

- Validates API keys at the edge
- Adds CORS headers
- Provides rate limiting via Cloudflare
- Logs requests to Cloudflare Analytics

### Setup

```bash
cd cloudflare/worker
npm install
npx wrangler secret put BACKEND_ORIGIN   # e.g. https://api.router.example.com
npx wrangler secret put EDGE_API_KEY      # optional, your API key for edge validation
npx wrangler deploy
```

### Worker Configuration

Set `EDGE_API_KEY_VALIDATION = "true"` in `wrangler.toml` to enable edge API key checks.

## Why Not Pure Cloudflare Workers?

LLM Router's backend cannot run as a pure Cloudflare Worker because:

1. **SQLite** requires a persistent writable filesystem (Workers are ephemeral)
2. **Streaming LLM responses** can exceed Workers' CPU time limits
3. **Background scheduler** (model auto-update) runs as a long-lived goroutine
4. **In-memory state** (circuit breakers, token buckets, cooldowns) resets between invocations

The hybrid approach (Tunnel + Pages + optional Worker) gives you Cloudflare's edge network benefits without rewriting the backend.
