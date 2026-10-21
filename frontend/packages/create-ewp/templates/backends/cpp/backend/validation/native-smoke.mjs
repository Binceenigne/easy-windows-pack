// Run with: node validation/native-smoke.mjs <absolute path to ewp-host.exe>
// Ephemeral loopback pages exercise the real WebView2/native HWND host.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const executable = resolve(process.argv[2] || 'build/ewp-host.exe');
let foreignRequests = 0;
let foreignExecutions = 0;
let child;
let finish;
const completed = new Promise(resolve => { finish = resolve; });
const foreign = createServer((req, res) => {
  foreignRequests++;
  if (req.url.startsWith('/executed')) foreignExecutions++;
  res.setHeader('Content-Type', 'text/html');
  res.end('<script>fetch("/executed");window.__ewp_rpc?.("window_action", ["close"])</script>');
});
foreign.listen(0, '127.0.0.1');
await once(foreign, 'listening');
const foreignURL = `http://127.0.0.1:${foreign.address().port}/untrusted`;
const page = `<!doctype html><html><body><h1>EWP native validation</h1><script>
const results = [];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function check(value, name) { if (!value) throw Error(name); results.push(name); }
const call = (method, ...args) => window.ewpNative.call(method, args);
window.easyWindowsPackApplyState = state => { window.lastNativeState = state; };
window.addEventListener('load', async () => {
  try {
    let state = await call('get_window_state');
    check(state.ok && state.visible && state.resizable && !state.maximized, 'initial HWND state');
    check((await call('set_always_on_top', true)).alwaysOnTop === true, 'set topmost');
    check((await call('toggle_always_on_top')).alwaysOnTop === false, 'toggle topmost');
    state = await call('set_window_size', 840, 560);
    check(state.windowSize.width === 840 && state.windowSize.height === 560, 'native client size');
    check(!(await call('set_window_size', '840', 560)).ok, 'reject string size');
    check(!(await call('set_window_size', 840.5, 560)).ok, 'reject fractional size');
    check(!(await call('set_window_size', 1e100, 560)).ok, 'reject overflowing size');
    check(!(await call('set_always_on_top', 'false')).ok, 'reject string boolean');
    check(!(await call('native_drag', 'unknown')).ok, 'reject unknown drag');
    check(!(await call('unknown_method')).ok, 'reject unknown method');
    check(!(await call('get_window_state', 1)).ok, 'reject extra arguments');
    state = await call('window_action', 'maximize');
    check(state.maximized, 'native maximize');
    check(Math.abs(state.windowSize.width - screen.availWidth * devicePixelRatio) <= 2 &&
      Math.abs(state.windowSize.height - screen.availHeight * devicePixelRatio) <= 2,
      'maximized client matches monitor work area');
    await fetch('/maximized', {method:'POST', body:JSON.stringify(state)});
    await wait(150);
    check(window.lastNativeState?.maximized === true, 'WM_SIZE state synchronization');
    check(!(await call('native_drag', 'right')).ok, 'reject maximized resize');
    state = await call('window_action', 'maximize');
    check(!state.maximized, 'maximize toggles restore');
    check(!(await call('window_action', 'minimize')).visible, 'native minimize');
    check((await call('window_action', 'restore')).visible, 'native restore');
    check(!(await call('hide_window')).visible, 'native hide');
    check((await call('show_window')).visible, 'native show');
    check((await call('set_titlebar_mode', 'minimal')).titleBarMode === 'minimal', 'minimal titlebar');
    state = await call('set_titlebar_mode', 'native');
    check(state.restartRequired === true && state.activeTitleBarMode === 'minimal', 'native mode requires restart');
    check((await call('set_titlebar_mode', 'default')).titleBarMode === 'default', 'default titlebar');
    const remote = ${JSON.stringify(foreignURL)};
    window.open(remote);
    const frame = document.createElement('iframe'); frame.src = remote; document.body.append(frame);
    const link = document.createElement('a'); link.href = remote; document.body.append(link); link.click();
    await wait(250);
    check(location.pathname === '/', 'remote link navigation canceled');
    location.href = remote;
    await wait(250);
    check(location.pathname === '/', 'script top navigation canceled');
    const response = await fetch('/redirect');
    // Fetch is intentionally not restricted; only document navigation is protected.
    check(response.ok, 'trusted frontend may fetch application data');
    location.href = '/redirect-navigation';
    await wait(250);
    check(location.pathname === '/', 'cross-origin redirect canceled');
    check((await call('get_window_state')).ok, 'bridge remains on trusted document');
    await fetch('/result', {method:'POST', body:JSON.stringify({ok:true,results})});
    await call('window_action', 'close');
  } catch (error) {
    await fetch('/result', {method:'POST', body:JSON.stringify({ok:false,results,error:String(error)})});
    await call('window_action', 'close');
  }
});
</script></body></html>`;
let maximizedState;
const server = createServer(async (req, res) => {
  console.log('HTTP', req.method, req.url);
  if (req.url === '/redirect-navigation') { res.writeHead(302, {Location:foreignURL}); res.end(); return; }
  if (req.url === '/redirect') { res.end('application data'); return; }
  if (req.url === '/result' || req.url === '/maximized') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const data = JSON.parse(body);
    res.end('ok');
    if (req.url === '/maximized') { maximizedState = data; console.log(JSON.stringify({maximizedState})); }
    else finish(data);
    return;
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(page);
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const timeout = setTimeout(() => {
  finish({ok:false,error:'host timed out'});
  if (child && child.exitCode === null) child.kill();
}, 30000);
try {
  const profile = await mkdtemp(resolve(tmpdir(), 'ewp-native-smoke-'));
  child = spawn(executable, [], {env:{...process.env,
    EWP_DEV_URL:`http://127.0.0.1:${server.address().port}/`,
    WEBVIEW2_USER_DATA_FOLDER:profile,
    EWP_APP_TITLE:'EWP Native Smoke', EWP_HOST_NO_DIALOG:'1', EWP_HOST_TRACE:'1'}, stdio:['ignore','pipe','pipe']});
  child.stdout.on('data', data => process.stdout.write(data));
  child.stderr.on('data', data => process.stderr.write(data));
  child.once('error', error => finish({ok:false,error:String(error)}));
  const exited = once(child, 'exit');
  const result = await completed;
  console.log(JSON.stringify({...result, foreignRequests, foreignExecutions}, null, 2));
  assert.equal(result.ok, true, result.error);
  assert.equal(foreignExecutions, 0, 'untrusted document script executed');
  assert.equal(maximizedState.maximized, true);
  const [code] = await exited;
  assert.equal(code, 0);
} finally {
  clearTimeout(timeout);
  if (child && child.exitCode === null) child.kill();
  server.closeAllConnections(); foreign.closeAllConnections();
  server.close(); foreign.close();
}