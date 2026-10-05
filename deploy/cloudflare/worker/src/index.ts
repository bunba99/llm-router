/**
 * Cloudflare Worker — Thin API proxy for LLM Router backend.
 *
 * Routes:
 *   /health, /v1/*, /models, /providers, /route, /monitor,
 *   /api-keys, /auth, /api/*  → forwarded to BACKEND_ORIGIN
 *   Everything else            → 404
 *
 * Secrets (set via `npx wrangler secret put <name>`):
 *   BACKEND_ORIGIN — required, e.g. "https://router.example.com"
 *   EDGE_API_KEY   — optional, if set validates X-API-Key header at edge
 *
 * The Worker streams request/response bodies unchanged — it does not buffer.
 * Works with Server-Sent Events (SSE) streaming from the backend.
 */

interface Env {
  BACKEND_ORIGIN: string;
  EDGE_API_KEY?: string;
  EDGE_API_KEY_VALIDATION: string;
}

const PROXY_PATH_PREFIXES = [
  "/health",
  "/v1/",
  "/models",
  "/providers",
  "/route",
  "/monitor",
  "/api-keys",
  "/auth",
  "/api/",
];

function shouldProxy(pathname: string): boolean {
  return PROXY_PATH_PREFIXES.some((p) => pathname.startsWith(p));
}

function addCorsHeaders(response: Response, origin: string): Response {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin || "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-API-Key, X-Request-Id, X-Provider"
  );
  headers.set("Access-Control-Expose-Headers", "X-Request-Id");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin || "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
          "Access-Control-Allow-Headers":
            "Content-Type, Authorization, X-API-Key, X-Request-Id, X-Provider",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    if (!shouldProxy(url.pathname)) {
      return new Response("Not Found", { status: 404 });
    }

    if (!env.BACKEND_ORIGIN) {
      return new Response(
        "BACKEND_ORIGIN secret is not configured. Set it via: npx wrangler secret put BACKEND_ORIGIN",
        { status: 500 }
      );
    }

    // Optional edge-level API key validation
    if (
      env.EDGE_API_KEY &&
      env.EDGE_API_KEY_VALIDATION === "true"
    ) {
      const apiKey =
        request.headers.get("X-API-Key") ||
        request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
      if (!apiKey || apiKey !== env.EDGE_API_KEY) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    const backendUrl = new URL(url.pathname + url.search, env.BACKEND_ORIGIN);

    // Forward the request — body streams through without buffering
    const backendReq = new Request(backendUrl, {
      method: request.method,
      headers: request.headers,
      body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
      redirect: "manual",
    });

    try {
      const response = await fetch(backendReq);
      return addCorsHeaders(response, origin);
    } catch (err) {
      console.error("Backend connection failed:", err);
      return new Response(
        JSON.stringify({ error: "Backend unavailable" }),
        {
          status: 502,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": origin || "*",
          },
        }
      );
    }
  },
};
