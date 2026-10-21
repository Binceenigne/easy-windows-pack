#pragma once

#ifndef _WIN32
#error This host requires Windows and WebView2.
#endif

// Include the official webview C API before this file. The Go copy uses the
// symbols compiled by webview_go; the C++ copy uses webview::core_static.
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <windowsx.h>
#include <commctrl.h>
#include <winhttp.h>
#include <WebView2.h>
#include <algorithm>
#include <atomic>
#include <filesystem>
#include <functional>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

namespace ewp {

inline void require(bool ok, const char *message) {
  if (!ok) throw std::runtime_error(message);
}
inline void checked(HRESULT hr, const char *message) {
  require(SUCCEEDED(hr), message);
}
inline void trace(const char *message) noexcept {
  wchar_t enabled[2]{};
  if (GetEnvironmentVariableW(L"EWP_HOST_TRACE", enabled, 2) != 1 || enabled[0] != L'1') return;
  DWORD written{};
  auto output = GetStdHandle(STD_ERROR_HANDLE);
  WriteFile(output, message, static_cast<DWORD>(lstrlenA(message)), &written, nullptr);
  WriteFile(output, "\r\n", 2, &written, nullptr);
}
inline std::wstring wide(const std::string &s) {
  if (s.empty()) return {};
  int n = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, s.data(),
                            static_cast<int>(s.size()), nullptr, 0);
  require(n > 0, "Invalid UTF-8");
  std::wstring out(n, L'\0');
  MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, s.data(),
                      static_cast<int>(s.size()), &out[0], n);
  return out;
}
inline std::string utf8(const std::wstring &s) {
  if (s.empty()) return {};
  int n = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, s.data(),
                            static_cast<int>(s.size()), nullptr, 0, nullptr, nullptr);
  require(n > 0, "Invalid UTF-16");
  std::string out(n, '\0');
  WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, s.data(),
                      static_cast<int>(s.size()), &out[0], n, nullptr, nullptr);
  return out;
}
inline std::wstring environment(const wchar_t *key) {
  DWORD n = GetEnvironmentVariableW(key, nullptr, 0);
  if (!n) return {};
  std::wstring out(n, L'\0');
  DWORD count = GetEnvironmentVariableW(key, &out[0], n);
  require(count < n, "Environment changed while reading it");
  out.resize(count);
  return out;
}
inline std::filesystem::path executable_directory() {
  std::vector<wchar_t> path(32768);
  DWORD n = GetModuleFileNameW(nullptr, path.data(), static_cast<DWORD>(path.size()));
  require(n > 0 && n < path.size(), "Cannot locate executable");
  return std::filesystem::path(std::wstring(path.data(), n)).parent_path();
}
inline std::filesystem::path frontend_directory() {
  auto explicit_assets = environment(L"EWP_ASSETS");
  if (!explicit_assets.empty()) return std::filesystem::path(explicit_assets);
  auto exe = executable_directory();
  if (std::filesystem::is_regular_file(exe / L"frontend/index.html"))
    return exe / L"frontend";
  // Source builds may be backend/build/Release, backend/build, or backend.
  // Only a project with a backend directory is eligible for this fallback.
  for (auto p = exe; !p.empty(); p = p.parent_path()) {
    if (std::filesystem::is_directory(p / L"backend") &&
        std::filesystem::is_regular_file(p / L"output/frontend/index.html"))
      return p / L"output/frontend";
    if (p == p.parent_path()) break;
  }
  throw std::runtime_error("Missing frontend/index.html beside the executable (or project output/frontend/index.html)");
}

