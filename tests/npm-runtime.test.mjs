import nodeTest from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { runInNewContext } from 'node:vm';
import { createRequire } from 'node:module';
import { parseArgs, findProjectRoot, configPath, selectPython, pythonEnvironment, pythonTaskSpec, spawnSpec, chooseLocalPort, runDev, main, MENU_TASKS, runMenu, isDirectExecution } from '../frontend/packages/easywindowspack/bin/ewp.mjs';
import { VERSION, languageArgs, helpText, text, withLanguage } from '../frontend/packages/easywindowspack/language.mjs';
import { projectManifest } from '../frontend/packages/create-ewp/lib/create.mjs';

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
  assert.throws(() => parseArgs(['build', '--wheel', '--exe']), /either|只选择/);
  assert.throws(() => parseArgs(['build', '--unknown']), /Unknown option|未知参数/);
  assert.throws(() => parseArgs(['publish']), /Unknown command|未知命令/);
});

test('dev opens a browser only for --web and validates the port', () => {
  assert.equal(parseArgs(['dev']).web, false);
  assert.equal(parseArgs(['dev', '--web', '--no-open']).open, false);
  assert.equal(parseArgs(['frontend:dev']).web, true);
  assert.equal(parseArgs(['dev', '--port', '0']).port, 0);
  assert.equal(parseArgs(['dev', '--port=65535']).port, 65535);
  for (const value of ['-1', '65536', 'abc', '2.1', '']) assert.throws(() => parseArgs(['dev', '--port', value]), /integer|整数/);
  assert.throws(() => parseArgs(['dev', '--port']), /integer|整数/);
  assert.throws(() => parseArgs(['test', '--web']), /Unknown option|未知参数/);
});

test('application packaging flags parse on every native task and preserve config paths as argv', () => {
  const config = 'config files/My Desktop & App.json';
  for (const language of ['zh-CN', 'en']) for (const command of ['app', 'installer', 'exe', 'build', 'full-build', 'build:all', 'build:app']) {
    const task = ['full-build', 'build:all'].includes(command) ? 'full-build' : command === 'build' ? 'exe' : command === 'build:app' ? 'app' : command;
    for (const mode of ['onefile', 'onedir']) for (const args of [
      [command, '--', '--mode', mode, '--config', config, '--installer'],
      [command, `--config=${config}`, '--installer', `--mode=${mode}`]
    ]) {
      const options = parseArgs([...args, '--lang', language], { env: {} });
      assert.equal(options.task, task);
      assert.equal(options.mode, mode);
      assert.equal(options.config, config);
      assert.equal(options.installer, true);
      const directory = join(tmpdir(), 'Project with spaces & symbols');
      const spec = pythonTaskSpec(directory, { ...options, language }, { exists: () => true });
      assert.deepEqual(spec.args, ['-u', join(directory, 'scripts/dev.py'), '--lang', language, task,
        '--mode', mode, '--config', config, '--installer']);
      assert.equal(spec.options.cwd, directory);
      assert.equal(spec.options.env.EWP_LANG, language);
      assert.deepEqual(spawnSpec(spec.command, spec.args, { platform: 'win32' }), { command: spec.command, args: spec.args, options: {} });
    }
  }
  for (const args of [['exe'], ['build'], ['build', '--exe']]) {
    const options = parseArgs(args);
    assert.equal(options.task, 'exe');
    for (const field of ['mode', 'config', 'installer']) assert.equal(options[field], undefined, field);
    assert.deepEqual(pythonTaskSpec(root, { ...options, language: 'en' }, { exists: () => true }).args,
      ['-u', join(root, 'scripts/dev.py'), '--lang', 'en', 'exe']);
  }
  for (const args of [['app'], ['installer']]) {
    const options = parseArgs(args);
    assert.equal(options.mode, undefined, 'Python uses the configured mode');
    assert.equal(options.installer, undefined, 'Python owns installer task semantics');
  }
  assert.equal(parseArgs(['build', '--all', '--installer']).task, 'full-build');
  assert.equal(parseArgs(['build', '--exe', '--mode=onedir']).task, 'exe');
});

