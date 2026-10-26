import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import { spawnSync } from 'node:child_process';
import { BACKEND_CAPABILITIES, inspectInstaller, inspectProject, menuModel } from '../frontend/packages/easywindowspack/capabilities.mjs';
import { helpText } from '../frontend/packages/easywindowspack/language.mjs';
import { createColors } from '../frontend/packages/create-ewp/lib/terminal.mjs';
import { runMenu, parseArgs } from '../frontend/packages/easywindowspack/bin/ewp.mjs';
import { documentationFiles, openDocumentation, runDocs } from '../frontend/packages/easywindowspack/documentation.mjs';
import { prepareManual } from '../frontend/packages/easywindowspack/manual/build.mjs';
import { highlightCode } from '../frontend/packages/easywindowspack/manual/highlight.mjs';
import { createGuide } from '../frontend/packages/easywindowspack/manual/content.mjs';
import { structureGuide } from '../frontend/packages/easywindowspack/manual/sections.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const plain = createColors({ env: { NO_COLOR: '1' }, stream: { isTTY: false } });
const ready = (backend = 'rust', overrides = {}) => ({ backend, platform: 'win32', frontendReady: true, venvReady: true, runtimeReady: true, wheelReady: true, packagerReady: true,
  toolchain: { backend, available: true, missing: [] }, installer: { available: true, url: 'https://nsis.sourceforge.io/Download' },
  builtFrontend: true, nodeTests: true, packaging: {}, ...overrides });
const commands = model => model.tasks.map(task => task.command);
function temporary(t) {
  const path = mkdtempSync(join(tmpdir(), 'ewp-manual-'));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
}

test('menu capability matrix never offers native wheels or single-file applications', () => {
  for (const backend of Object.keys(BACKEND_CAPABILITIES)) {
    const model = menuModel(ready(backend), 'en');
    assert.equal(commands(model).includes('wheel'), backend === 'python');
    assert.deepEqual(model.capability.modes, backend === 'python' ? ['onefile', 'onedir'] : ['onedir']);
    assert.ok(commands(model).includes('installer'));
    if (backend !== 'python') assert.match(model.tasks.find(task => task.command === 'exe').en, /directory/);
    assert.ok(commands(model).includes('docs'));
  }
});

test('missing NSIS hides installer, not onedir; configured setup also hides dependent builds', () => {
  const state = ready('rust', { installer: { available: false, url: 'https://nsis.sourceforge.io/Download' } });
  let model = menuModel(state, 'en');
  assert.equal(commands(model).includes('installer'), false);
  assert.ok(commands(model).includes('app'));
  assert.ok(commands(model).includes('exe'));
  assert.match(model.guidance.join('\n'), /EWP_MAKENSIS.*https:\/\/nsis/);
  state.packaging = { build: { mode: 'onedir', installer: true } };
  model = menuModel(state, 'en');
  for (const task of ['installer', 'app', 'exe', 'build:all']) assert.equal(commands(model).includes(task), false, task);
  assert.ok(commands(model).includes('bundle'));
});

test('menu retains recovery and frontend tasks when compiler or Python environment is missing', () => {
  for (const backend of Object.keys(BACKEND_CAPABILITIES)) {
    const model = menuModel(ready(backend, { venvReady: false, packagerReady: false,
      toolchain: { backend, available: false, missing: backend === 'python' ? ['.venv'] : ['Windows SDK'] } }), 'en');
    for (const command of ['init', 'browser', 'frontend', 'info', 'docs', 'help']) assert.ok(commands(model).includes(command), `${backend}:${command}`);
    for (const command of ['dev', 'demo', 'app', 'installer', 'exe', 'test']) assert.equal(commands(model).includes(command), false, `${backend}:${command}`);
  }
  const state = ready('rust', { builtFrontend: false, nodeTests: false });
  assert.ok(!commands(menuModel(state)).includes('frontend:preview'));
  assert.ok(!commands(menuModel(state)).includes('check'));
  assert.ok(!commands(menuModel(ready('rust', { platform: 'linux' }))).includes('app'));
});

