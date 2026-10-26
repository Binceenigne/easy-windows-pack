import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { prepareManual } from '../frontend/packages/easywindowspack/manual/build.mjs';
import { BACKEND_CAPABILITIES } from '../frontend/packages/easywindowspack/capabilities.mjs';
import { createGuide } from '../frontend/packages/easywindowspack/manual/content.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.NPM_PACK_PLAYWRIGHT || join(root, 'build', 'npm-release-tools', 'node_modules', '@playwright', 'test', 'index.js'));
const output = join(root, 'build', 'manual-browser-validation');
const preview = join(root, 'build', 'manual-offline-1da3f0a4');
const reports = [];

test('offline manual: pages, TOCs, brand, highlighting, history, mobile, search and reduced motion', { timeout: 90000 }, async t => {
  mkdirSync(output, { recursive: true });
  await prepareManual(preview, { version: '0.1.5', capabilities: BACKEND_CAPABILITIES });
  const browser = await chromium.launch({ channel: process.env.NPM_PACK_BROWSER_CHANNEL || 'msedge', headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, colorScheme: 'light', reducedMotion: 'no-preference' });
  const page = await context.newPage();
  const errors = [];
  const external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url())) external.push(request.url()); });
  const url = pathToFileURL(join(preview, 'index.html'));
  url.search = '?lang=zh-CN';
  url.hash = 'zh-CN-packaging';
  await page.goto(url.href);
  const visiblePage = () => page.locator('article:visible [data-page]:visible');

  await t.test('deep links render one module and TOC links target only its subsections', async () => {
    assert.equal(await visiblePage().count(), 1);
    assert.equal(await visiblePage().getAttribute('data-page'), 'packaging');
    const links = page.locator('.toc [data-toc-link]:visible');
    assert.ok(await links.count() >= 4);
    const valid = await links.evaluateAll(items => items.every(item => document.getElementById(item.dataset.tocLink)?.closest('[data-page]')?.dataset.page === 'packaging'));
    assert.equal(valid, true);
    assert.equal(await page.locator('[data-section-link][aria-current]:visible').count(), 1);
    reports.push('deep-link and scoped TOC passed');
  });

  await t.test('demo palette and both SVG assets are present; code text is preserved under highlighting', async () => {
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(247, 247, 255)');
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('.brand-mark img')].every(image => image.complete && image.naturalWidth > 0)), true);
    assert.ok(await page.locator('pre code .token').count() > 100);
    const actual = await page.locator('article[lang="zh-CN"] .doc-section pre code').allTextContents();
    const expected = createGuide('zh-CN', BACKEND_CAPABILITIES).sections.flatMap(section => section.blocks.filter(block => block.type === 'code').map(block => block.text));
    assert.deepEqual(actual, expected);
    await page.screenshot({ path: join(output, 'desktop-light.png'), fullPage: false });
    reports.push('brand, palette and highlighted code passed');
  });

  await t.test('section switching, subsection scrolling, search, language and history work together', async () => {
    await page.locator('.sidebar a[href="#zh-CN-window-frame"]').click();
    assert.equal(await visiblePage().getAttribute('data-page'), 'window-frame');
    const target = page.locator('.toc [data-toc-link]:visible').last();
    const anchor = await target.getAttribute('data-toc-link');
    await target.click();
    await page.waitForFunction(id => {
      const node = document.getElementById(id);
      const top = node.getBoundingClientRect().top;
      return top >= 70 && top < innerHeight - 40;
    }, anchor);
    assert.ok(page.url().endsWith('#' + anchor));
    assert.equal(await visiblePage().getAttribute('data-page'), 'window-frame');
    await page.locator('[data-switch-language="en"]').click();
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    assert.equal(await visiblePage().getAttribute('data-page'), 'window-frame');
    await page.goBack();
    assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN');
    await page.goForward();
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    await page.keyboard.press('Control+k');
    await page.locator('#manual-query').fill('no-results-unique-ewp-000');
    assert.match(await page.locator('#search-status').textContent(), /No results/);
    await page.locator('#manual-query').fill('makensis');
    assert.ok(await page.locator('.search-results a').count() > 0);
    await page.locator('.search-results a').first().click();
    assert.equal(await page.locator('#manual-search').getAttribute('open'), null);
    assert.equal(await visiblePage().count(), 1);
    reports.push('route, scrolling, search, language and history passed');
  });

  await t.test('dark mode persists and small screens do not overflow', async () => {
    await page.goto(url.href.replace('lang=zh-CN', 'lang=en').replace('#zh-CN-packaging', '#en-packaging'));
    await page.locator('[data-theme-toggle]').click();
    await page.locator('[data-theme-toggle]').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(17, 20, 33)');
    assert.equal(await page.locator('.brand-mark .brand-dark').isVisible(), true);
    await page.screenshot({ path: join(output, 'desktop-dark.png'), fullPage: false });
    await page.reload();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.locator('[data-menu]').click();
    assert.equal(await page.locator('[data-menu]').getAttribute('aria-expanded'), 'true');
    await page.locator('.sidebar a[href="#en-packaging"]').click();
    assert.equal(await page.locator('[data-menu]').getAttribute('aria-expanded'), 'false');
    assert.equal(await visiblePage().getAttribute('data-page'), 'packaging');
    await page.screenshot({ path: join(output, 'mobile-dark.png'), fullPage: false });
    await page.setViewportSize({ width: 320, height: 740 });
    assert.equal(await page.locator('.brand-mark').isVisible(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    reports.push('dark theme, persistence, 390px and 320px mobile passed');
  });

  await t.test('reduced motion and script-free HTML remain usable offline', async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await visiblePage().evaluate(node => getComputedStyle(node).animationName), 'none');
    const staticContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
    try {
      const staticPage = await staticContext.newPage();
      await staticPage.goto(url.href);
      assert.equal(await staticPage.locator('article:visible').count(), 2);
      assert.equal(await staticPage.locator('.doc-section:visible').count(), createGuide('zh-CN', BACKEND_CAPABILITIES).sections.length * 2);
      assert.ok(await staticPage.locator('pre code .token').count() > 100);
    } finally { await staticContext.close(); }
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    reports.push('reduced motion, no JavaScript and zero external requests passed');
  });
  await t.test('embedded package documentation preserves the app and never navigates or calls a bridge', async () => {
    const runtime = join(root, 'frontend', 'packages', 'easywindowspack');
    await prepareManual(join(runtime, 'assets', 'docs'), { version: '0.1.5', capabilities: BACKEND_CAPABILITIES });
    const resources = new Map([
      ['/documentation-view.mjs', join(runtime, 'documentation-view.mjs')],
      ['/assets/docs/panel.mjs', join(runtime, 'assets', 'docs', 'panel.mjs')],
      ['/assets/docs/session.mjs', join(runtime, 'assets', 'docs', 'session.mjs')]
    ]);
    const server = createServer((request, response) => {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      if (pathname === '/') {
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end('<!doctype html><html lang="en"><head><title>Application</title></head><body><h1>Application</h1><input aria-label="Application state" value="retained"><button id="docs">Documentation</button><script type="module">import {openDocs} from "/documentation-view.mjs"; window.bridgeCalls=0; window.pywebview={api:new Proxy({}, {get(){ window.bridgeCalls++; throw Error("Bridge must not be called"); }})}; document.querySelector("#docs").onclick=()=>openDocs({language:"en"});</script></body></html>');
      } else if (resources.has(pathname)) {
        response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        response.end(readFileSync(resources.get(pathname)));
      } else { response.statusCode = 404; response.end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const embeddedContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
    try {
      const embeddedPage = await embeddedContext.newPage();
      const messages = [];
      embeddedPage.on('pageerror', error => messages.push(error.message));
      const initial = `http://127.0.0.1:${server.address().port}/?application=1#state`;
      await embeddedPage.goto(initial);
      await embeddedPage.getByLabel('Application state').fill('unsaved application data');
      await embeddedPage.getByRole('button', { name: 'Documentation', exact: true }).click();
      const panel = embeddedPage.getByRole('dialog', { name: 'Easy Windows Pack documentation', exact: true });
      await panel.locator('[data-page="overview"]:visible').waitFor();
      assert.equal(await panel.locator('iframe').count(), 0);
      assert.equal(await panel.locator('.manual-body').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(247, 247, 255)');
      await panel.locator('.sidebar a[href="#en-packaging"]').click();
      assert.equal(await panel.locator('article:visible [data-page]:visible').getAttribute('data-page'), 'packaging');
      assert.ok(await panel.locator('.toc [data-toc-link]:visible').count() >= 4);
      await panel.locator('.sidebar-downloads a[href="guide.en.md"]').click();
      const raw = panel.getByRole('textbox', { name: 'guide.en.md', exact: true });
      await raw.waitFor();
      assert.match(await raw.inputValue(), /^# Easy Windows Pack/);
      await panel.getByRole('button', { name: 'Close', exact: true }).click();
      await panel.getByRole('button', { name: 'Back to app', exact: true }).click();
      assert.equal(await embeddedPage.locator('dialog').count(), 0);
      assert.equal(await embeddedPage.getByLabel('Application state').inputValue(), 'unsaved application data');
      assert.equal(await embeddedPage.evaluate(() => window.bridgeCalls), 0);
      assert.equal(await embeddedPage.title(), 'Application');
      assert.equal(embeddedPage.url(), initial);
      assert.equal(await embeddedPage.evaluate(() => document.activeElement.id), 'docs');
      await embeddedPage.locator('#docs').click();
      await panel.locator('[data-page="overview"]:visible').waitFor();
      await embeddedPage.keyboard.press('Escape');
      assert.equal(await embeddedPage.locator('dialog').count(), 0);
      assert.deepEqual(messages, []);
      reports.push('embedded package manual, raw files, preserved application state, focus and zero bridge calls passed');
    } finally {
      await embeddedContext.close();
      await new Promise(resolve => server.close(resolve));
    }
  });
  writeFileSync(join(output, 'report.json'), JSON.stringify({ passed: reports, browserErrors: errors, externalRequests: external }, null, 2));
});
