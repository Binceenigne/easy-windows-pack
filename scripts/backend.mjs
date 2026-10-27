#!/usr/bin/env node
// Shared native-backend task driver. Python projects keep scripts/dev.py.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const BACKENDS = ['python', 'golang', 'rust', 'cpp'];
const say = (language, zh, en) => language === 'en' ? en : zh;
export function projectManifest(root) {
  return JSON.parse(readFileSync(join(root, 'frontend/package.json'), 'utf8').replace(/^\uFEFF/, ''));
}
export function backendName(root) {
  const backend = projectManifest(root).ewp?.backend ?? 'python';
  if (!BACKENDS.includes(backend)) throw new Error(`Unknown ewp.backend: ${backend}`);
  return backend;
}
function languageOf(root, options = {}) {
  return options.language ?? process.env.EWP_LANG ?? projectManifest(root).ewp?.language ?? 'zh-CN';
}
function fail(language, zh, en) { throw new Error(say(language, zh, en)); }
export async function run(command, args, { cwd, env = process.env, language = 'zh-CN', signal } = {}) {
  if (signal?.aborted) throw Object.assign(new Error('Build interrupted'), { exitCode: 130 });
  console.log([command, ...args].map(value => /\s/.test(value) ? JSON.stringify(value) : value).join(' '));
  const child = spawn(command, args, { cwd, env, stdio: 'inherit', shell: false, windowsHide: true,
    detached: process.platform !== 'win32' });
  let interrupted = false;
  const stop = () => {
    interrupted = true;
    if (!child.pid) return;
    if (process.platform === 'win32') {
      const killer = spawn(join(process.env.SystemRoot || 'C:\\Windows', 'System32/taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      killer.once('error', () => child.kill());
    } else { try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill(); } }
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  signal?.addEventListener('abort', stop, { once: true });
  try {
    await new Promise((done, reject) => {
      child.once('error', error => reject(new Error(say(language,
        `无法启动 ${command}（${error.code}）。请安装所选后端的工具链并检查 PATH。`,
        `Cannot start ${command} (${error.code}). Install the selected backend toolchain and check PATH.`))));
      child.once('exit', (code, signal) => {
        if (!code && !signal && !interrupted) done();
        else reject(Object.assign(new Error(say(language, `命令失败：${command}（${code ?? signal}）`,
          `Command failed: ${command} (${code ?? signal})`)), { exitCode: interrupted ? 130 : code || 1 }));
      });
    });
  } finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); signal?.removeEventListener('abort', stop); }
}

export function buildSpec(root, { debug = false, env = process.env } = {}) {
  const backend = backendName(root);
  const build = join(root, 'build/native', backend);
  const executable = join(build, ...(backend === 'golang' ? [debug ? 'debug' : 'release'] : []), 'ewp-host.exe');
  const cwd = root;
  if (backend === 'cpp') return { executable, commands: [
    { command: env.EWP_CMAKE || 'cmake', args: ['-S', join(root, 'backend'), '-B', build, `-DCMAKE_BUILD_TYPE=${debug ? 'Debug' : 'Release'}`, ...JSON.parse(env.EWP_CMAKE_ARGS || '[]')] },
    { command: env.EWP_CMAKE || 'cmake', args: ['--build', build, '--config', debug ? 'Debug' : 'Release', '--parallel'] }
  ].map(command => ({ ...command, cwd, env })) };
  if (backend === 'rust') return { executable: join(build, debug ? 'debug' : 'release', 'ewp-host.exe'), commands: [{
    command: env.EWP_CARGO || 'cargo', args: ['build', '--manifest-path', join(root, 'backend/Cargo.toml'), '--target-dir', build, ...(debug ? [] : ['--release'])], cwd,
    // Static CRT makes the release folder usable without a separate VC runtime.
    env: { ...env, RUSTFLAGS: `${env.RUSTFLAGS || ''} -C target-feature=+crt-static`.trim() }
  }] };
  if (backend === 'golang') return { executable, commands: [{ command: env.EWP_GO || 'go',
    args: ['build', '-trimpath', ...(debug ? [] : ['-ldflags=-H=windowsgui -s -w']), '-o', executable, '.'],
    cwd: join(root, 'backend'), env: { ...env, CGO_ENABLED: '1' } }] };
  throw new Error('Python backend builds are handled by scripts/dev.py');
}