test('native configuration errors are visible before a menu can dispatch an unsupported package', () => {
  for (const packaging of [{ build: { mode: 'onefile' } }, { features: [{ id: 'optional' }] }, { hooks: { beforeInstall: [['tool']] } }]) {
    const model = menuModel(ready('rust', { packaging }), 'en');
    assert.ok(!commands(model).includes('app'));
    assert.ok(model.hidden.some(task => /onedir/.test(task.reason)));
    assert.ok(commands(model).includes('browser'));
  }
});

test('NSIS probing respects the exact configured executable and NSIS 3 requirement', () => {
  const calls = [];
  const result = inspectInstaller({ platform: 'win32', env: { EWP_MAKENSIS: 'C:\\Tools With Spaces\\makensis.exe' }, run(command, args, options) {
    calls.push([command, args]);
    assert.ok(options.timeout <= 3000);
    assert.equal(options.windowsHide, true);
    return { status: 0, stdout: 'MakeNSIS v3.11 - Copyright Contributors', stderr: '' };
  } });
  assert.equal(result.available, true);
  assert.deepEqual(calls, [['C:\\Tools With Spaces\\makensis.exe', ['/HDRINFO']]]);
  for (const output of ['MakeNSIS v2.51', 'unrelated tool']) assert.equal(inspectInstaller({ platform: 'win32', env: {}, run: () => ({ status: 0, stdout: output }) }).available, false);
  assert.equal(inspectInstaller({ platform: 'linux', run: () => { throw Error('Unexpected probe'); } }).available, false);
});

test('project inspection does not mistake unrelated global tools for frontend or venv readiness', t => {
  const directory = temporary(t);
  mkdirSync(join(directory, 'frontend'));
  writeFileSync(join(directory, 'frontend', 'package.json'), '{}');
  writeFileSync(join(directory, 'ewp.pack.json'), '{broken');
  const state = inspectProject(directory, 'python', { platform: 'win32', resolveModule: () => { throw Error('Missing vite'); } });
  assert.equal(state.frontendReady, false);
  assert.equal(state.venvReady, false);
  assert.equal(state.packagerReady, false);
  assert.ok(state.configError);
  assert.deepEqual(commands(menuModel(state, 'en')), ['init', 'info', 'docs', 'help']);
});

test('menu refreshes capabilities after a task, keeping numbering consistent', async t => {
  const directory = temporary(t);
  mkdirSync(join(directory, 'frontend'));
  writeFileSync(join(directory, 'frontend', 'package.json'), JSON.stringify({ ewp: { backend: 'rust' } }));
  let installed = false;
  let inspections = 0;
  let prompts = 0;
  const calls = [];
  await runMenu(directory, 'en', { colors: plain, log() {}, inspect() {
    inspections++;
    return ready('rust', { installer: { available: installed } });
  }, choose: async () => ++prompts === 1 ? '1' : '0', execute: async (_, options) => { calls.push(options.command); installed = true; return 0; } });
  assert.deepEqual(calls, ['init']);
  assert.equal(inspections, 2);
});

