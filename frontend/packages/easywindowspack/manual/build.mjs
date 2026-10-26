import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createGuide } from './content.mjs';
import { highlightCode } from './highlight.mjs';
import { structureGuide } from './sections.mjs';

export const DEFAULT_CAPABILITIES = Object.freeze({
  python: Object.freeze({ name: 'Python', modes: Object.freeze(['onefile', 'onedir']), wheel: true, installer: 'pyinstaller', advancedInstaller: true }),
  golang: Object.freeze({ name: 'Go', modes: Object.freeze(['onedir']), wheel: false, installer: 'nsis', advancedInstaller: false }),
  rust: Object.freeze({ name: 'Rust', modes: Object.freeze(['onedir']), wheel: false, installer: 'nsis', advancedInstaller: false }),
  cpp: Object.freeze({ name: 'C++', modes: Object.freeze(['onedir']), wheel: false, installer: 'nsis', advancedInstaller: false })
});

const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

function normalizeCapabilities(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('capabilities must be an object keyed by python/golang/rust/cpp.');
  return Object.fromEntries(Object.keys(DEFAULT_CAPABILITIES).map(key => {
    const item = input[key];
    if (!item || typeof item.name !== 'string' || !item.name.trim()
      || !Array.isArray(item.modes) || !item.modes.length
      || item.modes.some(mode => !['onefile', 'onedir'].includes(mode))
      || new Set(item.modes).size !== item.modes.length
      || typeof item.wheel !== 'boolean' || typeof item.advancedInstaller !== 'boolean'
      || !['pyinstaller', 'nsis'].includes(item.installer)) {
      throw new TypeError(`Invalid capabilities for ${key}. Expected name, modes, wheel, installer, advancedInstaller.`);
    }
    return [key, { name: item.name, modes: [...item.modes], wheel: item.wheel, installer: item.installer, advancedInstaller: item.advancedInstaller }];
  }));
}

function inline(text) {
  const tokens = /`([^`]+)`|\[([^\]\n]+)\]\(([^)\s]+)\)/g;
  let result = '', offset = 0;
  for (const match of text.matchAll(tokens)) {
    result += escape(text.slice(offset, match.index));
    if (match[1] !== undefined) result += `<code>${escape(match[1])}</code>`;
    else {
      const href = match[3];
      if (!/^(?:#[a-zA-Z0-9-]+|https:\/\/[^\s]+|guide(?:\.en)?\.md|capabilities\.json)$/.test(href)) throw new Error(`Unsafe manual link: ${href}`);
      result += `<a href="${escape(href)}"${href.startsWith('https:') ? ' target="_blank" rel="noopener noreferrer"' : ''}>${escape(match[2])}</a>`;
    }
    offset = match.index + match[0].length;
  }
  return result + escape(text.slice(offset));
}

const idFor = (guide, section, suffix = '') => `${guide.language}-${section.id}${suffix ? `-${suffix}` : ''}`;
const permalink = (id, title, english) => `<a class="permalink" href="#${id}" aria-label="${escape(`${english ? 'Link to' : '链接到'} ${title}`)}">#</a>`;

