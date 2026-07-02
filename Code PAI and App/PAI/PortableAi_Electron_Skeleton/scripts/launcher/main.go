package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
)

func main() {
	exe, _ := os.Executable()
	root := filepath.Dir(exe)
	target := filepath.Join(root, "app_data", "windows", "PortableAI.exe")

	args := append([]string{target}, os.Args[1:]...)
	cmd := &exec.Cmd{
		Path:        target,
		Args:        args,
		Dir:         filepath.Dir(target),
		SysProcAttr: &syscall.SysProcAttr{HideWindow: true},
	}
	cmd.Start()
}
