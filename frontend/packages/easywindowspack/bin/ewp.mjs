#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';

export const HELP = `easywindowspack 0.1.0 (Node >=22.12)
Usage: ewp <command> [options]
  init                     Initialize the project's Python .venv
  dev [--web] [--no-open]   Vite + desktop; --web opens a browser only
      [--port <0..65535>]   Default: a dynamically assigned local port
  build [-w|--wheel]       Build EXE by default; -w selects wheel
        [-e|--exe]         Explicitly select EXE
             npm: npm run build -- -w (bare -w is npm workspace)
  wheel | exe | bundle     Delegate packaging to scripts/dev.py
  test                     Delegate tests to scripts/dev.py
  frontend:dev             Vite browser development
  frontend:build           Build frontend with frontend/vite.config.mjs
  frontend:preview         Preview the built frontend
  check                    Run Node runtime and CLI checks
  info | help              Show project paths or this help
Ctrl+C closes Vite and the desktop process tree.
`;

export function parseArgs(argv = []) {
  const args = [...argv];
  const command = args.shift() ?? 'help';
  if (['help', '--help', '-h'].includes(command) || args.includes('--help') || args.includes('-h')) return { command: 'help' };
  if (!['init', 'dev', 'build', 'wheel', 'exe', 'bundle', 'test', 'check', 'info', 'frontend:dev', 'frontend:build', 'frontend:preview'].includes(command)) {
    throw new Error(`Unknown command: ${command}. Use ewp help.`);
  }
  const parsed = { command, task: command, web: command.startsWith('frontend:'), open: true, port: 0 };
  // npm removes its own separator; direct ewp invocations may retain it.
  if (args[0] === '--') args.shift();
  let buildTarget;
  while (args.length) {
    const arg = args.shift();
    if (command === 'build' && ['-w', '--wheel', '-e', '--exe'].includes(arg)) {
      const target = ['-w', '--wheel'].includes(arg) ? 'wheel' : 'exe';
      if (buildTarget && buildTarget !== target) throw new Error('Choose either --wheel or --exe.');
      buildTarget = target;
    } else if (['dev', 'frontend:dev', 'frontend:preview'].includes(command) && arg === '--no-open') {
      parsed.open = false;
    } else if (command === 'dev' && arg === '--web') {
      parsed.web = true;
    } else if (['dev', 'frontend:dev', 'frontend:preview'].includes(command) && (arg === '--port' || arg.startsWith('--port='))) {
      const value = arg === '--port' ? args.shift() : arg.slice(7);
      if (!/^\d+$/.test(value ?? '') || Number(value) > 65535) throw new Error('--port must be an integer from 0 to 65535.');
      parsed.port = Number(value);
    } else throw new Error(`Unknown option for ${command}: ${arg}. Use ewp help.`);
  }
  if (command === 'build') parsed.task = buildTarget ?? 'exe';
  return parsed;
}

export function findProjectRoot(start = process.cwd()) {
  let candidate = resolve(start);
  for (;;) {
    if (existsSync(join(candidate, 'scripts', 'dev.py'))) return candidate;
    const parent = dirname(candidate);
    if (parent === candidate) throw new Error('Project root not found: scripts/dev.py is required. Run ewp inside an initialized project.');
    candidate = parent;
  }
}

