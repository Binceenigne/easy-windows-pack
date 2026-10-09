import { mountFrame } from 'easywindowspack';
import colorLogo from './assets/ewp-color.svg';
import darkLogo from './assets/ewp-dark.svg';
import monoLogo from './assets/ewp-mono.svg';
import './style.css';

const content = document.createElement('main');
content.className = 'app-view';
content.innerHTML = `
  <section class="welcome-card">
    <header class="welcome-header">
      <picture class="brand-mark">
        <source srcset="${monoLogo}" media="(prefers-color-scheme: dark)" />
        <img src="${darkLogo}" alt="" width="22" height="22" />
      </picture>
      <span class="eyebrow">Vanilla · JavaScript</span>
    </header>
    <img class="hero-logo" src="${colorLogo}" alt="Easy Windows Pack" width="160" height="160" />
    <p class="brand-name">Easy Windows Pack</p>
    <h1>__EWP_heading__</h1>
    <p class="description">__EWP_description__</p>
    <div class="controls">
      <button class="counter" id="counter" type="button">__EWP_counter__: 0</button>
    </div>
    <p class="hint">__EWP_hint__ <code>__EWP_editFile__</code> __EWP_saveHint__</p>
    <nav class="welcome-links" aria-label="__EWP_resources__">
      <a href="https://github.com/Binceenigne/easy-windows-pack" target="_blank" rel="noopener noreferrer">__EWP_source__ <span aria-hidden="true">↗</span></a>
      <a href="https://github.com/Binceenigne/easy-windows-pack/tree/main/docs" target="_blank" rel="noopener noreferrer">__EWP_docs__ <span aria-hidden="true">↗</span></a>
    </nav>
    <label class="window-style">__EWP_windowStyle__
      <select id="window-style"><option value="macos">macOS</option><option value="windows">Windows</option></select>
    </label>
  </section>`;
const frame = mountFrame(document.querySelector('#app'), { title: document.title, windowStyle: 'macos', content });
const counter = content.querySelector('#counter');
const style = content.querySelector('#window-style');
let count = 0;
const increment = () => { counter.textContent = `__EWP_counter__: ${++count}`; };
const changeStyle = () => { frame.update({ windowStyle: style.value }); };
counter.addEventListener('click', increment);
style.addEventListener('change', changeStyle);
import.meta.hot?.dispose(() => {
  counter.removeEventListener('click', increment);
  style.removeEventListener('change', changeStyle);
  frame.dispose();
});