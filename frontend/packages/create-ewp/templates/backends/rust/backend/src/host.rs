use std::{cell::Cell, env, error::Error, path::PathBuf, rc::Rc};

use serde_json::{json, Value};
use tao::{
    dpi::{LogicalSize, PhysicalSize},
    event::{Event, WindowEvent},
    event_loop::{ControlFlow, EventLoopBuilder},
    window::{ResizeDirection, Window, WindowBuilder},
};
use wry::{NewWindowResponse, PageLoadEvent, WebContext, WebView, WebViewBuilder, WebViewBuilderExtWindows, WebViewExtWindows};
use webview2_com::{NavigationStartingEventHandler, PermissionRequestedEventHandler,
    Microsoft::Web::WebView2::Win32::COREWEBVIEW2_PERMISSION_STATE_DENY};

use crate::{bridge, navigation::{self, Navigation}};

#[derive(Debug)]
enum HostEvent {
    Call { request: bridge::Request, generation: u64 },
    PageLoaded,
    Exit,
}

struct Host {
    // Drop WebView before the HWND and keep its profile context alive.
    webview: WebView,
    window: Window,
    _context: WebContext,
    navigation: Navigation,
    titlebar_mode: &'static str,
}

impl Host {
    fn state(&self) -> Value {
        let size = self.window.inner_size();
        json!({
            "ok": true,
            "maximized": self.window.is_maximized(),
            "visible": self.window.is_visible() && !self.window.is_minimized(),
            "alwaysOnTop": self.window.is_always_on_top(),
            "resizable": self.window.is_resizable(),
            "titleBarMode": self.titlebar_mode,
            "activeTitleBarMode": self.titlebar_mode,
            "windowSize": {"width": size.width, "height": size.height},
        })
    }

    fn trusted_document(&self) -> bool {
        self.webview.url().map(|url| self.navigation.allows(&url)).unwrap_or(false)
    }

    fn evaluate(&self, script: &str) {
        if self.trusted_document() {
            if let Err(error) = self.webview.evaluate_script(script) {
                eprintln!("Could not deliver native bridge response: {error}");
            }
        }
    }

    fn publish_state(&self) {
        self.evaluate(&bridge::state_changed(&self.navigation, &self.state()));
    }

    fn dispatch(&mut self, request: &bridge::Request) -> Result<Value, String> {
        let args = &request.args;
        match request.method.as_str() {
            "get_window_state" | "get_window_size" | "get_always_on_top" => expect_count(args, 0)?,
            "window_action" => {
                match one_string(args)? {
                    "minimize" => self.window.set_minimized(true),
                    "maximize" => {
                        self.window.set_minimized(false);
                        self.window.set_maximized(!self.window.is_maximized());
                    }
                    "restore" => {
                        self.window.set_minimized(false);
                        self.window.set_maximized(false);
                    }
                    // Closing is queued after the asynchronous reply below.
                    "close" => {}
                    action => return Err(format!("Unsupported window action: {action}")),
                }
            }
            "native_drag" => {
                let direction = one_string(args)?;
                if direction == "move" {
                    self.window.drag_window().map_err(|error| error.to_string())?;
                } else {
                    let direction = resize_direction(direction)
                        .ok_or_else(|| format!("Unsupported resize direction: {direction}"))?;
                    if self.window.is_maximized() || !self.window.is_resizable() {
                        return Err("This window cannot currently be resized".into());
                    }
                    self.window.drag_resize_window(direction).map_err(|error| error.to_string())?;
                }
            }
            "set_window_size" => {
                expect_count(args, 2)?;
                let width = dimension(&args[0], 320)?;
                let height = dimension(&args[1], 200)?;
                if self.window.is_maximized() || self.window.is_minimized() {
                    return Err("Restore the window before resizing it".into());
                }
                self.window.set_inner_size(PhysicalSize::new(width, height));
            }
            "hide_window" => {
                expect_count(args, 0)?;
                self.window.set_visible(false);
            }
            "show_window" => {
                expect_count(args, 0)?;
                self.window.set_visible(true);
                self.window.set_minimized(false);
                self.window.set_focus();
            }
            "set_always_on_top" => {
                expect_count(args, 1)?;
                let enabled = args[0].as_bool().ok_or("Expected a boolean")?;
                self.window.set_always_on_top(enabled);
            }
            "toggle_always_on_top" => {
                expect_count(args, 0)?;
                self.window.set_always_on_top(!self.window.is_always_on_top());
            }
            "set_titlebar_mode" => {
                let mode = one_string(args)?;
                if !matches!(mode, "default" | "minimal" | "native") {
                    return Err(format!("Unsupported title bar mode: {mode}"));
                }
                if (mode == "native") != (self.titlebar_mode == "native") {
                    let mut state = self.state();
                    state["titleBarMode"] = json!(mode);
                    state["restartRequired"] = json!(true);
                    return Ok(state);
                }
                match mode {
                    "default" => self.titlebar_mode = "default",
                    "minimal" => self.titlebar_mode = "minimal",
                    "native" => {
                        self.titlebar_mode = "native";
                    }
                    _ => return Err(format!("Unsupported title bar mode: {mode}")),
                }
                let mut state = self.state();
                state["restartRequired"] = json!(false);
                return Ok(state);
            }
            method => return Err(format!("Unsupported native method: {method}")),
        }
        Ok(self.state())
    }
}

