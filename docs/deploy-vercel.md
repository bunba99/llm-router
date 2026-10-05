# Vercel Deployment

LLM Router supports deploying the monitor frontend to Vercel as a static site, with the Go backend hosted on a Docker-capable platform.

## Architecture

```
                     ┌──────────┐
                     │  Vercel   │
                     │  Edge     │
                     └────┬─────┘
                          │
            ┌─────────────┴─────────────┐
            │                           │
  ┌─────────┴──────────┐   ┌───────────┴───────────┐
  │  Vercel Static Host │   │  Vercel Serverless     │
  │  (Monitor Frontend) │   │  Function (API Proxy)   │
  │  your-app.vercel.app│   │  api/proxy.go          │
  └────────────────────┘   └───────────┬───────────┘
                                       │
                             ┌─────────┴─────────┐
                             │  Docker Host (VPS) │
                             │  llm-router :18000 │
                             └───────────────────┘
```

## Option A: Static Frontend Only (Recommended)

Deploy the monitor frontend to Vercel as a static site. API requests are proxied to your backend via Vercel's rewrite rules.

### Setup

```bash
# 1. Install Vercel CLI
npm i -g vercel

# 2. Login
vercel login

# 3. Deploy (from project root — uses vercel.json)
vercel --prod
```

### Vercel Project Settings

Set these in the Vercel project dashboard:

| Variable | Value |
|----------|-------|
| `BACKEND_ORIGIN` | Your backend's public URL, e.g. `https://api.router.example.com` |
| Framework Preset | Other |
| Build Command | `cd frontend && npm ci && npm run build` |
| Output Directory | `frontend/dist` |
| Install Command | `cd frontend && npm ci` |

### How It Works

`vercel.json` rewrites requests matching `/api/*` to your backend origin. The monitor SPA is served for all other routes.

## Option B: Vercel Serverless API Proxy

A Go-based Vercel serverless function at `api/proxy.go` proxies requests to your backend. This adds an edge layer for CORS normalization and request forwarding.

### Setup

```bash
# 1. Add the Go runtime to your Vercel project
#    In vercel.json at project root, the api/ directory functions
#    use the vercel-community/go runtime.

# 2. Set BACKEND_ORIGIN in Vercel dashboard
#    Go to Project Settings → Environment Variables
#    Add BACKEND_ORIGIN=<your-backend-url>

# 3. Deploy
vercel --prod
```

### Limitations

- Vercel Functions have a 60s max duration (Pro plan). Long-running streaming LLM requests may time out.
- The function uses ~256MB memory. For heavy traffic, consider increasing the memory allocation.
- For streaming endpoints, consider routing them directly to the backend (bypass the proxy).

## Option C: Local Dev with Vercel

```bash
# Start backend locally
./scripts/start-vercel.sh backend

# In another terminal, link to Vercel project
vercel link

# Pull environment variables
vercel env pull .env.local

# Run local dev server with Vercel config
vercel dev
```

## Why Not Full Vercel Serverless?

The Go backend cannot run as a pure Vercel serverless function because:

1. **SQLite** requires a persistent writable filesystem — Vercel functions are ephemeral with a read-only `/tmp`
2. **Streaming LLM responses** can exceed the 60s function timeout
3. **Background scheduler** (model auto-update every N hours) has no equivalent in serverless
4. **430KB+ config file** (`router.toml`) is impractical for serverless environment variable limits
5. **In-memory state** (circuit breakers, token buckets, provider cooldowns) resets on each cold start

## Recommended Production Setup

1. **Backend**: Docker on Fly.io / Railway / VPS (any platform with persistent storage)
2. **Frontend**: Vercel static hosting (fast global CDN, automatic HTTPS)
3. **API Proxy**: Vercel rewrite rules in `vercel.json` (zero-latency edge redirects)