inline std::filesystem::path safe_assets(std::filesystem::path path) {
  path = std::filesystem::canonical(path);
  require(path.root_name().wstring().size() == 2 && path.root_name().wstring()[1] == L':',
          "Assets must be on a local disk");
  require(std::filesystem::is_regular_file(path / L"index.html"), "Assets must contain index.html");
  // WebView2's folder mapping follows filesystem links. Reject reparse points
  // before mapping so a junction/symlink cannot expose files outside the bundle.
  for (const auto &entry : std::filesystem::recursive_directory_iterator(path)) {
    auto flags = GetFileAttributesW(entry.path().c_str());
    require(flags != INVALID_FILE_ATTRIBUTES && !(flags & FILE_ATTRIBUTE_REPARSE_POINT),
            "Assets may not contain symbolic links or junctions");
  }
  return path;
}

inline void prepare_profile() {
  if (!environment(L"WEBVIEW2_USER_DATA_FOLDER").empty()) return;
  auto base = environment(L"LOCALAPPDATA");
  require(!base.empty(), "LOCALAPPDATA is required for the writable WebView2 profile");
  unsigned long long hash = 14695981039346656037ULL;
  for (auto c : executable_directory().wstring()) hash = (hash ^ c) * 1099511628211ULL;
  auto path = std::filesystem::path(base) / L"easy-windows-pack" / std::to_wstring(hash) / L"webview";
  std::filesystem::create_directories(path);
  require(SetEnvironmentVariableW(L"WEBVIEW2_USER_DATA_FOLDER", path.c_str()) != FALSE,
          "Cannot set WebView2 profile directory");
}

struct Origin {
  INTERNET_SCHEME scheme{};
  INTERNET_PORT port{};
  std::wstring host;
  bool operator==(const Origin &other) const {
    return scheme == other.scheme && port == other.port && host == other.host;
  }
};
inline Origin origin(const std::wstring &url) {
  require(url.find(L'\0') == std::wstring::npos && url.find(L'\\') == std::wstring::npos,
          "Invalid URL");
  URL_COMPONENTS parts{};
  parts.dwStructSize = sizeof(parts);
  parts.dwHostNameLength = parts.dwUserNameLength = parts.dwPasswordLength = DWORD(-1);
  require(WinHttpCrackUrl(url.c_str(), static_cast<DWORD>(url.size()), 0, &parts) != FALSE,
          "Invalid HTTP URL");
  require((parts.nScheme == INTERNET_SCHEME_HTTP || parts.nScheme == INTERNET_SCHEME_HTTPS) &&
              !parts.dwUserNameLength && !parts.dwPasswordLength && parts.dwHostNameLength,
          "URL must use HTTP(S) without credentials");
  std::wstring host(parts.lpszHostName, parts.dwHostNameLength);
  std::transform(host.begin(), host.end(), host.begin(), [](wchar_t c) {
    return c >= L'A' && c <= L'Z' ? c + (L'a' - L'A') : c;
  });
  return {parts.nScheme, parts.nPort, host};
}
inline std::string quote(const std::string &s) {
  static const char hex[] = "0123456789abcdef";
  std::string out = "\"";
  for (unsigned char c : s) {
    if (c == '"' || c == '\\') { out += '\\'; out += char(c); }
    else if (c < 32) { out += "\\u00"; out += hex[c >> 4]; out += hex[c & 15]; }
    else out += char(c);
  }
  return out + '"';
}
inline std::string error(const std::string &message) {
  return "{\"ok\":false,\"error\":" + quote(message) + "}";
}

// Explicit IIDs also work with MinGW, without compiler-specific __uuidof.
inline constexpr IID navigation_iid{0x9adbe429,0xf36d,0x432b,{0x9d,0xdc,0xf8,0x88,0x1f,0xbd,0x76,0xe3}};
inline constexpr IID completed_iid{0xd33a35bf,0x1c49,0x4f98,{0x93,0xab,0x00,0x6e,0x05,0x33,0xfe,0x1c}};
inline constexpr IID popup_iid{0xd4c185fe,0xc81c,0x4989,{0x97,0xaf,0x2d,0x3f,0xa7,0xab,0x56,0x51}};
inline constexpr IID permission_iid{0x15e1c6a3,0xc72a,0x4df3,{0x91,0xd7,0xd0,0x97,0xfb,0xec,0x6b,0xfd}};
inline constexpr IID core3_iid{0xa0d6df20,0x3b92,0x416d,{0xaa,0x0c,0x43,0x7a,0x9c,0x72,0x78,0x57}};
inline constexpr IID unknown_iid{0,0,0,{0xc0,0,0,0,0,0,0,0x46}};