fn expect_count(args: &[Value], count: usize) -> Result<(), String> {
    if args.len() == count { Ok(()) } else { Err(format!("Expected {count} arguments")) }
}

fn one_string(args: &[Value]) -> Result<&str, String> {
    expect_count(args, 1)?;
    args[0].as_str().ok_or_else(|| "Expected a string".into())
}

fn dimension(value: &Value, minimum: u32) -> Result<u32, String> {
    let number = value.as_f64().ok_or("Window dimensions must be numbers")?;
    if number.is_finite() && number.fract() == 0.0 && (f64::from(minimum)..=16_384.0).contains(&number) {
        Ok(number as u32)
    } else {
        Err(format!("Window dimensions must be integers between {minimum} and 16384 physical pixels"))
    }
}

fn resize_direction(direction: &str) -> Option<ResizeDirection> {
    Some(match direction {
        "left" => ResizeDirection::West,
        "right" => ResizeDirection::East,
        "top" => ResizeDirection::North,
        "bottom" => ResizeDirection::South,
        "top-left" => ResizeDirection::NorthWest,
        "top-right" => ResizeDirection::NorthEast,
        "bottom-left" => ResizeDirection::SouthWest,
        "bottom-right" => ResizeDirection::SouthEast,
        _ => return None,
    })
}

fn profile_directory(navigation: &Navigation) -> Result<PathBuf, Box<dyn Error>> {
    // A writable per-app profile also works when the executable is installed in
    // Program Files. Separate file/dev profiles because their browser args differ.
    let executable = env::current_exe()?;
    let identity = executable.to_string_lossy();
    let mut hash = 0xcbf29ce484222325_u64;
    for byte in identity.bytes() {
        hash = (hash ^ u64::from(byte)).wrapping_mul(0x100000001b3);
    }
    let base = env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(env::temp_dir);
    let mode = if navigation.is_development() { "dev" } else { "file" };
    let path = base.join("easy-windows-pack").join(format!("{hash:016x}")).join(mode);
    std::fs::create_dir_all(&path)?;
    Ok(path)
}

