package trash

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestLinuxAndWindowsTrashCompile(t *testing.T) {
	for _, goos := range []string{"linux", "windows"} {
		cmd := exec.Command("go", "build", ".")
		cmd.Env = append(withoutTarget(os.Environ()), "GOOS="+goos, "GOARCH=amd64", "CGO_ENABLED=0")
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("%s: %v\n%s", goos, err, out)
		}
	}
}

func withoutTarget(env []string) []string {
	kept := make([]string, 0, len(env))
	for _, entry := range env {
		if strings.HasPrefix(entry, "GOOS=") || strings.HasPrefix(entry, "GOARCH=") || strings.HasPrefix(entry, "CGO_ENABLED=") {
			continue
		}
		kept = append(kept, entry)
	}
	return kept
}

func TestFreedesktopTrashRecordsTheOriginalPath(t *testing.T) {
	root := t.TempDir()
	src := filepath.Join(root, "Notes file.drawit.kdl")
	if err := os.WriteFile(src, []byte("keep"), 0o644); err != nil {
		t.Fatal(err)
	}
	dir := filepath.Join(root, "Trash")
	if err := os.MkdirAll(filepath.Join(dir, "files"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(dir, "info"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "files", "Notes file.drawit.kdl"), []byte("old"), 0o644); err != nil {
		t.Fatal(err)
	}

	if err := moveFreedesktop(dir, src); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(src); !os.IsNotExist(err) {
		t.Fatalf("source still present: %v", err)
	}
	got, err := os.ReadFile(filepath.Join(dir, "files", "Notes file 2.drawit.kdl"))
	if err != nil || string(got) != "keep" {
		t.Fatalf("trashed file = %q, %v", got, err)
	}
	if _, err := os.Stat(filepath.Join(dir, "files", "Notes file.drawit.kdl")); err != nil {
		t.Fatalf("existing trash entry changed: %v", err)
	}
	info, err := os.ReadFile(filepath.Join(dir, "info", "Notes file 2.drawit.kdl.trashinfo"))
	if err != nil {
		t.Fatal(err)
	}
	abs, err := filepath.Abs(src)
	if err != nil {
		t.Fatal(err)
	}
	wantPath := "Path=" + strings.ReplaceAll(abs, " ", "%20")
	text := string(info)
	if !strings.HasPrefix(text, "[Trash Info]\n") || !strings.Contains(text, wantPath+"\n") || !strings.Contains(text, "DeletionDate=") {
		t.Fatalf("info = %q, want %s", text, wantPath)
	}
}