export async function buildBackend(root, options = {}) {
  const language = languageOf(root, options);
  if (process.platform !== 'win32') fail(language, '原生宿主构建需要 Windows。', 'Native host builds require Windows.');
  const spec = buildSpec(root, options);
  mkdirSync(dirname(spec.executable), { recursive: true });
  for (const command of spec.commands) await run(command.command, command.args, { ...command, language, signal: options.signal });
  if (!existsSync(spec.executable)) fail(language, `构建未生成宿主：${spec.executable}`, `Build did not produce the host: ${spec.executable}`);
  return spec.executable;
}

export async function installFrontend(root, { language = 'zh-CN', env = process.env, execute = run } = {}) {
  const candidates = [env.npm_execpath,
    join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    join(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js')];
  const cli = candidates.find(path => path && /npm-cli\.js$/.test(path) && existsSync(path));
  if (!cli && process.platform === 'win32') fail(language,
    '找不到 npm CLI。请安装 Node.js：https://nodejs.org/en/download ，然后重试 init。',
    'npm CLI is missing. Install Node.js: https://nodejs.org/en/download , then retry init.');
  const args = ['install', '--include=dev', '--no-audit', '--no-fund'];
  // Reload file-based policy instead of npm 12.0's invalid inherited override.
  const installEnv = Object.fromEntries(Object.entries(env).filter(([key]) => key.toLowerCase() !== 'npm_config_allow_scripts'));
  await execute(cli ? process.execPath : 'npm', cli ? [resolve(cli), ...args] : args,
    { cwd: join(root, 'frontend'), env: installEnv, language });
}

export async function checkToolchain(root, options) {
  const require = createRequire(join(root, 'frontend/package.json'));
  const runtimeRequire = createRequire(require.resolve('easywindowspack/frame.css'));
  const { inspectToolchain, toolchainGuidance } = await import(pathToFileURL(runtimeRequire.resolve('create-ewp/toolchain')).href);
  const result = inspectToolchain(backendName(root));
  if (!result.available) throw new Error(toolchainGuidance(result, languageOf(root, options)));
}

export async function initialize(root, options = {}, { install = installFrontend, check = checkToolchain, frontend = frontendBuild, backend = buildBackend, log = console.log } = {}) {
  const language = languageOf(root, options);
  await install(root, { language });
  await check(root, { language });
  await frontend(root);
  await backend(root, { language, debug: true });
  log(say(language, '环境已就绪。', 'Environment ready.'));
  return 0;
}

async function frontendBuild(root) {
  const require = createRequire(join(root, 'frontend/package.json'));
  const { build } = await import(pathToFileURL(require.resolve('vite')).href);
  await build({ configFile: join(root, 'frontend/vite.config.mjs') });
}
function noLinks(source) {
  const entry = lstatSync(source);
  if (entry.isSymbolicLink()) throw new Error(`Linked packaging input is not allowed: ${source}`);
  if (entry.isDirectory()) for (const child of readdirSync(source)) noLinks(join(source, child));
}
function assertSafeParents(path) {
  for (let current = resolve(path); ; current = dirname(current)) {
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error(`Linked output path is not allowed: ${current}`);
    if (dirname(current) === current) break;
  }
}
function listFiles(directory, prefix = '') {
  return readdirSync(join(directory, prefix)).flatMap(name => {
    const path = join(prefix, name);
    return lstatSync(join(directory, path)).isDirectory() ? listFiles(directory, path) : [path.replaceAll('\\', '/')];
  });
}
function safeOwnedPath(path) {
  return typeof path === 'string' && path && !/[\\:\0]/.test(path)
    && path.split('/').every(part => part && part !== '.' && part !== '..');
}
export function loadPackConfig(root, options = {}) {
  const language = languageOf(root, options);
  const manifest = projectManifest(root);
  const path = resolve(root, options.config || 'ewp.pack.json');
  if (options.config && !existsSync(path)) fail(language, `配置不存在：${path}`, `Configuration not found: ${path}`);
  const config = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, '')) : {};
  const allowed = { root: ['schemaVersion', 'application', 'build', 'installer', 'features', 'prerequisites', 'hooks', 'postInstall'],
    application: ['id', 'name', 'version'], build: ['mode', 'installer'], installer: ['language'] };
  for (const [section, fields] of Object.entries(allowed)) {
    const value = section === 'root' ? config : config[section];
    if (value === undefined) continue;
    if (!value || Array.isArray(value) || typeof value !== 'object') fail(language, `配置 ${section} 必须是对象。`, `Configuration ${section} must be an object.`);
    const unknown = Object.keys(value).filter(key => !fields.includes(key));
    if (unknown.length) fail(language, `原生后端暂不支持配置 ${section}.${unknown[0]}。`, `Native backends do not support configuration ${section}.${unknown[0]}.`);
  }
  if (config.schemaVersion !== undefined && config.schemaVersion !== 1) fail(language, '只支持 schemaVersion 1。', 'Only schemaVersion 1 is supported.');
  const application = { id: manifest.name, name: manifest.name, version: manifest.version || '0.1.0', ...config.application };
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(application.id) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(application.id)) {
    fail(language, 'application.id 必须是安全的应用名称。', 'application.id must be a safe application name.');
  }
  for (const value of [application.name, application.version]) if (typeof value !== 'string' || !value || /[\0\r\n]/.test(value)) {
    fail(language, '应用名称或版本无效。', 'Invalid application name or version.');
  }
  const mode = options.mode || config.build?.mode || 'onedir';
  if (mode !== 'onedir') fail(language, '原生后端使用 onedir 分发；请设置 --mode onedir。安装包可封装为单个 setup.exe。',
    'Native backends use onedir distribution; set --mode onedir. An installer can wrap the directory in one setup.exe.');
  // Never silently ignore Python installer behaviors when switching backends.
  for (const field of ['features', 'prerequisites', 'hooks']) if (config[field] && Object.keys(config[field]).length) {
    fail(language, `原生安装器暂不支持 ${field}；请移除该项，或使用 Python 后端的配置安装器。`,
      `The native installer does not support ${field}; remove it or use the Python configuration installer.`);
  }
  if (config.installer?.language !== undefined && !['zh-CN', 'en'].includes(config.installer.language)) fail(language, '安装器语言仅支持 zh-CN/en。', 'Installer language must be zh-CN/en.');
  if (config.postInstall !== undefined) {
    if (!Array.isArray(config.postInstall)) fail(language, 'postInstall 必须是数组。', 'postInstall must be an array.');
    const types = new Set();
    for (const option of config.postInstall) {
      if (!option || !['startup', 'launch'].includes(option.type) || types.has(option.type)
        || Object.keys(option).some(key => !['id', 'type', 'name', 'default'].includes(key))
        || (option.default !== undefined && typeof option.default !== 'boolean')
        || (option.name !== undefined && (typeof option.name !== 'string' || /[\0\r\n]/.test(option.name)))) {
        fail(language, '原生 postInstall 仅支持各一个 startup/launch 选项。', 'Native postInstall supports one startup and one launch option.');
      }
      types.add(option.type);
    }
  }
  return { ...config, application, build: { ...config.build, mode },
    installer: { language, ...config.installer },
    install: Boolean(options.installer || options.command === 'installer' || options.task === 'installer' || config.build?.installer) };
}

