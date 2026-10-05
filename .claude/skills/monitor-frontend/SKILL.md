---
name: monitor-frontend
description: Work with the LLM Router monitor dashboard — React 19 + TypeScript + Vite frontend in frontend/. Use when modifying the dashboard UI, adding API integrations, or debugging frontend issues.
---

# Monitor Frontend Development

The monitor dashboard is a React + Vite app at `frontend/`.

## When to Activate

- Adding or modifying dashboard UI components
- Connecting new API endpoints to the frontend
- Debugging frontend build or proxy issues
- Styling monitor components
- Adding new monitoring views (invocations, pricing, provider health)

## Quick Start

```bash
cd frontend
npm install
npm run dev
```

Dashboard at `http://localhost:4022` (configurable in `router.toml` `[monitor].port`).

## Project Structure

```
frontend/src/
├── main.tsx              # Entry point
├── App.tsx               # Root component with router
├── components/           # UI components
│   └── ...
├── hooks/                # Custom React hooks
├── services/             # API service layer
└── utils/                # Utility functions
```

## Configuration

In `router.toml`:

```toml
[monitor]
port = 4022
api_url = "http://localhost:18000"   # Backend API URL (dev proxy)
api_base_url = "/api"                 # Production API base path
```

Env var equivalents: `VITE_PORT`, `VITE_API_URL`, `VITE_API_BASE_URL`.

## API Integration

The frontend communicates with the Go backend through the Vite dev proxy (in dev) or direct API calls (in production). API service modules are in `src/services/`.

Key backend API endpoints consumed by the monitor:
- `GET /api/monitor/invocations` — invocation history
- `GET /api/monitor/stats` — usage statistics
- `GET /pricing/latest` — pricing data
- Various provider/model management endpoints

## Build

```bash
npm run build         # Production build → dist/
```

The `scripts/start.sh monitor` command starts the Vite dev server. For production, serve the `dist/` directory with any static file server, proxying API requests to the Go backend.

## Key Files

- `frontend/vite.config.ts` — Vite configuration (proxy, plugins)
- `frontend/package.json` — dependencies and scripts
- `frontend/src/App.tsx` — root layout
- `frontend/src/services/` — API client code
- `frontend/src/components/` — UI components
