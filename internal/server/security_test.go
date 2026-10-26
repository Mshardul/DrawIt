package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// send makes a request with exact control over Host, Origin and Authorization.
func send(h http.Handler, method, target, host string, header map[string]string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, target, strings.NewReader("x"))
	req.Host = host
	for k, v := range header {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func bearer(token string) map[string]string {
	return map[string]string{"Authorization": "Bearer " + token}
}

func TestT020_UnexpectedHostIsRefused(t *testing.T) {
	h, _ := newServer(t)
	for _, host := range []string{"evil.example:8080", "evil.example", "127.0.0.1", "127.0.0.1:9999", "localhost.evil.example:8080", ""} {
		for _, target := range []string{"/", "/api/files"} {
			if rec := send(h, http.MethodGet, target, host, bearer(testToken)); rec.Code != http.StatusForbidden {
				t.Errorf("Host %q GET %s: status = %d, want 403", host, target, rec.Code)
			}
		}
	}
}

func TestT020_ListenerHostsAreAccepted(t *testing.T) {
	h, _ := newServer(t)
	for _, host := range []string{"127.0.0.1:8080", "localhost:8080", "LOCALHOST:8080"} {
		if rec := send(h, http.MethodGet, "/api/files", host, bearer(testToken)); rec.Code != http.StatusOK {
			t.Errorf("Host %q: status = %d, want 200", host, rec.Code)
		}
	}
}

func TestT020_ForeignOriginIsRefused(t *testing.T) {
	h, _ := newServer(t)
	for _, origin := range []string{"https://evil.example", "http://evil.example:8080", "null", "http://127.0.0.1:9999", "https://127.0.0.1:8080", "http://127.0.0.1:8080.evil.example"} {
		h1 := bearer(testToken)
		h1["Origin"] = origin
		for _, c := range []struct{ method, target string }{
			{http.MethodGet, "/api/files"},
			{http.MethodPut, "/api/file?path=a.drawit.kdl"},
			{http.MethodGet, "/"},
		} {
			if rec := send(h, c.method, c.target, testHost, h1); rec.Code != http.StatusForbidden {
				t.Errorf("Origin %q %s %s: status = %d, want 403", origin, c.method, c.target, rec.Code)
			}
		}
	}
}

func TestT020_OwnOriginIsAccepted(t *testing.T) {
	h, _ := newServer(t)
	for _, origin := range []string{"http://127.0.0.1:8080", "http://localhost:8080"} {
		header := bearer(testToken)
		header["Origin"] = origin
		if rec := send(h, http.MethodGet, "/api/files", testHost, header); rec.Code != http.StatusOK {
			t.Errorf("Origin %q: status = %d, want 200", origin, rec.Code)
		}
	}
}

func TestT020_APIRequiresTheTokenHeader(t *testing.T) {
	h, _ := newServer(t)
	for name, header := range map[string]map[string]string{
		"no header":     nil,
		"wrong token":   bearer("wrong"),
		"prefix":        bearer(testToken[:5]),
		"longer":        bearer(testToken + "x"),
		"empty token":   bearer(""),
		"wrong scheme":  {"Authorization": "Basic " + testToken},
		"bare token":    {"Authorization": testToken},
		"lowercase key": {"authorization": "bearer " + testToken + "x"},
	} {
		for _, c := range []struct{ method, target string }{
			{http.MethodGet, "/api/files"},
			{http.MethodGet, "/api/file?path=a.drawit.kdl"},
			{http.MethodPut, "/api/file?path=a.drawit.kdl"},
			{http.MethodGet, "/api/nothing"},
		} {
			if rec := send(h, c.method, c.target, testHost, header); rec.Code != http.StatusForbidden {
				t.Errorf("%s %s %s: status = %d, want 403", name, c.method, c.target, rec.Code)
			}
		}
	}
}

func TestT020_TokenInTheQueryStringIsNotAccepted(t *testing.T) {
	h, _ := newServer(t)
	if rec := send(h, http.MethodGet, "/api/files?token="+testToken, testHost, nil); rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", rec.Code)
	}
}

func TestT020_RefusedWriteChangesNothing(t *testing.T) {
	h, dir := newServer(t)
	send(h, http.MethodPut, "/api/file?path=a.drawit.kdl", testHost, nil)
	send(h, http.MethodPut, "/api/file?path=a.drawit.kdl", testHost, bearer("wrong"))
	if _, err := readDir(dir); err != nil {
		t.Fatal(err)
	}
	if entries, _ := readDir(dir); len(entries) != 0 {
		t.Fatalf("folder holds %v, want nothing", entries)
	}
}

func TestT020_AServerWithoutATokenRefusesTheAPI(t *testing.T) {
	_, dir := newServer(t)
	root := openRoot(t, dir)
	h := New(root, nil, Config{Hosts: []string{testHost}})
	for _, header := range []map[string]string{nil, bearer(""), bearer("anything")} {
		if rec := send(h, http.MethodGet, "/api/files", testHost, header); rec.Code != http.StatusForbidden {
			t.Errorf("status = %d, want 403", rec.Code)
		}
	}
}

func TestT020_TheAppLoadsWithoutAToken(t *testing.T) {
	h, _ := newServer(t)
	if rec := send(h, http.MethodGet, "/", testHost, nil); rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
}

func TestT020_EveryResponseCarriesSecurityHeaders(t *testing.T) {
	h, _ := newServer(t)
	for name, rec := range map[string]*httptest.ResponseRecorder{
		"app":          send(h, http.MethodGet, "/", testHost, nil),
		"app 404":      send(h, http.MethodGet, "/missing.js", testHost, nil),
		"api":          send(h, http.MethodGet, "/api/files", testHost, bearer(testToken)),
		"api refused":  send(h, http.MethodGet, "/api/files", testHost, nil),
		"host refused": send(h, http.MethodGet, "/", "evil.example", nil),
		"bad method":   send(h, http.MethodPost, "/api/files", testHost, bearer(testToken)),
	} {
		if got := rec.Header().Get("Referrer-Policy"); got != "no-referrer" {
			t.Errorf("%s: Referrer-Policy = %q, want no-referrer", name, got)
		}
		if got := rec.Header().Get("X-Content-Type-Options"); got != "nosniff" {
			t.Errorf("%s: X-Content-Type-Options = %q, want nosniff", name, got)
		}
		csp := rec.Header().Get("Content-Security-Policy")
		for _, want := range []string{"default-src 'self'", "connect-src 'self'", "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'", "form-action 'none'"} {
			if !strings.Contains(csp, want) {
				t.Errorf("%s: CSP %q lacks %s", name, csp, want)
			}
		}
		if strings.Contains(csp, "unsafe-") || strings.Contains(csp, "*") {
			t.Errorf("%s: CSP %q is not strict", name, csp)
		}
	}
}
