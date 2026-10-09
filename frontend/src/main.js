import { mountFrame, setTitleBarMode } from 'easywindowspack';
import 'easywindowspack/frame.css';
import colorLogo from './assets/ewp-color.svg';
import darkLogo from './assets/ewp-dark.svg';
import monoLogo from './assets/ewp-mono.svg';
import './demo.css';

const words = {
  'zh-CN': {
    tagline: '把你的 Web 界面，变成桌面应用。',
    description: '熟悉的前端开发体验，一个轻巧的原生窗口。',
    count: '点击次数', hint: '修改', hintEnd: '，保存即可看到更新。',
    docs: '开始使用', source: 'GitHub', playground: '试试窗口外观',
    style: '窗口样式', mode: '标题栏', standard: '默认', minimal: '紧凑', native: '系统原生',
    apply: '应用', components: '探索桌面组件',
    browser: '浏览器预览 · 原生操作请在桌面应用中体验', desktop: '桌面桥接已就绪',
    nativeHint: '系统标题栏需要桌面窗口；浏览器可预览默认或紧凑模式。',
    restart: '切换系统标题栏需要重新创建桌面窗口。', applied: '标题栏已更新',
    pending: '正在应用…', light: '浅色', dark: '深色', themeLabel: '切换页面主题',
    languageLabel: 'Switch to English', error: '窗口操作失败，请重试。'
  },
  en: {
    tagline: 'Your web app, on the desktop.',
    description: 'A familiar frontend workflow. A lightweight native window.',
    count: 'Count', hint: 'Edit', hintEnd: ' and save to see your changes.',
    docs: 'Get started', source: 'GitHub', playground: 'Try the window frame',
    style: 'Window style', mode: 'Title bar', standard: 'Default', minimal: 'Minimal', native: 'Native',
    apply: 'Apply', components: 'Explore desktop components',
    browser: 'Browser preview · Try native actions in the desktop app', desktop: 'Desktop bridge ready',
    nativeHint: 'Native title bars need a desktop window. Preview Default or Minimal here.',
    restart: 'Switching to a native title bar requires recreating the desktop window.',
    applied: 'Title bar updated', pending: 'Applying…', light: 'Light', dark: 'Dark',
    themeLabel: 'Switch page theme', languageLabel: '切换为简体中文',
    error: 'The window action failed. Please try again.'
  }
};

const content = document.createElement('main');
content.className = 'demo-page';
content.innerHTML = `
  <header class="demo-header">
    <a class="demo-brand" href="https://github.com/Binceenigne/easy-windows-pack" target="_blank" rel="noopener noreferrer">
      <img class="demo-brand-mark" src="${darkLogo}" alt="" width="22" height="22">
      <span>easy-windows-pack</span>
    </a>
    <div class="demo-tools">
      <button id="themeToggle" class="demo-tool" type="button">
        <svg class="demo-theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M20.7 13.2A8.7 8.7 0 0 1 10.8 3.3a8.8 8.8 0 1 0 9.9 9.9Z"/></svg>
        <span id="themeLabel"></span>
      </button>
      <span class="demo-tool-divider" aria-hidden="true"></span>
      <button id="languageToggle" class="demo-tool" type="button">EN</button>
    </div>
  </header>

  <section class="demo-hero" aria-labelledby="demo-title">
    <a class="demo-logo-link" href="https://github.com/Binceenigne/easy-windows-pack" target="_blank" rel="noopener noreferrer" aria-label="Easy Windows Pack on GitHub">
      <span class="demo-logo-glow" aria-hidden="true"></span>
      <img class="demo-logo" src="${colorLogo}" alt="Easy Windows Pack" width="112" height="112">
    </a>
    <p class="demo-eyebrow">VITE + PYTHON</p>
    <h1 id="demo-title">Easy Windows Pack</h1>
    <p class="demo-tagline" data-copy="tagline"></p>
    <p class="demo-description" data-copy="description"></p>
    <div class="demo-counter-area">
      <button id="counter" class="demo-counter" type="button"></button>
      <p class="demo-edit-hint"><span data-copy="hint"></span> <code>frontend/src/main.js</code><span data-copy="hintEnd"></span></p>
    </div>
    <nav class="demo-links" aria-label="Resources">
      <a id="docsLink" class="demo-link demo-link-primary" href="https://github.com/Binceenigne/easy-windows-pack#readme" target="_blank" rel="noopener noreferrer"><span data-copy="docs"></span><span aria-hidden="true">↗</span></a>
      <a class="demo-link" href="https://github.com/Binceenigne/easy-windows-pack" target="_blank" rel="noopener noreferrer"><span data-copy="source"></span><span aria-hidden="true">↗</span></a>
    </nav>
  </section>

  <section class="demo-playground" aria-labelledby="playground-title">
    <p id="playground-title" class="demo-playground-heading" data-copy="playground"></p>
    <div class="demo-frame-options">
      <label class="demo-field"><span data-copy="style"></span>
        <select id="windowStyle"><option value="macos">macOS</option><option value="windows">Windows</option></select>
      </label>
      <label class="demo-field"><span data-copy="mode"></span>
        <select id="mode"><option value="default" data-copy="standard"></option><option value="minimal" data-copy="minimal"></option><option value="native" data-copy="native"></option></select>
      </label>
      <button id="apply" class="demo-apply" type="button" data-copy="apply"></button>
    </div>
  </section>

  <footer class="demo-footer">
    <p class="demo-status"><span class="demo-status-dot" aria-hidden="true"></span><span id="status" role="status"></span></p>
    <a class="demo-components-link" href="./src/components.html"><span data-copy="components"></span><span aria-hidden="true"> →</span></a>
  </footer>
`;

