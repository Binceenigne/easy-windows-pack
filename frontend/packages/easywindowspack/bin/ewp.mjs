#!/usr/bin/env node
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { createInterface } from 'node:readline/promises';
import { VERSION, helpText, languageArgs, text, withLanguage } from '../language.mjs';

export const HELP = helpText();
const ALIASES = { browser: 'frontend:dev', frontend: 'frontend:build', preview: 'frontend:preview', 'build:wheel': 'wheel', 'build:exe': 'exe', 'full-build': 'build:all' };

export function parseArgs(argv = [], context = {}) {
  const { args, language } = languageArgs(argv, context);
  return withLanguage(language, () => parseCommand(args, language));
}

function parseCommand(args, language) {
  while (args[0] === '--') args.shift();
  const requested = args.shift() ?? 'help';
  const command = ALIASES[requested] ?? requested;
  if (command === 'create') return { command, args, language };
  if (['help', '--help', '-h'].includes(command) || args.includes('--help') || args.includes('-h')) return { command: 'help' };
  if (['version', '--version', '-v', '-V'].includes(command)) return { command: 'version' };
  if (!['menu', 'init', 'dev', 'demo', 'build', 'build:all', 'wheel', 'exe', 'bundle', 'test', 'check', 'info', 'frontend:dev', 'frontend:build', 'frontend:preview'].includes(command)) {
    throw new Error(text(`未知命令：${command}。请使用 ewp help。`, `Unknown command: ${command}. Use ewp help.`));
  }
  const parsed = { command, task: command, web: command.startsWith('frontend:'), open: true, port: 0 };
  if (command === 'build:all') parsed.task = 'full-build';
  // npm removes its own separator; direct ewp invocations may retain it.
  if (args[0] === '--') args.shift();
  let buildTarget;
  while (args.length) {
    const arg = args.shift();
    if (command === 'build' && ['-w', '--wheel', '-e', '--exe', '--all'].includes(arg)) {
      const target = arg === '--all' ? 'full-build' : ['-w', '--wheel'].includes(arg) ? 'wheel' : 'exe';
      if (buildTarget && buildTarget !== target) throw new Error(text('请只选择 --wheel、--exe 或 --all 中的一种。', 'Choose either --wheel, --exe or --all.'));
      buildTarget = target;
    } else if (command === 'demo' && arg === '--debug') {
      parsed.debug = true;
    } else if (['dev', 'frontend:dev', 'frontend:preview'].includes(command) && arg === '--no-open') {
      parsed.open = false;
    } else if (command === 'dev' && arg === '--web') {
      parsed.web = true;
    } else if (['dev', 'frontend:dev', 'frontend:preview'].includes(command) && (arg === '--port' || arg.startsWith('--port='))) {
      const value = arg === '--port' ? args.shift() : arg.slice(7);
      if (!/^\d+$/.test(value ?? '') || Number(value) > 65535) throw new Error(text('--port 必须是 0 到 65535 之间的整数。', '--port must be an integer from 0 to 65535.'));
      parsed.port = Number(value);
    } else throw new Error(text(`${command} 的未知参数：${arg}。请使用 ewp help。`, `Unknown option for ${command}: ${arg}. Use ewp help.`));
  }
  if (command === 'build') parsed.task = buildTarget ?? 'exe';
  return parsed;
}

export function findProjectRoot(start = process.cwd()) {
  let candidate = resolve(start);
  for (;;) {
    if (existsSync(join(candidate, 'scripts', 'dev.py'))) return candidate;
    const parent = dirname(candidate);
    if (parent === candidate) throw new Error(text('未找到项目根目录：需要 scripts/dev.py。请在已创建的项目内运行 ewp。', 'Project root not found: scripts/dev.py is required. Run ewp inside an initialized project.'));
    candidate = parent;
  }
}

