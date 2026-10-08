import { mountFrame, setTitleBarMode } from 'easywindowspack';
import 'easywindowspack/frame.css';
import './demo.css';

const content = document.createElement('div');
content.className = 'demo-content';
content.innerHTML = `
  <h1>Reusable WebView window</h1>
  <p>Choose the shared Windows or macOS frame and switch its title bar mode.</p>
  <p><label>Window style <select id="windowStyle"><option value="macos">macOS</option><option value="windows">Windows</option></select></label></p>
  <label>Title bar mode <select id="mode"><option value="default">Default</option><option value="minimal">Minimal</option><option value="native">Native</option></select></label>
  <button id="apply" type="button">Apply mode</button>
  <p class="demo-status" id="status" role="status">Connecting to desktop…</p>
  <p><a href="./src/components.html">Desktop components demo</a></p>
`;
const status = content.querySelector('#status');
const listeners = new AbortController();
const frame = mountFrame('#app', {
  title: 'easy-windows-pack demo', windowStyle: 'macos', content,
  onError: result => { status.textContent = result.error; }
});
const ready = () => {
  status.textContent = window.pywebview?.api
    ? 'Desktop bridge ready'
    : 'Browser preview — native window actions become available in the desktop app.';
};
window.addEventListener('pywebviewready', ready, { signal: listeners.signal });
ready();
content.querySelector('#windowStyle').addEventListener('change', event => {
  frame.update({ windowStyle: event.target.value });
}, { signal: listeners.signal });
content.querySelector('#apply').addEventListener('click', async () => {
  const mode = content.querySelector('#mode').value;
  if (!window.pywebview?.api) {
    if (mode !== 'native') frame.update({ mode });
    status.textContent = mode === 'native'
      ? 'Native mode requires a desktop window.'
      : `Browser preview: ${mode} title bar. Native window actions require the desktop app.`;
    return;
  }
  const result = await setTitleBarMode(mode);
  if (listeners.signal.aborted) return;
  status.textContent = result.restartRequired
    ? 'Native mode requires recreating the pywebview window.'
    : result.ok ? `Mode: ${result.activeTitleBarMode}` : result.error;
}, { signal: listeners.signal });
if (import.meta.hot) import.meta.hot.dispose(() => { listeners.abort(); frame.dispose(); });