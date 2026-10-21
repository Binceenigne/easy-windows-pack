//go:build windows && cgo

package main

/*
#cgo CXXFLAGS: -std=c++17 -DNOMINMAX -DUNICODE -D_UNICODE -I${SRCDIR}/include
#cgo LDFLAGS: -static -lstdc++ -lcomctl32 -lwinhttp -lole32 -luser32
#include "bridge.h"
*/
import "C"

import (
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"math"
	"os"
	"runtime"
	"unsafe"

	// The official CGO package supplies the webview C ABI and its Windows loader.
	// Its Go facade does not expose the native WebView2 controller; use the public
	// C ABI for that handle, never reflection or private Go struct fields.
	_ "github.com/webview/webview_go"
)

func failure(err error) string {
	data, _ := json.Marshal(map[string]any{"ok": false, "error": err.Error()})
	return string(data)
}

func stringArg(value json.RawMessage) (string, error) {
	var result string
	if bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
		return "", errors.New("expected string argument")
	}
	err := json.Unmarshal(value, &result)
	return result, err
}

func sizeArg(value json.RawMessage, minimum float64) (int, error) {
	var result float64
	if err := json.Unmarshal(value, &result); err != nil {
		return 0, errors.New("window size must contain numbers")
	}
	if math.IsNaN(result) || math.IsInf(result, 0) || math.Trunc(result) != result || result < minimum || result > 16384 {
		return 0, errors.New("window size must contain integers within the supported range")
	}
	return int(result), nil
}

func decode(request string) (int, int, int, error) {
	var envelope []json.RawMessage
	if err := json.Unmarshal([]byte(request), &envelope); err != nil || len(envelope) != 2 {
		return 0, 0, 0, errors.New("expected [method, args]")
	}
	method, err := stringArg(envelope[0])
	if err != nil {
		return 0, 0, 0, err
	}
	var args []json.RawMessage
	if err := json.Unmarshal(envelope[1], &args); err != nil || bytes.Equal(bytes.TrimSpace(envelope[1]), []byte("null")) {
		return 0, 0, 0, errors.New("expected argument array")
	}
	counts := map[string]int{
		"get_window_state": 0, "get_window_size": 0, "get_always_on_top": 0,
		"window_action": 1, "native_drag": 1, "set_always_on_top": 1,
		"toggle_always_on_top": 0, "set_window_size": 2,
		"hide_window": 0, "show_window": 0, "set_titlebar_mode": 1,
	}
	count, known := counts[method]
	if !known {
		return 0, 0, 0, fmt.Errorf("unknown RPC method: %s", method)
	}
	if len(args) != count {
		return 0, 0, 0, errors.New("wrong number of arguments")
	}
	switch method {
	case "get_window_state", "get_window_size", "get_always_on_top":
		return C.EWP_STATE, 0, 0, nil
	case "toggle_always_on_top":
		return C.EWP_TOPMOST, -1, 0, nil
	case "hide_window":
		return C.EWP_HIDE, 0, 0, nil
	case "show_window":
		return C.EWP_SHOW, 0, 0, nil
	case "set_always_on_top":
		var enabled bool
		if err := json.Unmarshal(args[0], &enabled); err != nil || bytes.Equal(bytes.TrimSpace(args[0]), []byte("null")) {
			return 0, 0, 0, errors.New("expected boolean argument")
		}
		if enabled {
			return C.EWP_TOPMOST, 1, 0, nil
		}
		return C.EWP_TOPMOST, 0, 0, nil
	case "set_window_size":
		width, err := sizeArg(args[0], 320)
		if err != nil {
			return 0, 0, 0, err
		}
		height, err := sizeArg(args[1], 200)
		return C.EWP_RESIZE, width, height, err
	}
	value, err := stringArg(args[0])
	if err != nil {
		return 0, 0, 0, err
	}
	switch method {
	case "window_action":
		actions := map[string]int{"minimize": C.EWP_MINIMIZE, "maximize": C.EWP_MAXIMIZE, "restore": C.EWP_RESTORE, "close": C.EWP_CLOSE}
		if action, ok := actions[value]; ok {
			return action, 0, 0, nil
		}
	case "native_drag":
		// Win32 HTCAPTION and HTLEFT..HTBOTTOMRIGHT, all pointer-sized native
		// message parameters are constructed inside the C++ UI-thread bridge.
		directions := map[string]int{"move": 2, "left": 10, "right": 11, "top": 12, "top-left": 13, "top-right": 14, "bottom": 15, "bottom-left": 16, "bottom-right": 17}
		if hit, ok := directions[value]; ok {
			return C.EWP_DRAG, hit, 0, nil
		}
	case "set_titlebar_mode":
		modes := map[string]int{"default": 0, "minimal": 1, "native": 2}
		if mode, ok := modes[value]; ok {
			return C.EWP_MODE, mode, 0, nil
		}
	}
	return 0, 0, 0, fmt.Errorf("unsupported %s argument: %s", method, value)
}

