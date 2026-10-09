import { mountFrame } from 'easywindowspack';
import './style.css';

const content = document.createElement('main');
content.className = 'app-view';
content.innerHTML = `
  <section class="welcome-card">
    <span class="eyebrow">Vanilla · JavaScript</span>
    <h1>__EWP_heading__</h1>
    <p class="description">__EWP_description__</p>
    <div class="controls">
      <label>__EWP_windowStyle__
        <select id="window-style"><option value="macos">macOS</option><option value="windows">Windows</option></select>
      </label>
      <button class="counter" id="counter" type="button">__EWP_counter__: 0</button>
    </div>
    <p class="hint">__EWP_hint__</p>
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