export function stageApp(root, executable, config, outputBase = 'apps') {
  const id = config.application.id;
  const parent = join(root, 'output', outputBase);
  const destination = join(parent, id);
  const temporary = join(parent, `.${id}-${process.pid}.tmp`);
  const backup = join(parent, `.${id}-${process.pid}.previous`);
  assertSafeParents(parent);
  if (!existsSync(join(root, 'output/frontend/index.html'))) throw new Error('Frontend build is missing: output/frontend/index.html');
  noLinks(join(root, 'output/frontend'));
  if (existsSync(destination)) noLinks(destination);
  mkdirSync(parent, { recursive: true });
  if (existsSync(temporary) || existsSync(backup)) throw new Error(`Staging directory already exists: ${temporary}`);
  mkdirSync(temporary);
  try {
    let preserved = [];
    if (existsSync(destination)) {
      const marker = join(destination, 'application.json');
      if (!existsSync(marker) || JSON.parse(readFileSync(marker, 'utf8')).id !== id) throw new Error(`Refusing to replace an unrelated directory: ${destination}`);
      const previous = JSON.parse(readFileSync(marker, 'utf8'));
      const owned = previous.artifactFiles;
      if (owned !== undefined && (!Array.isArray(owned) || !owned.every(safeOwnedPath))) throw new Error('Invalid previous artifact file list');
      // Preserve files added by the user. Remove only prior generated artifacts.
      cpSync(destination, temporary, { recursive: true });
      for (const file of owned || []) rmSync(join(temporary, file), { force: true });
      preserved = listFiles(temporary);
    }
    cpSync(executable, join(temporary, `${id}.exe`));
    cpSync(join(root, 'output/frontend'), join(temporary, 'frontend'), { recursive: true });
    if (existsSync(join(root, 'LICENSE'))) cpSync(join(root, 'LICENSE'), join(temporary, 'LICENSE'));
    const licenses = join(root, 'backend/include');
    if (existsSync(licenses)) for (const name of readdirSync(licenses).filter(name => /LICENSE$/i.test(name))) {
      mkdirSync(join(temporary, 'licenses'), { recursive: true });
      cpSync(join(licenses, name), join(temporary, 'licenses', name));
    }
    writeFileSync(join(temporary, 'README.txt'), 'Run ' + id + '.exe. Keep the frontend directory beside the executable. Microsoft Edge WebView2 Runtime is required.\r\n');
    const generated = new Set([`${id}.exe`, 'application.json', 'README.txt',
      ...listFiles(join(root, 'output/frontend')).map(file => `frontend/${file}`),
      ...(existsSync(join(temporary, 'licenses')) ? listFiles(join(temporary, 'licenses')).map(file => `licenses/${file}`) : []),
      ...(existsSync(join(root, 'LICENSE')) ? ['LICENSE'] : [])]);
    const artifactFiles = [...new Set([...listFiles(temporary).filter(file => !preserved.includes(file)), ...generated])].sort();
    writeFileSync(join(temporary, 'application.json'), JSON.stringify({ ...config.application, backend: backendName(root),
      prerequisites: ['WebView2'], artifactFiles }, null, 2) + '\n');
    if (existsSync(destination)) renameSync(destination, backup);
    try { renameSync(temporary, destination); }
    catch (error) { if (existsSync(backup)) renameSync(backup, destination); throw error; }
    if (existsSync(backup)) rmSync(backup, { recursive: true });
  } finally { rmSync(temporary, { recursive: true, force: true }); }
  return destination;
}

