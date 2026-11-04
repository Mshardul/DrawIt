package prefs_test

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/Mshardul/DrawIt/internal/prefs"
)

func TestMissingFileReadsAsVersionOne(t *testing.T) {
	dir := t.TempDir()
	view, err := prefs.Open(dir).Read()
	if err != nil {
		t.Fatal(err)
	}
	if view.Unreadable {
		t.Fatal("a missing file is readable defaults")
	}
	assertJSON(t, view.JSON, `{"version":1}`)
	if _, err := os.Stat(filepath.Join(dir, "preferences.json")); !os.IsNotExist(err) {
		t.Fatalf("reading created the file: %v", err)
	}
}

func TestPatchMergesNamespacesAndKeepsUnknownKeys(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "preferences.json")
	writePrefs(t, path, `{"version":1,"plugin":"keep-me","editor":{"grid":true,"future":1}}`)
	store := prefs.Open(dir)

	view, err := store.Patch([]byte(`{"editor":{"grid":false,"snap":true}}`))
	if err != nil {
		t.Fatal(err)
	}
	assertJSON(t, view.JSON, `{"version":1,"plugin":"keep-me","editor":{"grid":false,"snap":true,"future":1}}`)

	view, err = store.Patch([]byte(`{"panels":{"library":224}}`))
	if err != nil {
		t.Fatal(err)
	}
	assertJSON(t, view.JSON, `{"version":1,"plugin":"keep-me","editor":{"grid":false,"snap":true,"future":1},"panels":{"library":224}}`)

	view, err = store.Read()
	if err != nil {
		t.Fatal(err)
	}
	assertJSON(t, view.JSON, `{"version":1,"plugin":"keep-me","editor":{"grid":false,"snap":true,"future":1},"panels":{"library":224}}`)
}

func TestPatchWritesVersionWhenTheFileOmitsIt(t *testing.T) {
	dir := t.TempDir()
	writePrefs(t, filepath.Join(dir, "preferences.json"), `{"editor":{"grid":true}}`)
	view, err := prefs.Open(dir).Read()
	if err != nil {
		t.Fatal(err)
	}
	assertJSON(t, view.JSON, `{"version":1,"editor":{"grid":true}}`)
	onDisk := readPrefs(t, filepath.Join(dir, "preferences.json"))
	assertJSON(t, onDisk, `{"editor":{"grid":true}}`)

	view, err = prefs.Open(dir).Patch([]byte(`{"editor":{"snap":false}}`))
	if err != nil {
		t.Fatal(err)
	}
	assertJSON(t, view.JSON, `{"version":1,"editor":{"grid":true,"snap":false}}`)
}

func TestPatchKeepsANewerVersionNumber(t *testing.T) {
	dir := t.TempDir()
	writePrefs(t, filepath.Join(dir, "preferences.json"), `{"version":2,"editor":{"grid":true}}`)
	view, err := prefs.Open(dir).Patch([]byte(`{"editor":{"snap":true}}`))
	if err != nil {
		t.Fatal(err)
	}
	assertJSON(t, view.JSON, `{"version":2,"editor":{"grid":true,"snap":true}}`)
}

func TestUnreadableFileIsLeftAloneAndWritesAreRefused(t *testing.T) {
	for name, body := range map[string]string{
		"broken json":    "{not json",
		"array":          `[1,2]`,
		"version string": `{"version":"1","editor":{"grid":true}}`,
		"empty":          ``,
	} {
		t.Run(name, func(t *testing.T) {
			dir := t.TempDir()
			path := filepath.Join(dir, "preferences.json")
			writePrefs(t, path, body)
			before := readPrefs(t, path)
			store := prefs.Open(dir)

			view, err := store.Read()
			if err != nil {
				t.Fatal(err)
			}
			if !view.Unreadable {
				t.Fatal("file was treated as readable")
			}
			assertJSON(t, view.JSON, `{"version":1}`)

			view, err = store.Patch([]byte(`{"editor":{"grid":true}}`))
			if !errors.Is(err, prefs.ErrUnreadable) {
				t.Fatalf("patch error = %v, want unreadable", err)
			}
			assertJSON(t, view.JSON, `{"version":1}`)
			if got := readPrefs(t, path); !bytes.Equal(got, before) {
				t.Fatalf("file changed to %q", got)
			}
		})
	}
}

