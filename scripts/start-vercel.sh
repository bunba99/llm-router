#!/usr/bin/env bash
# Start LLM Router backend and provide instructions for Vercel frontend deployment.
#
# The backend runs locally via Docker Compose. The monitor frontend is deployed
# separately to Vercel as a static site, pointing API requests to this backend.
#
# Usage:
#   ./scripts/start-vercel.sh               # start full Docker stack
#   ./scripts/start-vercel.sh backend        # start backend only (no nginx)

set -euo pipefail
cd "$(dirname "$0")/.."

MODE="${1:-full}"

start_full() {
  echo "=== Starting LLM Router backend (Docker) ==="
  docker compose up -d
  echo ""
  echo "Backend running at: http://localhost:18000"
  echo "Frontend (nginx):  http://localhost:4022"
  echo ""
  echo "=== Vercel Frontend Deployment ==="
  echo ""
  echo "Option A — Deploy frontend to Vercel (recommended for production):"
  echo "  1. Install Vercel CLI: npm i -g vercel"
  echo "  2. Login:              vercel login"
  echo "  3. Deploy:             cd frontend && vercel --prod"
  echo ""
  echo "Option B — Use Vercel CLI with project-level config:"
  echo "  1. vercel link          (link to your Vercel project)"
  echo "  2. vercel --prod        (deploy, uses vercel.json rewrites)"
  echo ""
  echo "Make sure BACKEND_ORIGIN is set in Vercel project settings"
  echo "to point to your backend's public URL."
}

start_backend_only() {
  echo "=== Starting backend only (no nginx) ==="
  docker compose up -d llm-router
  echo ""
  echo "Backend running at: http://localhost:18000"
  echo ""
  echo "=== Vercel Frontend Deployment ==="
  echo ""
  echo "Option A — Deploy frontend to Vercel:"
  echo "  1. npm i -g vercel && vercel login"
  echo "  2. cd frontend && vercel --prod"
  echo ""
  echo "Option B — Local dev with hot reload:"
  echo "  cd frontend && npm run dev"
  echo "  (starts Vite dev server at http://localhost:3000)"
}

case "$MODE" in
  full)    start_full ;;
  backend) start_backend_only ;;
  *)
    echo "Usage: $0 [full|backend]"
    exit 1
    ;;
esac
