package webui

import (
	"io/fs"
	"testing"
)

func TestFilesIsAReadableFolder(t *testing.T) {
	info, err := fs.Stat(Files(), ".")
	if err != nil {
		t.Fatal(err)
	}
	if !info.IsDir() {
		t.Fatal("Files() root is not a folder")
	}
}