func invoke(host C.ewp_host, request string) string {
	command, a, b, err := decode(request)
	if err != nil {
		return failure(err)
	}
	result := C.ewp_command_run(host, C.int(command), C.int(a), C.int(b))
	if result == nil {
		return failure(errors.New("native result allocation failed"))
	}
	defer C.free(unsafe.Pointer(result))
	return C.GoString(result)
}

//export ewpGoRPC
func ewpGoRPC(id *C.char, request *C.char, host unsafe.Pointer) {
	// This callback enters from the native UI thread. Do not move it to a goroutine
	// or synchronously wait for another dispatch onto the same event loop.
	result := ""
	defer func() {
		if recovered := recover(); recovered != nil {
			result = failure(fmt.Errorf("RPC panic: %v", recovered))
		}
		response := C.CString(result)
		defer C.free(unsafe.Pointer(response))
		C.ewp_reply(C.ewp_host(host), id, response)
	}()
	result = invoke(C.ewp_host(host), C.GoString(request))
}

func run() error {
	var nativeError *C.char
	host := C.ewp_create(&nativeError)
	if nativeError != nil {
		defer C.free(unsafe.Pointer(nativeError))
		return errors.New(C.GoString(nativeError))
	}
	if host == nil {
		return errors.New("cannot allocate native host")
	}
	defer C.ewp_destroy(host)
	if nativeError = C.ewp_start(host); nativeError != nil {
		defer C.free(unsafe.Pointer(nativeError))
		return errors.New(C.GoString(nativeError))
	}
	return nil
}

func options() error {
	url := flag.String("url", "", "Loopback HTTP(S) development URL")
	assets := flag.String("assets", "", "Production frontend directory containing index.html")
	title := flag.String("title", "", "Native window title")
	mode := flag.String("titlebar-mode", "", "Titlebar: default, minimal, native")
	debug := flag.Bool("debug", false, "Enable WebView2 developer tools")
	flag.Parse()
	if flag.NArg() != 0 || (*url != "" && *assets != "") {
		return errors.New("expected [--url URL | --assets directory] [--title text] [--debug]")
	}
	for _, option := range []struct{ key, value string }{{"EWP_DEV_URL", *url}, {"EWP_ASSETS", *assets}, {"EWP_APP_TITLE", *title}, {"EWP_TITLEBAR_MODE", *mode}} {
		if option.value != "" {
			if err := os.Setenv(option.key, option.value); err != nil { return err }
		}
	}
	if *url != "" { os.Unsetenv("EWP_ASSETS") }
	if *assets != "" { os.Unsetenv("EWP_DEV_URL") }
	if *debug { os.Setenv("EWP_DEBUG", "1") }
	if os.Getenv("EWP_DEV_URL") != "" && os.Getenv("EWP_ASSETS") != "" {
		return errors.New("EWP_DEV_URL and EWP_ASSETS are mutually exclusive")
	}
	return nil
}

func main() {
	if err := options(); err != nil { fmt.Fprintln(os.Stderr, err); os.Exit(2) }
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		message := C.CString(err.Error())
		if os.Getenv("EWP_HOST_NO_DIALOG") != "1" { C.ewp_show_error(message) }
		C.free(unsafe.Pointer(message))
		os.Exit(1)
	}
}