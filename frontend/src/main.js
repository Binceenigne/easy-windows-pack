import { mountFrame } from 'easywindowspack';
import 'easywindowspack/frame.css';
import colorLogo from './assets/ewp-color.svg';
import darkLogo from './assets/ewp-dark.svg';
import monoLogo from './assets/ewp-mono.svg';
import partnerLogo from './assets/javascript.svg';
import './demo.css';

const words = {
  'zh-CN': {
    description: '把你的想法，带到桌面。',
    hint: '编辑', saveHint: '，保存即见更新。', docs: '开始构建', source: 'GitHub',
    resources: '开发资源', windowStyle: '试试窗口外观',
    windowHint: '切换上方标题栏，感受不同的桌面风格。',
    browser: '浏览器可预览外观 · 原生操作需桌面运行', desktop: '桌面桥接已就绪',
    themeToggle: '切换浅色与深色主题', languageToggle: 'Switch to English',
    error: '窗口外观未能更新，请重试。'
  },
  en: {
    description: 'Bring your ideas to the desktop.',
    hint: 'Edit', saveHint: ' and save to see your changes.', docs: 'Start building', source: 'GitHub',
    resources: 'Development resources', windowStyle: 'Try the window frame',
    windowHint: 'Switch the title bar above. Find your desktop style.',
    browser: 'Browser previews appearance · Native actions need the desktop app', desktop: 'Desktop bridge ready',
    themeToggle: 'Switch between light and dark themes', languageToggle: '切换为简体中文',
    error: 'Could not update the window frame. Please try again.'
  }
};

const repo = 'https://github.com/Binceenigne/easy-windows-pack';
const windowIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M6 6.5h1m2 0h1"/></svg>';
const content = document.createElement('main');
content.className = 'app-view';
content.dataset.stack = 'vanilla';
content.innerHTML = `
  <header class="welcome-header">
    <div class="welcome-tools">
      <button id="themeToggle" class="theme-toggle" type="button">
        <svg class="theme-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M20 14a8.4 8.4 0 0 1-10-10 8.5 8.5 0 1 0 10 10Z"/></svg>
        <svg class="theme-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/></svg>
      </button>
      <button id="languageToggle" class="language-toggle" type="button">EN</button>
    </div>
  </header>
  <section class="welcome-hero" aria-labelledby="welcome-title">
    <div class="brand-pair">
      <a class="brand-link" href="${repo}" target="_blank" rel="noopener noreferrer" aria-label="Easy Windows Pack · GitHub"><img src="${colorLogo}" alt="EWP" width="88" height="88"></a>
      <span class="brand-plus" aria-hidden="true">+</span>
      <a class="brand-link partner" href="https://developer.mozilla.org/en-US/docs/Web/JavaScript" target="_blank" rel="noopener noreferrer" aria-label="JavaScript · MDN"><img src="${partnerLogo}" alt="JavaScript" width="86" height="86"></a>
    </div>
    <h1 id="welcome-title">EWP <span class="title-join">+</span> <span class="partner-name">Vanilla</span></h1>
    <p class="description" data-copy="description"></p>
    <nav class="welcome-links">
      <a id="docsLink" class="welcome-button primary" href="${repo}#readme" target="_blank" rel="noopener noreferrer"><span data-copy="docs"></span><span aria-hidden="true">→</span></a>
      <a class="welcome-button" href="${repo}" target="_blank" rel="noopener noreferrer"><span data-copy="source"></span><span aria-hidden="true">↗</span></a>
    </nav>
    <p class="hint"><span data-copy="hint"></span> <code>frontend/src/main.js</code><span data-copy="saveHint"></span></p>
    <section class="desktop-experience" aria-labelledby="window-style-label">
      <div class="experience-row">
        <span id="window-style-label" class="experience-label" data-copy="windowStyle"></span>
        <div class="frame-switch" role="group">
          <button class="experience-button" type="button" data-window-style="macos" aria-pressed="true">${windowIcon}macOS</button>
          <button class="experience-button" type="button" data-window-style="windows" aria-pressed="false">${windowIcon}Windows</button>
        </div>
      </div>
      <p class="experience-feedback" data-copy="windowHint"></p>
    </section>
  </section>
  <footer class="welcome-footer">
    <p class="preview-status"><span class="status-dot" aria-hidden="true"></span><span id="status" role="status"></span></p>
    <a class="footer-brand" href="${repo}" target="_blank" rel="noopener noreferrer"><span class="brand-credit">Built with</span><img class="footer-logo" src="${darkLogo}" alt="" width="16" height="16"><span>easy-windows-pack</span></a>
  </footer>`;

const listeners = new AbortController();
const query = selector => content.querySelector(selector);
let language = 'zh-CN';
let theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
let windowStyle = 'macos';
let failed = false;
const frame = mountFrame('#app', {
  title: 'Easy Windows Pack', icon: darkLogo, windowStyle, content,
  onError: () => { failed = true; renderStatus(); }
});

function renderStatus() {
  query('#status').textContent = words[language][failed ? 'error' : window.pywebview?.api ? 'desktop' : 'browser'];
}

function renderTheme() {
  document.documentElement.dataset.welcomeTheme = theme;
  const icon = theme === 'dark' ? monoLogo : darkLogo;
  query('.footer-logo').src = icon;
  query('#themeToggle').setAttribute('aria-label', words[language].themeToggle);
  query('#themeToggle').setAttribute('aria-pressed', String(theme === 'dark'));
  frame.update({ icon });
}

function renderLanguage() {
  document.documentElement.lang = language;
  content.querySelectorAll('[data-copy]').forEach(element => { element.textContent = words[language][element.dataset.copy]; });
  query('.welcome-links').setAttribute('aria-label', words[language].resources);
  query('.frame-switch').setAttribute('aria-label', words[language].windowStyle);
  query('#languageToggle').textContent = language === 'en' ? '中文' : 'EN';
  query('#languageToggle').setAttribute('aria-label', words[language].languageToggle);
  query('#docsLink').href = language === 'en' ? `${repo}/blob/main/README.en.md` : `${repo}#readme`;
  renderTheme();
  renderStatus();
}

const on = (element, event, handler) => element.addEventListener(event, handler, { signal: listeners.signal });
on(query('#themeToggle'), 'click', () => { theme = theme === 'dark' ? 'light' : 'dark'; renderTheme(); });
on(query('#languageToggle'), 'click', () => { language = language === 'zh-CN' ? 'en' : 'zh-CN'; renderLanguage(); });
content.querySelectorAll('[data-window-style]').forEach(button => on(button, 'click', () => {
  failed = false;
  try {
    frame.update({ windowStyle: button.dataset.windowStyle });
    windowStyle = button.dataset.windowStyle;
    content.querySelectorAll('[data-window-style]').forEach(option => option.setAttribute('aria-pressed', String(option.dataset.windowStyle === windowStyle)));
  } catch { failed = true; }
  renderStatus();
}));
on(window, 'pywebviewready', renderStatus);

renderLanguage();
import.meta.hot?.dispose(() => {
  listeners.abort();
  frame.dispose();
  delete document.documentElement.dataset.welcomeTheme;
});