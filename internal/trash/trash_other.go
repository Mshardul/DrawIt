//go:build !darwin && !linux && !windows

package trash

func move(string) error { return ErrNoTrash }