test('packaging flags reject wheel conflicts, missing values and partial flag names in both languages', () => {
  for (const language of ['zh-CN', 'en']) {
    const parse = args => parseArgs([...args, '--lang', language], { env: {} });
    const unknown = language === 'en' ? /Unknown option/ : /未知参数/;
    for (const flags of [['--mode', 'onefile'], ['--config', 'my config.json'], ['--installer']]) {
      for (const wheel of ['-w', '--wheel']) for (const order of [[wheel, ...flags], [...flags, wheel]]) {
        assert.throws(() => parse(['build', ...order]), language === 'en' ? /cannot be combined/ : /不能.*同时使用/);
      }
      for (const command of ['wheel', 'build:wheel', 'test', 'dev', 'frontend:build', 'bundle']) {
        assert.throws(() => parse([command, ...flags]), unknown);
      }
    }
    for (const args of [['--mode'], ['--mode='], ['--mode', 'zip'], ['--mode', '--installer']]) {
      assert.throws(() => parse(['app', ...args]), /--mode/);
    }
    for (const args of [['--config'], ['--config='], ['--config', ' '], ['--config', '--installer'], ['--config', 'bad\npath'], ['--config', 'bad\0path']]) {
      assert.throws(() => parse(['app', ...args]), /--config/);
    }
    for (const flag of ['--model', '--mode-extra', '--configuration', '--config-extra', '--installer=false']) {
      assert.throws(() => parse(['app', flag, 'onedir']), unknown);
    }
    assert.throws(() => parse(['app', '--mode=onefile', '--mode=onedir']), /--mode/);
    assert.throws(() => parse(['app', '--config=a.json', '--config=b.json']), /--config/);
  }
});