export function selectPython(root, { platform = process.platform, exists = existsSync, probe = spawnSync, allowSystem = false } = {}) {
  const venv = join(root, '.venv', platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  if (exists(venv) && exists(join(root, '.venv/pyvenv.cfg'))) return { command: venv, args: [] };
  if (!allowSystem || exists(join(root, '.venv'))) {
    throw new Error('Missing or invalid project .venv. Run npm run init before desktop development, tests or packaging. Check an existing invalid .venv before retrying.');
  }
  const candidates = platform === 'win32'
    ? [{ command: 'py', args: ['-3'] }, { command: 'python', args: [] }]
    : [{ command: 'python3', args: [] }, { command: 'python', args: [] }];
  for (const candidate of candidates) {
    const result = probe(candidate.command, [...candidate.args, '--version'], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
    const version = /Python (\d+)\.(\d+)/.exec(`${result.stdout ?? ''}${result.stderr ?? ''}`);
    if (!result.error && result.status === 0 && version && (Number(version[1]) > 3 || (Number(version[1]) === 3 && Number(version[2]) >= 10))) return candidate;
  }
  throw new Error('Python 3 is missing. Install Python 3.10+ (Windows: enable the py launcher), then run npm run init.');
}

// .cmd/.bat cannot be spawned as executables. All tokens are quoted, shell
// expansion is disabled, and expansion/quote characters are rejected.
export function spawnSpec(command, args, { platform = process.platform, env = process.env } = {}) {
  if (platform !== 'win32' || !/\.(cmd|bat)$/i.test(command)) return { command, args, options: {} };
  const quote = value => {
    const token = String(value);
    if (/["%\r\n\0]/.test(token)) throw new Error('Unsupported character in Windows batch argument.');
    return `"${token}"`;
  };
  args.forEach(quote);
  quote(command);
  if (!/[\\/]/.test(command)) {
    const pathValue = Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1] ?? '';
    const found = pathValue.split(';').map(entry => join(entry.replace(/^"|"$/g, ''), command)).find(candidate => existsSync(candidate));
    if (!found) throw new Error(`Cannot locate ${command} on PATH. Install Node.js/npm and reopen the terminal.`);
    command = resolve(found);
  }
  return {
    command: env.ComSpec || env.COMSPEC || join(env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe'),
    args: ['/d', '/s', '/v:off', '/c', `"${[command, ...args].map(quote).join(' ')}"`],
    options: { windowsVerbatimArguments: true }
  };
}

export function launch(command, args, options = {}) {
  const spec = spawnSpec(command, args, { env: options.env ?? process.env });
  return spawn(spec.command, spec.args, { ...options, ...spec.options, shell: false });
}

async function withDeadline(operation, label, timeout = 10000, signal) {
  let timer;
  let abort;
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeout}ms.`)), timeout);
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

async function closeDevServer(server) {
  if (!server) return;
  // Stop scheduling speculative transforms, then let the existing import crawl
  // finish before closing its watcher. Vite can otherwise add dependency file
  // watches after close() has already disposed the watcher.
  if (server.config?.server) server.config.server.preTransformRequests = false;
  try { await withDeadline(server.waitForRequestsIdle?.(), 'Vite request drain', 1000); }
  catch { /* A stuck transform must not prevent the remaining cleanup. */ }
  const closeHttp = () => new Promise((resolveClose, reject) => {
    server.httpServer.close(error => error && error.code !== 'ERR_SERVER_NOT_RUNNING' ? reject(error) : resolveClose());
  });
  try {
    await withDeadline(typeof server.close === 'function' ? server.close() : closeHttp(), 'Vite shutdown', 3000);
  } catch (error) {
    // A plugin's close hook can stall; still release the listening socket,
    // websocket clients and file watcher owned by this dev session.
    server.httpServer?.closeAllConnections?.();
    await Promise.allSettled([
      withDeadline(server.ws?.close(), 'Vite websocket shutdown', 1000),
      withDeadline(server.watcher?.close(), 'Vite watcher shutdown', 1000),
      server.httpServer ? withDeadline(closeHttp(), 'Vite HTTP shutdown', 1000) : Promise.resolve()
    ]);
    throw error;
  }
}

export async function stopProcessTree(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    await new Promise(resolveStop => {
      const killer = spawn(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      const finish = () => {
        clearTimeout(timer);
        killer.off('error', fallback);
        killer.off('exit', finish);
        resolveStop();
      };
      const fallback = () => { killer.kill(); child.kill(); finish(); };
      const timer = setTimeout(fallback, 3000);
      killer.once('error', fallback);
      killer.once('exit', finish);
    });
  } else {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
  }
}

export function pythonEnvironment(env = process.env) {
  const clean = Object.fromEntries(Object.entries(env).filter(([key]) => !['PYTHONHOME', 'PYTHONPATH'].includes(key.toUpperCase())));
  return { ...clean, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' };
}

async function runChild(command, args, options) {
  const child = launch(command, args, options);
  const interrupt = () => { void stopProcessTree(child); };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  try {
    return await new Promise((resolveExit, reject) => {
      child.once('error', error => reject(new Error(`Cannot start ${command}: ${error.message}`)));
      child.once('exit', (code, signal) => resolveExit(code ?? (signal ? 130 : 1)));
    });
  } finally {
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
  }
}

async function runPython(root, task) {
  const python = selectPython(root, { allowSystem: task === 'init' });
  return runChild(python.command, [...python.args, '-u', join(root, 'scripts/dev.py'), task], {
    cwd: root, stdio: 'inherit', detached: process.platform !== 'win32', env: pythonEnvironment()
  });
}

export function configPath(root) {
  const config = join(root, 'frontend/vite.config.mjs');
  if (!existsSync(config)) throw new Error('frontend/vite.config.mjs is missing. Initialize the frontend before running this command.');
  return config;
}

async function viteApi() {
  try { return await import('vite'); }
  catch (error) { throw new Error(`Vite is missing or unavailable. Run npm install (Node >=22.12 required). ${error.message}`); }
}

export async function chooseLocalPort(port = 0) {
  if (port !== 0) return port;
  // Vite treats config port=0 as its default port. Ask the OS explicitly first.
  return new Promise((resolvePort, reject) => {
    const reservation = createNetServer();
    const controller = new AbortController();
    let settled = false;
    const finish = (error, allocated) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reservation.off('error', fail);
      controller.abort();
      if (error) reject(error);
      else resolvePort(allocated);
    };
    const fail = error => finish(error);
    const timer = setTimeout(() => finish(new Error('Local port allocation timed out after 3000ms.')), 3000);
    reservation.once('error', fail);
    reservation.listen({ port: 0, host: '127.0.0.1', signal: controller.signal }, () => {
      const allocated = reservation.address().port;
      reservation.close(error => finish(error, allocated));
    });
  });
}

export async function runDev(root, options) {
  const desktop = !options.web;
  const python = desktop ? selectPython(root) : null;
  if (desktop && !existsSync(join(root, 'backend/src/demo.py'))) throw new Error('Desktop demo missing: backend/src/demo.py. Use --web for browser development.');
  if (options.command === 'frontend:preview' && !existsSync(join(root, 'output/frontend/index.html'))) {
    throw new Error('Frontend build is missing. Run npm run frontend:build before preview.');
  }
  const startup = new AbortController();
  let server;
  let child;
  let closing;
  let interrupted = false;
  const close = () => closing ??= (async () => {
    try { await stopProcessTree(child); }
    finally { await closeDevServer(server); }
  })();
  let resolveEnd;
  let rejectEnd;
  const ended = new Promise((resolveExit, reject) => { resolveEnd = resolveExit; rejectEnd = reject; });
  // Child/server errors may arrive before startup finishes awaiting readiness.
  // Keep the eventual rejection handled until we reach the session wait.
  void ended.catch(() => {});
  const interrupt = () => {
    interrupted = true;
    startup.abort(new Error('Development startup interrupted.'));
    void close().then(() => resolveEnd(130), rejectEnd);
  };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  options.signal?.addEventListener('abort', interrupt, { once: true });
  if (options.signal?.aborted) interrupt();
  let failure;
  try {
    const { createServer, preview } = await withDeadline(viteApi(), 'Vite import', 10000, startup.signal);
    const port = await withDeadline(chooseLocalPort(options.port), 'Local port allocation', 3000, startup.signal);
    const serverOptions = { host: '127.0.0.1', port, strictPort: options.port !== 0, open: options.web && options.open };
    const capture = instance => {
      server = instance;
      // A slow plugin may finish buildStart after readiness times out. A late
      // HTTP listen must not reopen the port after the session was disposed.
      instance.httpServer?.once('listening', () => {
        if (startup.signal.aborted || closing) {
          instance.httpServer.closeAllConnections?.();
          instance.httpServer.close();
        }
      });
      if (startup.signal.aborted || closing) {
        void closeDevServer(instance).catch(error => console.error(`ewp: ${error.message}`));
        throw startup.signal.reason ?? new Error('Development session is closing.');
      }
    };
    const config = {
      configFile: configPath(root),
      // Capture ownership before user configure hooks run: creation itself can
      // fail or time out after Vite has already allocated watchers/sockets.
      plugins: [{ name: 'ewp-dev-lifecycle', enforce: 'pre', configureServer: capture, configurePreviewServer: capture }]
    };
    const creation = options.command === 'frontend:preview'
      ? preview({ ...config, preview: serverOptions })
      : createServer({ ...config, server: serverOptions });
    // If creation completes after cancellation, dispose that late instance too.
    void creation.then(instance => {
      if (startup.signal.aborted || closing) return closeDevServer(instance);
    }).catch(error => {
      if (startup.signal.aborted || closing) console.error(`ewp: ${error.message}`);
    });
    server = await withDeadline(creation, 'Vite creation', 10000, startup.signal);
    if (options.command !== 'frontend:preview') await withDeadline(server.listen(), 'Vite readiness', 10000, startup.signal);
    const url = server.resolvedUrls?.local?.[0];
    if (!url) throw new Error('Vite did not provide a local ready URL.');
    console.log(`Frontend ready: ${url}`);
    if (desktop && !interrupted) {
      child = launch(python.command, [...python.args, join(root, 'backend/src/demo.py'), '--debug'], {
        cwd: root, stdio: 'inherit', detached: process.platform !== 'win32',
        env: { ...pythonEnvironment(), EWP_DEV_URL: url }
      });
      child.once('error', error => rejectEnd(new Error(`Cannot start desktop: ${error.message}. Run npm run init, or use --web.`)));
      child.once('exit', (code, signal) => {
        if (code) console.error('Desktop exited with an error. Run npm run init to install pywebview and the project dependencies; use --web for a browser preview.');
        resolveEnd(code ?? (signal ? 130 : 0));
      });
    }
    return await ended;
  } catch (error) {
    if (interrupted) return 130;
    failure = error;
    throw error;
  } finally {
    startup.abort(new Error('Development session is closing.'));
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
    options.signal?.removeEventListener('abort', interrupt);
    try { await close(); }
    catch (error) {
      if (!failure) throw error;
      console.error(`ewp: cleanup failed: ${error.message}`);
    }
  }
}

export async function main(argv = process.argv.slice(2)) {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 12)) throw new Error('easywindowspack requires Node >=22.12.');
  if (argv[0] === 'create') {
    const { main: create } = await import('create-ewp/cli');
    return create(argv.slice(1));
  }
  const options = parseArgs(argv);
  if (options.command === 'help') { console.log(HELP); return 0; }
  const root = findProjectRoot();
  if (options.command === 'info') {
    console.log(`easywindowspack 0.1.0\nNode: ${process.version}\nProject: ${root}\nFrontend: ${join(root, 'frontend')}\nConfig: ${configPath(root)}\nPython venv: ${join(root, '.venv')}\nDefault build: EXE`);
    return 0;
  }
  if (options.command === 'check') {
    return runChild(process.execPath, ['--test', join(root, 'tests/npm-runtime.test.mjs')], {
      cwd: root, stdio: 'inherit', detached: process.platform !== 'win32'
    });
  }
  if (['dev', 'frontend:dev', 'frontend:preview'].includes(options.command)) return runDev(root, options);
  if (options.command === 'frontend:build') {
    const { build } = await viteApi();
    await build({ configFile: configPath(root) });
    return 0;
  }
  return runPython(root, options.task);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code; }, error => {
    console.error(`ewp: ${error.message}`);
    process.exitCode = Number.isInteger(error.exitCode) && error.exitCode > 0 ? error.exitCode : 1;
  });
}