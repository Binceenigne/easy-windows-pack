import nodeTest from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { runInNewContext } from 'node:vm';
import { createRequire } from 'node:module';
import { parseArgs, findProjectRoot, configPath, selectPython, pythonEnvironment, spawnSpec, chooseLocalPort, runDev, main } from '../frontend/packages/easywindowspack/bin/ewp.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const packageRoot = join(root, 'frontend/packages/easywindowspack');
const frontendRequire = createRequire(new URL('../frontend/package.json', import.meta.url));

const test = (name, options, body) => typeof options === 'function'
  ? nodeTest(name, { timeout: 15000 }, options)
  : nodeTest(name, { timeout: 15000, ...options }, body);

async function deadline(operation, label, signal, timeout = 3000) {
  let timer;
  let abort;
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeout}ms`)), timeout);
        if (signal) {
          abort = () => reject(signal.reason);
          if (signal.aborted) abort();
          else signal.addEventListener('abort', abort, { once: true });
        }
      })
    ]);
  } finally {
    clearTimeout(timer);
    if (abort) signal.removeEventListener('abort', abort);
  }
}

async function fetchText(url, signal) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  const timer = setTimeout(() => controller.abort(new Error(`HTTP request timed out: ${url}`)), 3000);
  try {
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
    const response = await fetch(url, { signal: controller.signal, headers: { Connection: 'close' } });
    return { status: response.status, text: await response.text() };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    controller.abort();
  }
}

async function closeServer(server) {
  if (!server) return;
  try {
    await deadline(server.close(), 'Vite close');
  } finally {
    server.httpServer?.closeAllConnections?.();
    if (server.httpServer?.listening) {
      await deadline(new Promise((resolveClose, reject) => server.httpServer.close(error => error ? reject(error) : resolveClose())), 'HTTP close');
    }
    await deadline(server.watcher?.close(), 'Watcher close');
  }
}

async function expectDevFailure(directory, options, pattern, signal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Dev failure check timed out')), 5000);
  try {
    await assert.rejects(runDev(directory, {
      ...options, signal: AbortSignal.any([signal, controller.signal])
    }), pattern);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

test('build defaults to EXE and explicitly accepts wheel and EXE aliases', () => {
  assert.equal(parseArgs(['build']).task, 'exe');
  for (const flag of ['-w', '--wheel']) assert.equal(parseArgs(['build', flag]).task, 'wheel');
  assert.equal(parseArgs(['build', '--', '-w']).task, 'wheel');
  for (const flag of ['-e', '--exe']) assert.equal(parseArgs(['build', flag]).task, 'exe');
  assert.throws(() => parseArgs(['build', '--wheel', '--exe']), /either/);
  assert.throws(() => parseArgs(['build', '--unknown']), /Unknown option/);
  assert.throws(() => parseArgs(['publish']), /Unknown command/);
});

test('dev opens a browser only for --web and validates the port', () => {
  assert.equal(parseArgs(['dev']).web, false);
  assert.equal(parseArgs(['dev', '--web', '--no-open']).open, false);
  assert.equal(parseArgs(['frontend:dev']).web, true);
  assert.equal(parseArgs(['dev', '--port', '0']).port, 0);
  assert.equal(parseArgs(['dev', '--port=65535']).port, 65535);
  for (const value of ['-1', '65536', 'abc', '2.1', '']) assert.throws(() => parseArgs(['dev', '--port', value]), /integer/);
  assert.throws(() => parseArgs(['dev', '--port']), /integer/);
  assert.throws(() => parseArgs(['test', '--web']), /Unknown option/);
});

test('project discovery ascends from nested directories and never depends on CLI installation location', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ewp-project-'));
  try {
    mkdirSync(join(directory, 'scripts'));
    writeFileSync(join(directory, 'scripts/dev.py'), '');
    mkdirSync(join(directory, 'frontend/src'), { recursive: true });
    writeFileSync(join(directory, 'frontend/vite.config.mjs'), 'export default {};');
    assert.equal(findProjectRoot(directory), resolve(directory));
    assert.equal(findProjectRoot(join(directory, 'frontend')), resolve(directory));
    assert.equal(findProjectRoot(join(directory, 'frontend/src')), resolve(directory));
    assert.equal(configPath(findProjectRoot(join(directory, 'frontend/src'))), join(directory, 'frontend/vite.config.mjs'));
    assert.throws(() => findProjectRoot(tmpdir()), /scripts\/dev.py/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('Python tasks require project .venv and only initialization can fall back to system Python', () => {
  const probes = [];
  const probe = (command, args) => {
    probes.push([command, args]);
    return command === 'python' ? { status: 0, stdout: 'Python 3.12.0' } : { status: 1 };
  };
  const venv = selectPython(root, { platform: 'win32', exists: () => true, probe });
  assert.match(venv.command, /Scripts[\\/]python\.exe$/);
  assert.equal(probes.length, 0);
  assert.throws(() => selectPython(root, { platform: 'win32', exists: () => false, probe }), /npm run init/);
  assert.equal(probes.length, 0);
  assert.deepEqual(selectPython(root, { platform: 'win32', exists: () => false, probe, allowSystem: true }), { command: 'python', args: [] });
  assert.deepEqual(probes, [['py', ['-3', '--version']], ['python', ['--version']]]);
  assert.deepEqual(selectPython(root, { platform: 'win32', exists: () => false, allowSystem: true, probe: () => ({ status: 0, stdout: 'Python 3.11' }) }), { command: 'py', args: ['-3'] });
  assert.throws(() => selectPython(root, { exists: () => false, allowSystem: true, probe: () => ({ status: 1 }) }), /npm run init/);
  assert.throws(() => selectPython(root, { exists: () => false, allowSystem: true, probe: () => ({ status: 0, stdout: 'Python 3.9' }) }), /Python 3.10/);
  assert.throws(() => selectPython(root, {
    platform: 'win32', allowSystem: true,
    exists: path => path === join(root, '.venv') || path.endsWith('python.exe'),
    probe: () => { throw new Error('Invalid venv must not fall back to global Python'); }
  }), /invalid project .venv/);
  assert.match(selectPython(root, { platform: 'linux', exists: () => true }).command, /bin[\\/]python$/);
});

test('Python child environment isolates foreign imports without mutating the parent', () => {
  const source = { Path: 'node-bin', PYTHONHOME: 'foreign', PythonPath: 'foreign-code', EWP_DEV_URL: 'http://127.0.0.1:1234/' };
  const env = pythonEnvironment(source);
  assert.equal(env.PYTHONHOME, undefined);
  assert.equal(env.PythonPath, undefined);
  assert.equal(env.Path, source.Path);
  assert.equal(env.EWP_DEV_URL, source.EWP_DEV_URL);
  assert.equal(env.PYTHONUTF8, '1');
  assert.equal(source.PYTHONHOME, 'foreign');
});

test('Windows batch commands use ComSpec with every token quoted and unsafe expansion rejected', () => {
  const spec = spawnSpec('C:\\Program Files\\nodejs\\npm.cmd', ['run', 'frontend:build'], { platform: 'win32', env: { ComSpec: 'C:\\Windows\\System32\\cmd.exe' } });
  assert.equal(spec.command, 'C:\\Windows\\System32\\cmd.exe');
  assert.deepEqual(spec.args.slice(0, 4), ['/d', '/s', '/v:off', '/c']);
  assert.equal(spec.options.windowsVerbatimArguments, true);
  assert.match(spec.args[4], /^""C:\\Program Files\\nodejs\\npm.cmd" "run" "frontend:build""$/);
  for (const arg of ['%PATH%', '" & echo injected', 'a\nb']) assert.throws(() => spawnSpec('npm.cmd', [arg], { platform: 'win32' }), /Unsupported/);
  assert.deepEqual(spawnSpec('python.exe', ['scripts/dev.py', 'wheel'], { platform: 'win32' }).args, ['scripts/dev.py', 'wheel']);
});

test('Windows npm.cmd actually executes without ENOENT', { skip: process.platform !== 'win32' }, () => {
  const spec = spawnSpec('npm.cmd', ['--version']);
  const result = spawnSync(spec.command, spec.args, { ...spec.options, encoding: 'utf8', windowsHide: true, timeout: 10000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\d+\.\d+\.\d+/);
});

test('help runs outside a project without probing Python', async t => {
  const original = process.cwd();
  const log = console.log;
  let output = '';
  try {
    process.chdir(tmpdir());
    console.log = value => { output += value; };
    assert.equal(await deadline(main(['--help']), 'CLI help', t.signal), 0);
    assert.match(output, /Build EXE by default/);
  } finally { process.chdir(original); console.log = log; }
});

test('published entry points and optional framework peers match the runtime contract', () => {
  const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'easywindowspack');
  assert.equal(pkg.version, '0.1.0');
  assert.equal(pkg.license, 'MIT');
  assert.equal(pkg.engines.node, '>=22.12.0');
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.bin.ewp, './bin/ewp.mjs');
  for (const name of ['.', './frame.css', './desktop.css', './desktop-components.js', './desktop-updates.js']) assert.ok(pkg.exports[name]);
  for (const name of ['vue', 'react']) {
    assert.equal(pkg.peerDependenciesMeta[name].optional, true);
    assert.equal(pkg.dependencies[name], undefined);
  }
});

test('workspace scripts delegate to the Node CLI and preserve npm build argument forwarding', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'frontend/package.json'), 'utf8'));
  for (const path of ['package.json', 'package-lock.json', 'vite.config.mjs', 'node_modules', 'packages']) {
    assert.equal(existsSync(join(root, path)), false, `Root must not contain ${path}`);
  }
  assert.equal(pkg.private, true);
  assert.deepEqual(pkg.workspaces, ['packages/*']);
  assert.match(pkg.devDependencies.vite, /^\^7\./);
  for (const name of ['init', 'dev', 'build', 'build:wheel', 'build:exe', 'bundle', 'test', 'frontend:build', 'frontend:dev', 'frontend:preview', 'check']) {
    assert.match(pkg.scripts[name], /node packages\/easywindowspack\/bin\/ewp\.mjs /, name);
  }
  assert.equal(pkg.scripts.build, 'node packages/easywindowspack/bin/ewp.mjs build');
  assert.equal(pkg.scripts['prepare:npm'], 'node ../scripts/prepare-npm.mjs');
  assert.match(pkg.scripts['pack:npm'], /--pack-destination \.\.\/output\/npm/);
  assert.match(pkg.scripts['test:npm'], /\.\.\/tests\/npm-runtime.test.mjs/);
});

test('generated npm assets resolve every export and share the original frame template', { skip: !existsSync(join(packageRoot, 'assets/frame-template.mjs')) && 'Run npm run prepare:npm first.' }, async t => {
  const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  for (const entry of Object.values(pkg.exports)) {
    for (const file of typeof entry === 'string' ? [entry] : Object.values(entry)) assert.ok(existsSync(join(packageRoot, file)), `Missing export: ${file}`);
  }
  const { frameTemplate } = await deadline(import('../frontend/packages/easywindowspack/assets/frame-template.mjs'), 'Template import', t.signal);
  assert.equal(frameTemplate.trim(), readFileSync(join(root, 'frontend/components/titlebar/window-frame.html'), 'utf8').trim());
});

test('Vite picks a dynamic local port and denies project/backend files', async t => {
  const { createServer } = await deadline(import(pathToFileURL(frontendRequire.resolve('vite')).href), 'Vite import', t.signal);
  const port = await deadline(chooseLocalPort(0), 'Local port allocation', t.signal);
  assert.ok(port > 0 && port <= 65535);
  assert.equal(await deadline(chooseLocalPort(8080), 'Fixed port selection', t.signal), 8080);
  let server;
  let closing = false;
  const creation = createServer({
    configFile: join(root, 'frontend/vite.config.mjs'),
    // This test checks serving/security, not speculative dependency warmup.
    // Vite can otherwise add dependency watchers after server.close() returns.
    server: { open: false, port, strictPort: true, preTransformRequests: false },
    optimizeDeps: { noDiscovery: true, include: [] },
    logLevel: 'silent'
  }).then(async instance => {
    server = instance;
    if (closing || t.signal.aborted) await closeServer(instance);
    return instance;
  });
  try {
    server = await deadline(creation, 'Vite creation', t.signal);
    await deadline(server.listen(), 'Vite listen', t.signal);
    const url = server.resolvedUrls.local[0];
    assert.equal(url, `http://127.0.0.1:${port}/`);
    assert.equal((await fetchText(new URL('src/demo.css', url), t.signal)).status, 200);
    for (const path of ['backend/src/demo.py', 'scripts/dev.py', 'package.json', '.git/config']) {
      const response = await fetchText(new URL(`/@fs/${join(root, path).replaceAll('\\', '/')}`, url), t.signal);
      assert.ok([403, 404].includes(response.status), `Private path must not be served: ${path}`);
      const relative = await fetchText(new URL(path, url), t.signal);
      assert.ok([403, 404].includes(relative.status), `Root path must not be served: ${path}`);
    }
    assert.equal((await fetchText(new URL('src/components.html', url), t.signal)).status, 200);
    if (existsSync(join(packageRoot, 'assets/desktop-components.js'))) {
      const script = await fetchText(new URL('src/components-entry.js', url), t.signal);
      assert.equal(script.status, 200, script.text);
    }
    // Vite normalizes relative base to '/' while serving; builds retain './'.
    assert.equal(server.config.base, '/');
    assert.equal(resolve(server.config.build.outDir), resolve(root, 'output/frontend'));
    assert.deepEqual(Object.keys(server.config.build.rollupOptions.input), ['index', 'components']);
  } finally {
    closing = true;
    await closeServer(server);
  }

  // A failed dev startup must release its watchers and signal handlers as well
  // as the listening socket. Keep these regressions within this integration test.
  const signals = ['SIGINT', 'SIGTERM'].map(name => process.listenerCount(name));
  const occupied = createNetServer();
  try {
    await deadline(new Promise((resolveListen, reject) => {
      occupied.once('error', reject);
      occupied.listen({ port, host: '127.0.0.1', signal: t.signal }, resolveListen);
    }), 'Rebind released port', t.signal);
    await expectDevFailure(root, { command: 'dev', web: true, open: false, port }, /already in use|EADDRINUSE/, t.signal);
  } finally {
    if (occupied.listening) await deadline(new Promise((resolveClose, reject) => occupied.close(error => error ? reject(error) : resolveClose())), 'Reservation close');
  }
  assert.deepEqual(['SIGINT', 'SIGTERM'].map(name => process.listenerCount(name)), signals);

  const directory = mkdtempSync(join(tmpdir(), 'ewp-dev-failure-'));
  try {
    mkdirSync(join(directory, 'frontend'));
    writeFileSync(join(directory, 'frontend/vite.config.mjs'), `
      import { writeFileSync } from 'node:fs';
      export default {
        root: ${JSON.stringify(join(directory, 'frontend'))},
        logLevel: 'silent',
        plugins: [{
          name: 'startup-failure',
          buildStart() { throw new Error('forced ready failure'); },
          closeBundle() { writeFileSync(${JSON.stringify(join(directory, 'closed'))}, 'closed'); }
        }]
      };
    `);
    await expectDevFailure(directory, { command: 'dev', web: true, open: false, port: 0 }, /forced ready failure/, t.signal);
    assert.ok(existsSync(join(directory, 'closed')), 'Failed readiness must run Vite cleanup hooks');
    assert.deepEqual(['SIGINT', 'SIGTERM'].map(name => process.listenerCount(name)), signals);

    rmSync(join(directory, 'closed'));
    writeFileSync(join(directory, 'frontend/vite.config.mjs'), readFileSync(join(directory, 'frontend/vite.config.mjs'), 'utf8')
      .replace('buildStart() { throw', 'configureServer() { throw')
      .replace('forced ready failure', 'forced creation failure'));
    await expectDevFailure(directory, { command: 'dev', web: true, open: false, port: 0 }, /forced creation failure/, t.signal);
    assert.ok(existsSync(join(directory, 'closed')), 'Failed creation must clean the captured Vite instance');
    assert.deepEqual(['SIGINT', 'SIGTERM'].map(name => process.listenerCount(name)), signals);
  } finally { rmSync(directory, { recursive: true, force: true }); }

  const controller = new AbortController();
  const log = console.log;
  let ready;
  const readyUrl = new Promise(resolveReady => { ready = resolveReady; });
  console.log = (value, ...args) => {
    if (String(value).startsWith('Frontend ready: ')) ready(String(value).slice('Frontend ready: '.length));
    else log(value, ...args);
  };
  const session = runDev(root, { command: 'dev', web: true, open: false, port: 0, signal: AbortSignal.any([t.signal, controller.signal]) });
  void session.catch(() => {});
  try {
    const url = await deadline(Promise.race([readyUrl, session.then(() => { throw new Error('Dev exited before ready'); })]), 'Real dev readiness', t.signal, 5000);
    const response = await fetchText(new URL('src/components-entry.js', url), t.signal);
    assert.equal(response.status, 200, response.text);
  } finally {
    controller.abort();
    try { assert.equal(await deadline(session, 'Real dev shutdown', undefined, 5000), 130); }
    finally { console.log = log; }
  }
  assert.deepEqual(['SIGINT', 'SIGTERM'].map(name => process.listenerCount(name)), signals);
});