template<class Interface, class Args> class Event final : public Interface {
  std::atomic<ULONG> refs_{1};
  IID iid_;
  std::function<HRESULT(Args *)> fn_;
public:
  Event(IID iid, std::function<HRESULT(Args *)> fn) : iid_(iid), fn_(std::move(fn)) {}
  ULONG STDMETHODCALLTYPE AddRef() override { return ++refs_; }
  ULONG STDMETHODCALLTYPE Release() override {
    ULONG refs = --refs_;
    if (!refs) delete this;
    return refs;
  }
  HRESULT STDMETHODCALLTYPE QueryInterface(REFIID iid, void **out) override {
    if (!out) return E_POINTER;
    *out = nullptr;
    if (!IsEqualIID(iid, iid_) && !IsEqualIID(iid, unknown_iid)) return E_NOINTERFACE;
    *out = static_cast<Interface *>(this);
    AddRef();
    return S_OK;
  }
  HRESULT STDMETHODCALLTYPE Invoke(ICoreWebView2 *, Args *args) override {
    // No C++ exception may cross a COM callback boundary.
    try { return fn_(args); } catch (...) { return E_FAIL; }
  }
};

enum Command { State, Minimize, Maximize, Restore, Close, Drag, Topmost, Resize, Hide, Show, Mode };

class Host {
  webview_t view_{};
  HWND hwnd_{};
  DWORD thread_ = GetCurrentThreadId();
  ICoreWebView2 *core_{};
  Origin trusted_{};
  std::wstring entry_;
  std::string mode_ = "default";
  bool stopping_ = false;
  bool subclassed_ = false, state_pending_ = false, close_requested_ = false;
  EventRegistrationToken nav_{}, frame_{}, popup_{}, completed_{}, permission_{};
  bool has_nav_ = false, has_frame_ = false, has_popup_ = false;
  bool has_completed_ = false, has_permission_ = false;
  static constexpr UINT state_message = WM_APP + 0x531;
  static constexpr UINT_PTR subclass_id = 0x455750;

