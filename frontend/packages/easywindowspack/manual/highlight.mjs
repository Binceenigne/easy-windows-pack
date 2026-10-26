const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

const keywords = new Set('import from export const let var function return async await new throw if else for of in try catch finally class extends true false null undefined typeof interface type def with as not and or None True False raise pass assert'.split(' '));
const commands = new Set(['ewp', 'ews', 'npm', 'node', 'cargo', 'rustc', 'go', 'cmake', 'python', 'pip', 'makensis']);

/** Small static lexer: highlighting never executes code or changes its text. */
export function highlightCode(source, language = '') {
  const comments = ['powershell', 'bash', 'shell', 'python', 'toml'].includes(language);
  const pattern = new RegExp([
    '/\\*[\\s\\S]*?\\*/',
    '//[^\\r\\n]*',
    ...(comments ? ['#[^\\r\\n]*'] : []),
    '"(?:\\\\.|[^"\\\\])*"',
    "'(?:\\\\.|[^'\\\\])*'",
    '`(?:\\\\.|[^`\\\\])*`',
    '\\$[a-zA-Z_][\\w:]*',
    '--?[a-zA-Z][\\w:-]*',
    '\\b\\d+(?:\\.\\d+)?\\b',
    '\\b[a-zA-Z_][\\w]*\\b'
  ].join('|'), 'g');
  let html = '';
  let offset = 0;
  for (const match of source.matchAll(pattern)) {
    html += escape(source.slice(offset, match.index));
    const value = match[0];
    let token;
    if (/^(?:\/\/|\/\*|#)/.test(value)) token = 'comment';
    else if (/^["'`]/.test(value)) token = /^\s*:/.test(source.slice(match.index + value.length)) ? 'property' : 'string';
    else if (/^\d/.test(value)) token = 'number';
    else if (/^\$/.test(value)) token = 'variable';
    else if (/^-/.test(value)) token = 'option';
    else if (keywords.has(value)) token = 'keyword';
    else if (commands.has(value)) token = 'command';
    else if (/^\s*\(/.test(source.slice(match.index + value.length))) token = 'function';
    html += token ? `<span class="token token-${token}">${escape(value)}</span>` : escape(value);
    offset = match.index + value.length;
  }
  return html + escape(source.slice(offset));
}
