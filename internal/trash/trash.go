// Package trash moves a file or folder into the operating system's trash.
package trash

import "errors"

// ErrNoTrash means this system has no trash. The item is left in place.
var ErrNoTrash = errors.New("no trash")

// Move puts the file or folder at path into the operating system's trash.
func Move(path string) error { return move(path) }