export function selectPython(root, { platform = process.platform, exists = existsSync, probe = spawnSync, allowSystem = false } = {}) {
  const venv = join(root, '.venv', platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  if (exists(venv) && exists(join(root, '.venv/pyvenv.cfg'))) return { command: venv, args: [] };
  if (!allowSystem || exists(join(root, '.venv'))) {
    throw new Error(text('项目 .venv 缺失或无效。请先执行 npm run init，再进行桌面开发、测试或打包；已有无效 .venv 时请先检查该目录。', 'Missing or invalid project .venv. Run npm run init before desktop development, tests or packaging. Check an existing invalid .venv before retrying.'));
  }
  const candidates = platform === 'win32'
    ? [{ command: 'py', args: ['-3'] }, { command: 'python', args: [] }]
    : [{ command: 'python3', args: [] }, { command: 'python', args: [] }];
  for (const candidate of candidates) {
    const result = probe(candidate.command, [...candidate.args, '--version'], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
    const version = /Python (\d+)\.(\d+)/.exec(`${result.stdout ?? ''}${result.stderr ?? ''}`);
    if (!result.error && result.status === 0 && version && (Number(version[1]) > 3 || (Number(version[1]) === 3 && Number(version[2]) >= 10))) return candidate;
  }
  throw new Error(text('未找到 Python 3。请安装 Python 3.10+（Windows 请启用 py 启动器），然后运行 npm run init。', 'Python 3 is missing. Install Python 3.10+ (Windows: enable the py launcher), then run npm run init.'));
}

// .cmd/.bat cannot be spawned as executables. All tokens are quoted, shell
// expansion is disabled, and expansion/quote characters are rejected.
export function spawnSpec(command, args, { platform = process.platform, env = process.env } = {}) {
  if (platform !== 'win32' || !/\.(cmd|bat)$/i.test(command)) return { command, args, options: {} };
  const quote = value => {
    const token = String(value);
    if (/["%\r\n\0]/.test(token)) throw new Error(text('Windows 批处理参数包含不支持的字符。', 'Unsupported character in Windows batch argument.'));
    return `"${token}"`;
  };
  args.forEach(quote);
  quote(command);
  if (!/[\\/]/.test(command)) {
    const pathValue = Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1] ?? '';
    const found = pathValue.split(';').map(entry => join(entry.replace(/^"|"$/g, ''), command)).find(candidate => existsSync(candidate));
    if (!found) throw new Error(text(`PATH 中找不到 ${command}。请安装 Node.js/npm 并重新打开终端。`, `Cannot locate ${command} on PATH. Install Node.js/npm and reopen the terminal.`));
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
        timer = setTimeout(() => reject(new Error(text(`${label} 超时（${timeout} 毫秒）。`, `${label} timed out after ${timeout}ms.`))), timeout);
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
  try { await withDeadline(server.waitForRequestsIdle?.(), text('等待 Vite 请求完成', 'Vite request drain'), 1000); }
  catch { /* A stuck transform must not prevent the remaining cleanup. */ }
  const closeHttp = () => new Promise((resolveClose, reject) => {
    server.httpServer.close(error => error && error.code !== 'ERR_SERVER_NOT_RUNNING' ? reject(error) : resolveClose());
  });
  try {
    await withDeadline(typeof server.close === 'function' ? server.close() : closeHttp(), text('关闭 Vite', 'Vite shutdown'), 3000);
  } catch (error) {
    // A plugin's close hook can stall; still release the listening socket,
    // websocket clients and file watcher owned by this dev session.
    server.httpServer?.closeAllConnections?.();
    await Promise.allSettled([
      withDeadline(server.ws?.close(), text('关闭 Vite WebSocket', 'Vite websocket shutdown'), 1000),
      withDeadline(server.watcher?.close(), text('关闭 Vite 文件监听', 'Vite watcher shutdown'), 1000),
      server.httpServer ? withDeadline(closeHttp(), text('关闭 Vite HTTP', 'Vite HTTP shutdown'), 1000) : Promise.resolve()
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
      child.once('error', error => reject(new Error(text(`无法启动 ${command}：${error.message}`, `Cannot start ${command}: ${error.message}`))));
      child.once('exit', (code, signal) => resolveExit(code ?? (signal ? 130 : 1)));
    });
  } finally {
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
  }
}

export function pythonTaskSpec(root, options, selection = {}) {
  const python = selectPython(root, { ...selection, allowSystem: options.task === 'init' });
  const language = options.language ?? languageArgs([]).language;
  return {
    command: python.command,
    args: [...python.args, '-u', join(root, 'scripts/dev.py'), '--lang', language, options.task, ...(options.debug ? ['--debug'] : [])],
    options: { cwd: root, stdio: 'inherit', detached: process.platform !== 'win32', env: { ...pythonEnvironment(), EWP_LANG: language } }
  };
}

async function runPython(root, options) {
  const spec = pythonTaskSpec(root, options);
  return runChild(spec.command, spec.args, spec.options);
}

export function configPath(root) {
  const config = join(root, 'frontend/vite.config.mjs');
  if (!existsSync(config)) throw new Error(text('缺少 frontend/vite.config.mjs。请先初始化前端。', 'frontend/vite.config.mjs is missing. Initialize the frontend before running this command.'));
  return config;
}

async function viteApi() {
  try { return await import('vite'); }
  catch (error) { throw new Error(text(`Vite 缺失或不可用。请运行 npm install（需要 Node >=22.12）。${error.message}`, `Vite is missing or unavailable. Run npm install (Node >=22.12 required). ${error.message}`)); }
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
    const timer = setTimeout(() => finish(new Error(text('本机端口分配超时（3000 毫秒）。', 'Local port allocation timed out after 3000ms.'))), 3000);
    reservation.once('error', fail);
    reservation.listen({ port: 0, host: '127.0.0.1', signal: controller.signal }, () => {
      const allocated = reservation.address().port;
      reservation.close(error => finish(error, allocated));
    });
  });
}

export async function runDev(root, options) {
  return withLanguage(options.language ?? languageArgs([], { cwd: root }).language, () => runDevSession(root, options));
}

async function runDevSession(root, options) {
  const desktop = !options.web;
  const python = desktop ? selectPython(root) : null;
  if (desktop && !existsSync(join(root, 'backend/src/demo.py'))) throw new Error(text('缺少桌面演示入口 backend/src/demo.py。浏览器开发请使用 --web。', 'Desktop demo missing: backend/src/demo.py. Use --web for browser development.'));
  if (options.command === 'frontend:preview' && !existsSync(join(root, 'output/frontend/index.html'))) {
    throw new Error(text('缺少已编译前端。请先运行 npm run frontend:build 再预览。', 'Frontend build is missing. Run npm run frontend:build before preview.'));
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
    startup.abort(new Error(text('开发启动已中断。', 'Development startup interrupted.')));
    void close().then(() => resolveEnd(130), rejectEnd);
  };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  options.signal?.addEventListener('abort', interrupt, { once: true });
  if (options.signal?.aborted) interrupt();
  let failure;
  try {
    const { createServer, preview } = await withDeadline(viteApi(), text('导入 Vite', 'Vite import'), 10000, startup.signal);
    const port = await withDeadline(chooseLocalPort(options.port), text('分配本机端口', 'Local port allocation'), 3000, startup.signal);
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
        throw startup.signal.reason ?? new Error(text('开发会话正在关闭。', 'Development session is closing.'));
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
    server = await withDeadline(creation, text('创建 Vite', 'Vite creation'), 10000, startup.signal);
    if (options.command !== 'frontend:preview') await withDeadline(server.listen(), text('等待 Vite 就绪', 'Vite readiness'), 10000, startup.signal);
    const url = server.resolvedUrls?.local?.[0];
    if (!url) throw new Error(text('Vite 未提供已就绪的本机 URL。', 'Vite did not provide a local ready URL.'));
    console.log(text(`前端已就绪：${url}`, `Frontend ready: ${url}`));
    if (desktop && !interrupted) {
      child = launch(python.command, [...python.args, join(root, 'backend/src/demo.py'), '--debug'], {
        cwd: root, stdio: 'inherit', detached: process.platform !== 'win32',
        env: { ...pythonEnvironment(), EWP_DEV_URL: url, EWP_LANG: options.language ?? languageArgs([], { cwd: root }).language }
      });
      child.once('error', error => rejectEnd(new Error(text(`无法启动桌面：${error.message}。请执行 npm run init，或使用 --web。`, `Cannot start desktop: ${error.message}. Run npm run init, or use --web.`))));
      child.once('exit', (code, signal) => {
        if (code) console.error(text('桌面异常退出。请运行 npm run init 安装 pywebview 和项目依赖；浏览器预览请使用 --web。', 'Desktop exited with an error. Run npm run init to install pywebview and the project dependencies; use --web for a browser preview.'));
        resolveEnd(code ?? (signal ? 130 : 0));
      });
    }
    return await ended;
  } catch (error) {
    if (interrupted) return 130;
    failure = error;
    throw error;
  } finally {
    startup.abort(new Error(text('开发会话正在关闭。', 'Development session is closing.')));
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
    options.signal?.removeEventListener('abort', interrupt);
    try { await close(); }
    catch (error) {
      if (!failure) throw error;
      console.error(text(`ewp: 清理失败：${error.message}`, `ewp: cleanup failed: ${error.message}`));
    }
  }
}

export const MENU_TASKS = [
  { command: 'init', zh: '初始化环境', en: 'Initialize environment' },
  { command: 'browser', zh: 'Vite 浏览器预览', en: 'Vite browser preview' },
  { command: 'frontend', zh: '构建前端', en: 'Build frontend' },
  { command: 'demo', args: ['--debug'], zh: '桌面演示（开发者工具）', en: 'Desktop demo (developer tools)' },
  { command: 'wheel', zh: '构建 Wheel', en: 'Build wheel' },
  { command: 'exe', zh: '构建 Windows EXE', en: 'Build Windows EXE' },
  { command: 'bundle', zh: '构建源码包', en: 'Build source bundle' },
  { command: 'build:all', zh: '完整构建', en: 'Full build' },
  { command: 'test', zh: '运行测试', en: 'Run tests' },
  { command: 'info', zh: '环境信息', en: 'Environment info' },
  { command: 'dev', zh: '桌面热更新开发（HMR）', en: 'Desktop development with HMR' },
  { command: 'frontend:preview', zh: '预览编译后的前端', en: 'Preview built frontend' },
  { command: 'check', zh: 'Node 运行时检查', en: 'Node runtime checks' }
];

async function menuChoice(prompt) {
  const input = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await new Promise((resolveChoice, reject) => {
      input.once('close', () => resolveChoice(null));
      input.once('SIGINT', () => { resolveChoice(null); input.close(); });
      input.question(prompt).then(resolveChoice, reject);
    });
  } finally { input.close(); }
}

export async function runMenu(root, language, { choose = menuChoice, execute = executeTask, log = console.log } = {}) {
  return withLanguage(language, async () => {
    for (;;) {
      log(text('\nEasy Windows Pack — 开发菜单', '\nEasy Windows Pack — Development menu'));
      MENU_TASKS.forEach((task, index) => log(`${index + 1}. ${text(task.zh, task.en)} — ewp ${task.command}${task.args ? ` ${task.args.join(' ')}` : ''} / npm run ${task.command}${task.args ? ` -- ${task.args.join(' ')}` : ''}`));
      log(text('0. 退出', '0. Exit'));
      const answer = await choose(text('请选择任务：', 'Choose a task: '));
      if (answer === null) return 130;
      const choice = answer.trim();
      if (choice === '0') return 0;
      const task = /^\d+$/.test(choice) ? MENU_TASKS[Number(choice) - 1] : undefined;
      if (!task) { log(text('无效选择，请输入菜单编号。', 'Invalid choice; enter a menu number.')); continue; }
      try {
        const options = parseArgs([task.command, ...(task.args ?? []), '--lang', language]);
        const code = await execute(root, { ...options, language });
        if (code === 130) return 130;
        if (code) log(text(`任务失败，退出码：${code}`, `Task failed with exit code ${code}.`));
      } catch (error) { log(`ewp: ${error.message}`); }
    }
  });
}

export async function main(argv = process.argv.slice(2)) {
  const { language, explicit } = languageArgs(argv);
  return withLanguage(language, async () => {
    const [major, minor] = process.versions.node.split('.').map(Number);
    if (major < 22 || (major === 22 && minor < 12)) throw new Error(text('easywindowspack 需要 Node >=22.12。', 'easywindowspack requires Node >=22.12.'));
    const options = parseArgs(argv);
    if (options.command === 'create') {
      const { main: create } = await import('create-ewp/cli');
      return create([...options.args, ...(explicit ? ['--lang', language] : [])]);
    }
    if (options.command === 'help') { console.log(helpText(language)); return 0; }
    if (options.command === 'version') { console.log(VERSION); return 0; }
    const root = findProjectRoot();
    return executeTask(root, { ...options, language });
  });
}

async function executeTask(root, options) {
  if (options.command === 'menu') return runMenu(root, options.language);
  if (options.command === 'info') {
    console.log(text(
      `easywindowspack ${VERSION}\nNode: ${process.version}\n项目：${root}\n前端：${join(root, 'frontend')}\n配置：${configPath(root)}\nPython 虚拟环境：${join(root, '.venv')}\n默认构建：EXE`,
      `easywindowspack ${VERSION}\nNode: ${process.version}\nProject: ${root}\nFrontend: ${join(root, 'frontend')}\nConfig: ${configPath(root)}\nPython venv: ${join(root, '.venv')}\nDefault build: EXE`));
    return 0;
  }
  if (options.command === 'check') {
    if (!existsSync(join(root, 'tests/npm-runtime.test.mjs'))) throw new Error(text('本项目未提供 tests/npm-runtime.test.mjs，无法运行 Node 运行时检查。', 'This project does not provide tests/npm-runtime.test.mjs for Node runtime checks.'));
    return runChild(process.execPath, ['--test', join(root, 'tests/npm-runtime.test.mjs')], {
      cwd: root, stdio: 'inherit', detached: process.platform !== 'win32', env: { ...process.env, EWP_LANG: options.language }
    });
  }
  if (['dev', 'frontend:dev', 'frontend:preview'].includes(options.command)) return runDev(root, options);
  if (options.command === 'frontend:build') {
    const { build } = await viteApi();
    await build({ configFile: configPath(root) });
    return 0;
  }
  return runPython(root, options);
}

export function isDirectExecution(entry = process.argv[1], moduleUrl = import.meta.url) {
  if (!entry) return false;
  try { return realpathSync(entry) === realpathSync(fileURLToPath(moduleUrl)); }
  catch { return false; }
}

if (isDirectExecution()) {
  main().then(code => { process.exitCode = code; }, error => {
    console.error(`ewp: ${error.message}`);
    process.exitCode = Number.isInteger(error.exitCode) && error.exitCode > 0 ? error.exitCode : 1;
  });
}