test('npm workspace and generated scripts forward native flags with spaces to the Python boundary', {
  skip: !process.env.CREATE_EWP_PYTHON && 'Set CREATE_EWP_PYTHON to the configured Python interpreter.', timeout: 60000
}, () => {
  const directory = mkdtempSync(join(tmpdir(), 'ewp forwarding & space-'));
  const frontend = join(directory, 'frontend');
  const entry = join(packageRoot, 'bin/ewp.mjs');
  try {
    mkdirSync(join(directory, 'scripts'));
    writeFileSync(join(directory, 'scripts/dev.py'), 'import json, sys\nprint(json.dumps(sys.argv[1:]))\n');
    symlinkSync(dirname(dirname(process.env.CREATE_EWP_PYTHON)), join(directory, '.venv'), process.platform === 'win32' ? 'junction' : 'dir');
    const bins = join(frontend, 'node_modules/.bin');
    mkdirSync(bins, { recursive: true });
    if (process.platform === 'win32') writeFileSync(join(bins, 'ewp.cmd'), `@echo off\r\n"${process.execPath}" "${entry}" %*\r\n`);
    else symlinkSync(entry, join(bins, 'ewp'));
    const workspace = JSON.parse(readFileSync(join(root, 'frontend/package.json'), 'utf8'));
    const cli = 'node packages/easywindowspack/bin/ewp.mjs';
    for (const scripts of [
      Object.fromEntries(Object.entries(workspace.scripts).map(([name, value]) => [name, value.replace(cli, `node "${entry}"`)])),
      projectManifest('my-app', 'vanilla', 'en').scripts
    ]) {
      writeFileSync(join(frontend, 'package.json'), JSON.stringify({ name: 'forwarding-fixture', private: true, scripts }));
      for (const task of ['app', 'installer', 'exe', 'build', 'full-build', 'build:all', 'build:app']) {
        const config = 'config files/My Desktop & App.json';
        const spec = spawnSpec(process.platform === 'win32' ? 'npm.cmd' : 'npm',
          ['run', task, '--', '--mode', 'onedir', '--config', config, '--installer', '--lang=en']);
        const result = spawnSync(spec.command, spec.args, { ...spec.options, cwd: frontend, encoding: 'utf8', timeout: 10000 });
        assert.equal(result.error, undefined, task);
        assert.equal(result.status, 0, `${task}: ${result.stdout}\n${result.stderr}`);
        const pythonTask = ['full-build', 'build:all'].includes(task) ? 'full-build' : task === 'build' ? 'exe' : task === 'build:app' ? 'app' : task;
        assert.deepEqual(JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1)),
          ['--lang', 'en', pythonTask, '--mode', 'onedir', '--config', config, '--installer']);
      }
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('Node task argv is accepted by scripts/dev.py and keeps legacy EXE selection', {
  skip: !process.env.CREATE_EWP_PYTHON && 'Set CREATE_EWP_PYTHON to the configured Python interpreter.'
}, () => {
  const cases = [['app'], ['installer'], ['exe'], ['build'], ['full-build'],
    ...['app', 'installer', 'exe', 'build', 'full-build'].map(command => [command, '--mode=onedir', '--config', 'configs/My App.json', '--installer'])];
  const argumentsList = cases.map(args => pythonTaskSpec(root, { ...parseArgs(args), language: 'en' }, { exists: () => true }).args.slice(2));
  const harness = `import importlib.util, json, sys
from pathlib import Path
root = Path(sys.argv[1])
spec = importlib.util.spec_from_file_location('ewp_dev_contract', root / 'scripts/dev.py')
dev = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dev)
rows = []
for argv in json.load(sys.stdin):
    parsed = dev.parser(root, 'en').parse_args(argv)
    task = parsed.command
    command = dev.task_command('exe' if task == 'full-build' else task, root,
        config_path=getattr(parsed, 'config', None), mode=getattr(parsed, 'mode', None),
        installer=getattr(parsed, 'installer', None))
    rows.append({'task': task, 'mode': parsed.mode, 'config': parsed.config,
                 'installer': parsed.installer, 'command': command})
print(json.dumps(rows))
`;
  const result = spawnSync(process.env.CREATE_EWP_PYTHON, ['-X', 'utf8', '-c', harness, root], {
    input: JSON.stringify(argumentsList), cwd: tmpdir(), encoding: 'utf8', timeout: 10000
  });
  assert.equal(result.status, 0, result.stderr);
  JSON.parse(result.stdout).forEach((row, index) => {
    const options = parseArgs(cases[index]);
    assert.equal(row.task, options.task);
    assert.equal(row.mode, options.mode ?? null);
    assert.equal(row.config, options.config ?? null);
    assert.equal(row.installer, options.installer ?? null);
    if (index >= 5 || row.task === 'app' || row.task === 'installer') {
      assert.equal(row.command[2], 'easy_windows_pack.cli');
      assert.equal(row.command[3], row.task === 'installer' ? 'installer' : 'app');
      if (index >= 5) assert.deepEqual(row.command.slice(-5), ['--config', 'configs/My App.json', '--mode', 'onedir', '--installer']);
    } else {
      assert.equal(row.command[2], 'PyInstaller');
      assert.ok(row.command.includes(join(root, 'output/exe')));
    }
  });
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
  }), /invalid project .venv|\.venv 缺失或无效/);
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
  for (const arg of ['%PATH%', '" & echo injected', 'a\nb']) assert.throws(() => spawnSpec('npm.cmd', [arg], { platform: 'win32' }), /Unsupported|不支持/);
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
    assert.equal(await deadline(main(['--help', '--lang', 'en']), 'CLI help', t.signal), 0);
    assert.match(output, /Build EXE by default/);
  } finally { process.chdir(original); console.log = log; }
});

