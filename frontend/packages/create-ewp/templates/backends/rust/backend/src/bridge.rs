use serde::Deserialize;
use serde_json::{json, Value};

use crate::navigation::Navigation;

pub const MAX_MESSAGE_BYTES: usize = 65_536;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Request {
    pub id: u64,
    pub document: String,
    pub method: String,
    #[serde(default)]
    pub args: Vec<Value>,
}

impl Request {
    pub fn parse(body: &str) -> Option<Self> {
        if body.len() > MAX_MESSAGE_BYTES {
            return None;
        }
        let request: Self = serde_json::from_str(body).ok()?;
        if request.id == 0 || request.id > 9_007_199_254_740_991
            || request.document.len() != 32
            || !request.document.bytes().all(|byte| byte.is_ascii_hexdigit())
            || request.method.is_empty() || request.method.len() > 64
            || request.args.len() > 8
        {
            return None;
        }
        Some(request)
    }
}

// Wry injects scripts into ALL Windows frames. Check top-level + URL explicitly.
// Keep the same guard for initialization, replies and unsolicited state updates.
const GUARD: &str = r#"
if (window !== window.top) return;
const trusted = () => {
    try {
        const current = new URL(window.location.href);
        const entry = new URL(policy.entry);
        if (current.username || current.password) return false;
        if (policy.development) {
            return (current.protocol === 'http:' || current.protocol === 'https:')
                && current.origin === entry.origin;
        }
        current.hash = ''; current.search = '';
        return current.href === entry.href;
    } catch { return false; }
};
if (!trusted()) return;
"#;

const INITIALIZE: &str = r#"
if (window.ewpNative) return;
const pending = new Map();
const random = new Uint8Array(16);
crypto.getRandomValues(random);
const documentId = Array.from(random, x => x.toString(16).padStart(2, '0')).join('');
const postMessage = window.ipc.postMessage.bind(window.ipc);
let sequence = 0;
let unloading = false;

const call = (method, args = []) => new Promise((resolve, reject) => {
    if (unloading || !trusted()) return reject(new Error('Native bridge is unavailable for this document'));
    if (typeof method !== 'string' || !method.length || method.length > 64 || !Array.isArray(args) || args.length > 8) {
        return reject(new TypeError('Expected call(method, argsArray)'));
    }
    if (pending.size >= 256 || sequence >= Number.MAX_SAFE_INTEGER) {
        return reject(new Error('Too many pending native calls'));
    }
    const id = ++sequence;
    let message;
    try {
        message = JSON.stringify({ id, document: documentId, method, args });
        if (new TextEncoder().encode(message).length > 65536) throw new Error('Native request is too large');
    } catch (error) { return reject(error); }
    const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Native call timed out: ${method}`));
    }, 60000);
    pending.set(id, { resolve, reject, timer });
    try { postMessage(message); }
    catch (error) {
        clearTimeout(timer);
        pending.delete(id);
        reject(error);
    }
});

Object.defineProperty(window, '__ewpNativeReceive', {
    value: message => {
        if (!trusted() || message.document !== documentId) return;
        const request = pending.get(message.id);
        if (!request) return;
        clearTimeout(request.timer);
        pending.delete(message.id);
        // Application errors use {ok:false,error}; transport failures reject.
        request.resolve(message.result);
    }
});
Object.defineProperty(window, 'ewpNative', { value: Object.freeze({ call }) });
const methods = ['get_window_state', 'get_window_size', 'get_always_on_top',
    'window_action', 'native_drag', 'set_always_on_top', 'toggle_always_on_top',
    'set_window_size', 'hide_window', 'show_window', 'set_titlebar_mode'];
const api = Object.fromEntries(methods.map(method => [method, (...args) => call(method, args)]));
Object.defineProperty(window, 'pywebview', {value: Object.freeze({api: Object.freeze(api)})});
document.addEventListener('DOMContentLoaded', () => {
    window.dispatchEvent(new Event('pywebviewready'));
    call('get_window_state').then(state => window.easyWindowsPackApplyState?.(state));
}, {once:true});
window.addEventListener('pagehide', () => {
    unloading = true;
    for (const request of pending.values()) {
        clearTimeout(request.timer);
        request.reject(new Error('Document unloaded'));
    }
    pending.clear();
});
window.addEventListener('pageshow', () => { unloading = false; });
window.dispatchEvent(new Event('ewp-native-ready'));
"#;

fn guarded(navigation: &Navigation, body: &str) -> String {
    format!("(() => {{ const policy = {};\n{GUARD}\n{body}\n}})();", navigation.script_policy())
}

pub fn initialization(navigation: &Navigation) -> String {
    guarded(navigation, INITIALIZE)
}

pub fn response(navigation: &Navigation, request: &Request, result: Value) -> String {
    let message = json!({"id": request.id, "document": request.document, "result": result});
    guarded(navigation, &format!("window.__ewpNativeReceive?.({message});"))
}

pub fn state_changed(navigation: &Navigation, state: &Value) -> String {
    guarded(navigation, &format!(
        "const state = {state}; window.easyWindowsPackApplyState?.(state); window.dispatchEvent(new CustomEvent('ewp:window-state', {{ detail: state }}));"
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn requests_are_bounded_and_do_not_accept_non_array_arguments() {
        let valid = json!({"id": 1, "document": "0123456789abcdef0123456789abcdef", "method": "get_window_state", "args": []});
        assert!(Request::parse(&valid.to_string()).is_some());
        let mut invalid = valid.clone();
        invalid["args"] = json!("minimize");
        assert!(Request::parse(&invalid.to_string()).is_none());
        invalid = valid.clone();
        invalid["id"] = json!(9_007_199_254_740_992_u64);
        assert!(Request::parse(&invalid.to_string()).is_none());
        invalid = valid;
        invalid["args"] = json!(["x".repeat(MAX_MESSAGE_BYTES)]);
        assert!(Request::parse(&invalid.to_string()).is_none());
    }
}
