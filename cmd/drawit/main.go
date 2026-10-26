// Command drawit serves the DrawIt app and the files of one folder, and opens the browser.
package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/signal"
	"runtime"
	"strconv"
	"time"

	"github.com/Mshardul/DrawIt/internal/browser"
	"github.com/Mshardul/DrawIt/internal/server"
	"github.com/Mshardul/DrawIt/internal/webui"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	open := func(url string) error { return browser.Open(runtime.GOOS, url) }
	if err := run(ctx, os.Args[1:], os.Stdout, open, nil); err != nil {
		fmt.Fprintln(os.Stderr, "drawit:", err)
		os.Exit(1)
	}
}

// run serves the folder named in args (default: the current folder) until ctx ends. It tells
// the URL on out, then calls open unless -no-browser is given. ready, if set, is called last, once the
// server accepts connections and the browser has been asked to open.
func run(ctx context.Context, args []string, out io.Writer, open func(url string) error, ready func()) error {
	flags := flag.NewFlagSet("drawit", flag.ContinueOnError)
	flags.SetOutput(out)
	addr := flags.String("addr", "127.0.0.1:0", "address to listen on")
	noBrowser := flags.Bool("no-browser", false, "do not open the browser")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if flags.NArg() > 1 {
		return errors.New("usage: drawit [-addr host:port] [-no-browser] [folder]")
	}
	dir := "."
	if flags.NArg() == 1 {
		dir = flags.Arg(0)
	}

	if host, _, err := net.SplitHostPort(*addr); err != nil || host != "127.0.0.1" {
		return fmt.Errorf("-addr %q: DrawIt listens on 127.0.0.1 only", *addr)
	}

	root, err := os.OpenRoot(dir)
	if err != nil {
		return err
	}
	defer func() { _ = root.Close() }()
	if info, err := root.Stat("."); err != nil || !info.IsDir() {
		return fmt.Errorf("%s is not a folder", dir)
	}

	listener, err := net.Listen("tcp", *addr)
	if err != nil {
		return err
	}
	token, err := newToken()
	if err != nil {
		_ = listener.Close()
		return err
	}
	port := strconv.Itoa(listener.Addr().(*net.TCPAddr).Port)
	cfg := server.Config{Token: token, Hosts: []string{"127.0.0.1:" + port, "localhost:" + port}}
	// The token goes in the fragment: browsers never send it to a server or in a Referer header.
	url := "http://" + listener.Addr().String() + "/#" + token
	srv := &http.Server{Handler: server.New(root, webui.Files(), cfg), ReadHeaderTimeout: 10 * time.Second}
	served := make(chan error, 1)
	go func() { served <- srv.Serve(listener) }()

	_, _ = fmt.Fprintf(out, "DrawIt is serving %s at %s\n", dir, url)
	if !*noBrowser && open != nil {
		if err := open(url); err != nil {
			_, _ = fmt.Fprintf(out, "could not open the browser (%v); open %s yourself\n", err, url)
		}
	}
	if ready != nil {
		ready()
	}

	select {
	case err := <-served:
		return err
	case <-ctx.Done():
	}
	// Finish requests in flight, but do not wait on connections that never send one.
	shutdown, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdown); err != nil {
		return srv.Close()
	}
	return nil
}

// newToken returns 256 random bits, URL-safe.
func newToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}