test('mount runtime reuses the shared template, remounts safely and exposes bridge methods', async t => {
  const created = [];
  const bound = new Set();
  const calls = [];
  const bridge = {
    bind(frame, options) { bound.add(frame); calls.push(['bind', options]); },
    unbind(frame) { bound.delete(frame); },
    setWindowStyle(style) { calls.push(['style', style]); },
    setTitleBarMode(mode) { return Promise.resolve({ ok: true, mode }); },
    call(method, ...args) { return Promise.resolve({ method, args }); },
    isSupportedResizeDirection(direction) { return direction === 'left'; }
  };
  let host;
  const document = {
    querySelector() { return host; },
    createElement(name) {
      assert.equal(name, 'template');
      const content = { children: [], replaceChildren(...nodes) { this.children = nodes; }, textContent: '' };
      const title = { textContent: '' };
      const frame = {
        dataset: {}, removed: false,
        removeAttribute(name) { assert.equal(name, 'id'); },
        querySelector(selector) { return selector === '[data-ewp-content]' ? content : selector === '[data-ewp-title]' ? title : null; },
        remove() { this.removed = true; }
      };
      const template = { innerHTML: '', content: { querySelector: () => frame } };
      created.push({ template, frame, title, content });
      return template;
    }
  };
  host = { ownerDocument: document, append() {} };
  // Exercise the authored runtime without needing generated assets or a DOM package.
  const source = readFileSync(join(packageRoot, 'index.mjs'), 'utf8')
    .replace(/^import .*;\r?$/gm, '')
    .replace(/export function /g, 'function ');
  const runtime = runInNewContext(`${source}\n({ mountFrame, setWindowStyle, setTitleBarMode, call, isSupportedResizeDirection });`, {
    document, window: { easyWindowsPack: bridge }, frameTemplate: '<shared-frame />'
  });
  const node = { nodeType: 1 };
  const first = runtime.mountFrame(host, { content: node, title: 'Example', windowStyle: 'macos' });
  assert.equal(created[0].template.innerHTML, '<shared-frame />');
  assert.equal(first.content.children[0], node);
  assert.equal(bound.size, 1);
  first.update({ title: '', mode: 'minimal' });
  assert.equal(created[0].title.textContent, '');
  assert.equal(first.content.children[0], node);
  assert.equal(calls.at(-1)[1].mode, 'minimal');
  const second = runtime.mountFrame(host, { content: '<b>plain text</b>' });
  assert.equal(first.frame.removed, true);
  assert.equal(second.content.textContent, '<b>plain text</b>');
  assert.equal(bound.size, 1);
  second.remove();
  second.dispose();
  assert.equal(bound.size, 0);
  assert.equal(second.frame.removed, true);
  runtime.setWindowStyle('windows');
  assert.equal(calls.at(-1)[1], 'windows');
  assert.equal((await deadline(runtime.setTitleBarMode('native'), 'Titlebar bridge', t.signal)).mode, 'native');
  assert.equal((await deadline(runtime.call('host_action', 1), 'Host bridge', t.signal)).args[0], 1);
  assert.equal(runtime.isSupportedResizeDirection('left'), true);
  assert.throws(() => runtime.mountFrame(null), /container/);
});

