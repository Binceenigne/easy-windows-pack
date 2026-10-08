import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { mountFrame } from 'easywindowspack';
import type { MountedFrame } from 'easywindowspack';

type FrameProps = { title?: string; windowStyle?: 'macos' | 'windows'; children: ReactNode };

export default function Frame({ title = 'Desktop App', windowStyle = 'macos', children }: FrameProps) {
  const root = useRef<HTMLDivElement>(null);
  const frame = useRef<MountedFrame | null>(null);
  const [content, setContent] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!root.current) return;
    const instance = mountFrame(root.current);
    frame.current = instance;
    setContent(instance.content);
    return () => { frame.current = null; instance.dispose(); };
  }, []);
  useEffect(() => { frame.current?.update({ title, windowStyle }); }, [title, windowStyle]);
  return <><div ref={root} className="desktop-frame" />{content && createPortal(children, content)}</>;
}