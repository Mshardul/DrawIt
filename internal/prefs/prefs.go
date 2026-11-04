package prefs

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"sync"
)

const fileName = "preferences.json"

var ErrUnreadable = errors.New("preferences file cannot be read")

var ErrBadPatch = errors.New("preferences patch must be an object of objects")

var ErrNotObject = errors.New("preferences key is not an object")

type View struct {
	JSON       []byte
	Unreadable bool
}

type Store struct {
	path string
	mu   sync.Mutex
}

func Dir() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "drawit"), nil
}

func Open(dir string) *Store {
	return &Store{path: filepath.Join(dir, fileName)}
}

func (s *Store) Read() (View, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	obj, unreadable, err := s.load()
	if err != nil {
		return View{}, err
	}
	if unreadable {
		return View{JSON: defaults(), Unreadable: true}, nil
	}
	return View{JSON: document(obj)}, nil
}

func (s *Store) Patch(patch []byte) (View, error) {
	namespaces, err := patchObject(patch)
	if err != nil {
		return View{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	obj, unreadable, err := s.load()
	if err != nil {
		return View{}, err
	}
	if unreadable {
		return View{JSON: defaults(), Unreadable: true}, ErrUnreadable
	}
	if len(namespaces) == 0 {
		return View{JSON: document(obj)}, nil
	}
	next := make(map[string]json.RawMessage, len(obj)+len(namespaces)+1)
	for k, v := range obj {
		next[k] = append(json.RawMessage(nil), v...)
	}
	for name, raw := range namespaces {
		merged, err := mergeNamespace(next[name], raw)
		if err != nil {
			return View{}, err
		}
		next[name] = merged
	}
	if _, ok := next["version"]; !ok {
		next["version"] = json.RawMessage("1")
	}
	if err := s.write(next); err != nil {
		return View{}, err
	}
	return View{JSON: document(next)}, nil
}

func defaults() []byte {
	return []byte(`{"version":1}`)
}

func document(obj map[string]json.RawMessage) []byte {
	if len(obj) == 0 {
		return defaults()
	}
	out := make(map[string]json.RawMessage, len(obj)+1)
	for k, v := range obj {
		out[k] = v
	}
	if _, ok := out["version"]; !ok {
		out["version"] = json.RawMessage("1")
	}
	b, err := json.Marshal(out)
	if err != nil {
		return defaults()
	}
	return b
}

func (s *Store) load() (map[string]json.RawMessage, bool, error) {
	b, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, false, nil
		}
		return nil, true, nil
	}
	obj, ok := objectMap(b)
	if !ok {
		return nil, true, nil
	}
	if ver, ok := obj["version"]; ok && !jsonNumber(ver) {
		return nil, true, nil
	}
	return obj, false, nil
}

func patchObject(patch []byte) (map[string]json.RawMessage, error) {
	obj, ok := objectMap(patch)
	if !ok {
		return nil, ErrBadPatch
	}
	for name, raw := range obj {
		if name == "version" {
			return nil, ErrBadPatch
		}
		if _, ok := objectMap(raw); !ok {
			return nil, ErrBadPatch
		}
	}
	return obj, nil
}

func mergeNamespace(existing, patch json.RawMessage) (json.RawMessage, error) {
	keys, ok := objectMap(patch)
	if !ok {
		return nil, ErrBadPatch
	}
	base := map[string]json.RawMessage{}
	if len(bytes.TrimSpace(existing)) > 0 {
		base, ok = objectMap(existing)
		if !ok {
			return nil, ErrNotObject
		}
	}
	for k, v := range keys {
		base[k] = append(json.RawMessage(nil), v...)
	}
	b, err := json.Marshal(base)
	if err != nil {
		return nil, err
	}
	return b, nil
}

func objectMap(b []byte) (map[string]json.RawMessage, bool) {
	if len(bytes.TrimSpace(b)) == 0 {
		return nil, false
	}
	dec := json.NewDecoder(bytes.NewReader(b))
	var obj map[string]json.RawMessage
	if err := dec.Decode(&obj); err != nil || obj == nil {
		return nil, false
	}
	var extra any
	if err := dec.Decode(&extra); err != io.EOF {
		return nil, false
	}
	return obj, true
}

// A quoted string of digits still decodes as a number, so the first byte has to be a digit.
func jsonNumber(raw json.RawMessage) bool {
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 {
		return false
	}
	switch raw[0] {
	case '-', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9':
	default:
		return false
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	var n float64
	if err := dec.Decode(&n); err != nil {
		return false
	}
	var extra any
	return dec.Decode(&extra) == io.EOF
}

func (s *Store) write(obj map[string]json.RawMessage) error {
	body, err := json.Marshal(obj)
	if err != nil {
		return err
	}
	body = append(body, '\n')
	dir := filepath.Dir(s.path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	f, err := os.CreateTemp(dir, ".preferences-*.tmp")
	if err != nil {
		return err
	}
	tmp := f.Name()
	done := false
	defer func() {
		if !done {
			_ = os.Remove(tmp)
		}
	}()
	if _, err := f.Write(body); err != nil {
		_ = f.Close()
		return err
	}
	if err := f.Sync(); err != nil {
		_ = f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	if err := os.Rename(tmp, s.path); err != nil {
		return err
	}
	done = true
	return nil
}
