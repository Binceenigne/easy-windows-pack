(function (global) {
  'use strict';
  const percent = value => Math.max(0, Math.min(100, Number(value) || 0));
  const reduced = () => global.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    document.documentElement.dataset.motion === 'off';
  function sequence(length, text) {
    let seed = 2166136261;
    for (const character of text) { seed ^= character.charCodeAt(0); seed = Math.imul(seed, 16777619); }
    const values = Array.from({length}, (_, index) => index);
    for (let index = length - 1; index > 0; index--) {
      seed = Math.imul(seed ^ (seed >>> 15), 2246822519) >>> 0;
      const target = seed % (index + 1);
      [values[index], values[target]] = [values[target], values[index]];
    }
    return values;
  }

  function createMatrixProgress(root, options = {}) {
    let state = {value: 0, remaining: 100, size: 4, ...options}, disposed = false;
    const bar = document.createElement('span');
    bar.setAttribute('aria-hidden', 'true');
    root.classList.add('ewp-progress');
    root.setAttribute('role', 'progressbar');
    root.setAttribute('aria-valuemin', '0'); root.setAttribute('aria-valuemax', '100');
    root.append(bar);
    function render() {
      if (disposed) return;
      const fill = state.unlimited ? 100 : percent(state.value), remaining = percent(state.remaining);
      const size = [2, 3, 4].includes(state.size) ? state.size : 4;
      const dot = size === 2 ? 2 : 3, gap = size === 2 ? 2 : 3;
      const blockWidth = size * dot + size - 1;
      const style = getComputedStyle(root);
      const width = root.clientWidth - parseFloat(style.paddingLeft || 0) - parseFloat(style.paddingRight || 0) - 6;
      const count = Math.max(0, Math.floor((width + gap) / (blockWidth + gap)));
      const matrix = count >= (size === 4 ? 8 : size === 3 ? 7 : 10);
      root.setAttribute('aria-valuenow', String(fill));
      root.setAttribute('aria-label', state.label || 'Progress');
      root.setAttribute('aria-valuetext', state.unlimited ? (state.unlimitedLabel || 'Unlimited') : `${fill}%`);
      root.dataset.tone = state.unlimited ? 'unlimited' : remaining <= 10 ? 'critical' : remaining <= 25 ? 'danger' : remaining <= 50 ? 'warn' : 'good';
      bar.className = matrix ? 'ewp-matrix' : 'ewp-linear';
      bar.style.setProperty('--ewp-fill', String(fill / 100));
      bar.style.setProperty('--ewp-size', String(size));
      bar.style.setProperty('--ewp-dot', `${dot}px`);
      bar.style.setProperty('--ewp-gap', `${gap}px`);
      const signature = matrix ? `${size}:${count}:${Math.round(count * size * size * fill / 100)}` : 'linear';
      if (bar.dataset.signature === signature) return;
      bar.dataset.signature = signature;
      const fragment = document.createDocumentFragment();
      if (matrix) {
        const total = Math.round(count * size * size * fill / 100);
        for (let index = 0; index < count; index++) {
          const block = document.createElement('span'); block.className = 'ewp-matrix-block';
          const filled = Math.max(0, Math.min(size * size, total - index * size * size));
          block.classList.toggle('is-active', filled > 0 && filled < size * size);
          const indexes = new Set(sequence(size * size, `${state.seed || root.id}:${size}:${index}`).slice(0, filled));
          for (let i = 0; i < size * size; i++) {
            const cell = document.createElement('i'); cell.className = 'ewp-matrix-dot';
            cell.classList.toggle('is-filled', indexes.has(i)); block.append(cell);
          }
          fragment.append(block);
        }
      }
      bar.replaceChildren(fragment);
    }
    const observer = new ResizeObserver(render); observer.observe(root); render();
    return {
      update(value) { state = {...state, ...value}; render(); },
      dispose() { disposed = true; observer.disconnect(); bar.remove(); root.classList.remove('ewp-progress');
        ['role', 'aria-valuemin', 'aria-valuemax', 'aria-valuenow', 'aria-valuetext', 'aria-label', 'data-tone'].forEach(name => root.removeAttribute(name)); }
    };
  }

  function createEntrance(root) {
    let timer, disposed = false;
    const originalInert = root.inert, originalHidden = root.getAttribute('aria-hidden');
    function restore() {
      root.inert = originalInert;
      if (originalHidden === null) root.removeAttribute('aria-hidden'); else root.setAttribute('aria-hidden', originalHidden);
    }
    function prepare() {
      if (disposed) return;
      clearTimeout(timer); root.dataset.ewpEntry = 'pending'; root.inert = true; root.setAttribute('aria-hidden', 'true');
    }
    function reveal() {
      if (disposed || root.dataset.ewpEntry !== 'pending') return;
      const items = [...root.querySelectorAll('[data-ewp-enter]')];
      items.forEach((item, index) => item.style.setProperty('--ewp-entry-delay', `${index * 160}ms`));
      root.dataset.ewpEntry = reduced() ? 'ready' : 'arriving';
      if (originalHidden === null) root.removeAttribute('aria-hidden'); else root.setAttribute('aria-hidden', originalHidden);
      timer = setTimeout(() => { root.dataset.ewpEntry = 'ready'; restore(); }, reduced() ? 0 : 1100 + Math.max(0, items.length - 1) * 160);
    }
    prepare();
    return {prepare, reveal, dispose() { disposed = true; clearTimeout(timer); restore(); delete root.dataset.ewpEntry;
      root.querySelectorAll('[data-ewp-enter]').forEach(item => item.style.removeProperty('--ewp-entry-delay')); }};
  }

  function createBootCurtain(root, {onComplete = () => {}, timeout = 12000} = {}) {
    let ready = false, leaving = false, completed = false, holdTimer, exitTimer;
    const start = performance.now(), previousFocus = document.activeElement;
    const media = global.matchMedia('(prefers-reduced-motion: reduce)');
    root.hidden = false; root.classList.add('ewp-curtain'); root.tabIndex = -1;
    root.setAttribute('role', 'status'); root.focus({preventScroll: true});
    function cleanup() { clearTimeout(holdTimer); clearTimeout(exitTimer); clearTimeout(watchdog);
      document.removeEventListener('keydown', key, true); root.removeEventListener('transitionend', ended); media.removeEventListener('change', schedule); }
    function complete(reason) {
      if (completed) return;
      completed = true; cleanup(); root.hidden = true; root.classList.remove('is-leaving');
      if (previousFocus?.isConnected && typeof previousFocus.focus === 'function') previousFocus.focus({preventScroll: true});
      onComplete({reason});
    }
    function close() {
      if (completed || leaving) return;
      leaving = true; root.classList.add('is-leaving');
      exitTimer = setTimeout(() => complete('finished'), reduced() ? 0 : 740);
    }
    function schedule() {
      clearTimeout(holdTimer);
      if (!ready || completed) return;
      if (leaving) { if (reduced()) complete('finished'); return; }
      holdTimer = setTimeout(close, reduced() ? 0 : Math.max(0, 850 - (performance.now() - start)));
    }
    function key(event) { if (ready && ['Escape', 'Enter', ' '].includes(event.key)) { event.preventDefault(); close(); } }
    function ended(event) { if (event.target === root && event.propertyName === 'clip-path' && leaving) complete('finished'); }
    const watchdog = setTimeout(() => complete('timeout'), timeout);
    document.addEventListener('keydown', key, true); root.addEventListener('transitionend', ended); media.addEventListener('change', schedule);
    return {setReady(value = true) { ready = value === true; schedule(); }, dispose() { completed = true; cleanup(); root.hidden = true; root.classList.remove('is-leaving'); }};
  }
  global.EasyWindowsPackComponents = {createMatrixProgress, createEntrance, createBootCurtain};
})(window);