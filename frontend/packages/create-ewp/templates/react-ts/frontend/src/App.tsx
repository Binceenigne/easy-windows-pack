import { openDocs } from 'easywindowspack/docs';
import { useEffect, useState } from 'react';
import Frame from './Frame';
import colorLogo from './assets/ewp-color.svg';
import darkLogo from './assets/ewp-dark.svg';
import monoLogo from './assets/ewp-mono.svg';
import partnerLogo from './assets/react.svg';

export default function App() {
  const [windowStyle, setWindowStyle] = useState<'macos' | 'windows'>('macos');
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    document.documentElement.dataset.welcomeTheme = dark ? 'dark' : 'light';
    return () => { delete document.documentElement.dataset.welcomeTheme; };
  }, [dark]);
  return (
    <Frame title={document.title} windowStyle={windowStyle}>
      <main className="app-view" data-stack="react">
        <header className="welcome-header">
          <button className="theme-toggle" type="button" aria-label="__EWP_themeToggle__" aria-pressed={dark} onClick={() => setDark(value => !value)}>
            <svg className="theme-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M20 14a8.4 8.4 0 0 1-10-10 8.5 8.5 0 1 0 10 10Z" /></svg>
            <svg className="theme-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5" /></svg>
          </button>
        </header>
        <section className="welcome-hero" aria-labelledby="welcome-title">
          <div className="brand-pair">
            <a className="brand-link" href="https://github.com/Binceenigne/easy-windows-pack" target="_blank" rel="noopener noreferrer" aria-label="Easy Windows Pack · GitHub"><img src={colorLogo} alt="EWP" width="88" height="88" /></a>
            <span className="brand-plus" aria-hidden="true">+</span>
            <a className="brand-link partner" href="https://react.dev/" target="_blank" rel="noopener noreferrer" aria-label="React"><img src={partnerLogo} alt="React" width="86" height="86" /></a>
          </div>
          <h1 id="welcome-title">EWP <span className="title-join">+</span> <span className="partner-name">React</span></h1>
          <p className="description">__EWP_description__</p>
          <nav className="welcome-links" aria-label="__EWP_resources__">
            <button className="welcome-button primary" type="button" onClick={() => { void openDocs({ language: '__EWP_docsLang__' }); }}>__EWP_docs__ <span aria-hidden="true">→</span></button>
            <a className="welcome-button" href="https://github.com/Binceenigne/easy-windows-pack" target="_blank" rel="noopener noreferrer">__EWP_source__ <span aria-hidden="true">↗</span></a>
          </nav>
          <p className="hint">__EWP_hint__ <code>__EWP_editFile__</code>__EWP_saveHint__</p>
          <section className="desktop-experience" aria-labelledby="window-style-label">
            <div className="experience-row">
              <span className="experience-label" id="window-style-label">__EWP_windowStyle__</span>
              <div className="frame-switch" role="group" aria-label="__EWP_windowStyle__">
                <button className="experience-button" type="button" aria-pressed={windowStyle === 'macos'} onClick={() => setWindowStyle('macos')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M3 9h18M6 6.5h1m2 0h1" /></svg>macOS</button>
                <button className="experience-button" type="button" aria-pressed={windowStyle === 'windows'} onClick={() => setWindowStyle('windows')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M3 9h18M6 6.5h1m2 0h1" /></svg>Windows</button>
              </div>
            </div>
            <p className="experience-feedback">__EWP_windowHint__</p>
          </section>
        </section>
        <footer className="welcome-footer">
          <p className="preview-status"><span className="status-dot" aria-hidden="true" />__EWP_previewHint__</p>
          <a className="footer-brand" href="https://github.com/Binceenigne/easy-windows-pack" target="_blank" rel="noopener noreferrer"><span className="brand-credit">Built with</span><img src={dark ? monoLogo : darkLogo} alt="" width="16" height="16" /><span>easy-windows-pack</span></a>
        </footer>
      </main>
    </Frame>
  );
}