function renderBlock(block, section, guide) {
  const english = guide.language === 'en';
  switch (block.type) {
    case 'paragraph': return `<p>${inline(block.text)}</p>`;
    case 'heading': {
      const id = idFor(guide, section, block.id);
      return `<h3 id="${id}" tabindex="-1">${escape(block.text)}${permalink(id, block.text, english)}</h3>`;
    }
    case 'list': return `<ul>${block.items.map(item => `<li>${inline(item)}</li>`).join('')}</ul>`;
    case 'note': return `<aside class="callout" aria-label="${escape(block.title)}"><p class="callout-title">${escape(block.title)}</p><p>${inline(block.text)}</p></aside>`;
    case 'code': return `<figure class="code-block"><figcaption><span>${escape(block.language)}</span><button type="button" class="copy-button" data-copy hidden aria-label="${english ? 'Copy code' : '复制代码'}">${english ? 'Copy' : '复制'}</button></figcaption><pre tabindex="0"><code class="language-${escape(block.language)}">${highlightCode(block.text, block.language)}</code></pre></figure>`;
    case 'table': return `<div class="table-scroll" role="region" aria-label="${escape(section.title)}" tabindex="0"><table><caption class="sr-only">${escape(section.title)} — ${english ? 'reference' : '参考表'}</caption><thead><tr>${block.headers.map(value => `<th scope="col">${inline(value)}</th>`).join('')}</tr></thead><tbody>${block.rows.map(row => `<tr>${row.map(value => `<td>${inline(String(value))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    default: throw new Error(`Unknown manual block: ${block.type}`);
  }
}

function renderNavigation(guide) {
  return `<div data-language="${guide.language}" lang="${guide.language}">${guide.groups.map(([title, ids]) => `<div class="nav-group"><p class="nav-heading">${escape(title)}</p><ul>${ids.map(id => {
    const item = guide.sections.find(section => section.id === id);
    if (!item) throw new Error(`Unknown navigation section: ${id}`);
    return `<li><a data-section-link="${guide.language}-${id}" href="#${guide.language}-${id}">${escape(item.title)}</a></li>`;
  }).join('')}</ul></div>`).join('')}</div>`;
}

function renderArticle(guide, version, brand) {
  const english = guide.language === 'en';
  return `<article data-language="${guide.language}" lang="${guide.language}" aria-labelledby="${guide.language}-overview">
<header class="article-hero" data-page="overview" data-page-title="${escape(guide.title)}">
  <div class="overview-logo" aria-hidden="true">${brand}</div>
  <p class="eyebrow">${english ? 'DEVELOPER MANUAL · OFFLINE EDITION' : '开发者手册 · 离线版'}</p>
  <h1 id="${guide.language}-overview" tabindex="-1">${escape(guide.title)}</h1>
  <p class="hero-tagline">${escape(guide.tagline)}</p>
  <p class="hero-introduction">${escape(guide.introduction)}</p>
  <div class="hero-links"><a class="primary-link" href="#${guide.language}-quick-start">${english ? 'Start building' : '开始构建'} <span aria-hidden="true">→</span></a><a href="#${guide.language}-bridge">${english ? 'API reference' : 'API 参考'}</a><a href="guide${english ? '.en' : ''}.md">${english ? 'Read Markdown' : '读取 Markdown'}</a></div>
  <p class="edition">${english ? 'Framework version' : '框架版本'} <code>${escape(version)}</code> <span aria-hidden="true">·</span> ${english ? 'Local assets. No server required.' : '本机资源，无需服务器。'}</p>
<div class="overview-modules"><h2 id="${guide.language}-overview-modules" tabindex="-1">${english ? 'Explore the modules' : '模块指南'}</h2><div class="module-grid">${guide.sections.map(section => `<a class="module-link" href="#${idFor(guide, section)}"><strong>${escape(section.title)}</strong><span>${escape(section.summary)}</span></a>`).join('')}</div></div>
</header>
${guide.sections.map(section => `<section class="doc-section" id="${idFor(guide, section)}" data-section="${section.id}" data-page="${section.id}" data-page-title="${escape(section.title)}" aria-labelledby="${idFor(guide, section)}-heading">
  <h2 id="${idFor(guide, section)}-heading" tabindex="-1">${escape(section.title)}${permalink(idFor(guide, section), section.title, english)}</h2>
  <p class="section-summary">${escape(section.summary)}</p>
  ${section.blocks.map(block => renderBlock(block, section, guide)).join('\n')}
</section>`).join('\n')}
<nav class="doc-pagination" data-pagination hidden aria-label="${english ? 'Previous and next page' : '上一页和下一页'}"><a data-previous></a><a data-next></a></nav>
<footer class="article-footer"><p>${english ? 'Built to be read, even without JavaScript.' : '无 JavaScript，也能完整阅读。'}</p><a href="#${guide.language}-overview">${english ? 'Back to top ↑' : '返回顶部 ↑'}</a></footer>
</article>`;
}

function renderToc(guide) {
  const en = guide.language === 'en';
  const title = en ? 'On this page' : '本页目录';
  const links = (items) => '<ol>' + items.map(([id, text]) => '<li><a href="#' + id + '" data-toc-link="' + id + '">' + escape(text) + '</a></li>').join('') + '</ol>';
  const overview = '<div data-page-toc="overview">' + links([[guide.language + '-overview', en ? 'Overview' : '概览'], [guide.language + '-overview-modules', en ? 'Modules' : '模块指南']]) + '</div>';
  const sections = guide.sections.map(section => '<div data-page-toc="' + section.id + '">' + links([[idFor(guide, section) + '-heading', section.title], ...section.blocks.filter(block => block.type === 'heading').map(block => [idFor(guide, section, block.id), block.text])]) + '</div>').join('');
  return '<nav data-language="' + guide.language + '" lang="' + guide.language + '" aria-label="' + title + '"><p class="toc-title">' + title + '</p>' + overview + sections + '</nav>';
}

function renderHtml(guides, version, css, script, brand, favicon) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="description" content="Easy Windows Pack 离线使用手册 / Offline developer manual: creation, runtime APIs, desktop modules, packaging and troubleshooting.">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'">
  <title>Easy Windows Pack 使用手册</title>
  <link rel="icon" type="image/svg+xml" href="${favicon}">
  <style>${css}</style>
</head>
<body>
  <a class="skip-link" href="#manual-content" data-ui="skip">跳到正文 / Skip to content</a>
  <header class="site-header">
    <div class="header-inner">
      <button type="button" class="menu-toggle" data-menu hidden aria-controls="manual-sidebar" aria-expanded="false" aria-label="打开导航"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>
      <a class="brand" href="#zh-CN-overview" data-home><span class="brand-mark" aria-hidden="true">${brand}</span><span><span class="brand-full">Easy Windows Pack</span><span class="brand-short">EWP</span><span class="brand-subtitle" data-ui="manual">使用手册</span></span></a>
      <span class="version-label">v${escape(version)}</span>
      <div class="header-actions">
        <button type="button" class="search-trigger" data-search-open hidden aria-haspopup="dialog"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg><span data-ui="search">搜索文档</span><kbd data-shortcut>Ctrl K</kbd></button>
        <nav class="language-switch" aria-label="语言 / Language"><a href="?lang=zh-CN#zh-CN-overview" lang="zh-CN" hreflang="zh-CN" data-switch-language="zh-CN" aria-current="true">中文</a><a href="?lang=en#en-overview" lang="en" hreflang="en" data-switch-language="en">EN</a></nav>
        <button type="button" class="theme-toggle" data-theme-toggle hidden aria-label="切换主题"><span aria-hidden="true" data-theme-icon><svg data-theme-glyph="system" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/></svg><svg data-theme-glyph="dark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" hidden><path d="M20 14a8.4 8.4 0 0 1-10-10 8.5 8.5 0 1 0 10 10Z"/></svg><svg data-theme-glyph="light" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" hidden><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/></svg></span><span data-theme-label>跟随系统</span></button>
      </div>
    </div>
  </header>
  <div class="site-layout">
    <nav class="sidebar" id="manual-sidebar" aria-label="文档导航">
      ${guides.map(renderNavigation).join('\n')}
      <div class="sidebar-downloads"><p class="nav-heading" data-ui="aiFiles">AI / 原始文件</p><a href="guide.md" lang="zh-CN">guide.md <span>中文</span></a><a href="guide.en.md" lang="en">guide.en.md <span>English</span></a><a href="capabilities.json">capabilities.json <span>JSON</span></a></div>
    </nav>
    <button class="sidebar-scrim" type="button" hidden data-menu-close tabindex="-1" aria-label="关闭导航"></button>
    <div class="document-layout">
      <main id="manual-content" tabindex="-1">
        <noscript><p class="no-script">JavaScript 已关闭：两种语言全文均在下方，可用浏览器查找。 / JavaScript is off: both complete languages follow; use browser Find.</p></noscript>
        ${guides.map(guide => renderArticle(guide, version, brand)).join('\n')}
      </main>
      <aside class="toc" aria-label="本页目录">
        ${guides.map(renderToc).join('\n')}
      </aside>
    </div>
  </div>
  <dialog id="manual-search" aria-labelledby="search-title">
    <div class="search-top"><h2 id="search-title" data-ui="searchTitle">搜索文档</h2><button type="button" data-search-close data-ui="close">关闭</button></div>
    <label class="sr-only" for="manual-query" data-ui="queryLabel">输入关键词</label>
    <input id="manual-query" type="search" autocomplete="off" placeholder="搜索命令、模块或 API…" aria-describedby="search-hint search-status">
    <p id="search-hint" class="search-hint" data-ui="searchHint">搜索当前语言全文；使用 Tab 选择结果，Esc 关闭。</p>
    <p id="search-status" role="status" aria-live="polite"></p>
    <ul id="search-results" class="search-results"></ul>
  </dialog>
  <p class="sr-only" id="manual-announcement" role="status" aria-live="polite"></p>
  <script>${script.replace(/<\/script/gi, '<\\/script')}</script>
</body>
</html>
`;
}

function renderMarkdown(guide, version) {
  const row = cells => `| ${cells.map(value => String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ')} |`;
  const output = [
    `# ${guide.title}`, '', `${guide.language === 'en' ? 'Framework version' : '框架版本'}: ${version}`, '',
    guide.tagline, '', guide.introduction, '',
    '[中文 Markdown](guide.md) · [English Markdown](guide.en.md) · [capabilities.json](capabilities.json)', '',
    `## ${guide.language === 'en' ? 'Contents' : '目录'}`, '',
    ...guide.sections.map(section => `- [${section.title}](#${idFor(guide, section)})`), ''
  ];
  for (const section of guide.sections) {
    output.push(`<a id="${idFor(guide, section)}"></a>`, '', `## ${section.title}`, '', section.summary, '');
    for (const block of section.blocks) {
      switch (block.type) {
        case 'paragraph': output.push(block.text, ''); break;
        case 'heading': output.push(`<a id="${idFor(guide, section, block.id)}"></a>`, '', `### ${block.text}`, ''); break;
        case 'code': output.push(`\`\`\`${block.language}`, block.text, '\`\`\`', ''); break;
        case 'list': output.push(...block.items.map(item => `- ${item}`), ''); break;
        case 'note': output.push(`> **${block.title}**`, `> ${block.text}`, ''); break;
        case 'table': output.push(row(block.headers), row(block.headers.map(() => '---')), ...block.rows.map(row), ''); break;
        default: throw new Error(`Unknown manual block: ${block.type}`);
      }
    }
  }
  return output.join('\n');
}

/** Generate the complete offline manual without importing the CLI or loading runtime assets. */
export async function prepareManual(outputDirectory, { version = 'development', capabilities = DEFAULT_CAPABILITIES } = {}) {
  if (typeof outputDirectory !== 'string' || !outputDirectory.trim()) throw new TypeError('outputDirectory must be a non-empty directory path.');
  if (typeof version !== 'string' || !version.trim() || /[\r\n]/.test(version)) throw new TypeError('version must be a non-empty single-line string.');
  const sharedCapabilities = normalizeCapabilities(capabilities);
  const guides = ['zh-CN', 'en'].map(language => structureGuide(createGuide(language, sharedCapabilities)));
  const [css, script, demo, colorSvg] = await Promise.all([
    readFile(new URL('./manual.css', import.meta.url), 'utf8'),
    readFile(new URL('./browser.js', import.meta.url), 'utf8'),
    readFile(new URL('../../../src/demo.css', import.meta.url), 'utf8'),
    readFile(new URL('../../../src/assets/ewp-color.svg', import.meta.url), 'utf8')
  ]);
  const declarations = pattern => {
    const block = pattern.exec(demo)?.[1];
    if (!block) throw new Error('Demo theme declarations are missing');
    return block.split('\n').filter(line => /^\s*--welcome-/.test(line)).join('\n');
  };
  const light = declarations(/:root\s*\{([\s\S]*?)\}/);
  const dark = declarations(/:root\[data-welcome-theme="dark"\]\s*\{([\s\S]*?)\}/);
  const palette = ':root {' + light + '}\n:root[data-theme="dark"] {' + dark + '}\n@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {' + dark + '} }\n';
  const colorUri = 'data:image/svg+xml;base64,' + Buffer.from(colorSvg).toString('base64');
  const brand = '<img class="brand-light" src="' + colorUri + '" alt=""><img class="brand-dark" src="' + colorUri + '" alt="">';
  const directory = resolve(outputDirectory);
  const stylesheet = palette + css.replace(/^\uFEFF/, '');
  const browserScript = script.replace('export function mountManual', 'function mountManual') + '\nmountManual();';
  const html = renderHtml(guides, version, stylesheet, browserScript, brand, colorUri);
  const markdown = renderMarkdown(guides[0], version);
  const englishMarkdown = renderMarkdown(guides[1], version);
  const capabilitiesJson = JSON.stringify(sharedCapabilities, null, 2) + '\n';
  const body = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>')).replace(/<script>[\s\S]*?<\/script>/g, '');
  const entries = {
    'index.html': html,
    'guide.md': markdown,
    'guide.en.md': englishMarkdown,
    'capabilities.json': capabilitiesJson,
    'session.mjs': script,
    'panel.mjs': `export default ${JSON.stringify({ body, css: stylesheet, files: { 'guide.md': markdown, 'guide.en.md': englishMarkdown, 'capabilities.json': capabilitiesJson } })};\n`
  };
  await mkdir(directory, { recursive: true });
  await Promise.all(Object.entries(entries).map(([name, contents]) => writeFile(join(directory, name), contents, 'utf8')));
  return { outputDirectory: directory, files: Object.keys(entries).map(name => join(directory, name)) };
}
