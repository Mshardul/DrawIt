package server

import (
	"crypto/subtle"
	"net/http"
	"strings"
)

// Config holds what the server needs to defend itself.
type Config struct {
	// Token is the session token every /api/ request must carry as `Authorization: Bearer`.
	// With no token the API refuses every request.
	Token string
	// Hosts are the Host header values the server answers to, such as "127.0.0.1:8080".
	Hosts []string
}

// csp lets the app load only its own files and talk only to its own server, so neither the
// app nor a pack can reach the network.
const csp = "default-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"

// protect wraps next with the security headers, the Host and Origin checks, and the token check
// for /api/. A request that fails a check gets 403 and never reaches next.
func protect(cfg Config, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Content-Security-Policy", csp)
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("X-Content-Type-Options", "nosniff")

		if !cfg.allowsHost(r.Host) || !cfg.allowsOrigin(r) || (strings.HasPrefix(r.URL.Path, "/api/") && !cfg.allowsToken(r)) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (c Config) allowsHost(host string) bool {
	for _, allowed := range c.Hosts {
		if strings.EqualFold(host, allowed) {
			return true
		}
	}
	return false
}

// allowsOrigin accepts a request with no Origin header, or one naming the server itself.
func (c Config) allowsOrigin(r *http.Request) bool {
	origin, ok := r.Header["Origin"]
	if !ok {
		return true
	}
	if len(origin) != 1 {
		return false
	}
	host, found := strings.CutPrefix(origin[0], "http://")
	return found && c.allowsHost(host)
}

func (c Config) allowsToken(r *http.Request) bool {
	if c.Token == "" {
		return false
	}
	got, found := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	return found && subtle.ConstantTimeCompare([]byte(got), []byte(c.Token)) == 1
}
