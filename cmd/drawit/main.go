// Command drawit serves the DrawIt app and, when a folder is open, its files, and opens the browser.
package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"strconv"
	"time"

	"github.com/Mshardul/DrawIt/internal/browser"
	"github.com/Mshardul/DrawIt/internal/prefs"
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

func run(ctx context.Context, args []string, out io.Writer, open func(url string) error, ready func()) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	config, err := prefs.Dir()
	if err != nil {
		return err
	}
	return runWith(ctx, args, out, open, ready, home, prefs.Open(config))
}

func runWith(ctx context.Context, args []string, out io.Writer, open func(url string) error, ready func(), home string, store *prefs.Store) error {
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
	cli := ""
	if flags.NArg() == 1 {
		cli = flags.Arg(0)
	}

	if host, _, err := net.SplitHostPort(*addr); err != nil || host != "127.0.0.1" {
		return fmt.Errorf("-addr %q: DrawIt listens on 127.0.0.1 only", *addr)
	}

	dir, err := chooseFolder(cli, store)
	if err != nil {
		return err
	}
	if dir != "" {
		dir, err = filepath.Abs(dir)
		if err != nil {
			return err
		}
	}
	library := filepath.Join(home, "DrawIt")
	if err := os.MkdirAll(library, 0o755); err != nil {
		return err
	}

	var root *os.Root
	if dir != "" {
		root, err = os.OpenRoot(dir)
		if err != nil {
			return err
		}
		defer func() { _ = root.Close() }()
		if info, err := root.Stat("."); err != nil || !info.IsDir() {
			return fmt.Errorf("%s is not a folder", dir)
		}
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
	srv := &http.Server{Handler: server.New(root, dir, library, webui.Files(), store, cfg), ReadHeaderTimeout: 10 * time.Second}
	served := make(chan error, 1)
	go func() { served <- srv.Serve(listener) }()

	if dir == "" {
		_, _ = fmt.Fprintf(out, "DrawIt is at %s\n", url)
	} else {
		_, _ = fmt.Fprintf(out, "DrawIt is serving %s at %s\n", dir, url)
	}
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

func chooseFolder(cli string, store *prefs.Store) (string, error) {
	if cli != "" {
		info, err := os.Stat(cli)
		if err != nil {
			return "", err
		}
		if !info.IsDir() {
			return "", fmt.Errorf("%s is not a folder", cli)
		}
		return cli, nil
	}
	folder, err := rememberedFolder(store)
	if err != nil {
		return "", err
	}
	if folder == "" {
		return "", nil
	}
	info, err := os.Stat(folder)
	if err != nil || !info.IsDir() {
		return "", nil
	}
	return folder, nil
}

func rememberedFolder(store *prefs.Store) (string, error) {
	if store == nil {
		return "", nil
	}
	view, err := store.Read()
	if err != nil {
		return "", err
	}
	if view.Unreadable {
		return "", nil
	}
	var doc struct {
		Workspace struct {
			Folder json.RawMessage `json:"folder"`
		} `json:"workspace"`
	}
	if err := json.Unmarshal(view.JSON, &doc); err != nil {
		return "", nil
	}
	if len(bytes.TrimSpace(doc.Workspace.Folder)) == 0 {
		return "", nil
	}
	var folder string
	if err := json.Unmarshal(doc.Workspace.Folder, &folder); err != nil {
		return "", nil
	}
	return folder, nil
}

func newToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}