test('language priority is explicit flag, environment, nearest project, then Chinese', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ewp-language-'));
  const cwd = join(directory, 'frontend/src');
  const context = { cwd, env: {} };
  try {
    mkdirSync(cwd, { recursive: true });
    assert.equal(languageArgs([], context).language, 'zh-CN');
    const manifest = join(directory, 'frontend/package.json');
    writeFileSync(manifest, '\uFEFF' + JSON.stringify({ ewp: { language: 'en' } }));
    const original = readFileSync(manifest, 'utf8');
    assert.equal(languageArgs([], context).language, 'en');
    assert.equal(languageArgs([], { ...context, env: { EWP_LANG: 'zh-CN' } }).language, 'zh-CN');
    assert.equal(languageArgs(['--lang', 'en', 'info'], { ...context, env: { EWP_LANG: 'zh-CN' } }).language, 'en');
    assert.equal(languageArgs(['info', '--lang=zh-CN'], context).language, 'zh-CN');
    assert.equal(languageArgs(['--lang=en'], { ...context, env: { EWP_LANG: 'invalid' } }).language, 'en');
    for (const args of [['--lang'], ['--lang='], ['--lang', 'xx'], ['--lang=en', '--lang=zh-CN']]) {
      assert.throws(() => languageArgs(args, context), /--lang/);
    }
    assert.throws(() => parseArgs(['unknown', '--lang', 'en'], context), /Unknown command/);
    assert.throws(() => parseArgs(['unknown', '--lang', 'zh-CN'], context), /未知命令/);
    assert.equal(readFileSync(manifest, 'utf8'), original, 'Invocation overrides never write project settings');
    writeFileSync(manifest, '{broken');
    assert.equal(languageArgs([], context).language, 'zh-CN');
    assert.deepEqual(await Promise.all(['en', 'zh-CN'].map(language => withLanguage(language, async () => {
      await Promise.resolve();
      return text('中文', 'English');
    }))), ['English', '中文']);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('global help, version and create help execute through a real directory symlink outside projects', { timeout: 30000 }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'ewp-linked cli-'));
  const entry = join(packageRoot, 'bin/ewp.mjs');
  const linked = join(directory, 'nvm link');
  try {
    // Windows junctions exercise the nvm directory-symlink case without elevation.
    symlinkSync(packageRoot, linked, process.platform === 'win32' ? 'junction' : 'dir');
    const linkedEntry = join(linked, 'bin/ewp.mjs');
    assert.equal(isDirectExecution(linkedEntry, pathToFileURL(entry).href), true);
    assert.equal(isDirectExecution(join(directory, 'missing'), pathToFileURL(entry).href), false);
    assert.equal(isDirectExecution(join(packageRoot, 'language.mjs'), pathToFileURL(entry).href), false);
    const run = args => {
      const result = spawnSync(process.execPath, [linkedEntry, ...args], {
        cwd: directory, env: { ...process.env, EWP_LANG: '' }, encoding: 'utf8', timeout: 8000
      });
      assert.equal(result.error, undefined);
      assert.equal(result.status, 0, result.stderr);
      return result.stdout;
    };
    for (const args of [[], ['help'], ['--help'], ['-h']]) {
      const output = run(args);
      assert.match(output, /用法：ewp/);
      assert.match(output, /create/);
      assert.match(output, /npm --prefix frontend run ewp/);
    }
    for (const flag of ['--version', '-v', '-V', 'version']) assert.equal(run([flag]).trim(), VERSION);
    assert.match(run(['--lang', 'en', '-h']), /Usage: ewp/);
    assert.match(run(['--lang', 'en', 'create', '-h']), /create-ewp — Create a desktop project/);
    assert.match(run(['create', '-h', '--lang', 'zh-CN']), /创建桌面项目/);
    assert.match(run(['create', '--lang=en', '--help']), /--template/);
    const imported = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(linkedEntry).href)})`], { cwd: directory, encoding: 'utf8', timeout: 8000 });
    assert.equal(imported.status, 0, imported.stderr);
    assert.equal(imported.stdout, '', 'Importing CLI never executes it');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('all menu tasks and aliases parse and Python receives language, task and debug safely', () => {
  for (const task of MENU_TASKS) assert.ok(parseArgs([task.command, ...(task.args ?? [])]).task);
  assert.ok(MENU_TASKS.some(task => task.command === 'app'));
  assert.ok(MENU_TASKS.some(task => task.command === 'installer'));
  for (const [alias, command] of Object.entries({ browser: 'frontend:dev', frontend: 'frontend:build', preview: 'frontend:preview', 'full-build': 'build:all', 'build:wheel': 'wheel', 'build:exe': 'exe', 'build:app': 'app' })) {
    assert.equal(parseArgs([alias]).command, command);
  }
  assert.equal(parseArgs(['browser', '--no-open', '--port=1234']).web, true);
  for (const args of [['build:all'], ['full-build'], ['build', '--all']]) assert.equal(parseArgs(args).task, 'full-build');
  for (const flag of ['--wheel', '--exe']) assert.throws(() => parseArgs(['build', '--all', flag]), /只选择|Choose/);
  assert.equal(parseArgs(['demo', '--debug']).debug, true);
  assert.throws(() => parseArgs(['exe', '--debug']), /未知参数|Unknown option/);
  for (const task of ['init', 'demo', 'wheel', 'exe', 'bundle', 'test', 'build']) {
    const spec = pythonTaskSpec(root, { task, language: 'en', debug: task === 'demo' }, { exists: () => true });
    assert.deepEqual(spec.args, ['-u', join(root, 'scripts/dev.py'), '--lang', 'en', task, ...(task === 'demo' ? ['--debug'] : [])]);
    assert.equal(spec.options.env.EWP_LANG, 'en');
    assert.equal(spec.options.env.PYTHONHOME, undefined);
    assert.equal(spec.options.env.PYTHONPATH, undefined);
  }
  assert.throws(() => pythonTaskSpec(root, { task: 'demo', language: 'en' }, { exists: () => false, allowSystem: true }), /npm run init/);
});

test('menu dispatches every task, recovers after failures and handles exit without Python', async () => {
  const answers = ['invalid', ...MENU_TASKS.map((_, index) => String(index + 1)), '0'];
  const calls = [];
  const output = [];
  assert.equal(await runMenu(root, 'en', {
    choose: async () => answers.shift(), log: line => output.push(line),
    execute: async (directory, options) => {
      assert.equal(directory, root);
      calls.push(options);
      if (calls.length === 1) throw new Error('fixture failure');
      return calls.length === 2 ? 2 : 0;
    }
  }), 0);
  assert.equal(calls.length, MENU_TASKS.length);
  assert.ok(calls.every(options => options.language === 'en'));
  assert.equal(calls.find(options => options.command === 'demo').debug, true);
  assert.equal(calls.find(options => options.command === 'build:all').task, 'full-build');
  assert.ok(output.some(line => line.includes('Invalid choice')));
  assert.ok(output.some(line => line.includes('Task failed with exit code 2')));
  for (const task of MENU_TASKS) assert.ok(output.some(line => line.includes(`npm run ${task.command}`)));
  assert.equal(await runMenu(root, 'zh-CN', { choose: async () => null, log: () => {} }), 130);
  assert.equal(await runMenu(root, 'en', { choose: async () => '1', execute: async () => 130, log: () => {} }), 130);
  const directory = mkdtempSync(join(tmpdir(), 'ewp-menu-'));
  try {
    mkdirSync(join(directory, 'scripts'));
    writeFileSync(join(directory, 'scripts/dev.py'), '');
    const result = spawnSync(process.execPath, [join(packageRoot, 'bin/ewp.mjs'), 'menu', '--lang=en'], { cwd: directory, input: '0\n', encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Development menu/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('help describes every task and both entry locations in each language', () => {
  for (const language of ['en', 'zh-CN']) {
    const help = helpText(language);
    for (const task of MENU_TASKS) assert.ok(help.includes(task.command), task.command);
    assert.match(help, /--lang zh-CN\|en > EWP_LANG > frontend\/package.json ewp.language > zh-CN/);
    assert.match(help, /npm run build -- -w/);
    assert.match(help, /--mode onefile\|onedir/);
    assert.match(help, /--config PATH/);
    assert.match(help, /--installer/);
    for (const path of ['ewp.pack.json', 'output/apps/', 'output/installers/', 'output/exe/']) assert.ok(help.includes(path), path);
    assert.equal(/[\u3400-\u9fff]/u.test(help), language === 'zh-CN');
  }
});

test('published entry points and optional framework peers match the runtime contract', () => {
  const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'easywindowspack');
  assert.equal(pkg.version, '0.1.2');
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
  for (const name of ['help', 'menu', 'info', 'init', 'dev', 'browser', 'frontend', 'demo', 'wheel', 'exe', 'app', 'installer', 'build', 'build:all', 'full-build', 'build:wheel', 'build:exe', 'build:app', 'bundle', 'test', 'frontend:build', 'frontend:dev', 'frontend:preview', 'check']) {
    assert.match(pkg.scripts[name], /node packages\/easywindowspack\/bin\/ewp\.mjs /, name);
  }
  assert.equal(pkg.scripts.ewp, 'node packages/easywindowspack/bin/ewp.mjs');
  for (const task of MENU_TASKS) assert.ok(pkg.scripts[task.command], task.command);
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
  const session = runDev(root, { command: 'dev', web: true, open: false, port: 0, language: 'en', signal: AbortSignal.any([t.signal, controller.signal]) });
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