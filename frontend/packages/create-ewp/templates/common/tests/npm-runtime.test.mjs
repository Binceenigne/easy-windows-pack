import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const frontend = join(root, 'frontend');
const requireFrontend = createRequire(join(frontend, 'package.json'));
const readJson = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));

test('installed runtime exposes the public frame API and CSS resources', async () => {
  const frameCss = requireFrontend.resolve('easywindowspack/frame.css');
  for (const path of [frameCss, requireFrontend.resolve('easywindowspack/desktop.css')]) {
    assert.ok(statSync(path).isFile(), path);
    assert.ok(readFileSync(path, 'utf8').trim(), path);
  }

  // The root export is import-only. Locate its manifest from the resolved
  // public CSS export, then import the declared ESM entry (also on Windows).
  let directory = dirname(frameCss);
  while (!existsSync(join(directory, 'package.json'))) {
    const parent = dirname(directory);
    assert.notEqual(parent, directory, 'Runtime package.json was not found');
    directory = parent;
  }
  const pkg = readJson(join(directory, 'package.json'));
  assert.equal(pkg.name, 'easywindowspack');
  const entry = pkg.exports['.'];
  const runtime = await import(pathToFileURL(resolve(directory, typeof entry === 'string' ? entry : entry.import)).href);
  assert.equal(typeof runtime.mountFrame, 'function');
  assert.equal(typeof runtime.getWindowApi, 'function');
  assert.equal(runtime.getWindowApi(), null);
});

test('Vite serves the frontend and builds portable desktop resources', async () => {
  const { default: config } = await import(pathToFileURL(join(frontend, 'vite.config.mjs')).href);
  assert.equal(resolve(config.root), resolve(frontend));
  assert.equal(config.base, './');
  assert.equal(resolve(config.root, config.build.outDir), join(root, 'output', 'frontend'));
});

test('application manifest and HTML point to an existing module entry', () => {
  const pkg = readJson(join(frontend, 'package.json'));
  assert.equal(pkg.type, 'module');
  assert.ok(pkg.dependencies?.easywindowspack, 'Declare the runtime dependency');
  assert.ok(['zh-CN', 'en'].includes(pkg.ewp?.language), 'Save a supported project language');
  const html = readFileSync(join(frontend, 'index.html'), 'utf8');
  const scripts = html.match(/<script\b[^>]*>/gi) ?? [];
  const entries = scripts.filter(tag => /\btype\s*=\s*["']module["']/i.test(tag))
    .map(tag => tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1]).filter(Boolean);
  assert.ok(entries.length, 'HTML must reference an application module');
  for (const entry of entries) {
    const path = resolve(frontend, entry.replace(/^\//, ''));
    assert.ok(statSync(path).isFile(), `Missing application entry: ${entry}`);
  }
});