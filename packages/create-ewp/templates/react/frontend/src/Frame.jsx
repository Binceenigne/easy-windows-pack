import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { mountFrame } from 'easywindowspack';

export default function Frame({ title = 'Desktop App', windowStyle = 'macos', children }) {
  const root = useRef(null);
  const frame = useRef(null);
  const [content, setContent] = useState(null);
  useEffect(() => {
    const instance = mountFrame(root.current);
    frame.current = instance;
    setContent(instance.content);
    return () => { frame.current = null; instance.dispose(); };
  }, []);
  useEffect(() => { frame.current?.update({ title, windowStyle }); }, [title, windowStyle]);
  return <><div ref={root} className="desktop-frame" />{content && createPortal(children, content)}</>;
}