const listeners = new AbortController();
const query = selector => content.querySelector(selector);
const status = query('#status');
const counter = query('#counter');
const applyButton = query('#apply');
const scheme = window.matchMedia('(prefers-color-scheme: dark)');
let language = 'zh-CN';
let theme = scheme.matches ? 'dark' : 'light';
let count = 0;
let pending = false;
let feedback = null;
const frame = mountFrame('#app', {
  title: 'Easy Windows Pack', icon: darkLogo, windowStyle: 'macos', content,
  onError: () => { feedback = 'error'; renderStatus(); }
});

function renderStatus() {
  const desktop = Boolean(window.pywebview?.api);
  content.dataset.desktop = String(desktop);
  status.textContent = words[language][feedback ?? (desktop ? 'desktop' : 'browser')];
}

function renderTheme() {
  document.documentElement.dataset.demoTheme = theme;
  query('.demo-brand-mark').src = theme === 'dark' ? monoLogo : darkLogo;
  query('#themeLabel').textContent = words[language][theme === 'dark' ? 'light' : 'dark'];
  query('#themeToggle').setAttribute('aria-label', words[language].themeLabel);
  query('#themeToggle').setAttribute('aria-pressed', String(theme === 'dark'));
  frame.update({ icon: theme === 'dark' ? monoLogo : darkLogo });
}

function renderLanguage() {
  document.documentElement.lang = language;
  content.querySelectorAll('[data-copy]').forEach(element => { element.textContent = words[language][element.dataset.copy]; });
  counter.textContent = `${words[language].count}: ${count}`;
  applyButton.textContent = words[language][pending ? 'pending' : 'apply'];
  query('#languageToggle').textContent = language === 'en' ? '中文' : 'EN';
  query('#languageToggle').setAttribute('aria-label', words[language].languageLabel);
  query('#docsLink').href = language === 'en'
    ? 'https://github.com/Binceenigne/easy-windows-pack/blob/main/README.en.md'
    : 'https://github.com/Binceenigne/easy-windows-pack#readme';
  renderTheme();
  renderStatus();
}

const on = (element, event, handler) => element.addEventListener(event, handler, { signal: listeners.signal });
on(counter, 'click', () => { counter.textContent = `${words[language].count}: ${++count}`; });
on(query('#themeToggle'), 'click', () => { theme = theme === 'dark' ? 'light' : 'dark'; renderTheme(); });
on(query('#languageToggle'), 'click', () => { language = language === 'zh-CN' ? 'en' : 'zh-CN'; renderLanguage(); });
on(query('#windowStyle'), 'change', event => { frame.update({ windowStyle: event.target.value }); });
on(window, 'pywebviewready', () => { feedback = null; renderStatus(); });
on(applyButton, 'click', async () => {
  const mode = query('#mode').value;
  if (!window.pywebview?.api) {
    if (mode !== 'native') frame.update({ mode });
    feedback = mode === 'native' ? 'nativeHint' : 'applied';
    renderStatus();
    return;
  }
  pending = true;
  applyButton.disabled = true;
  applyButton.textContent = words[language].pending;
  try {
    const result = await setTitleBarMode(mode);
    if (listeners.signal.aborted) return;
    feedback = result.restartRequired ? 'restart' : result.ok ? 'applied' : 'error';
  } catch {
    if (listeners.signal.aborted) return;
    feedback = 'error';
  } finally {
    if (!listeners.signal.aborted) {
      pending = false;
      applyButton.disabled = false;
      applyButton.textContent = words[language].apply;
      renderStatus();
    }
  }
});

renderLanguage();
if (import.meta.hot) import.meta.hot.dispose(() => {
  listeners.abort();
  frame.dispose();
  delete document.documentElement.dataset.demoTheme;
});