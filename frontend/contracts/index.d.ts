export type Id = string;

export type SidebarItem = {
  key: Id;
  label: string;
  icon?: string;
  badge?: string | number;
  disabled?: boolean;
  expandable?: boolean;
  children?: SidebarItem[];
  metadata?: Record<string, unknown>;
};

export type SidebarState = {
  activeKey?: Id;
  expandedKey?: Id;
  open: boolean;
  mobile: boolean;
};

export type ChatAttachment = {
  id: Id;
  name: string;
  url?: string;
  mimeType?: string;
  size?: number;
  status?: 'pending' | 'ready' | 'uploading' | 'error';
  error?: string;
};

export type ToolCall = {
  id: Id;
  name: string;
  label?: string;
  status: 'queued' | 'running' | 'success' | 'error' | 'cancelled';
  arguments?: unknown;
  result?: unknown;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
  metadata?: Record<string, unknown>;
};

export type ReasoningConfig = {
  enabled: boolean;
  depth: 'low' | 'medium' | 'high' | 'max' | string;
  showProcess: boolean;
  allowUserChange: boolean;
  label?: string;
};

export type ReasoningState = {
  status: 'idle' | 'queued' | 'running' | 'complete' | 'error' | 'cancelled';
  depth?: string;
  summary?: string;
  steps?: Array<{ id: Id; label: string; status: 'pending' | 'running' | 'complete' | 'error' }>;
  elapsedMs?: number;
  error?: string;
};

export type ChatMessage = {
  id: Id;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content?: string;
  status?: 'pending' | 'streaming' | 'complete' | 'error';
  createdAt?: string;
  attachments?: ChatAttachment[];
  toolCalls?: ToolCall[];
  reasoning?: ReasoningState;
  metadata?: Record<string, unknown>;
};

export type ChatProvider = {
  complete?: (draft: string, options: Record<string, unknown>) => Promise<string>;
  suggest?: (options: Record<string, unknown>) => Promise<string[]>;
  upload?: (files: File[], signal?: AbortSignal) => Promise<ChatAttachment[]>;
  stop?: () => void | Promise<void>;
};

export type SidebarEvents = {
  select: (item: SidebarItem) => void;
  toggle: (key: Id, expanded: boolean) => void;
  update: (state: Partial<SidebarState>) => void;
};

export type ChatEvents = {
  send: (content: string, attachments: ChatAttachment[]) => void | Promise<void>;
  stop: () => void | Promise<void>;
  attachment: (attachment: ChatAttachment) => void;
  reasoningChange: (config: ReasoningConfig) => void;
  toolToggle: (call: ToolCall, expanded: boolean) => void;
};
