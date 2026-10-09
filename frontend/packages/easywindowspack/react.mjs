import { createElement, useLayoutEffect, useRef } from 'react';
import { mountFrame } from './index.mjs';

export function WindowFrame({ children, title, icon, mode, windowStyle, resizable = true, onError, ...attrs }) {
  const host = useRef(null);
  const content = useRef(null);
  const instance = useRef(null);
  useLayoutEffect(() => {
    // Keep React's own child container intact across StrictMode cleanup/remount.
    const node = content.current;
    instance.current = mountFrame(host.current, { content: node });
    return () => {
      host.current?.append(node);
      instance.current?.dispose();
      instance.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    instance.current?.update({ title, icon, mode, windowStyle, resizable, onError });
  }, [title, icon, mode, windowStyle, resizable, onError]);
  return createElement('div', { ...attrs, ref: host }, createElement('div', { ref: content }, children));
}

export default WindowFrame;