pub fn run() -> Result<(), Box<dyn Error>> {
    let titlebar_mode = match env::var("EWP_TITLEBAR_MODE").as_deref().unwrap_or("default") {
        "default" | "" => "default", "minimal" => "minimal", "native" => "native",
        _ => return Err("Invalid EWP_TITLEBAR_MODE".into()),
    };
    let navigation = Navigation::from_environment()?;
    let debug = env::var("EWP_DEBUG").as_deref() == Ok("1");
    let title = env::var("EWP_APP_TITLE").ok().filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "Desktop App".into());
    let event_loop = EventLoopBuilder::<HostEvent>::with_user_event().build();
    let proxy = event_loop.create_proxy();

    // tao 0.34.5 already constrains frameless maximized client bounds to rcWork
    // in WM_NCCALCSIZE, including the auto-hide taskbar strip. Do not add a
    // competing WM_GETMINMAXINFO subclass or emulate maximize with fullscreen.
    // https://github.com/tauri-apps/tao/blob/tao-v0.34.5/src/platform_impl/windows/event_loop.rs
    let window = WindowBuilder::new()
        .with_title(title)
        .with_decorations(titlebar_mode == "native")
        .with_resizable(true)
        .with_min_inner_size(PhysicalSize::new(320, 200))
        .with_inner_size(LogicalSize::new(1100.0, 760.0))
        .build(&event_loop)?;
    let mut context = WebContext::new(Some(profile_directory(&navigation)?));
    let generation = Rc::new(Cell::new(0_u64));
    let nav_generation = generation.clone();
    let ipc_generation = generation.clone();
    let nav_policy = navigation.clone();
    let ipc_policy = navigation.clone();
    let ipc_proxy = proxy.clone();
    let load_proxy = proxy.clone();

    let mut builder = WebViewBuilder::new_with_web_context(&mut context)
        .with_devtools(debug)
        .with_default_context_menus(false)
        .with_initialization_script(bridge::initialization(&navigation))
        .with_navigation_handler(move |url| {
            let allowed = nav_policy.allows(&url);
            if allowed {
                nav_generation.set(nav_generation.get().wrapping_add(1));
            }
            allowed
        })
        // Includes target=_blank and window.open. No remote page gains a host.
        .with_new_window_req_handler(|_, _| NewWindowResponse::Deny)
        .with_download_started_handler(|_, _| false)
        .with_ipc_handler(move |message| {
            // WebView2 supplies Source through Wry's Request URI; never trust
            // a URL supplied by JavaScript in the JSON payload.
            if !ipc_policy.allows(&message.uri().to_string()) { return; }
            if let Some(request) = bridge::Request::parse(message.body()) {
                let _ = ipc_proxy.send_event(HostEvent::Call {
                    request,
                    generation: ipc_generation.get(),
                });
            }
        })
        .with_on_page_load_handler(move |event, _| {
            if matches!(event, PageLoadEvent::Finished) {
                let _ = load_proxy.send_event(HostEvent::PageLoaded);
            }
        });
    if let Some(assets) = navigation.assets.clone() {
        builder = builder.with_https_scheme(true).with_custom_protocol("ewp".into(), move |_, request| {
            let (status, body, mime) = if request.method() != "GET" && request.method() != "HEAD" {
                (405, Vec::new(), "text/plain")
            } else {
                match navigation::resource(&assets, &request.uri().to_string()) {
                    Ok((body, mime)) => (200, body, mime),
                    Err(_) => (404, Vec::new(), "text/plain"),
                }
            };
            wry::http::Response::builder().status(status)
                .header("Content-Type", mime).header("X-Content-Type-Options", "nosniff")
                .body(std::borrow::Cow::Owned(if request.method() == "HEAD" {Vec::new()} else {body})).unwrap()
        });
    }
    let webview = builder.build(&window)?;
    // Wry's navigation callback only covers the top document. Install frame
    // and permission guards on its public WebView2 handle before loading HTML.
    unsafe {
        let core = webview.webview();
        let mut token = 0;
        core.add_FrameNavigationStarting(&NavigationStartingEventHandler::create(Box::new(|_, args| {
            if let Some(args) = args { args.SetCancel(true)?; }
            Ok(())
        })), &mut token)?;
        core.add_PermissionRequested(&PermissionRequestedEventHandler::create(Box::new(|_, args| {
            if let Some(args) = args { args.SetState(COREWEBVIEW2_PERMISSION_STATE_DENY)?; }
            Ok(())
        })), &mut token)?;
    }
    webview.load_url(navigation.entry.as_str())?;
    if debug { webview.open_devtools(); }
    let mut host = Host { webview, window, _context: context, navigation, titlebar_mode };

    // IPC handlers only enqueue; all HWND operations and evaluate_script calls
    // occur here, outside WebView2 callbacks, on the event loop's UI thread.
    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;
        match event {
            Event::WindowEvent { event: WindowEvent::CloseRequested, .. }
            | Event::WindowEvent { event: WindowEvent::Destroyed, .. }
            | Event::UserEvent(HostEvent::Exit) => *control_flow = ControlFlow::Exit,
            Event::UserEvent(HostEvent::Call { request, generation: received }) => {
                if received != generation.get() || !host.trusted_document() { return; }
                let result = host.dispatch(&request).unwrap_or_else(|error| json!({"ok": false, "error": error}));
                let closing = request.method == "window_action"
                    && request.args.first().and_then(Value::as_str) == Some("close")
                    && result["ok"] == true;
                let script = bridge::response(&host.navigation, &request, result);
                if closing {
                    // Wait for ExecuteScript completion before tearing down the
                    // view, so the close Promise can settle in the renderer.
                    let exit_proxy = proxy.clone();
                    if host.webview.evaluate_script_with_callback(&script, move |_| {
                        let _ = exit_proxy.send_event(HostEvent::Exit);
                    }).is_err() {
                        *control_flow = ControlFlow::Exit;
                    }
                } else {
                    host.evaluate(&script);
                    host.publish_state();
                }
            }
            Event::UserEvent(HostEvent::PageLoaded)
            | Event::WindowEvent { event: WindowEvent::Resized(_), .. }
            | Event::WindowEvent { event: WindowEvent::Focused(_), .. }
            | Event::WindowEvent { event: WindowEvent::ScaleFactorChanged { .. }, .. } => host.publish_state(),
            _ => {}
        }
    })
}
