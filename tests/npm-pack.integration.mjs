/**
 * Run: node tests/npm-pack.integration.mjs
 * Optional without packs: node tests/npm-pack.integration.mjs --optional
 * Focus a rerun: node tests/npm-pack.integration.mjs --templates=vue,vue-ts
 * Uses ONLY output/npm tarballs and installed public packages. No prepare,
 * repository runtime imports, publish, Python init, wheel or EXE execution.
 * Retains projects/report under build/npm-pack-validation/<unique space path>
 * for the native packaging owner; restores every temporary source probe.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repository = fileURLToPath(new URL('../', import.meta.url));
const templates = ['vanilla', 'vanilla-ts', 'vue', 'vue-ts', 'react', 'react-ts'];
const filter = process.argv.find(value => value.startsWith('--templates='))?.slice(12);
const selected = filter ? filter.split(',') : templates;
assert.ok(selected.length && selected.every(value => templates.includes(value)), 'Unknown --templates selection');
const packs = Object.fromEntries(['create-ewp', 'easywindowspack'].map(name => [name, join(repository, 'output/npm', `${name}-0.1.0.tgz`)]));
const missing = Object.values(packs).filter(path => !existsSync(path));
const skipped = missing.length && process.argv.includes('--optional') ? `Missing real tarballs: ${missing.join(', ')}` : false;
const require = createRequire(import.meta.url);
const children = new Set();
const servers = new Set();
let browser;
let closing;
let report;
let reportPath;

function within(parent, path) {
  const result = relative(realpathSync(parent), realpathSync(path));
  return result !== '..' && !result.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(result);
}

function hash(path) { return createHash('sha256').update(readFileSync(path)).digest('hex'); }
function json(path) { return JSON.parse(readFileSync(path, 'utf8')); }
function saveJson(path, value) { writeFileSync(path, JSON.stringify(value, null, 2) + '\n'); }

// Bootstrap before the installed creator is available. Prefer npm's actual JS
// entry; safely quote the Windows ComSpec fallback (no shell interpolation).
function npmSpec(args) {
  const candidates = [process.env.npm_execpath, join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    join(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js')];
  const cli = candidates.find(path => path && /npm-cli\.js$/.test(path) && existsSync(path));
  if (cli) return { command: process.execPath, args: [resolve(cli), ...args], options: {} };
  if (process.platform !== 'win32') return { command: 'npm', args, options: {} };
  const pathValue = Object.entries(process.env).find(([key]) => key.toLowerCase() === 'path')?.[1] ?? '';
  const batch = pathValue.split(';').map(part => join(part.replace(/^"|"$/g, ''), 'npm.cmd')).find(existsSync);
  assert.ok(batch, 'npm.cmd not found on PATH');
  const quote = value => {
    assert.doesNotMatch(value, /["%\r\n\0]/, 'Unsupported Windows batch argument');
    return `"${value}"`;
  };
  return { command: process.env.ComSpec || process.env.COMSPEC || 'C:\\Windows\\System32\\cmd.exe',
    args: ['/d', '/s', '/v:off', '/c', `"${[batch, ...args].map(quote).join(' ')}"`],
    options: { windowsVerbatimArguments: true } };
}

async function stopChild(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync(join(process.env.SystemRoot || 'C:\\Windows', 'System32/taskkill.exe'),
      ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true, timeout: 10000 });
  } else {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
  }
}

async function execute(command, args, cwd, label, options = {}) {
  console.log(`[pack-integration] ${label}`);
  const started = Date.now();
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase() !== 'NODE_PATH'));
  const child = spawn(command, args, { cwd, env: { ...env, CI: '1', NO_COLOR: '1' },
    shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'], ...options });
  children.add(child);
  let output = '';
  child.stdout.setEncoding('utf8').on('data', value => { output += value; });
  child.stderr.setEncoding('utf8').on('data', value => { output += value; });
  let timer;
  let timedOut = false;
  try {
    const code = await new Promise((resolveExit, reject) => {
      child.once('error', reject);
      child.once('close', code => resolveExit(code));
      timer = setTimeout(() => { timedOut = true; void stopChild(child); }, 240000);
    });
    const log = join(cwd, `integration-${label.replace(/[^a-z0-9]+/gi, '-')}.log`);
    writeFileSync(log, output);
    report.commands.push({ label, cwd, command, args, code, timedOut, log, durationMs: Date.now() - started });
    assert.equal(timedOut, false, `${label} timed out; see ${log}`);
    assert.equal(code, 0, `${label} failed; see ${log}\n${output.slice(-10000)}`);
    return output;
  } finally { clearTimeout(timer); await stopChild(child); children.delete(child); }
}

function npm(args, cwd, label) {
  const spec = npmSpec(args);
  return execute(spec.command, spec.args, cwd, label, spec.options);
}

async function closeServer(server) {
  try {
    if (server.close) {
      server.config.server.preTransformRequests = false;
      await server.waitForRequestsIdle?.();
      await server.close();
    }
    else {
      server.httpServer.closeAllConnections?.();
      await new Promise((resolveClose, reject) => server.httpServer.close(error =>
        error && error.code !== 'ERR_SERVER_NOT_RUNNING' ? reject(error) : resolveClose()));
    }
  } finally { servers.delete(server); }
}

async function cleanup() {
  return closing ??= (async () => {
    const results = await Promise.allSettled([
      browser?.close(), ...[...servers].map(closeServer), ...[...children].map(stopChild)
    ]);
    const errors = results.filter(result => result.status === 'rejected').map(result => String(result.reason));
    if (report) {
      report.cleanupErrors = errors;
      report.finishedAt = new Date().toISOString();
      saveJson(reportPath, report);
    }
    return errors;
  })();
}

async function installedAudit(project) {
  // This probe executes in the consumer, so Node resolves the installed exports.
  const probe = join(project, 'integration-exports.mjs');
  writeFileSync(probe, `import assert from 'node:assert/strict';
import { existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mountFrame, getWindowApi } from 'easywindowspack';
import { main } from 'create-ewp/cli';
assert.equal(typeof mountFrame, 'function');
assert.equal(getWindowApi(), null);
assert.equal(typeof main, 'function');
for (const spec of ['easywindowspack', 'easywindowspack/frame.css', 'easywindowspack/desktop.css',
  'easywindowspack/desktop-components.js', 'easywindowspack/desktop-updates.js',
  'easywindowspack/vue', 'easywindowspack/react', 'create-ewp/cli']) {
  const path = fileURLToPath(import.meta.resolve(spec));
  assert.ok(existsSync(path), spec);
  assert.ok(realpathSync(path).startsWith(realpathSync('./node_modules')), spec + ' escaped consumer installation');
}
console.log('Installed exports and prepared assets resolve');\n`);
  try { await execute(process.execPath, [probe], project, 'installed-exports'); }
  finally { rmSync(probe, { force: true }); }
  const lock = json(join(project, 'package-lock.json'));
  for (const name of Object.keys(packs)) {
    const entries = Object.entries(lock.packages).filter(([key]) => key.endsWith(`/node_modules/${name}`) || key === `node_modules/${name}`);
    assert.ok(entries.length, `Missing installed ${name}`);
    for (const [, entry] of entries) {
      assert.match(entry.resolved, /^file:/, `${name} unexpectedly resolved from registry`);
      assert.equal(entry.version, '0.1.0');
    }
    assert.ok(within(project, join(project, 'node_modules', name)), `${name} must be physically installed`);
  }
  const declaration = join(project, 'node_modules/easywindowspack/index.d.ts');
  assert.equal(json(join(project, 'node_modules/easywindowspack/package.json')).exports['.'].types, './index.d.ts');
  assert.match(readFileSync(declaration, 'utf8'), /export function mountFrame/);
}

async function typecheck(project, template) {
  const probe = join(project, 'frontend/src/integration-contract.ts');
  writeFileSync(probe, `import { mountFrame, call, setWindowStyle, getWindowApi } from 'easywindowspack';
import type { FrameOptions, MountedFrame } from 'easywindowspack';
const options: FrameOptions = { windowStyle: 'windows', content: document.createElement('main') };
const handle: MountedFrame = mountFrame('#app', options);
const content: HTMLElement = handle.content;
handle.update({ title: content.tagName }).dispose();
const result: Promise<Record<string, unknown>> = call('window_action', 'minimize');
void result; getWindowApi()?.unbind(handle.frame); setWindowStyle('macos');
// @ts-expect-error Published types must reject unsupported styles.
setWindowStyle('unsupported');
// @ts-expect-error Published types must reject unsupported modes.
mountFrame('#app', { mode: 'unsupported' });\n`);
  try {
    let output = await npm(['run', 'typecheck', '--', '--traceResolution'], project, `${template}-typecheck`);
    if (template.startsWith('vue')) {
      // Volar intercepts module resolution and need not emit the TS trace for
      // resolved application imports. Check the public contract independently.
      output = await execute(process.execPath, [join(project, 'node_modules/typescript/bin/tsc'),
        '--noEmit', '--strict', '--skipLibCheck', '--moduleResolution', 'bundler',
        '--module', 'esnext', '--target', 'es2022', '--traceResolution', probe], project, `${template}-published-contract`);
    }
    assert.match(output.replaceAll('\\', '/'), /node_modules\/easywindowspack\/index\.d\.ts/, 'TypeScript did not resolve the published declaration');
  } finally { rmSync(probe, { force: true }); }
}

function loadPlaywright() {
  if (process.env.NPM_PACK_PLAYWRIGHT) return require(process.env.NPM_PACK_PLAYWRIGHT);
  const global = 'C:/ProgramData/nvm/v22.22.2/node_modules/@playwright/test/index.js';
  if (existsSync(global)) return require(global);
  try { return require('@playwright/test'); }
  catch { throw new Error('Playwright not found. Set NPM_PACK_PLAYWRIGHT to the installed @playwright/test entry.'); }
}

async function newPage() {
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) errors.push(`HTTP ${response.status()} ${response.url()}`); });
  await page.addInitScript(() => {
    window.__packActions = [];
    let maximized = false;
    window.pywebview = { api: {
      window_action: async action => {
        window.__packActions.push(action);
        if (action === 'maximize') maximized = !maximized;
        return { ok: true, maximized, titleBarMode: 'default' };
      }
    } };
    window.__packDocument = `${Date.now()}-${Math.random()}`;
  });
  return { page, errors };
}

async function interact(page, expect, title) {
  const frame = page.locator('[data-ewp-window-frame]');
  await expect(frame).toHaveCount(1);
  await expect(frame.locator('[data-ewp-title]')).toHaveText(title);
  const counter = frame.locator('[data-ewp-content] .counter');
  await expect(counter).toHaveText('Count: 0');
  await counter.click(); await counter.click();
  await expect(counter).toHaveText('Count: 2');
  const select = frame.locator('[data-ewp-content] select');
  for (const style of ['windows', 'macos', 'windows']) {
    await select.selectOption(style);
    await expect(frame).toHaveAttribute('data-window-style', style);
    await expect(counter).toHaveText('Count: 2');
    const css = await frame.locator('.ewp-titlebar').evaluate(element => getComputedStyle(element).height);
    assert.equal(css, style === 'windows' ? '33px' : '40px', `Real ${style} titlebar CSS`);
  }
  const start = await page.evaluate(() => window.__packActions.length);
  for (const action of ['minimize', 'maximize', 'maximize', 'close']) {
    await frame.locator(`[data-ewp-action="${action}"]`).click();
    if (action === 'maximize') {
      const calls = await page.evaluate(() => window.__packActions.filter(value => value === 'maximize').length);
      await expect(frame).toHaveClass(calls % 2 ? /ewp-window-maximized/ : /^(?!.*ewp-window-maximized).*$/);
    }
  }
  assert.deepEqual(await page.evaluate(start => window.__packActions.slice(start), start), ['minimize', 'maximize', 'maximize', 'close'], 'Exactly one stub API call per click');
}

// Consumer-only probes exercise the generated composition layers, not replacement
// frames. Original sources are restored even when HMR/assertions fail.
function lifecycleFixture(project, template) {
  const htmlPath = join(project, 'frontend/index.html');
  const originalHtml = readFileSync(htmlPath, 'utf8');
  const extension = template.startsWith('react') ? (template.endsWith('-ts') ? 'tsx' : 'jsx') : template.endsWith('-ts') ? 'ts' : 'js';
  const entry = join(project, `frontend/src/main.${extension}`);
  const originalEntry = readFileSync(entry, 'utf8');
  const probe = join(project, 'frontend/src/integration-lifecycle.mjs');
  const controls = `
const controls = document.createElement('aside');
controls.innerHTML = '<button id="pack-unmount">Unmount</button><button id="pack-remount">Remount</button>';
controls.style.cssText = 'position:fixed;bottom:10px;right:10px;z-index:9999';
document.body.append(controls);
document.getElementById('pack-unmount').onclick = unmount;
document.getElementById('pack-remount').onclick = mount;
`;
  if (template.startsWith('vue')) {
    writeFileSync(probe, `import { createApp } from 'vue';
import App from './App.vue'; import './style.css';
let app;
function mount() { if (!app) { app = createApp(App); app.mount('#app'); } }
function unmount() { app?.unmount(); app = undefined; }
mount(); ${controls}`);
  } else if (template.startsWith('react')) {
    writeFileSync(probe, `import { createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.${extension}'; import './style.css';
let root;
function mount() { if (!root) { root = createRoot(document.getElementById('app')); root.render(createElement(StrictMode, null, createElement(App))); } }
function unmount() { root?.unmount(); root = undefined; }
mount(); ${controls}`);
  } else {
    // Keep all original Vanilla business handlers, and expose explicit disposal.
    writeFileSync(entry, originalEntry.replace('frame.update({ windowStyle:', 'currentFrame.update({ windowStyle:') + `
let currentFrame = frame;
let live = true;
function unmount() { currentFrame.dispose(); live = false; }
function mount() {
  if (live) return;
  count = 0; counter.textContent = 'Count: 0'; style.value = 'macos';
  currentFrame = mountFrame('#app', { title: document.title, windowStyle: 'macos', content });
  live = true;
}
${controls}`);
    return () => writeFileSync(entry, originalEntry);
  }
  writeFileSync(htmlPath, originalHtml.replace(`/src/main.${extension}`, '/src/integration-lifecycle.mjs'));
  return () => { writeFileSync(htmlPath, originalHtml); rmSync(probe, { force: true }); };
}

test('real npm packs: consumer installation, six builds, types, Chrome and HMR', { skip: skipped }, async t => {
  assert.deepEqual(missing, [], `Missing real tarballs; pack both packages into output/npm first: ${missing.join(', ')}`);
  const parent = join(repository, 'build/npm-pack-validation');
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, 'pack validation '));
  const originalNodeEnv = process.env.NODE_ENV;
  const harness = join(root, 'harness');
  const outside = join(root, 'outside project');
  mkdirSync(harness); mkdirSync(outside);
  reportPath = join(root, 'report.json');
  report = { startedAt: new Date().toISOString(), root, harness, packs: Object.fromEntries(Object.entries(packs).map(([name, path]) => [name, { path, sha256: hash(path) }])),
    selected, commands: [], projects: [], checks: [], findings: [], nativePackaging: 'Deferred to main agent; no Python/EXE execution' };
  saveJson(reportPath, report);
  const signal = () => { void cleanup().finally(() => process.exit(130)); };
  process.once('SIGINT', signal); process.once('SIGTERM', signal);
  const dependencies = { 'create-ewp': `file:${packs['create-ewp'].replaceAll('\\', '/')}`,
    easywindowspack: `file:${packs.easywindowspack.replaceAll('\\', '/')}`,
    vite: '^7.3.7', vue: '^3.5.0', react: '^19.0.0', 'react-dom': '^19.0.0',
    '@vitejs/plugin-vue': '^6.0.0', '@vitejs/plugin-react': '^5.0.0', typescript: '~5.9.0',
    'vue-tsc': '^3.0.0', '@types/react': '^19.0.0', '@types/react-dom': '^19.0.0', '@types/node': '^22.0.0' };
  try {
    saveJson(join(harness, 'package.json'), { name: 'npm-pack-validation-harness', private: true, type: 'module', dependencies });
    await npm(['install', '--include=dev', '--ignore-scripts', '--prefer-offline', '--no-audit', '--no-fund'], harness, 'harness-install');
    await installedAudit(harness);
    const { chromium, expect: playwrightExpect } = loadPlaywright();
    const expect = playwrightExpect.configure({ timeout: 15000 });
    browser = await chromium.launch({ channel: process.env.NPM_PACK_BROWSER_CHANNEL || 'chrome', headless: true });
    const creator = join(harness, 'node_modules/create-ewp/bin/create-ewp.mjs');
    const runtimeCli = join(harness, 'node_modules/easywindowspack/bin/ewp.mjs');
    await t.test('installed ewp create runs before project root discovery', async () => {
      const destination = join(outside, 'Global Created App');
      await execute(process.execPath, [runtimeCli, 'create', 'Global Created App', '--template', 'vue', '--no-install', '--no-start'], outside, 'ewp-create-outside');
      assert.ok(existsSync(join(destination, 'scripts/dev.py')));
      assert.ok(existsSync(join(destination, 'frontend/src/App.vue')));
      report.checks.push('installed ewp create outside project');
    });
    for (const template of selected) {
      await t.test(template, async () => {
        const project = join(root, `App ${template}`);
        const record = { template, path: project, status: 'running' };
        report.projects.push(record);
        try {
          await execute(process.execPath, [creator, `App ${template}`, '--template', template, '--no-install', '--no-start'], root, `${template}-create`);
          const manifestPath = join(project, 'package.json');
          const manifest = json(manifestPath);
          assert.equal(manifest.dependencies.easywindowspack, '^0.1.0', 'Generator public dependency contract');
          record.generatedViteRange = manifest.devDependencies.vite;
          if (manifest.devDependencies.vite !== '^7.3.7') {
            const finding = `${template}: packed generator declares Vite ${manifest.devDependencies.vite}; target is ^7.3.7. Update generator and repack.`;
            report.findings.push(finding);
            console.log(`[pack-integration] FINDING: ${finding}`);
          }
          assert.equal(manifest.scripts.build, 'ewp build');
          assert.equal(manifest.scripts.init, 'ewp init');
          manifest.dependencies.easywindowspack = dependencies.easywindowspack;
          manifest.dependencies['create-ewp'] = dependencies['create-ewp'];
          saveJson(manifestPath, manifest);
          await npm(['install', '--include=dev', '--ignore-scripts', '--prefer-offline', '--no-audit', '--no-fund'], project, `${template}-install`);
          await installedAudit(project);
          if (template.endsWith('-ts')) { await typecheck(project, template); record.publishedTypes = 'passed'; }
          await npm(['run', 'frontend:build'], project, `${template}-frontend-build`);
          const built = readFileSync(join(project, 'output/frontend/index.html'), 'utf8');
          assert.match(built, /\.\/assets\//, 'Production relative asset URLs');
          assert.doesNotMatch(built, /\/src\/main|\.tsx?\b|\.vue\b/);
          assert.ok(readdirSync(join(project, 'output/frontend/assets')).some(name => name.endsWith('.js')));
          record.build = 'passed';
          const vite = await import(pathToFileURL(join(project, 'node_modules/vite/dist/node/index.js')).href);
          process.env.NODE_ENV = 'production';
          const preview = await vite.preview({ configFile: join(project, 'vite.config.mjs'), logLevel: 'silent', preview: { host: '127.0.0.1', port: 0, open: false } });
          servers.add(preview);
          const production = await newPage();
          try {
            await production.page.goto(preview.resolvedUrls.local[0]);
            await interact(production.page, expect, manifest.name);
            assert.deepEqual(production.errors, [], `${template} production errors`);
            record.productionInteraction = 'passed';
          } finally { await production.page.close(); await closeServer(preview); }
          const restore = lifecycleFixture(project, template);
          let dev;
          let consumer;
          const appPath = join(project, 'frontend/src/App.vue');
          const appSource = template.startsWith('vue') ? readFileSync(appPath, 'utf8') : undefined;
          try {
            // No fs.allow override: installed modules are genuinely in this project.
            process.env.NODE_ENV = 'development';
            dev = await vite.createServer({ configFile: join(project, 'vite.config.mjs'), logLevel: 'silent', server: { host: '127.0.0.1', port: 0, open: false } });
            servers.add(dev); await dev.listen();
            consumer = await newPage();
            await consumer.page.goto(dev.resolvedUrls.local[0]);
            for (let cycle = 0; cycle < 3; cycle++) {
              await interact(consumer.page, expect, manifest.name);
              await consumer.page.evaluate(() => { window.__packDetached = [...document.querySelectorAll('[data-ewp-action]')]; });
              await consumer.page.locator('#pack-unmount').click();
              await expect(consumer.page.locator('[data-ewp-window-frame]')).toHaveCount(0);
              const calls = await consumer.page.evaluate(() => window.__packActions.length);
              await consumer.page.evaluate(() => window.__packDetached.forEach(button => button.click()));
              assert.equal(await consumer.page.evaluate(() => window.__packActions.length), calls, 'Disposed titlebar listeners still active');
              await consumer.page.locator('#pack-remount').click();
              await expect(consumer.page.locator('[data-ewp-window-frame]')).toHaveCount(1);
            }
            record.lifecycle = '3 unmount/remount cycles passed; detached listeners released';
            if (template.startsWith('vue')) {
              // HMR belongs to the unchanged generated application entry.
              await consumer.page.close();
              consumer = undefined;
              await closeServer(dev);
              dev = undefined;
              restore();
              dev = await vite.createServer({ configFile: join(project, 'vite.config.mjs'), logLevel: 'silent', server: { host: '127.0.0.1', port: 0, open: false } });
              servers.add(dev); await dev.listen();
              consumer = await newPage();
              await consumer.page.goto(dev.resolvedUrls.local[0]);
              await expect(consumer.page.locator('.counter')).toHaveText('Count: 0');
              await dev.waitForRequestsIdle();
              const token = await consumer.page.evaluate(() => window.__packDocument);
              let navigations = 0;
              const navigation = frame => { if (frame === consumer.page.mainFrame()) navigations++; };
              consumer.page.on('framenavigated', navigation);
              await consumer.page.locator('.counter').click();
              await expect(consumer.page.locator('.counter')).toHaveText('Count: 1');
              assert.ok(appSource.includes('Your next desktop app.'), 'HMR fixture marker absent');
              writeFileSync(appPath, appSource.replace('Your next desktop app.', 'Pack integration HMR updated.'));
              await expect(consumer.page.locator('h1')).toHaveText('Pack integration HMR updated.');
              assert.equal(await consumer.page.evaluate(() => window.__packDocument), token, 'HMR reloaded the document');
              assert.equal(navigations, 0, 'HMR caused full-page navigation');
              record.hmrCountAfterEdit = await consumer.page.locator('.counter').textContent();
              if (record.hmrCountAfterEdit !== 'Count: 1') report.findings.push(`${template}: HMR updates text without a full-page reload but resets the counter (${record.hmrCountAfterEdit}). Review Vue component HMR boundaries if state preservation is required.`);
              // Separate editor writes beyond Chokidar's atomic-event coalescing
              // window. This is not a retry or a synthetic HMR watcher emit.
              await new Promise(resolveWrite => setTimeout(resolveWrite, 200));
              writeFileSync(appPath, appSource);
              await expect(consumer.page.locator('h1')).toHaveText('Your next desktop app.');
              assert.equal(await consumer.page.evaluate(() => window.__packDocument), token, 'HMR restore reloaded the document');
              assert.equal(navigations, 0, 'HMR restore caused full-page navigation');
              consumer.page.off('framenavigated', navigation);
              record.hmr = 'text update and restore; zero full reloads';
            }
            assert.deepEqual(consumer.errors, [], `${template} dev errors`);
            record.status = 'passed';
          } finally {
            if (appSource !== undefined) writeFileSync(appPath, appSource);
            if (consumer) await consumer.page.close();
            if (dev) await closeServer(dev);
            restore();
          }
        } catch (error) { record.status = 'failed'; record.error = error.stack; throw error; }
        finally { saveJson(reportPath, report); }
      });
    }
    report.mainProjectPath = report.projects.find(item => item.template === 'vue' && item.status === 'passed')?.path
      ?? report.projects.find(item => item.template.startsWith('vue') && item.build === 'passed')?.path;
    for (const [name, pack] of Object.entries(report.packs)) assert.equal(hash(pack.path), pack.sha256, `${name} tarball changed during execution; rerun against stable packs`);
    report.checks.push('input tarball SHA-256 unchanged');
  } finally {
    const errors = await cleanup();
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    process.off('SIGINT', signal); process.off('SIGTERM', signal);
    console.log(`[pack-integration] REPORT=${reportPath}`);
    console.log(`[pack-integration] MAIN_PROJECT_PATH=${report.mainProjectPath ?? 'unavailable (no Vue project passed)'}`);
    assert.deepEqual(errors, [], 'Process/server cleanup failed');
  }
});