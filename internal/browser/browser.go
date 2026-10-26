// Package browser opens a URL in the user's default browser.
package browser

import "os/exec"

// Command returns the program and arguments that open url on the given GOOS.
func Command(goos, url string) (string, []string) {
	switch goos {
	case "darwin":
		return "open", []string{url}
	case "windows":
		return "rundll32", []string{"url.dll,FileProtocolHandler", url}
	default:
		return "xdg-open", []string{url}
	}
}

// Open starts the default browser on url without waiting for it.
func Open(goos, url string) error {
	name, args := Command(goos, url)
	cmd := exec.Command(name, args...)
	if err := cmd.Start(); err != nil {
		return err
	}
	go func() { _ = cmd.Wait() }()
	return nil
}