test('contextual help uses the backend matrix and preserves plain/color behavior', () => {
  for (const language of ['zh-CN', 'en']) {
    const native = helpText(language, { colors: plain, model: menuModel(ready(), language) });
    assert.match(native, /--mode onedir/);
    assert.doesNotMatch(native, /--mode onefile\|onedir|ewp wheel/);
    assert.match(native, /ewp docs --print/);
    const color = helpText(language, { colors: createColors({ env: { FORCE_COLOR: '1' }, stream: {} }) });
    assert.match(color, /\u001b\[/);
    assert.doesNotMatch(helpText(language, { colors: plain }), /\u001b\[/);
  }
});

test('manual generation has demo branding, static full content, scoped TOCs, highlighted code and Markdown parity', async t => {
  const directory = temporary(t);
  const result = await prepareManual(directory, { version: '0.1.5', capabilities: BACKEND_CAPABILITIES });
  assert.equal(result.files.length, 6);
  const html = readFileSync(join(directory, 'index.html'), 'utf8');
  const markdown = readFileSync(join(directory, 'guide.md'), 'utf8');
  const english = readFileSync(join(directory, 'guide.en.md'), 'utf8');
  assert.deepEqual(JSON.parse(readFileSync(join(directory, 'capabilities.json'), 'utf8')), BACKEND_CAPABILITIES);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'All anchors must be unique');
  for (const match of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.includes(match[1]), `Missing anchor ${match[1]}`);
  for (const language of ['zh-CN', 'en']) for (const section of structureGuide(createGuide(language, BACKEND_CAPABILITIES)).sections) {
    assert.ok(html.includes(`data-page="${section.id}"`));
    assert.ok(html.includes(`data-page-toc="${section.id}"`));
    const text = language === 'en' ? english : markdown;
    assert.ok(text.includes(section.title));
    for (const block of section.blocks) if (block.type === 'code') assert.ok(text.includes(block.text), `${section.id} code was not preserved`);
  }
  const colorSvg = readFileSync(join(root, 'frontend', 'src', 'assets', 'ewp-color.svg'));
  const colorData = 'data:image/svg+xml;base64,' + colorSvg.toString('base64');
  assert.ok(html.includes(colorData));
  assert.ok(html.match(new RegExp(colorData.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')).length >= 2);
  assert.match(html, /--welcome-background: #f7f7ff/);
  assert.match(html, /--welcome-background: #111421/);
  assert.match(html, /token-keyword/);
  assert.match(html, /prefers-reduced-motion/);
  assert.doesNotMatch(html, /<(?:script|link)[^>]+(?:src|href)="https?:/);
  assert.doesNotMatch(html, /<img[^>]+src="https?:/);
});

test('syntax highlighting escapes HTML without altering code text', () => {
  const value = 'const html = "<script>alert(1)</script>"; // comment';
  const highlighted = highlightCode(value, 'javascript');
  assert.match(highlighted, /token-keyword/);
  assert.match(highlighted, /token-string/);
  assert.doesNotMatch(highlighted, /<script>/);
  const recovered = highlighted.replace(/<\/?span[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  assert.equal(recovered, value);
});

test('docs works outside projects, supports print/no-open and safe browser fallback', async t => {
  const directory = temporary(t);
  await prepareManual(directory, { version: '0.1.5', capabilities: BACKEND_CAPABILITIES });
  const files = documentationFiles('en', directory);
  assert.match(files.url, /^file:/);
  assert.match(files.url, /lang=en/);
  const output = [];
  await runDocs({ language: 'en', print: true }, { directory, log: text => output.push(text), openBrowser: () => { throw Error('Unexpected browser open'); } });
  assert.match(output[0], /^# Easy Windows Pack/);
  output.length = 0;
  await runDocs({ language: 'en', open: false }, { directory, log: text => output.push(text) });
  assert.equal(output[0], files.url);
  let warning;
  await runDocs({ language: 'en' }, { directory, log() {}, warn: value => { warning = value; }, openBrowser: async () => { throw Error('blocked'); } });
  assert.match(warning, /Open the local URL/);
  assert.equal(parseArgs(['docs', '--no-open']).open, false);
  assert.equal(parseArgs(['docs', '--print']).print, true);
  assert.throws(() => parseArgs(['docs', '--port=1']), /Unknown|未知/);
  for (const bin of ['ewp', 'ews']) {
    const result = spawnSync(process.execPath, [join(root, 'frontend', 'packages', 'easywindowspack', 'bin', `${bin}.mjs`), 'docs', '--no-open', '--lang', 'en'], { cwd: directory, encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout.trim(), /^file:.*lang=en$/);
  }
});

test('documentation opener passes file URLs as literal arguments without a shell', async () => {
  const url = 'file:///C:/A%20B%26C/index.html?lang=en';
  const calls = [];
  await openDocumentation(url, { platform: 'win32', env: { SystemRoot: 'C:\\Windows' }, launch(command, args, options) {
    calls.push([command, args, options]);
    const child = new EventEmitter();
    queueMicrotask(() => child.emit('exit', 0));
    return child;
  } });
  assert.equal(calls[0][2].shell, false);
  assert.deepEqual(calls[0][1], ['url.dll,FileProtocolHandler', url]);
});
