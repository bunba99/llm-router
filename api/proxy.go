// Vercel serverless function — API proxy for LLM Router backend.
//
// This function is deployed as part of the Vercel project and proxies
// requests to the actual Go backend running on a Docker host (VPS, Fly.io, etc.).
//
// Set the BACKEND_ORIGIN environment variable in Vercel project settings:
//   BACKEND_ORIGIN=https://your-backend-host.example.com
//
// Routes handled: /v1/*, /health, /models, /providers, /route, /monitor, /api-keys, /auth
//
// The handler streams request/response bodies without buffering, so it works
// with Server-Sent Events (SSE) for streaming chat completions.

package proxy

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
)

var backendOrigin = strings.TrimRight(os.Getenv("BACKEND_ORIGIN"), "/")

var proxyPathPrefixes = []string{
	"/v1/",
	"/health",
	"/models",
	"/providers",
	"/route",
	"/monitor",
	"/api-keys",
	"/auth",
}

func shouldProxy(path string) bool {
	for _, p := range proxyPathPrefixes {
		if strings.HasPrefix(path, p) {
			return true
		}
	}
	return false
}

func copyHeader(dst, src http.Header) {
	for k, vv := range src {
		for _, v := range vv {
			dst.Add(k, v)
		}
	}
}

func Handler(w http.ResponseWriter, r *http.Request) {
	if backendOrigin == "" {
		http.Error(w, "BACKEND_ORIGIN env var is not set", http.StatusInternalServerError)
		return
	}

	if !shouldProxy(r.URL.Path) {
		http.NotFound(w, r)
		return
	}

	targetURL := backendOrigin + r.URL.Path
	if r.URL.RawQuery != "" {
		targetURL += "?" + r.URL.RawQuery
	}

	proxyReq, err := http.NewRequestWithContext(r.Context(), r.Method, targetURL, r.Body)
	if err != nil {
		log.Printf("proxy: failed to create request: %v", err)
		http.Error(w, "Bad Gateway", http.StatusBadGateway)
		return
	}

	copyHeader(proxyReq.Header, r.Header)
	proxyReq.Header.Set("X-Forwarded-For", r.RemoteAddr)
	proxyReq.Header.Set("X-Forwarded-Proto", "https")
	if requestID := r.Header.Get("X-Request-Id"); requestID != "" {
		proxyReq.Header.Set("X-Request-Id", requestID)
	}

	client := &http.Client{}
	resp, err := client.Do(proxyReq)
	if err != nil {
		log.Printf("proxy: backend request failed for %s: %v", r.URL.Path, err)
		http.Error(w, "Backend unavailable", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	copyHeader(w.Header(), resp.Header)
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key, X-Request-Id, X-Provider")
	w.Header().Set("Access-Control-Expose-Headers", "X-Request-Id")

	w.WriteHeader(resp.StatusCode)

	if _, err := io.Copy(w, resp.Body); err != nil {
		log.Printf("proxy: response copy failed: %v", err)
	}
}

func init() {
	if backendOrigin == "" {
		fmt.Fprintln(os.Stderr, "proxy: BACKEND_ORIGIN is not set — proxy will return 500 for all requests")
	} else {
		fmt.Fprintf(os.Stderr, "proxy: forwarding to backend %s\n", backendOrigin)
	}
}
