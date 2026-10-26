export interface DocumentationOptions {
  language?: 'zh-CN' | 'en';
}
export interface DocumentationView {
  close(): void;
}
/** Open the installed offline manual in an isolated panel without navigating the application. */
export function openDocs(options?: DocumentationOptions): Promise<DocumentationView>;