  static LRESULT CALLBACK procedure(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp,
                                     UINT_PTR id, DWORD_PTR data) noexcept {
    auto *self = reinterpret_cast<Host *>(data);
    if (msg == WM_NCDESTROY) {
      RemoveWindowSubclass(hwnd, procedure, id);
      self->subclassed_ = false;
      self->hwnd_ = nullptr;
      return DefSubclassProc(hwnd, msg, wp, lp);
    }
    if (msg == WM_NCCALCSIZE && wp && self->mode_ != "native") return 0;
    if (msg == WM_GETMINMAXINFO && self->mode_ != "native") {
      auto result = DefSubclassProc(hwnd, msg, wp, lp);
      MONITORINFO info{};
      info.cbSize = sizeof(info);
      if (GetMonitorInfoW(MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST), &info)) {
        auto *limits = reinterpret_cast<MINMAXINFO *>(lp);
        limits->ptMaxPosition = {info.rcWork.left - info.rcMonitor.left,
                                 info.rcWork.top - info.rcMonitor.top};
        limits->ptMaxSize = {info.rcWork.right - info.rcWork.left,
                             info.rcWork.bottom - info.rcWork.top};
        limits->ptMinTrackSize = {320, 200};
      }
      return result;
    }
    if (msg == state_message) {
      self->state_pending_ = false;
      try { self->publish(); } catch (...) {}
      return 0;
    }
    auto result = DefSubclassProc(hwnd, msg, wp, lp);
    if (self->hwnd_ && (msg == WM_SIZE || msg == WM_SHOWWINDOW ||
        msg == WM_WINDOWPOSCHANGED || msg == WM_EXITSIZEMOVE || msg == WM_DPICHANGED))
      self->queue_state();
    return result;
  }

  void queue_state() noexcept {
    if (hwnd_ && !state_pending_) {
      state_pending_ = PostMessageW(hwnd_, state_message, 0, 0) != FALSE;
    }
  }
  bool trusted_url(const wchar_t *url) const noexcept {
    try {
      if (!url || !(origin(url) == trusted_)) return false;
      if (trusted_.host == L"ewp.local") {
        // Release allows only the entry document (query/hash routing is fine).
        std::wstring value(url);
        value.resize(value.find_first_of(L"?#") == std::wstring::npos
                         ? value.size() : value.find_first_of(L"?#"));
        return value == L"https://ewp.local/index.html";
      }
      return true;
    } catch (...) { return false; }
  }
  void secure_browser() {
    using Nav = Event<ICoreWebView2NavigationStartingEventHandler, ICoreWebView2NavigationStartingEventArgs>;
    auto *nav = new Nav(navigation_iid, [this](auto *args) {
      LPWSTR uri{};
      HRESULT hr = args->get_Uri(&uri);
      bool allow = SUCCEEDED(hr) && trusted_url(uri);
      CoTaskMemFree(uri);
      return allow ? S_OK : args->put_Cancel(TRUE);
    });
    HRESULT hr = core_->add_NavigationStarting(nav, &nav_);
    nav->Release();
    checked(hr, "Cannot protect top-level navigation");
    has_nav_ = true;
    auto *frame = new Nav(navigation_iid, [](auto *args) { return args->put_Cancel(TRUE); });
    hr = core_->add_FrameNavigationStarting(frame, &frame_);
    frame->Release();
    checked(hr, "Cannot protect frame navigation");
    has_frame_ = true;
    using Popup = Event<ICoreWebView2NewWindowRequestedEventHandler, ICoreWebView2NewWindowRequestedEventArgs>;
    auto *popup = new Popup(popup_iid, [](auto *args) { return args->put_Handled(TRUE); });
    hr = core_->add_NewWindowRequested(popup, &popup_);
    popup->Release();
    checked(hr, "Cannot disable new windows");
    has_popup_ = true;
    using Permission = Event<ICoreWebView2PermissionRequestedEventHandler, ICoreWebView2PermissionRequestedEventArgs>;
    auto *permission = new Permission(permission_iid, [](auto *args) {
      return args->put_State(COREWEBVIEW2_PERMISSION_STATE_DENY);
    });
    hr = core_->add_PermissionRequested(permission, &permission_);
    permission->Release();
    checked(hr, "Cannot restrict browser permissions");
    has_permission_ = true;
    using Completed = Event<ICoreWebView2NavigationCompletedEventHandler, ICoreWebView2NavigationCompletedEventArgs>;
    auto *completed = new Completed(completed_iid, [this](auto *) { queue_state(); return S_OK; });
    hr = core_->add_NavigationCompleted(completed, &completed_);
    completed->Release();
    checked(hr, "Cannot subscribe to navigation completion");
    has_completed_ = true;
    ICoreWebView2Settings *settings{};
    checked(core_->get_Settings(&settings), "Cannot read browser settings");
    hr = settings->put_AreDefaultContextMenusEnabled(FALSE);
    settings->Release();
    checked(hr, "Cannot disable default context menus");
  }
  void cleanup() noexcept {
    stopping_ = true;
    if (core_) {
      if (has_nav_) core_->remove_NavigationStarting(nav_);
      if (has_frame_) core_->remove_FrameNavigationStarting(frame_);
      if (has_popup_) core_->remove_NewWindowRequested(popup_);
      if (has_completed_) core_->remove_NavigationCompleted(completed_);
      if (has_permission_) core_->remove_PermissionRequested(permission_);
      core_->Release();
      core_ = nullptr;
    }
    if (subclassed_ && hwnd_) RemoveWindowSubclass(hwnd_, procedure, subclass_id);
    subclassed_ = false;
    if (view_) { webview_destroy(view_); view_ = nullptr; }
  }

