const views = new WeakMap();

function panelStyles(css) {
  return css.replace(/:root:not\(([^)]+)\)/g, ':host(:not($1))')
    .replace(/:root(\[[^\]]+\])?/g, (_, condition) => condition ? `:host(${condition})` : ':host')
    .replace(/\.enhanced(\.menu-open)?(?![\w-])/g, (_, open) => open ? ':host(.enhanced.menu-open)' : ':host(.enhanced)')
    .replace(/\bhtml\s*\{/g, ':host {')
    .replace(/\bbody\s*\{/g, '.manual-body {') + `
:host { display: block; width: 100%; height: 100%; }
.manual-body { height: 100%; overflow: auto; scroll-padding-top: calc(var(--header-height) + 28px); overscroll-behavior: contain; }
.back-to-app { flex-shrink: 0; display: grid; place-items: center; border: 1px solid var(--line); width: 32px; height: 32px; background: var(--raised); color: var(--text); font-size: 18px; }
.raw-document { width: min(900px, calc(100% - 32px)); height: min(720px, 85dvh); padding: 18px; border: 1px solid var(--line); border-radius: 0; background: var(--page); color: var(--text); }
.raw-document[open] { display: flex; flex-direction: column; gap: 14px; }
.raw-document form { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
.raw-document textarea { flex: 1; min-height: 0; width: 100%; resize: none; background: var(--panel); color: var(--text); border: 1px solid var(--line); border-radius: 0; font: 12px/1.7 Consolas, monospace; padding: 14px; }
@media(max-width:720px) { .header-inner { padding-inline: 12px; gap: 7px; } .brand-full { display: none; } .brand-short { display: inline; } }
`;
}

/** Read the installed package's manual inside the app, without navigation or a host bridge. */
export async function openDocs({ language = document.documentElement.lang || 'zh-CN' } = {}) {
  const owner = document;
  if (views.has(owner)) { views.get(owner).dialog.focus(); return views.get(owner).handle; }
  const english = language === 'en';
  const previous = owner.activeElement;
  const dialog = owner.createElement('dialog');
  dialog.setAttribute('aria-label', english ? 'Easy Windows Pack documentation' : 'Easy Windows Pack 文档');
  dialog.style.cssText = 'position:fixed;inset:0;width:100%;max-width:none;height:100%;max-height:none;margin:0;padding:0;border:0;border-radius:0;overflow:hidden;background:transparent;';
  const host = owner.createElement('div');
  host.style.cssText = 'height:100%;width:100%;';
  const scope = host.attachShadow({ mode: 'open' });
  const loading = owner.createElement('p');
  loading.setAttribute('role', 'status');
  loading.textContent = english ? 'Loading documentation…' : '正在打开文档…';
  loading.style.cssText = 'padding:24px;margin:0;background:#f7f7ff;color:#282d3d;';
  const closeLoading = owner.createElement('button');
  closeLoading.type = 'button';
  closeLoading.textContent = english ? 'Back to app' : '返回应用';
  closeLoading.onclick = () => close();
  scope.append(loading, closeLoading);
  dialog.append(host);
  const events = new AbortController();
  let dispose;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    events.abort();
    dispose?.();
    dialog.close();
    dialog.remove();
    views.delete(owner);
    if (previous?.isConnected) previous.focus({ preventScroll: true });
  };
  const handle = { close };
  views.set(owner, { dialog, handle });
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); }, { signal: events.signal });
  owner.body.append(dialog);
  dialog.showModal();
  try {
    const [{ default: manual }, { mountManual }] = await Promise.all([
      import('./assets/docs/panel.mjs'), import('./assets/docs/session.mjs')
    ]);
    if (closed) return handle;
    const style = owner.createElement('style');
    style.textContent = panelStyles(manual.css);
    const body = owner.createElement('div');
    body.className = 'manual-body';
    body.innerHTML = manual.body;
    // Generated body content is static; standalone scripts are never evaluated here.
    body.querySelectorAll('script, base, meta').forEach(node => node.remove());
    const back = owner.createElement('button');
    back.type = 'button';
    back.className = 'back-to-app';
    back.textContent = '←';
    back.title = english ? 'Back to app' : '返回应用';
    back.setAttribute('aria-label', back.title);
    back.addEventListener('click', close, { signal: events.signal });
    body.querySelector('.header-inner').prepend(back);
    scope.replaceChildren(style, body);
    dispose = mountManual({ scope, root: host, scroller: body, embedded: true,
      initialUrl: `https://ewp.local/index.html?lang=${english ? 'en' : 'zh-CN'}` });
    scope.addEventListener('click', event => {
      const link = event.target.closest('a');
      const file = link?.getAttribute('href');
      if (!file || !Object.hasOwn(manual.files, file)) return;
      event.preventDefault();
      const raw = owner.createElement('dialog');
      raw.className = 'raw-document';
      const form = owner.createElement('form');
      form.method = 'dialog';
      const heading = owner.createElement('strong');
      heading.textContent = file;
      const button = owner.createElement('button');
      button.textContent = host.lang === 'en' ? 'Close' : '关闭';
      form.append(heading, button);
      const content = owner.createElement('textarea');
      content.readOnly = true;
      content.setAttribute('aria-label', file);
      content.value = manual.files[file];
      raw.append(form, content);
      raw.addEventListener('close', () => { raw.remove(); link.focus(); }, { once: true });
      body.append(raw);
      raw.showModal();
      content.focus();
    }, { signal: events.signal });
    back.focus();
  } catch (error) {
    if (!closed) loading.textContent = english
      ? `Documentation could not load. Run ewp docs to read the installed manual. ${error.message}`
      : `文档未能加载，可运行 ewp docs 阅读安装包中的手册。${error.message}`;
  }
  return handle;
}
