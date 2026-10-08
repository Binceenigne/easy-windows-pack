import { mountFrame } from 'easywindowspack';
import './style.css';

const content = document.createElement('main');
content.className = 'app-view';
content.innerHTML = `
  <section class="welcome-card">
    <span class="eyebrow">Vanilla · JavaScript</span>
    <h1>Your next desktop app.</h1>
    <p class="description">从一个轻量窗口开始。<br />Build something that feels at home on your desktop.</p>
    <div class="controls">
      <label>窗口外观 / Window style
        <select id="window-style"><option value="macos">macOS</option><option value="windows">Windows</option></select>
      </label>
      <button class="counter" id="counter" type="button">Count: 0</button>
    </div>
    <p class="hint">标题栏复用 easywindowspack。原生窗口按钮在桌面中可用。<br />Native window controls work in the desktop host.</p>
  </section>`;
const frame = mountFrame(document.querySelector('#app'), { title: document.title, windowStyle: 'macos', content });
const counter = content.querySelector('#counter');
const style = content.querySelector('#window-style');
let count = 0;
const increment = () => { counter.textContent = `Count: ${++count}`; };
const changeStyle = () => { frame.update({ windowStyle: style.value }); };
counter.addEventListener('click', increment);
style.addEventListener('change', changeStyle);
import.meta.hot?.dispose(() => {
  counter.removeEventListener('click', increment);
  style.removeEventListener('change', changeStyle);
  frame.dispose();
});