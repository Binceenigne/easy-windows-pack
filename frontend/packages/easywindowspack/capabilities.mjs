import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspectToolchain, toolchainGuidance } from 'create-ewp/toolchain';

export const BACKEND_CAPABILITIES = Object.freeze({
  python: Object.freeze({ name: 'Python', modes: ['onefile', 'onedir'], wheel: true, installer: 'pyinstaller', advancedInstaller: true }),
  golang: Object.freeze({ name: 'Go', modes: ['onedir'], wheel: false, installer: 'nsis', advancedInstaller: false }),
  rust: Object.freeze({ name: 'Rust', modes: ['onedir'], wheel: false, installer: 'nsis', advancedInstaller: false }),
  cpp: Object.freeze({ name: 'C++', modes: ['onedir'], wheel: false, installer: 'nsis', advancedInstaller: false })
});

export const MENU_TASKS = [
  { command: 'init', group: 'start', zh: '初始化 / 修复环境', en: 'Initialize / repair environment' },
  { command: 'dev', group: 'develop', zh: '桌面热更新开发', en: 'Desktop development with HMR' },
  { command: 'browser', group: 'develop', zh: '浏览器热更新预览', en: 'Browser development with HMR' },
  { command: 'demo', args: ['--debug'], group: 'develop', zh: '桌面演示（开发者工具）', en: 'Desktop demo (developer tools)' },
  { command: 'frontend', group: 'build', zh: '编译前端', en: 'Build frontend' },
  { command: 'frontend:preview', group: 'build', zh: '预览已编译前端', en: 'Preview built frontend' },
  { command: 'app', group: 'package', zh: '按配置构建应用', en: 'Build configured application' },
  { command: 'exe', group: 'package', zh: '构建应用（兼容 EXE 入口）', en: 'Build application (legacy EXE entry)' },
  { command: 'installer', group: 'package', zh: '构建安装包', en: 'Build installer' },
  { command: 'wheel', group: 'package', zh: '构建 Python wheel', en: 'Build Python wheel' },
  { command: 'bundle', group: 'package', zh: '构建源码包', en: 'Build source bundle' },
  { command: 'build:all', group: 'package', zh: '完整构建', en: 'Full build' },
  { command: 'test', group: 'inspect', zh: '后端测试', en: 'Backend tests' },
  { command: 'check', group: 'inspect', zh: 'Node 运行时检查', en: 'Node runtime checks' },
  { command: 'info', group: 'inspect', zh: '环境信息', en: 'Environment info' },
  { command: 'docs', group: 'guide', zh: '打开离线文档', en: 'Open offline documentation' },
  { command: 'help', group: 'guide', zh: '命令速查', en: 'Command reference' }
];

export function inspectInstaller({ platform = process.platform, env = process.env, run = spawnSync, exists = existsSync } = {}) {
  const url = 'https://nsis.sourceforge.io/Download';
  const candidates = [env.EWP_MAKENSIS || 'makensis'];
  if (platform === 'win32') for (const command of candidates) {
    const result = run(command, ['/HDRINFO'], { env, encoding: 'utf8', timeout: 3000, windowsHide: true });
    if (!result.error && result.status === 0 && /\bv?3\.\d+/i.test(`${result.stdout ?? ''}\n${result.stderr ?? ''}`)) {
      return { available: true, command, missing: [], url };
    }
  }
  return { available: false, command: env.EWP_MAKENSIS || 'makensis', missing: ['NSIS 3 (makensis)'], url };
}

function pythonModule(root, name, platform, exists, directories) {
  const paths = [join(root, '.venv', 'Lib', 'site-packages', name, '__init__.py')];
  if (platform !== 'win32') {
    const lib = join(root, '.venv', 'lib');
    if (exists(lib)) for (const version of directories(lib)) if (/^python\d+\.\d+$/.test(version)) {
      paths.push(join(lib, version, 'site-packages', name, '__init__.py'));
    }
  }
  if (name === 'easy_windows_pack' && exists(join(root, 'backend', 'base', 'ewpcore', '__init__.py'))) return true;
  return paths.some(exists);
}

export function inspectProject(root, backend, {
  platform = process.platform, env = process.env, exists = existsSync, read = readFileSync,
  directories = readdirSync, inspect = inspectToolchain, installer = inspectInstaller,
  resolveModule = name => createRequire(join(root, 'frontend', 'package.json')).resolve(name)
} = {}) {
  if (!BACKEND_CAPABILITIES[backend]) throw new TypeError(`Unknown backend: ${backend}`);
  let frontendReady = exists(join(root, 'frontend', 'vite.config.mjs'));
  try { resolveModule('vite'); } catch { frontendReady = false; }
  const venvReady = exists(join(root, '.venv', 'pyvenv.cfg')) && exists(join(root, '.venv', platform === 'win32' ? 'Scripts' : 'bin', platform === 'win32' ? 'python.exe' : 'python'));
  const toolchain = backend === 'python' ? { backend, available: venvReady, missing: venvReady ? [] : ['.venv'] } : inspect(backend, { platform, env });
  const runtimeReady = backend !== 'python' || (venvReady && pythonModule(root, 'easy_windows_pack', platform, exists, directories));
  const wheelReady = backend !== 'python' || (venvReady && pythonModule(root, 'build', platform, exists, directories));
  const packagerReady = backend !== 'python' || (venvReady && pythonModule(root, 'PyInstaller', platform, exists, directories));
  let packaging;
  let configError;
  const path = join(root, 'ewp.pack.json');
  if (exists(path)) {
    try { packaging = JSON.parse(read(path, 'utf8').replace(/^\uFEFF/, '')); }
    catch (error) { configError = error.message; }
  }
  return { backend, platform, frontendReady, venvReady, runtimeReady, wheelReady, packagerReady, toolchain,
    installer: backend === 'python' ? { available: packagerReady } : installer({ platform, env }),
    builtFrontend: exists(join(root, 'output', 'frontend', 'index.html')),
    nodeTests: exists(join(root, 'tests', 'npm-runtime.test.mjs')),
    packaging: packaging ?? {}, configError };
}

