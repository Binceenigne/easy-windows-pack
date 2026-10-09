import { useState } from 'react';
import Frame from './Frame.jsx';

export default function App() {
  const [count, setCount] = useState(0);
  const [windowStyle, setWindowStyle] = useState('macos');
  return (
    <Frame title={document.title} windowStyle={windowStyle}>
      <main className="app-view">
        <section className="welcome-card">
          <span className="eyebrow">React · JavaScript</span>
          <h1>__EWP_heading__</h1>
          <p className="description">__EWP_description__</p>
          <div className="controls">
            <label>__EWP_windowStyle__
              <select value={windowStyle} onChange={event => setWindowStyle(event.target.value)}>
                <option value="macos">macOS</option><option value="windows">Windows</option>
              </select>
            </label>
            <button className="counter" type="button" onClick={() => setCount(value => value + 1)}>__EWP_counter__: {count}</button>
          </div>
          <p className="hint">__EWP_hint__</p>
        </section>
      </main>
    </Frame>
  );
}