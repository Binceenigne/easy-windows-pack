import './assets/window-frame.js';
import { frameTemplate } from './assets/frame-template.mjs';

const mounted = new WeakMap();

/** Mount the shared frame. CSS is explicitly imported by the application. */
export function mountFrame(target, options = {}) {
  if (typeof document === 'undefined') throw new Error('mountFrame requires a browser DOM.');
  const host = typeof target === 'string' ? document.querySelector(target) : target;
  if (!host || typeof host.append !== 'function') throw new TypeError('mountFrame requires an existing container.');
  mounted.get(host)?.dispose();
  const template = host.ownerDocument.createElement('template');
  template.innerHTML = frameTemplate.trim();
  const frame = template.content.querySelector('[data-ewp-window-frame]');
  const content = frame?.querySelector('[data-ewp-content]');
  if (!frame || !content) throw new Error('The shared frame template is invalid. Run npm run prepare:npm.');
  // Instances share the template, never its fixed id or its demo content.
  frame.removeAttribute('id');
  content.replaceChildren();
  host.append(frame);
  const bridge = window.easyWindowsPack;
  if (!bridge?.bind || !bridge?.unbind) {
    frame.remove();
    throw new Error('The frame bridge does not support lifecycle cleanup. Regenerate npm assets.');
  }
  let disposed = false;
  let current = {};
  const instance = {
    frame,
    content,
    update(next = {}) {
      if (disposed) return instance;
      current = { ...current, ...next };
      bridge.unbind(frame);
      if ('content' in next) {
        if (typeof next.content === 'string') content.textContent = next.content;
        else content.replaceChildren(...(next.content == null ? [] : [next.content]));
      }
      const title = frame.querySelector('[data-ewp-title]');
      if (title && 'title' in current) title.textContent = current.title ?? '';
      const icon = frame.querySelector('[data-ewp-icon]');
      if (icon && 'icon' in current) {
        if (current.icon) icon.src = current.icon;
        else icon.removeAttribute('src');
        icon.style.display = current.icon ? 'block' : 'none';
      }
      if ('resizable' in current) frame.dataset.resizable = String(current.resizable);
      bridge.bind(frame, { ...current, content: undefined, mode: current.mode ?? current.titleBarMode });
      return instance;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      bridge.unbind(frame);
      frame.remove();
      if (mounted.get(host) === instance) mounted.delete(host);
    },
    remove() {
      instance.dispose();
    }
  };
  try { instance.update(options); }
  catch (error) { instance.dispose(); throw error; }
  mounted.set(host, instance);
  return instance;
}

export function getWindowApi() {
  return typeof window === 'undefined' ? null : window.easyWindowsPack ?? null;
}

function requireWindowApi() {
  const api = getWindowApi();
  if (!api) throw new Error('The window bridge requires a browser DOM.');
  return api;
}

/** Change all mounted frames through the shared bridge. */
export function setWindowStyle(style) {
  return requireWindowApi().setWindowStyle(style);
}

/** Native mode changes are requests to the desktop host. */
export function setTitleBarMode(mode) {
  return requireWindowApi().setTitleBarMode(mode);
}

export function call(method, ...args) {
  return requireWindowApi().call(method, ...args);
}

export function isSupportedResizeDirection(direction) {
  return requireWindowApi().isSupportedResizeDirection(direction);
}