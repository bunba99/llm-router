#!/usr/bin/env bash
# Start LLM Router with Cloudflare Tunnel.
#
# Prerequisites:
#   1. Install cloudflared: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
#   2. Authenticate: cloudflared tunnel login
#   3. Create tunnel: cloudflared tunnel create llm-router
#   4. Set env vars in .env: TUNNEL_ID, TUNNEL_DOMAIN
#   5. Route DNS: In Cloudflare dashboard, add CNAME record for TUNNEL_DOMAIN → <TUNNEL_ID>.cfargotunnel.com
#
# Usage:
#   ./scripts/start-cloudflare.sh               # start the full stack
#   ./scripts/start-cloudflare.sh backend        # backend + tunnel only

set -euo pipefail
cd "$(dirname "$0")/.."

# Load .env if present
if [ -f .env ]; then
  set -a; source .env; set +a
fi

MODE="${1:-full}"

check_cloudflare_prereqs() {
  if [ -z "${TUNNEL_ID:-}" ]; then
    echo "ERROR: TUNNEL_ID env var is not set."
    echo "Create a tunnel first: cloudflared tunnel create llm-router"
    exit 1
  fi
  if [ -z "${TUNNEL_DOMAIN:-}" ]; then
    echo "ERROR: TUNNEL_DOMAIN env var is not set."
    echo "Set it to your public domain, e.g. router.example.com"
    exit 1
  fi
  if [ ! -f deploy/cloudflared/credentials.json ]; then
    echo "ERROR: deploy/cloudflared/credentials.json not found."
    echo "Run: cloudflared tunnel token --file deploy/cloudflared/credentials.json llm-router"
    exit 1
  fi
}

start_full() {
  echo "=== Starting LLM Router + Cloudflare Tunnel ==="
  echo "Backend:  http://localhost:18000"
  echo "Frontend: http://localhost:4022"
  echo "Tunnel:   https://${TUNNEL_DOMAIN}"
  echo ""
  docker compose -f deploy/compose/docker-compose.yml -f deploy/cloudflared/docker-compose.cloudflared.yml up -d
  echo ""
  echo "Stack started. Monitor logs with: docker compose logs -f"
}

start_backend_only() {
  echo "=== Starting backend + Cloudflare Tunnel (no frontend) ==="
  echo "Backend:  http://localhost:18000"
  echo "Tunnel:   https://${TUNNEL_DOMAIN} (backend directly)"
  echo ""
  docker compose -f deploy/compose/docker-compose.yml -f deploy/cloudflared/docker-compose.cloudflared.yml up -d llm-router cloudflared
  echo ""
  echo "Backend + tunnel started."
}

check_cloudflare_prereqs

case "$MODE" in
  full)    start_full ;;
  backend) start_backend_only ;;
  *)
    echo "Usage: $0 [full|backend]"
    exit 1
    ;;
esac
