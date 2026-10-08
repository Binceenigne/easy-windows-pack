import { useState } from 'react';
import Frame from './Frame';

export default function App() {
  const [count, setCount] = useState(0);
  const [windowStyle, setWindowStyle] = useState<'macos' | 'windows'>('macos');
  return (
    <Frame title={document.title} windowStyle={windowStyle}>
      <main className="app-view">
        <section className="welcome-card">
          <span className="eyebrow">React · TypeScript</span>
          <h1>Your next desktop app.</h1>
          <p className="description">从一个轻量窗口开始。<br />Build something that feels at home on your desktop.</p>
          <div className="controls">
            <label>窗口外观 / Window style
              <select value={windowStyle} onChange={event => setWindowStyle(event.target.value === 'windows' ? 'windows' : 'macos')}>
                <option value="macos">macOS</option><option value="windows">Windows</option>
              </select>
            </label>
            <button className="counter" type="button" onClick={() => setCount(value => value + 1)}>Count: {count}</button>
          </div>
          <p className="hint">React portal 在共享窗口内容区内保持响应式。<br />Native window controls work in the desktop host.</p>
        </section>
      </main>
    </Frame>
  );
}