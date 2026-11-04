package server

import (
	"crypto/subtle"
	"net/http"
	"strings"
	"time"
)

type Config struct {
	Token string
	Hosts []string
	// Now is the clock for the one browser session. Nil means time.Now.
	Now func() time.Time
	// Trash moves a library path into the operating system's trash. Nil means the OS trash.
	Trash func(path string) error
}

// Image requests cannot carry the API token, so images are blob URLs.
const csp = "default-src 'self'; connect-src 'self'; img-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"

func protect(cfg Config, hold *browserSession, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Content-Security-Policy", csp)
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("X-Content-Type-Options", "nosniff")

		if !cfg.allowsHost(r.Host) || !cfg.allowsOrigin(r) || (strings.HasPrefix(r.URL.Path, "/api/") && !cfg.allowsToken(r)) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		if strings.HasPrefix(r.URL.Path, "/api/") && !isSessionClaim(r) && !hold.allow(r.Header.Get(SessionHeader)) {
			http.Error(w, "session lost", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func isSessionClaim(r *http.Request) bool {
	return r.Method == http.MethodPost && r.URL.Path == "/api/session"
}

func (c Config) allowsHost(host string) bool {
	for _, allowed := range c.Hosts {
		if strings.EqualFold(host, allowed) {
			return true
		}
	}
	return false
}

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
