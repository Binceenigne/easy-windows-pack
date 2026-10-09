import { useState } from 'react';
import Frame from './Frame';
import colorLogo from './assets/ewp-color.svg';
import darkLogo from './assets/ewp-dark.svg';
import monoLogo from './assets/ewp-mono.svg';

export default function App() {
  const [count, setCount] = useState(0);
  const [windowStyle, setWindowStyle] = useState<'macos' | 'windows'>('macos');
  return (
    <Frame title={document.title} windowStyle={windowStyle}>
      <main className="app-view">
        <section className="welcome-card">
          <header className="welcome-header">
            <picture className="brand-mark">
              <source srcSet={monoLogo} media="(prefers-color-scheme: dark)" />
              <img src={darkLogo} alt="" width="22" height="22" />
            </picture>
            <span className="eyebrow">React · TypeScript</span>
          </header>
          <img className="hero-logo" src={colorLogo} alt="Easy Windows Pack" width="160" height="160" />
          <p className="brand-name">Easy Windows Pack</p>
          <h1>__EWP_heading__</h1>
          <p className="description">__EWP_description__</p>
          <div className="controls">
            <button className="counter" type="button" onClick={() => setCount(value => value + 1)}>__EWP_counter__: {count}</button>
          </div>
          <p className="hint">__EWP_hint__ <code>__EWP_editFile__</code> __EWP_saveHint__</p>
          <nav className="welcome-links" aria-label="__EWP_resources__">
            <a href="https://github.com/Binceenigne/easy-windows-pack" target="_blank" rel="noopener noreferrer">__EWP_source__ <span aria-hidden="true">↗</span></a>
            <a href="https://github.com/Binceenigne/easy-windows-pack/tree/main/docs" target="_blank" rel="noopener noreferrer">__EWP_docs__ <span aria-hidden="true">↗</span></a>
          </nav>
          <label className="window-style">__EWP_windowStyle__
            <select value={windowStyle} onChange={event => setWindowStyle(event.target.value === 'windows' ? 'windows' : 'macos')}>
              <option value="macos">macOS</option><option value="windows">Windows</option>
            </select>
          </label>
        </section>
      </main>
    </Frame>
  );
}