function nsisQuote(value) { return String(value).replaceAll('$', '$$').replaceAll('"', '$\\"').replaceAll('\r', '').replaceAll('\n', ''); }
export function installerScript(directory, output, config) {
  const app = config.application;
  const q = nsisQuote;
  noLinks(directory);
  const marker = join(directory, 'application.json');
  const recorded = existsSync(marker) ? JSON.parse(readFileSync(marker, 'utf8')).artifactFiles : undefined;
  const owned = recorded || listFiles(directory);
  if (!Array.isArray(owned) || !owned.every(safeOwnedPath)) throw new Error('Unsafe installer file list');
  const files = owned.map(path => path.replaceAll('/', '\\'));
  const folders = [...new Set(files.map(file => dirname(file)).filter(folder => folder !== '.'))].sort((a, b) => b.length - a.length);
  const startup = config.postInstall?.find(option => option.type === 'startup');
  const launch = config.postInstall?.find(option => option.type === 'launch');
  return `Unicode true
!include "MUI2.nsh"
Name "${q(app.name)}"
OutFile "${q(output)}"
InstallDir "$LOCALAPPDATA\\Programs\\${q(app.id)}"
InstallDirRegKey HKCU "Software\\${q(app.id)}" "InstallDir"
RequestExecutionLevel user
!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
${startup || launch ? '!insertmacro MUI_PAGE_COMPONENTS' : ''}
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "${config.installer?.language === 'en' ? 'English' : 'SimpChinese'}"
Section "Application"
SectionIn RO
SetOutPath "$INSTDIR"
${files.map(file => `SetOutPath "$INSTDIR${dirname(file) === '.' ? '' : '\\' + q(dirname(file))}"\nFile "${q(join(directory, file))}"`).join('\n')}
WriteUninstaller "$INSTDIR\\uninstall.exe"
CreateShortcut "$SMPROGRAMS\\${q(app.id)}.lnk" "$INSTDIR\\${q(app.id)}.exe"
WriteRegStr HKCU "Software\\${q(app.id)}" "InstallDir" "$INSTDIR"
WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${q(app.id)}" "DisplayName" "${q(app.name)}"
WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${q(app.id)}" "DisplayVersion" "${q(app.version)}"
WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${q(app.id)}" "UninstallString" '$\\"$INSTDIR\\uninstall.exe$\\"'
SectionEnd
${startup ? `Section ${startup.default ? '' : '/o '}"${q(startup.name || 'Start with Windows')}"
CreateShortcut "$SMSTARTUP\\${q(app.id)}.lnk" "$INSTDIR\\${q(app.id)}.exe"
SectionEnd` : ''}
${launch ? `Section ${launch.default ? '' : '/o '}"${q(launch.name || 'Launch after installation')}"
Exec '$\\"$INSTDIR\\${q(app.id)}.exe$\\"'
SectionEnd` : ''}
Section "Uninstall"
${files.map(file => `Delete "$INSTDIR\\${q(file)}"`).join('\n')}
Delete "$INSTDIR\\uninstall.exe"
Delete "$SMPROGRAMS\\${q(app.id)}.lnk"
Delete "$SMSTARTUP\\${q(app.id)}.lnk"
${folders.map(folder => `RMDir "$INSTDIR\\${q(folder)}"`).join('\n')}
RMDir "$INSTDIR"
DeleteRegKey HKCU "Software\\${q(app.id)}"
DeleteRegKey HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${q(app.id)}"
SectionEnd
`;
}
async function installer(root, directory, config, language) {
  const folder = join(root, 'output/installers');
  mkdirSync(folder, { recursive: true });
  mkdirSync(join(root, 'build/native/installer'), { recursive: true });
  const output = join(folder, `${config.application.id}-setup.exe`);
  const script = join(root, 'build/native/installer/setup.nsi');
  writeFileSync(script, '\uFEFF' + installerScript(directory, output, config));
  await run(process.env.EWP_MAKENSIS || 'makensis', ['/V2', script], { cwd: root, language });
  console.log(output);
  return output;
}