export function menuModel(state, language = 'zh-CN') {
  const english = language === 'en';
  const say = (zh, en) => english ? en : zh;
  const capability = BACKEND_CAPABILITIES[state.backend];
  const native = state.backend !== 'python';
  const tasks = [];
  const hidden = [];
  const configuredInstall = state.packaging.build?.installer === true;
  const configProblem = state.configError || (native && (
    (state.packaging.build?.mode && !capability.modes.includes(state.packaging.build.mode)) ||
    ['features', 'prerequisites', 'hooks'].some(key => state.packaging[key] && Object.keys(state.packaging[key]).length)
  ));
  const packagingCommands = ['app', 'exe', 'installer', 'build:all'];
  for (const task of MENU_TASKS) {
    const command = task.command;
    let reason;
    if (command === 'wheel' && !capability.wheel) continue;
    if (['init', 'info', 'docs', 'help'].includes(command)) { tasks.push(task); continue; }
    if (['dev', 'demo', ...packagingCommands].includes(command) && native && state.platform !== 'win32') {
      reason = say('原生桌面构建需要 Windows', 'Native desktop builds require Windows');
    } else if (['wheel', ...packagingCommands].includes(command) && !native && state.platform !== 'win32' && command !== 'wheel') {
      reason = say('EXE 和安装包构建需要 Windows', 'EXE and installer builds require Windows');
    } else if (['dev', 'demo', 'test', ...packagingCommands].includes(command) && !state.toolchain.available) {
      reason = native ? state.toolchain.missing.join(', ') : say('请先运行 ewp init 创建有效 .venv', 'Run ewp init to create a valid .venv');
    } else if (command === 'wheel' && !native && !state.wheelReady) {
      reason = say('缺少 Python build，请重新运行 ewp init', 'Python build is missing; rerun ewp init');
    } else if (command === 'bundle' && !native && !state.runtimeReady) {
      reason = say('缺少项目 Python 运行库，请重新运行 ewp init', 'The project Python runtime is missing; rerun ewp init');
    } else if (command === 'bundle' && native && state.platform !== 'win32') {
      reason = say('原生源码打包需要 Windows tar.exe', 'Native source packaging requires Windows tar.exe');
    } else if (['browser', 'frontend', 'frontend:preview', 'dev', 'demo', 'check', 'wheel', ...packagingCommands].includes(command) && !state.frontendReady) {
      reason = say('前端依赖 / Vite 配置未就绪，请先运行 ewp init', 'Frontend dependencies / Vite config are missing; run ewp init');
    } else if (['check', 'test'].includes(command) && (command === 'check' || native) && !state.nodeTests) {
      reason = say('缺少 tests/npm-runtime.test.mjs', 'Missing tests/npm-runtime.test.mjs');
    } else if (command === 'frontend:preview' && !state.builtFrontend) {
      reason = say('请先运行 ewp frontend 编译前端', 'Run ewp frontend before previewing');
    } else if (packagingCommands.includes(command) && !state.packagerReady) {
      reason = say('缺少 PyInstaller，请重新运行 ewp init', 'PyInstaller is missing; rerun ewp init');
    } else if (packagingCommands.includes(command) && configProblem && !(command === 'exe' && !native) && !(command === 'build:all' && !native)) {
      reason = state.configError ? say('ewp.pack.json 不是有效 JSON', 'ewp.pack.json is not valid JSON')
        : say('原生后端仅支持 onedir 和基础安装配置，请检查 ewp.pack.json', 'Native backends support onedir and basic installer configuration; check ewp.pack.json');
    } else if (native && (command === 'installer' || (packagingCommands.includes(command) && configuredInstall)) && !state.installer.available) {
      reason = say('缺少 NSIS 3 (makensis)', 'NSIS 3 (makensis) is missing');
    }
    if (reason) hidden.push({ ...task, reason });
    else tasks.push(native && ['exe', 'app'].includes(command) ? { ...task,
      zh: command === 'exe' ? '构建目录版应用（EXE + 资源）' : '按配置构建目录版应用',
      en: command === 'exe' ? 'Build directory application (EXE + assets)' : 'Build configured directory application' } : task);
  }
  const guidance = [];
  if (native && !state.toolchain.available) guidance.push(toolchainGuidance(state.toolchain, language));
  if (native && !state.installer.available) guidance.push(say(
    `安装包入口已隐藏：安装 NSIS 3 并设置 PATH 或 EWP_MAKENSIS。${state.installer.url}`,
    `Installer entries are hidden: install NSIS 3 and set PATH or EWP_MAKENSIS. ${state.installer.url}`));
  return { backend: state.backend, capability, tasks, hidden, guidance };
}