test('frame unbind cancels DOM actions and pending callbacks while rebind remains single-dispatch', async t => {
  const button = new EventTarget();
  button.dataset = { ewpAction: 'maximize' };
  const frame = {
    dataset: {},
    classList: { contains: () => false, toggle() {} },
    querySelector: () => null,
    querySelectorAll: selector => selector === '[data-ewp-action]' ? [button] : []
  };
  let calls = 0;
  let errors = 0;
  let resolveCall;
  const window = { pywebview: { api: { window_action: () => { calls++; return new Promise(resolveResult => { resolveCall = resolveResult; }); } } } };
  runInNewContext(readFileSync(join(root, 'frontend/frame/ewpframe/window-frame.js'), 'utf8'), {
    window, document: { querySelectorAll: () => [] }, AbortController
  });
  const api = window.easyWindowsPack;
  api.bind(frame, { onError: () => errors++ });
  api.bind(frame, { onError: () => errors++ });
  button.dispatchEvent(new Event('click'));
  assert.equal(calls, 1);
  api.unbind(frame);
  resolveCall({ ok: false, error: 'late' });
  await deadline(new Promise(resolveMicrotasks => setImmediate(resolveMicrotasks)), 'Frame callbacks', t.signal);
  assert.equal(errors, 0);
  button.dispatchEvent(new Event('click'));
  assert.equal(calls, 1);
  assert.equal(frame.dataset.ewpBound, undefined);
  api.bind(frame);
  button.dispatchEvent(new Event('click'));
  assert.equal(calls, 2);
  api.unbind(frame);
  resolveCall({ ok: true });
});