export async function sourceBundle(root, language) {
  const manifest = projectManifest(root);
  const id = manifest.name;
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(id)) throw new Error('Unsafe package name');
  const staging = join(root, 'build/native/bundle', id);
  assertSafeParents(staging);
  if (existsSync(staging)) { noLinks(staging); rmSync(staging, { recursive: true }); }
  mkdirSync(staging, { recursive: true });
  // Explicit source boundary; no .maintainer, profiles, caches or credentials.
  for (const name of ['frontend', 'backend', 'scripts', 'tests', 'docs/index.md', 'docs/design.md', 'docs/agent.md', 'docs/images',
    'docs/.easy-dev/agent.md', 'docs/.easy-dev/skills/easy-dev', 'docs/.agents/skills/easy-dev', 'docs/.claude/skills/easy-dev',
    'startup.cmd', 'ewp.pack.json', 'README.md', 'LICENSE', 'AGENTS.md', 'CLAUDE.md', '.gitignore', '.github/copilot-instructions.md']) {
    const source = join(root, name);
    if (!existsSync(source)) continue;
    cpSync(source, join(staging, name), { recursive: true, filter: path => {
      if (lstatSync(path).isSymbolicLink()) throw new Error(`Linked source is not allowed: ${path}`);
      return !/(?:^|[\\/])(?:node_modules|target|build|output|\.git|\.venv|\.maintainer|__pycache__|vendor)(?:[\\/]|$)/.test(relative(source, path))
        && !/\.env(?:\.|$)|settings\.local|history\.jsonl|\.pyc$/.test(basename(path));
    } });
  }
  const version = manifest.version || '0.1.0';
  if (typeof version !== 'string' || !/^[a-zA-Z0-9.+-]+$/.test(version)) throw new Error('Unsafe package version');
  const output = join(root, 'output/bundles', `${id}-${version}-source.zip`);
  assertSafeParents(dirname(output));
  mkdirSync(dirname(output), { recursive: true });
  // tar.exe ships with supported Windows versions; ZIP format is selected by -a.
  await run('tar.exe', ['-a', '-cf', output, '-C', dirname(staging), id], { cwd: root, language });
  console.log(output);
  return output;
}

