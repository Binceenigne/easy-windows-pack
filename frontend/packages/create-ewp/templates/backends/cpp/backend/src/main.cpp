#define WEBVIEW_HEADER
#include <webview/webview.h>
#include "ewp_host.hpp"
#include <nlohmann/json.hpp>
#include <cmath>
#include <map>
#include <shellapi.h>

namespace {
using json = nlohmann::json;
bool options() {
  int argc{};
  auto argv = CommandLineToArgvW(GetCommandLineW(), &argc);
  ewp::require(argv != nullptr, "Cannot read command line");
  std::unique_ptr<wchar_t *, decltype(&LocalFree)> arguments(argv, LocalFree);
  bool url = false, assets = false;
  for (int i = 1; i < argc; ++i) {
    std::wstring option(argv[i]);
    if (option == L"--help") {
      const char *usage = "ewp-host [--url <loopback HTTP(S) URL> | --assets <directory>] [--title <text>] [--titlebar-mode <default|minimal|native>] [--debug]\r\n";
      DWORD written{};
      WriteFile(GetStdHandle(STD_OUTPUT_HANDLE), usage, DWORD(lstrlenA(usage)), &written, nullptr);
      return false;
    }
    if (option == L"--debug") { SetEnvironmentVariableW(L"EWP_DEBUG", L"1"); continue; }
    ewp::require(option == L"--url" || option == L"--assets" || option == L"--title" || option == L"--titlebar-mode", "Unknown host option (see --help)");
    ewp::require(i + 1 < argc && argv[i + 1][0], "Missing host option value");
    const wchar_t *key = L"EWP_APP_TITLE";
    if (option == L"--titlebar-mode") key = L"EWP_TITLEBAR_MODE";
    if (option == L"--url") { url = true; key = L"EWP_DEV_URL"; SetEnvironmentVariableW(L"EWP_ASSETS", nullptr); }
    if (option == L"--assets") { assets = true; key = L"EWP_ASSETS"; SetEnvironmentVariableW(L"EWP_DEV_URL", nullptr); }
    ewp::require(!(url && assets), "--url and --assets are mutually exclusive");
    ewp::require(SetEnvironmentVariableW(key, argv[++i]) != FALSE, "Cannot configure host option");
  }
  ewp::require(ewp::environment(L"EWP_DEV_URL").empty() || ewp::environment(L"EWP_ASSETS").empty(),
               "EWP_DEV_URL and EWP_ASSETS are mutually exclusive");
  return true;
}
void count(const json &args, std::size_t expected) {
  ewp::require(args.size() == expected, "Wrong number of arguments");
}
std::string text(const json &value) {
  ewp::require(value.is_string(), "Expected string argument");
  return value.get<std::string>();
}
int dimension(const json &value, int minimum) {
  ewp::require(value.is_number(), "Window size must contain numbers");
  double number = value.get<double>();
  ewp::require(std::isfinite(number) && std::floor(number) == number &&
                   number >= minimum && number <= 16384,
               "Window size must contain integers within the supported range");
  return static_cast<int>(number);
}
std::string call(ewp::Host &host, const char *request) {
  auto request_json = json::parse(request);
  ewp::require(request_json.is_array() && request_json.size() == 2 &&
                   request_json[0].is_string() && request_json[1].is_array(),
               "Expected [method, args]");
  auto method = text(request_json[0]);
  const auto &args = request_json[1];
  if (method == "get_window_state" || method == "get_window_size" || method == "get_always_on_top") {
    count(args, 0); return host.command(ewp::State);
  }
  if (method == "window_action") {
    count(args, 1);
    static const std::map<std::string, ewp::Command> actions = {
      {"minimize", ewp::Minimize}, {"maximize", ewp::Maximize},
      {"restore", ewp::Restore}, {"close", ewp::Close}};
    auto action = actions.find(text(args[0]));
    ewp::require(action != actions.end(), "Unknown window action");
    return host.command(action->second);
  }
  if (method == "native_drag") {
    count(args, 1);
    static const std::map<std::string, int> directions = {
      {"move", HTCAPTION}, {"left", HTLEFT}, {"right", HTRIGHT}, {"top", HTTOP},
      {"bottom", HTBOTTOM}, {"top-left", HTTOPLEFT}, {"top-right", HTTOPRIGHT},
      {"bottom-left", HTBOTTOMLEFT}, {"bottom-right", HTBOTTOMRIGHT}};
    auto direction = directions.find(text(args[0]));
    ewp::require(direction != directions.end(), "Unknown drag direction");
    return host.command(ewp::Drag, direction->second);
  }
  if (method == "set_always_on_top") {
    count(args, 1);
    ewp::require(args[0].is_boolean(), "Expected boolean argument");
    return host.command(ewp::Topmost, args[0].get<bool>());
  }
  if (method == "toggle_always_on_top") { count(args, 0); return host.command(ewp::Topmost, -1); }
  if (method == "set_window_size") {
    count(args, 2);
    return host.command(ewp::Resize, dimension(args[0], 320), dimension(args[1], 200));
  }
  if (method == "hide_window") { count(args, 0); return host.command(ewp::Hide); }
  if (method == "show_window") { count(args, 0); return host.command(ewp::Show); }
  if (method == "set_titlebar_mode") {
    count(args, 1);
    auto mode = text(args[0]);
    ewp::require(mode == "default" || mode == "minimal" || mode == "native", "Unknown titlebar mode");
    return host.command(ewp::Mode, mode == "native" ? 2 : mode == "minimal" ? 1 : 0);
  }
  throw std::runtime_error("Unknown RPC method: " + method);
}
void rpc(const char *id, const char *request, void *data) noexcept {
  auto &host = *static_cast<ewp::Host *>(data);
  try { host.reply(id, call(host, request)); }
  catch (const std::exception &error) { host.reply(id, ewp::error(error.what())); }
  catch (...) { host.reply(id, ewp::error("Unhandled native error")); }
}
}

int WINAPI WinMain(HINSTANCE, HINSTANCE, LPSTR, int) {
  try {
    if (!options()) return 0;
    ewp::Host host;
    // webview 0.12 dispatches bound callbacks onto its UI event loop.
    ewp::require(webview_bind(host.view(), "__ewp_rpc", rpc, &host) == WEBVIEW_ERROR_OK,
                 "Cannot bind RPC");
    host.start();
    return 0;
  } catch (const std::exception &error) {
    DWORD written{};
    WriteFile(GetStdHandle(STD_ERROR_HANDLE), error.what(), DWORD(lstrlenA(error.what())), &written, nullptr);
    if (ewp::environment(L"EWP_HOST_NO_DIALOG") != L"1")
      MessageBoxW(nullptr, ewp::wide(error.what()).c_str(), L"Easy Windows Pack", MB_OK | MB_ICONERROR);
    return 1;
  }
}