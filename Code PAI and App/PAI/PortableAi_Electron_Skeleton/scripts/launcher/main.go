// PortableAI Windows root launcher.
// Sits at the USB root and starts the packaged Electron app that lives in
// app_data\windows\. Build with:
//
//	GOOS=windows GOARCH=amd64 go build -ldflags="-H=windowsgui" -o PortableAI.exe
//
// Notes for antivirus friendliness: no window hiding, no process-attribute
// tricks — just resolve the path, report a clear error if the target is
// missing, and hand off. The .syso files embed the icon + version info,
// which also reduces Defender/SmartScreen false positives.
package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"unsafe"
)

func errorBox(msg string) {
	user32 := syscall.NewLazyDLL("user32.dll")
	msgBox := user32.NewProc("MessageBoxW")
	title, _ := syscall.UTF16PtrFromString("PortableAI")
	text, _ := syscall.UTF16PtrFromString(msg)
	// 0x10 = MB_ICONERROR
	msgBox.Call(0, uintptr(unsafe.Pointer(text)), uintptr(unsafe.Pointer(title)), 0x10)
}

func main() {
	exe, err := os.Executable()
	if err != nil {
		errorBox("Could not determine the launcher's own location.")
		return
	}
	root := filepath.Dir(exe)
	target := filepath.Join(root, "app_data", "windows", "PortableAI.exe")

	if _, err := os.Stat(target); err != nil {
		errorBox("PortableAI.exe was not found at:\n" + target +
			"\n\nMake sure you copied the WHOLE PortableAI folder to the drive.")
		return
	}

	cmd := exec.Command(target, os.Args[1:]...)
	cmd.Dir = filepath.Dir(target)
	if err := cmd.Start(); err != nil {
		errorBox("PortableAI failed to start:\n" + err.Error())
	}
}
