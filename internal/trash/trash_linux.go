//go:build linux

package trash

import (
	"os"
	"path/filepath"
)

func move(path string) error {
	dir, err := homeTrash()
	if err != nil {
		return err
	}
	return moveFreedesktop(dir, path)
}

func homeTrash() (string, error) {
	data := os.Getenv("XDG_DATA_HOME")
	if data == "" {
		home, err := os.UserHomeDir()
		if err != nil || home == "" {
			return "", ErrNoTrash
		}
		data = filepath.Join(home, ".local", "share")
	}
	dir := filepath.Join(data, "Trash")
	if err := os.MkdirAll(filepath.Join(dir, "files"), 0o700); err != nil {
		return "", ErrNoTrash
	}
	if err := os.MkdirAll(filepath.Join(dir, "info"), 0o700); err != nil {
		return "", ErrNoTrash
	}
	return dir, nil
}
