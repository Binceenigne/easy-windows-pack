//go:build windows && cgo

// Use the public C ABI compiled and linked by the pinned webview_go module.
// WEBVIEW_HEADER prevents a second C++ implementation from being compiled here.
#define WEBVIEW_STATIC
#define WEBVIEW_HEADER
#include "include/webview.h"
#include "ewp_host.hpp"
#include "bridge.h"
#include <cstring>

extern "C" void ewpGoRPC(char *id, char *request, void *host);

namespace {
char *copy(const std::string &value) noexcept {
  auto *out = static_cast<char *>(std::malloc(value.size() + 1));
  if (out) std::memcpy(out, value.c_str(), value.size() + 1);
  return out;
}
void rpc(const char *id, const char *request, void *host) {
  // webview_go's pinned webview 0.11 dispatches binding callbacks onto the UI
  // event loop. The Go callback stays synchronous; native code verifies thread ID.
  ewpGoRPC(const_cast<char *>(id), const_cast<char *>(request), host);
}
}

extern "C" ewp_host ewp_create(char **error) {
  *error = nullptr;
  try {
    auto host = std::make_unique<ewp::Host>();
    webview_bind(host->view(), "__ewp_rpc", rpc, host.get());
    return host.release();
  } catch (const std::exception &e) { *error = copy(e.what()); }
  catch (...) { *error = copy("Cannot create native host"); }
  return nullptr;
}
extern "C" void ewp_destroy(ewp_host host) { delete static_cast<ewp::Host *>(host); }
extern "C" char *ewp_start(ewp_host host) {
  try { static_cast<ewp::Host *>(host)->start(); return nullptr; }
  catch (const std::exception &e) { return copy(e.what()); }
  catch (...) { return copy("Native event loop failed"); }
}
extern "C" char *ewp_command_run(ewp_host host, int command, int a, int b) {
  try { return copy(static_cast<ewp::Host *>(host)->command(static_cast<ewp::Command>(command), a, b)); }
  catch (const std::exception &e) { return copy(ewp::error(e.what())); }
  catch (...) { return copy(ewp::error("Native operation failed")); }
}
extern "C" void ewp_reply(ewp_host host, const char *id, const char *result) {
  try { static_cast<ewp::Host *>(host)->reply(id, result); } catch (...) {}
}
extern "C" void ewp_show_error(const char *message) {
  try { MessageBoxW(nullptr, ewp::wide(message).c_str(), L"Easy Windows Pack", MB_OK | MB_ICONERROR); }
  catch (...) { MessageBoxW(nullptr, L"Native host failed", L"Easy Windows Pack", MB_OK | MB_ICONERROR); }
}