export async function task(root, options = {}) {
  root = resolve(root);
  const language = languageOf(root, options);
  const command = options.task || options.command;
  const backend = backendName(root);
  if (backend === 'python') fail(language, 'Python 任务应通过 scripts/dev.py 执行。', 'Python tasks use scripts/dev.py.');
  if (command === 'wheel') fail(language, 'wheel 仅适用于 Python 后端。', 'Wheel is only available for the Python backend.');
  if (command === 'bundle') { await sourceBundle(root, language); return 0; }
  if (command === 'test') {
    await run(process.execPath, ['--test', join(root, 'tests/npm-runtime.test.mjs')], { cwd: root, language });
    if (backend === 'rust') await run(process.env.EWP_CARGO || 'cargo', ['test', '--manifest-path', join(root, 'backend/Cargo.toml'), '--target-dir', join(root, 'build/native/rust')], { cwd: root, language });
    else await buildBackend(root, { language, debug: true });
    return 0;
  }
  if (command === 'backend:build') { console.log(await buildBackend(root, { language, debug: Boolean(options.debug) })); return 0; }
  if (!['init', 'demo', 'exe', 'app', 'installer', 'build', 'full-build', 'build:all'].includes(command)) {
    fail(language, `不支持的原生任务：${command}`, `Unsupported native task: ${command}`);
  }
  if (command === 'init') return initialize(root, options);
  const config = command === 'demo' ? null : loadPackConfig(root, options);
  if (['full-build', 'build:all'].includes(command)) await task(root, { ...options, task: 'test' });
  await frontendBuild(root);
  const executable = await buildBackend(root, { language, debug: command === 'demo' && options.debug });
  if (command === 'demo') {
    await run(executable, ['--assets', join(root, 'output/frontend'), '--title', projectManifest(root).name, ...(options.debug ? ['--debug'] : [])], { cwd: root, language });
    return 0;
  }
  const directory = stageApp(root, executable, config, command === 'exe' && !options.mode && !options.config && !options.installer ? 'exe' : 'apps');
  console.log(directory);
  if (config.install) await installer(root, directory, config, language);
  if (['full-build', 'build:all'].includes(command)) await sourceBundle(root, language);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const options = { task: args.shift() || 'init' };
  while (args.length) {
    const arg = args.shift();
    if (arg === '--debug' || arg === '--installer') options[arg.slice(2)] = true;
    else if (['--lang', '--mode', '--config'].includes(arg) && args[0] && !args[0].startsWith('-')) options[arg === '--lang' ? 'language' : arg.slice(2)] = args.shift();
    else throw new Error(`Unknown or incomplete option: ${arg}`);
  }
  task(resolve(dirname(fileURLToPath(import.meta.url)), '..'), options).then(code => { process.exitCode = code; }, error => {
    console.error(error.message); process.exitCode = error.exitCode || 1;
  });
}