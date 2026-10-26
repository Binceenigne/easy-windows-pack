import { openDocs } from 'easywindowspack/docs';
import { mountFrame } from 'easywindowspack';
import colorLogo from './assets/ewp-color.svg';
import darkLogo from './assets/ewp-dark.svg';
import monoLogo from './assets/ewp-mono.svg';
import partnerLogo from './assets/javascript.svg';
import './style.css';

const content = document.createElement('main');
content.className = 'app-view';
content.dataset.stack = 'vanilla';
content.innerHTML = `
  <header class="welcome-header">
    <button class="theme-toggle" type="button" aria-label="__EWP_themeToggle__" aria-pressed="false">
      <svg class="theme-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M20 14a8.4 8.4 0 0 1-10-10 8.5 8.5 0 1 0 10 10Z"/></svg>
      <svg class="theme-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/></svg>
    </button>
  </header>
  <section class="welcome-hero" aria-labelledby="welcome-title">
    <div class="brand-pair">
      <a class="brand-link" href="https://github.com/Binceenigne/easy-windows-pack" target="_blank" rel="noopener noreferrer" aria-label="Easy Windows Pack · GitHub"><img src="${colorLogo}" alt="EWP" width="88" height="88"></a>
      <span class="brand-plus" aria-hidden="true">+</span>
      <a class="brand-link partner" href="https://developer.mozilla.org/en-US/docs/Web/JavaScript" target="_blank" rel="noopener noreferrer" aria-label="JavaScript · MDN"><img src="${partnerLogo}" alt="JavaScript" width="86" height="86"></a>
    </div>
    <h1 id="welcome-title">EWP <span class="title-join">+</span> <span class="partner-name">Vanilla</span></h1>
    <p class="description">__EWP_description__</p>
    <nav class="welcome-links" aria-label="__EWP_resources__">
      <button class="welcome-button primary" type="button">__EWP_docs__ <span aria-hidden="true">→</span></button>
      <a class="welcome-button" href="https://github.com/Binceenigne/easy-windows-pack" target="_blank" rel="noopener noreferrer">__EWP_source__ <span aria-hidden="true">↗</span></a>
    </nav>
    <p class="hint">__EWP_hint__ <code>__EWP_editFile__</code>__EWP_saveHint__</p>
    <section class="desktop-experience" aria-labelledby="window-style-label">
      <div class="experience-row">
        <span class="experience-label" id="window-style-label">__EWP_windowStyle__</span>
        <div class="frame-switch" role="group" aria-label="__EWP_windowStyle__">
          <button class="experience-button" type="button" data-window-style="macos" aria-pressed="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M6 6.5h1m2 0h1"/></svg>macOS</button>
          <button class="experience-button" type="button" data-window-style="windows" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M6 6.5h1m2 0h1"/></svg>Windows</button>
        </div>
      </div>
      <p class="experience-feedback">__EWP_windowHint__</p>
    </section>
  </section>
  <footer class="welcome-footer">
    <p class="preview-status"><span class="status-dot" aria-hidden="true"></span>__EWP_previewHint__</p>
    <a class="footer-brand" href="https://github.com/Binceenigne/easy-windows-pack" target="_blank" rel="noopener noreferrer"><span class="brand-credit">Built with</span><img class="footer-logo" src="${darkLogo}" alt="" width="16" height="16"><span>easy-windows-pack</span></a>
  </footer>`;

const frame = mountFrame('#app', { title: document.title, windowStyle: 'macos', content });
const listeners = new AbortController();
const themeButton = content.querySelector('.theme-toggle');
let dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
function renderTheme() {
  document.documentElement.dataset.welcomeTheme = dark ? 'dark' : 'light';
  content.querySelector('.footer-logo').src = dark ? monoLogo : darkLogo;
  themeButton.setAttribute('aria-pressed', String(dark));
}
content.querySelector('.welcome-button.primary').addEventListener('click', () => { void openDocs({ language: '__EWP_docsLang__' }); }, { signal: listeners.signal });
themeButton.addEventListener('click', () => { dark = !dark; renderTheme(); }, { signal: listeners.signal });
content.querySelectorAll('[data-window-style]').forEach(button => {
  button.addEventListener('click', () => {
    frame.update({ windowStyle: button.dataset.windowStyle });
    content.querySelectorAll('[data-window-style]').forEach(option => option.setAttribute('aria-pressed', String(option === button)));
  }, { signal: listeners.signal });
});
renderTheme();
import.meta.hot?.dispose(() => {
  listeners.abort();
  frame.dispose();
  delete document.documentElement.dataset.welcomeTheme;
});