func TestPatchRefusesToReplaceAKeyThatIsNotAnObject(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "preferences.json")
	writePrefs(t, path, `{"version":1,"plugin":"keep-me"}`)
	before := readPrefs(t, path)

	_, err := prefs.Open(dir).Patch([]byte(`{"plugin":{"a":1}}`))
	if err == nil || errors.Is(err, prefs.ErrUnreadable) {
		t.Fatalf("patch error = %v, want a refusal that is not unreadable", err)
	}
	if got := readPrefs(t, path); !bytes.Equal(got, before) {
		t.Fatalf("file changed to %q", got)
	}
}

func TestPatchMustBeAnObjectOfObjects(t *testing.T) {
	dir := t.TempDir()
	store := prefs.Open(dir)
	for _, body := range []string{`[]`, `1`, `{"editor":1}`, `{"version":1}`, ``, `{`} {
		if _, err := store.Patch([]byte(body)); err == nil || errors.Is(err, prefs.ErrUnreadable) {
			t.Fatalf("patch %s error = %v, want a bad patch", body, err)
		}
	}
	if _, err := os.Stat(filepath.Join(dir, "preferences.json")); !os.IsNotExist(err) {
		t.Fatalf("a refused patch created the file: %v", err)
	}
}

func TestEmptyPatchDoesNotCreateOrRewriteTheFile(t *testing.T) {
	dir := t.TempDir()
	view, err := prefs.Open(dir).Patch([]byte(`{}`))
	if err != nil {
		t.Fatal(err)
	}
	assertJSON(t, view.JSON, `{"version":1}`)
	if _, err := os.Stat(filepath.Join(dir, "preferences.json")); !os.IsNotExist(err) {
		t.Fatalf("empty patch created the file: %v", err)
	}

	path := filepath.Join(dir, "preferences.json")
	original := []byte("{\n  \"version\": 1, \"editor\": {\"grid\": true}\n}\n")
	writePrefs(t, path, string(original))
	if _, err := prefs.Open(dir).Patch([]byte(`{}`)); err != nil {
		t.Fatal(err)
	}
	if got := readPrefs(t, path); !bytes.Equal(got, original) {
		t.Fatalf("empty patch rewrote the file as %q", got)
	}
}

func TestDirectoryInPlaceOfTheFileIsLeftAlone(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "preferences.json")
	if err := os.Mkdir(path, 0o755); err != nil {
		t.Fatal(err)
	}
	store := prefs.Open(dir)
	view, err := store.Read()
	if err != nil {
		t.Fatal(err)
	}
	if !view.Unreadable {
		t.Fatal("a directory was treated as readable")
	}
	if _, err := store.Patch([]byte(`{"editor":{"grid":true}}`)); !errors.Is(err, prefs.ErrUnreadable) {
		t.Fatalf("patch error = %v, want unreadable", err)
	}
	info, err := os.Stat(path)
	if err != nil || !info.IsDir() {
		t.Fatalf("path is no longer a directory: %v", err)
	}
}

func assertJSON(t *testing.T, got []byte, want string) {
	t.Helper()
	var have, need any
	if err := json.Unmarshal(got, &have); err != nil {
		t.Fatalf("got is not JSON (%v): %s", err, got)
	}
	if err := json.Unmarshal([]byte(want), &need); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(have, need) {
		t.Fatalf("got %s, want %s", got, want)
	}
}

func writePrefs(t *testing.T, path, body string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

func readPrefs(t *testing.T, path string) []byte {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return b
}