public:
  Host() {
    try {
      auto mode = environment(L"EWP_TITLEBAR_MODE");
      require(mode.empty() || mode == L"default" || mode == L"minimal" || mode == L"native", "Invalid EWP_TITLEBAR_MODE");
      if (!mode.empty()) mode_ = utf8(mode);
      entry_ = environment(L"EWP_DEV_URL");
      std::filesystem::path assets;
      if (!entry_.empty()) {
        trusted_ = origin(entry_);
        require(trusted_.host == L"localhost" || trusted_.host == L"127.0.0.1" ||
                    trusted_.host == L"[::1]" || trusted_.host == L"::1",
                "EWP_DEV_URL must use localhost, 127.0.0.1, or [::1]");
      } else {
        assets = safe_assets(frontend_directory());
        entry_ = L"https://ewp.local/index.html";
        trusted_ = origin(entry_);
      }
      trace("ewp: creating WebView2");
      prepare_profile();
      view_ = webview_create(environment(L"EWP_DEBUG") == L"1", nullptr);
      trace("ewp: WebView2 created");
      require(view_ != nullptr, "Cannot create WebView2; install Microsoft Edge WebView2 Runtime");
      hwnd_ = static_cast<HWND>(webview_get_window(view_));
      require(hwnd_ && GetWindowThreadProcessId(hwnd_, nullptr) == thread_, "Invalid native UI thread");
      auto *controller = static_cast<ICoreWebView2Controller *>(
          webview_get_native_handle(view_, WEBVIEW_NATIVE_HANDLE_KIND_BROWSER_CONTROLLER));
      require(controller != nullptr, "WebView2 controller unavailable");
      checked(controller->get_CoreWebView2(&core_), "WebView2 unavailable");
      if (!assets.empty()) {
        ICoreWebView2_3 *mapping{};
        checked(core_->QueryInterface(core3_iid, reinterpret_cast<void **>(&mapping)),
                "WebView2 Runtime does not support local resource mapping");
        auto hr = mapping->SetVirtualHostNameToFolderMapping(
            L"ewp.local", assets.c_str(), COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_DENY_CORS);
        mapping->Release();
        checked(hr, "Cannot map frontend resources");
      }
      secure_browser(); // All guards are installed before any application navigation.
      trace("ewp: navigation guards installed");
      require(SetWindowSubclass(hwnd_, procedure, subclass_id, reinterpret_cast<DWORD_PTR>(this)) != FALSE,
              "Cannot subclass native window");
      subclassed_ = true;
      // Retain resize/minimize/maximize styles for Windows snap and drag-restore.
      auto style = GetWindowLongPtrW(hwnd_, GWL_STYLE);
      SetLastError(0);
      auto previous = SetWindowLongPtrW(hwnd_, GWL_STYLE,
          (mode_ == "native" ? style | WS_CAPTION : style & ~LONG_PTR(WS_CAPTION)) |
          WS_THICKFRAME | WS_SYSMENU | WS_MINIMIZEBOX | WS_MAXIMIZEBOX);
      require(previous || !GetLastError(), "Cannot set frameless window style");
      require(SetWindowPos(hwnd_, nullptr, 0, 0, 1100, 720,
                 SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED) != FALSE,
              "Cannot size native window");
      auto title = environment(L"EWP_APP_TITLE");
      require(SetWindowTextW(hwnd_, title.empty() ? L"Easy Windows Pack" : title.c_str()) != FALSE,
              "Cannot set application title");
    } catch (...) { cleanup(); throw; }
  }
  ~Host() { cleanup(); }
  Host(const Host &) = delete;
  Host &operator=(const Host &) = delete;
  webview_t view() const { return view_; }
  void check_thread() const { require(GetCurrentThreadId() == thread_, "Operation requires the UI thread"); }
  bool trusted_document() const {
    check_thread();
    if (stopping_ || !core_) return false;
    LPWSTR uri{};
    auto hr = core_->get_Source(&uri);
    bool trusted = SUCCEEDED(hr) && trusted_url(uri);
    CoTaskMemFree(uri);
    return trusted;
  }
  std::string state() const {
    check_thread();
    require(hwnd_ && IsWindow(hwnd_), "Window is closed");
    RECT rect{};
    require(GetClientRect(hwnd_, &rect) != FALSE, "Cannot read window size");
    // During minimization report the normal placement instead of a 0x0 client.
    if (IsIconic(hwnd_)) {
      WINDOWPLACEMENT placement{sizeof(placement)};
      if (GetWindowPlacement(hwnd_, &placement)) rect = placement.rcNormalPosition;
    }
    auto boolean = [](bool b) { return b ? "true" : "false"; };
    return std::string("{\"ok\":true,\"maximized\":") + boolean(IsZoomed(hwnd_)) +
        ",\"visible\":" + boolean(IsWindowVisible(hwnd_) && !IsIconic(hwnd_)) +
        ",\"alwaysOnTop\":" + boolean(GetWindowLongPtrW(hwnd_, GWL_EXSTYLE) & WS_EX_TOPMOST) +
        ",\"resizable\":" + boolean(GetWindowLongPtrW(hwnd_, GWL_STYLE) & WS_THICKFRAME) +
        ",\"titleBarMode\":" + quote(mode_) + ",\"activeTitleBarMode\":" + quote(mode_) +
        ",\"windowSize\":{\"width\":" + std::to_string(rect.right - rect.left) +
        ",\"height\":" + std::to_string(rect.bottom - rect.top) + "}}";
  }
  void publish() {
    if (!hwnd_ || !trusted_document()) return;
    auto js = "window.easyWindowsPackApplyState?.(" + state() + ");";
    webview_eval(view_, js.c_str()); // webview_go pins the 0.11 void-return ABI.
  }
  std::string command(Command command, int a = 0, int b = 0) {
    check_thread();
    require(hwnd_ && IsWindow(hwnd_), "Window is closed");
    require(trusted_document(), "RPC requires the trusted application document");
    switch (command) {
    case State: break;
    case Minimize: ShowWindow(hwnd_, SW_MINIMIZE); break;
    case Maximize: ShowWindow(hwnd_, IsZoomed(hwnd_) ? SW_RESTORE : SW_MAXIMIZE); break;
    case Restore: ShowWindow(hwnd_, SW_RESTORE); break;
    case Close: close_requested_ = true; break;
    case Drag: {
      require(a == HTCAPTION || (a >= HTLEFT && a <= HTBOTTOMRIGHT), "Invalid drag direction");
      require(a == HTCAPTION || !IsZoomed(hwnd_), "Cannot resize a maximized window");
      POINT cursor{};
      require(GetCursorPos(&cursor) != FALSE, "Cannot read cursor position");
      ReleaseCapture();
      require(PostMessageW(hwnd_, WM_NCLBUTTONDOWN, static_cast<WPARAM>(a),
                           MAKELPARAM(cursor.x, cursor.y)) != FALSE, "Cannot begin native drag");
      break; // Windows owns the move/resize loop, including maximize drag-restore.
    }
    case Topmost:
      require(a >= -1 && a <= 1, "Invalid always-on-top value");
      if (a == -1) a = !(GetWindowLongPtrW(hwnd_, GWL_EXSTYLE) & WS_EX_TOPMOST);
      require(SetWindowPos(hwnd_, a ? HWND_TOPMOST : HWND_NOTOPMOST, 0, 0, 0, 0,
                           SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE) != FALSE, "Cannot set always-on-top");
      break;
    case Resize:
      require(a >= 320 && a <= 16384 && b >= 200 && b <= 16384, "Size must be integer pixels: width 320..16384, height 200..16384");
      require(!IsZoomed(hwnd_) && !IsIconic(hwnd_), "Restore the window before resizing it");
      if (mode_ == "native") {
        RECT size{0, 0, a, b};
        require(AdjustWindowRectEx(&size, DWORD(GetWindowLongPtrW(hwnd_, GWL_STYLE)), FALSE,
                                  DWORD(GetWindowLongPtrW(hwnd_, GWL_EXSTYLE))) != FALSE,
                "Cannot calculate native client size");
        a = size.right - size.left; b = size.bottom - size.top;
      }
      require(SetWindowPos(hwnd_, nullptr, 0, 0, a, b, SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE) != FALSE,
              "Cannot resize window");
      break;
    case Hide: ShowWindow(hwnd_, SW_HIDE); break;
    case Show:
      ShowWindow(hwnd_, IsIconic(hwnd_) ? SW_RESTORE : SW_SHOW);
      break;
    case Mode:
      require(a >= 0 && a <= 2, "Invalid titlebar mode");
      if ((a == 2) != (mode_ == "native")) {
        auto result = state();
        result.pop_back();
        // Report the request without changing the active frameless mode.
        auto at = result.find("\"titleBarMode\":");
        auto end = result.find(',', at);
        auto requested = a == 2 ? "native" : a ? "minimal" : "default";
        result.replace(at, end - at, "\"titleBarMode\":" + quote(requested));
        return result + ",\"requestedTitleBarMode\":" + quote(requested) + ",\"restartRequired\":true}";
      }
      mode_ = a == 2 ? "native" : a ? "minimal" : "default";
      break;
    default: throw std::runtime_error("Unknown native command");
    }
    publish();
    auto result = state();
    if (command == Mode) { result.pop_back(); result += ",\"restartRequired\":false}"; }
    return result;
  }
  void reply(const char *id, const std::string &result) {
    check_thread();
    if (stopping_) return;
    webview_return(view_, id, 0, result.c_str());
    // resolve queues its JS evaluation first. Close is queued after that work.
    if (close_requested_) {
      close_requested_ = false;
      PostMessageW(hwnd_, WM_CLOSE, 0, 0);
    }
  }
  void start() {
    check_thread();
    trace("ewp: starting frontend");
    const char *script = R"JS((() => {
      if (window !== window.top) { delete window.__ewp_rpc; return; }
      const rpc = window.__ewp_rpc;
      Object.defineProperty(window, 'ewpNative', { value: Object.freeze({
        call(method, args = []) {
          if (typeof method !== 'string' || !Array.isArray(args))
            return Promise.resolve({ok:false,error:'Expected method string and argument array'});
          return rpc(method, args).catch(error => ({ok:false,error:String(error)}));
        }
      }) });
      const methods = ['get_window_state', 'get_window_size', 'get_always_on_top',
        'window_action', 'native_drag', 'set_always_on_top', 'toggle_always_on_top',
        'set_window_size', 'hide_window', 'show_window', 'set_titlebar_mode'];
      const api = Object.fromEntries(methods.map(method =>
        [method, (...args) => window.ewpNative.call(method, args)]));
      Object.defineProperty(window, 'pywebview', {value: Object.freeze({api: Object.freeze(api)})});
      window.dispatchEvent(new Event('ewp-native-ready'));
      window.open = () => null;
      const sync = () => window.ewpNative.call('get_window_state', []).then(state => {
        if (state.ok) window.easyWindowsPackApplyState?.(state);
      });
      document.addEventListener('DOMContentLoaded', () => {
        window.dispatchEvent(new Event('pywebviewready')); sync();
      }, {once:true});
      window.addEventListener('load', sync, {once:true});
    })();)JS";
    webview_init(view_, script);
    webview_navigate(view_, utf8(entry_).c_str());
    webview_run(view_);
  }
};

} // namespace ewp