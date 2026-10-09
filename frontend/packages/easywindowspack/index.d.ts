export interface FrameOptions {
  title?: string;
  icon?: string | null;
  mode?: 'native' | 'default' | 'minimal';
  titleBarMode?: 'native' | 'default' | 'minimal';
  windowStyle?: 'windows' | 'macos';
  resizable?: boolean;
  /** Strings are rendered as text. Pass a DOM node to render application content. */
  content?: Node | string | null;
  onError?: (result: { ok: false; error: string }) => void;
}
export interface MountedFrame {
  frame: HTMLElement;
  content: HTMLElement;
  update(options?: FrameOptions): MountedFrame;
  dispose(): void;
  /** Remove the frame and release its listeners; equivalent to dispose(). */
  remove(): void;
}
export function mountFrame(target: Element | string, options?: FrameOptions): MountedFrame;
export function setWindowStyle(style: 'windows' | 'macos'): void;
export function setTitleBarMode(mode: 'native' | 'default' | 'minimal'): Promise<Record<string, unknown>>;
export function call(method: string, ...args: unknown[]): Promise<Record<string, unknown>>;
export function isSupportedResizeDirection(direction: string): boolean;
export function getWindowApi(): {
  bind(frame: Element, options?: FrameOptions): Element;
  unbind(frame: Element): Element;
  call(method: string, ...args: unknown[]): Promise<Record<string, unknown>>;
  setWindowStyle(style: string): void;
  setTitleBarMode(mode: string): Promise<Record<string, unknown>>;
  isSupportedResizeDirection(direction: string): boolean;
} | null;