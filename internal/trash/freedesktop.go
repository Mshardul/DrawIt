package trash

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func moveFreedesktop(dir, path string) error {
	name, err := uniqueTrashName(filepath.Join(dir, "files"), filepath.Join(dir, "info"), filepath.Base(path))
	if err != nil {
		return err
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	infoPath := filepath.Join(dir, "info", name+".trashinfo")
	body := "[Trash Info]\nPath=" + escapeTrashPath(abs) + "\nDeletionDate=" + time.Now().Format("2006-01-02T15:04:05") + "\n"
	if err := os.WriteFile(infoPath, []byte(body), 0o600); err != nil {
		return err
	}
	if err := os.Rename(path, filepath.Join(dir, "files", name)); err != nil {
		_ = os.Remove(infoPath)
		return err
	}
	return nil
}

func moveInto(dir, path string) error {
	name, err := uniqueTrashName(dir, "", filepath.Base(path))
	if err != nil {
		return err
	}
	return os.Rename(path, filepath.Join(dir, name))
}

func uniqueTrashName(filesDir, infoDir, name string) (string, error) {
	if trashNameFree(filesDir, infoDir, name) {
		return name, nil
	}
	stem, ext := splitTrashName(name)
	for n := 2; n <= 10000; n++ {
		candidate := fmt.Sprintf("%s %d%s", stem, n, ext)
		if trashNameFree(filesDir, infoDir, candidate) {
			return candidate, nil
		}
	}
	return "", os.ErrExist
}

func trashNameFree(filesDir, infoDir, name string) bool {
	if _, err := os.Lstat(filepath.Join(filesDir, name)); !os.IsNotExist(err) {
		return false
	}
	if infoDir == "" {
		return true
	}
	_, err := os.Lstat(filepath.Join(infoDir, name+".trashinfo"))
	return os.IsNotExist(err)
}

func splitTrashName(name string) (string, string) {
	if i := strings.IndexByte(name, '.'); i > 0 {
		return name[:i], name[i:]
	}
	return name, ""
}

func escapeTrashPath(p string) string {
	var b strings.Builder
	for i := 0; i < len(p); i++ {
		c := p[i]
		if c == '/' || c == '-' || c == '_' || c == '.' || c == '~' || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') {
			b.WriteByte(c)
			continue
		}
		fmt.Fprintf(&b, "%%%02X", c)
	}
	return b.String()
}
