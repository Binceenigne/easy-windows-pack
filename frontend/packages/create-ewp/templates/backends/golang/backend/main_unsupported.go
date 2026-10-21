//go:build !windows || !cgo

package main

import (
	"fmt"
	"os"
)

func main() {
	fmt.Fprintln(os.Stderr, "ewp-host requires Windows, CGO_ENABLED=1, and a MinGW-w64 C/C++ compiler matching GOARCH")
	os.Exit(1)
}