//go:build darwin

package trash

import (
	"os"
	"path/filepath"
)

func move(path string) error {
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return ErrNoTrash
	}
	dir := filepath.Join(home, ".Trash")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return ErrNoTrash
	}
	return moveInto(dir, path)
}
