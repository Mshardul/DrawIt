//go:build windows

package trash

import (
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"
)

func move(path string) error {
	abs, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	if !recycleBin(abs) {
		return ErrNoTrash
	}
	from, err := syscall.UTF16FromString(abs)
	if err != nil {
		return err
	}
	from = append(from, 0)
	op := shFileOp{
		Func:  3,
		From:  &from[0],
		Flags: 0x40 | 0x10 | 0x400,
	}
	r, _, _ := syscall.NewLazyDLL("shell32.dll").NewProc("SHFileOperationW").Call(uintptr(unsafe.Pointer(&op)))
	if r != 0 {
		return syscall.Errno(r)
	}
	return nil
}

func recycleBin(path string) bool {
	vol := filepath.VolumeName(path)
	if vol == "" {
		return false
	}
	if !strings.HasSuffix(vol, `\`) {
		vol += `\`
	}
	root, err := syscall.UTF16PtrFromString(vol)
	if err != nil {
		return false
	}
	info := shQueryRBInfo{CbSize: uint32(unsafe.Sizeof(shQueryRBInfo{}))}
	r, _, _ := syscall.NewLazyDLL("shell32.dll").NewProc("SHQueryRecycleBinW").Call(uintptr(unsafe.Pointer(root)), uintptr(unsafe.Pointer(&info)))
	return r == 0
}

type shFileOp struct {
	Hwnd         uintptr
	Func         uint32
	From         *uint16
	To           *uint16
	Flags        uint16
	Any          int32
	NameMappings uintptr
	Progress     *uint16
}

type shQueryRBInfo struct {
	CbSize      uint32
	I64Size     int64
	I64NumItems int64
}
