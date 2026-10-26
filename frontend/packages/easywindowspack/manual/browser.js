export function mountManual({ scope = document, root = document.documentElement, scroller = window, initialUrl, embedded = false } = {}) {
  const all = selector => [...scope.querySelectorAll(selector)];
  const query = selector => scope.querySelector(selector);
  const byId = id => query('[id="' + CSS.escape(id) + '"]');
  const listeners = new AbortController();
  const on = (target, type, action, options = {}) => target.addEventListener(type, action, { ...options, signal: listeners.signal });
  let currentUrl = new URL(initialUrl || location.href);
  const height = () => embedded ? scroller.clientHeight : innerHeight;
  const scrollTop = () => embedded ? scroller.scrollTop : scrollY;
  const scrollHeight = () => embedded ? scroller.scrollHeight : document.documentElement.scrollHeight;
  const topOffset = () => embedded ? scroller.getBoundingClientRect().top : 0;
  const languageNodes = all('[data-language]');
  const menuButton = query('[data-menu]');
  const sidebar = query('#manual-sidebar');
  const scrim = query('[data-menu-close]');
  const mobile = matchMedia('(max-width: 720px)');
  const dialog = query('#manual-search');
  const searchInput = query('#manual-query');
  const results = query('#search-results');
  const status = query('#search-status');
  const announce = query('#manual-announcement');
  const themes = ['system', 'light', 'dark'];
  const words = {
    'zh-CN': {
      skip: '跳到正文', manual: '使用手册', search: '搜索文档', searchTitle: '搜索文档',
      close: '关闭', queryLabel: '输入关键词', aiFiles: 'AI / 原始文件',
      searchHint: '搜索当前语言全文；使用 Tab 选择结果，Esc 关闭。',
      placeholder: '搜索命令、模块或 API…', menuOpen: '打开文档导航', menuClose: '关闭文档导航',
      navigation: '文档导航', toc: '本页目录', copy: '复制', copyLabel: '复制代码', copied: '已复制',
      copyFailed: '请选中复制', copiedNotice: '代码已复制到剪贴板。',
      copyFailedNotice: '无法访问剪贴板，请直接选中代码并复制。',
      searchStart: '输入关键词，或从以下常用章节开始。',
      noResults: '没有匹配结果。试试更短的关键词、命令名或 API 名称。',
      resultCount: (count, shown) => `找到 ${count} 个章节${shown < count ? `，显示前 ${shown} 个` : ''}。`,
      theme: '主题', system: '跟随系统', light: '浅色', dark: '深色', next: '切换为',
      title: 'Easy Windows Pack 使用手册'
    },
    en: {
      skip: 'Skip to content', manual: 'Developer manual', search: 'Search docs', searchTitle: 'Search documentation',
      close: 'Close', queryLabel: 'Search terms', aiFiles: 'AI / Raw files',
      searchHint: 'Search all content in this language. Tab through results; Esc to close.',
      placeholder: 'Search commands, modules or APIs…', menuOpen: 'Open documentation navigation', menuClose: 'Close documentation navigation',
      navigation: 'Documentation navigation', toc: 'On this page', copy: 'Copy', copyLabel: 'Copy code', copied: 'Copied',
      copyFailed: 'Select to copy', copiedNotice: 'Code copied to clipboard.',
      copyFailedNotice: 'Clipboard is unavailable. Select the code and copy it manually.',
      searchStart: 'Enter search terms, or start with a popular section below.',
      noResults: 'No results. Try a shorter keyword, command, or API name.',
      resultCount: (count, shown) => `${count} matching section${count === 1 ? '' : 's'}${shown < count ? `; showing the first ${shown}` : ''}.`,
      theme: 'Theme', system: 'System', light: 'Light', dark: 'Dark', next: 'Switch to',
      title: 'Easy Windows Pack Manual'
    }
  };
  let language = 'zh-CN';
  let page = 'overview';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let theme = 'system';
  let searchOpener;
  let scrollFrame = 0;
  const fold = value => value.normalize('NFKC').toLowerCase();
  const index = all('article[data-language] .doc-section').map(section => {
    const title = section.querySelector('h2').textContent.replace(/#$/, '').trim();
    const summary = section.querySelector('.section-summary').textContent;
    const text = section.textContent.replace(/\s+/g, ' ').trim();
    return { id: section.id, language: section.closest('article').lang, title, summary, text, normalized: fold(text), titleText: fold(title) };
  });

  function setMenu(open, restoreFocus = false) {
    const expanded = Boolean(open && mobile.matches);
    root.classList.toggle('menu-open', expanded);
    menuButton.setAttribute('aria-expanded', String(expanded));
    menuButton.setAttribute('aria-label', words[language][expanded ? 'menuClose' : 'menuOpen']);
    sidebar.inert = mobile.matches && !expanded;
    scrim.hidden = !expanded;
    scrim.setAttribute('aria-label', words[language].menuClose);
    if (expanded) sidebar.querySelector('[data-language]:not([hidden]) a')?.focus();
    else if (restoreFocus) menuButton.focus();
  }

  function applyTheme() {
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
    const text = words[language];
    const next = themes[(themes.indexOf(theme) + 1) % themes.length];
    query('[data-theme-label]').textContent = text[theme];
    for (const glyph of all('[data-theme-glyph]')) glyph.hidden = glyph.dataset.themeGlyph !== theme;
    query('[data-theme-toggle]').setAttribute('aria-label', `${text.theme}: ${text[theme]}. ${text.next} ${text[next]}`);
    query('[data-theme-toggle]').title = `${text.theme}: ${text[theme]}`;
  }

  function updateLocation() {
    scrollFrame = 0;
    const toc = query('[data-language="' + language + '"] [data-page-toc="' + page + '"]');
    const links = toc ? [...toc.querySelectorAll('[data-toc-link]')] : [];
    let current = links[0]?.dataset.tocLink;
    const threshold = Number.parseFloat(getComputedStyle(root).getPropertyValue('--header-height')) + 100;
    const atBottom = scrollTop() + height() >= scrollHeight() - 3;
    for (const link of links) {
      const heading = byId(link.dataset.tocLink);
      if (heading) {
        const top = heading.getBoundingClientRect().top - topOffset();
        if (top <= threshold || (atBottom && top < height())) current = heading.id;
      }
    }
    for (const link of all('[data-section-link]')) {
      if (link.dataset.sectionLink === language + '-' + page) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
    for (const link of all('[data-toc-link]')) {
      if (!link.closest('[data-page-toc]').hidden && link.dataset.tocLink === current) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  }

  function navigateTo(id, { historyMode = 'push', smooth = true, focus = true } = {}) {
    let target = byId(id);
    if (!target?.closest('[data-page]')) target = byId(language + '-overview');
    const owner = target.closest('article');
    if (owner.lang !== language) setLanguage(owner.lang);
    page = target.closest('[data-page]').dataset.page;
    for (const node of all('[data-page]')) node.hidden = node.dataset.page !== page || node.closest('article').lang !== language;
    for (const node of all('[data-page-toc]')) node.hidden = node.dataset.pageToc !== page;
    const visiblePages = all('article[lang="' + language + '"] [data-page]');
    const position = visiblePages.findIndex(node => node.dataset.page === page);
    const pagination = query('article[lang="' + language + '"] [data-pagination]');
    pagination.hidden = false;
    for (const [selector, offset, label] of [
      ['[data-previous]', -1, language === 'en' ? 'Previous page' : '上一页'],
      ['[data-next]', 1, language === 'en' ? 'Next page' : '下一页']
    ]) {
      const link = pagination.querySelector(selector);
      const destination = visiblePages[position + offset];
      link.hidden = !destination;
      if (destination) {
        link.href = '#' + language + '-' + destination.dataset.page;
        const caption = document.createElement('small');
        caption.textContent = label;
        link.replaceChildren(caption, document.createTextNode(destination.dataset.pageTitle));
      }
    }
    const url = new URL(currentUrl);
    url.searchParams.set('lang', language);
    url.hash = target.id;
    currentUrl = url;
    if (!embedded && historyMode !== 'none') {
      try { history[historyMode === 'replace' ? 'replaceState' : 'pushState'](null, '', url); }
      catch { if (location.hash !== url.hash) location.hash = url.hash; }
    }
    const heading = target.matches('section') ? target.querySelector('h2') : target;
    if (focus) heading?.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'start', behavior: smooth && !reducedMotion.matches ? 'smooth' : 'instant' });
    const title = target.closest('[data-page]').dataset.pageTitle;
    if (!embedded) document.title = title + ' · Easy Windows Pack';
    announce.textContent = title;
    updateLocation();
  }

  function queueLocation() {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(updateLocation);
  }

  function setLanguage(next, updateUrl = false) {
    language = next === 'en' ? 'en' : 'zh-CN';
    const text = words[language];
    root.lang = language;
    if (!embedded) document.title = text.title;
    for (const node of languageNodes) node.hidden = node.dataset.language !== language;
    for (const link of all('[data-switch-language]')) {
      if (link.dataset.switchLanguage === language) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
    for (const node of all('[data-ui]')) {
      if (text[node.dataset.ui]) node.textContent = text[node.dataset.ui];
    }
    for (const button of all('[data-copy]')) {
      button.textContent = text.copy;
      button.setAttribute('aria-label', text.copyLabel);
    }
    query('[data-home]').href = `#${language}-overview`;
    sidebar.setAttribute('aria-label', text.navigation);
    query('.toc').setAttribute('aria-label', text.toc);
    searchInput.placeholder = text.placeholder;
    setMenu(false);
    applyTheme();
    if (updateUrl) {
      const suffix = currentUrl.hash.replace(/^#(?:zh-CN|en)-/, '') || 'overview';
      const id = byId(language + '-' + suffix) ? language + '-' + suffix : language + '-overview';
      navigateTo(id, { historyMode: 'push' });
    }
    if (dialog.open) renderSearch();
    queueLocation();
  }

  function markedText(element, text, terms) {
    if (!terms.length) { element.textContent = text; return; }
    const normalized = fold(text);
    const positions = terms.map(term => normalized.indexOf(term)).filter(position => position >= 0);
    const start = positions.length ? Math.min(...positions) : -1;
    if (start < 0) { element.textContent = text; return; }
    const term = terms.find(value => normalized.indexOf(value) === start);
    element.append(document.createTextNode(text.slice(0, start)));
    const mark = document.createElement('mark');
    mark.textContent = text.slice(start, start + term.length);
    element.append(mark, document.createTextNode(text.slice(start + term.length)));
  }

  function renderSearch() {
    const terms = [...new Set(fold(searchInput.value.trim()).split(/\s+/).filter(Boolean))];
    const current = index.filter(item => item.language === language);
    const matches = terms.length ? current.filter(item => terms.every(term => item.normalized.includes(term)))
      .map(item => ({ ...item, score: terms.reduce((score, term) => score + (item.titleText.includes(term) ? 10 : 1), 0) }))
      .sort((a, b) => b.score - a.score)
      : current.filter(item => ['quick-start', 'window-frame', 'packaging', 'troubleshooting'].some(id => item.id === `${language}-${id}`));
    const shown = matches.slice(0, 15);
    const fragment = document.createDocumentFragment();
    for (const item of shown) {
      const li = document.createElement('li');
      const link = document.createElement('a');
      link.href = `#${item.id}`;
      const title = document.createElement('span');
      title.className = 'search-result-title';
      markedText(title, item.title, terms);
      const excerpt = document.createElement('span');
      excerpt.className = 'search-result-excerpt';
      const offset = terms.length ? item.normalized.indexOf(terms[0]) : -1;
      const start = Math.max(0, offset - 45);
      const snippet = terms.length ? `${start ? '…' : ''}${item.text.slice(start, start + 180)}${item.text.length > start + 180 ? '…' : ''}` : item.summary;
      markedText(excerpt, snippet, terms);
      link.append(title, excerpt);
      li.append(link);
      fragment.append(li);
    }
    results.replaceChildren(fragment);
    status.textContent = !terms.length ? words[language].searchStart : matches.length ? words[language].resultCount(matches.length, shown.length) : words[language].noResults;
  }

  function openSearch(opener) {
    setMenu(false);
    searchOpener = opener || document.activeElement;
    renderSearch();
    if (!dialog.open) dialog.showModal();
    searchInput.focus();
    searchInput.select();
  }
  function closeSearch(restoreFocus = true) {
    if (!dialog.open) return;
    dialog.close();
    if (restoreFocus && searchOpener?.isConnected) searchOpener.focus({ preventScroll: true });
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
    } catch { /* file:// and embedded viewers may deny clipboard access. */ }
    const previous = document.activeElement;
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('aria-label', words[language].copyLabel);
    textarea.style.cssText = 'position:fixed;left:-9999px;top:0;';
    (embedded ? scroller : document.body).append(textarea);
    try { textarea.select(); return document.execCommand('copy'); }
    catch { return false; }
    finally { textarea.remove(); previous?.focus({ preventScroll: true }); }
  }

  try {
    const saved = localStorage.getItem('ewp-manual-theme');
    if (themes.includes(saved)) theme = saved;
  } catch { /* Persistence is optional, including on file://. */ }
  const url = new URL(currentUrl);
  const initial = url.searchParams.get('lang');
  setLanguage(initial === 'en' || (!initial && currentUrl.hash.startsWith('#en-')) ? 'en' : 'zh-CN');

  menuButton.hidden = false;
  query('[data-theme-toggle]').hidden = false;
  all('[data-copy]').forEach(button => { button.hidden = false; });
  if (typeof dialog.showModal === 'function') query('[data-search-open]').hidden = false;
  query('[data-shortcut]').textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K';
  root.classList.add('enhanced');
  navigateTo(currentUrl.hash.slice(1) || language + '-overview', { historyMode: 'replace', smooth: false, focus: false });

  on(menuButton, 'click', () => setMenu(menuButton.getAttribute('aria-expanded') !== 'true'));
  on(scrim, 'click', () => setMenu(false, true));
  on(mobile, 'change', () => { setMenu(false); queueLocation(); });
  on(query('[data-theme-toggle]'), 'click', () => {
    theme = themes[(themes.indexOf(theme) + 1) % themes.length];
    applyTheme();
    try { localStorage.setItem('ewp-manual-theme', theme); } catch { /* Keep the in-memory preference. */ }
  });
  for (const link of all('[data-switch-language]')) {
    on(link, 'click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      setLanguage(link.dataset.switchLanguage, true);
    });
  }
  on(query('[data-search-open]'), 'click', event => openSearch(event.currentTarget));
  on(query('[data-search-close]'), 'click', () => closeSearch());
  on(dialog, 'cancel', event => { event.preventDefault(); closeSearch(); });
  on(dialog, 'click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeSearch();
  });
  on(searchInput, 'input', renderSearch);
  on(dialog, 'keydown', event => {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    const links = [...results.querySelectorAll('a')];
    if (!links.length) return;
    event.preventDefault();
    const current = links.indexOf(document.activeElement);
    const next = event.key === 'ArrowDown' ? (current + 1) % links.length : current <= 0 ? links.length - 1 : current - 1;
    links[next].focus();
  });
  on(scope, 'keydown', event => {
    const typing = event.target instanceof Element && Boolean(event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'));
    const shortcut = (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k';
    if (typeof dialog.showModal === 'function' && (shortcut || (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey && !event.altKey))) {
      event.preventDefault();
      openSearch();
    } else if (event.key === 'Escape' && root.classList.contains('menu-open')) {
      event.preventDefault();
      setMenu(false, true);
    }
  });
  on(scope, 'click', async event => {
    const copy = event.target.closest('[data-copy]');
    if (copy) {
      const copied = await copyText(copy.closest('.code-block').querySelector('pre code').textContent);
      copy.textContent = copied ? words[language].copied : words[language].copyFailed;
      announce.textContent = copied ? words[language].copiedNotice : words[language].copyFailedNotice;
      setTimeout(() => { copy.textContent = words[language].copy; }, 1800);
      return;
    }
    const link = event.target.closest('a[href^="#"]');
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const target = byId(link.getAttribute('href').slice(1));
    if (!target) return;
    if (!target.closest('[data-page]')) return;
    event.preventDefault();
    if (dialog.contains(link)) closeSearch(false);
    setMenu(false);
    navigateTo(target.id);
  });
  if (!embedded) {
    on(window, 'hashchange', () => {
      currentUrl = new URL(location.href);
      const next = /^#(zh-CN|en)-/.exec(currentUrl.hash)?.[1];
      if (next && next !== language) setLanguage(next);
      navigateTo(currentUrl.hash.slice(1), { historyMode: 'none', smooth: false });
    });
    on(window, 'popstate', () => {
      currentUrl = new URL(location.href);
      setLanguage(currentUrl.searchParams.get('lang') === 'en' ? 'en' : 'zh-CN');
      navigateTo(currentUrl.hash.slice(1), { historyMode: 'none', smooth: false });
    });
  }
  on(scroller, 'scroll', queueLocation, { passive: true });
  on(window, 'resize', queueLocation, { passive: true });
  return () => { listeners.abort(); if (scrollFrame) cancelAnimationFrame(scrollFrame); root.classList.remove('enhanced', 'menu-open'); };
}
