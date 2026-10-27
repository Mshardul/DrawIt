package browser

import (
	"reflect"
	"testing"
)

func TestCommandPerPlatform(t *testing.T) {
	const url = "http://127.0.0.1:8080/"
	for _, c := range []struct {
		goos string
		name string
		args []string
	}{
		{"darwin", "open", []string{url}},
		{"linux", "xdg-open", []string{url}},
		{"freebsd", "xdg-open", []string{url}},
		{"windows", "rundll32", []string{"url.dll,FileProtocolHandler", url}},
	} {
		name, args := Command(c.goos, url)
		if name != c.name || !reflect.DeepEqual(args, c.args) {
			t.Errorf("%s: got %s %v, want %s %v", c.goos, name, args, c.name, c.args)
		}
	}
}
