import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const BACKEND_TOOLS = {
  python: [{ name: 'Python >=3.10', url: 'https://www.python.org/downloads/' }],
  golang: [{ name: 'Go >=1.22', url: 'https://go.dev/dl/' }, { name: 'MinGW-w64 C++ compiler', url: 'https://www.msys2.org/' }],
  rust: [
    { name: 'Rust/Cargo with the MSVC target', url: 'https://rustup.rs/' },
    { name: 'Visual Studio 2022 Build Tools (Desktop development with C++)', url: 'https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022' }
  ],
  cpp: [
    { name: 'CMake >=3.24', url: 'https://cmake.org/download/' },
    { name: 'Visual Studio 2022 Build Tools (Desktop development with C++) and Windows SDK', url: 'https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022' }
  ]
};

function probe(command, args, { env, run }) {
  const result = run(command, args, { env, encoding: 'utf8', timeout: 10000, windowsHide: true });
  return !result.error && result.status === 0 ? `${result.stdout ?? ''}\n${result.stderr ?? ''}` : '';
}

function hasMsvc({ env, run, exists }) {
  if (probe('where.exe', ['cl.exe'], { env, run })) return true;
  const vswhere = join(env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft Visual Studio/Installer/vswhere.exe');
  return exists(vswhere) && Boolean(probe(vswhere, ['-latest', '-products', '*', '-requires',
    'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'], { env, run }).trim());
}

function version(text, expression) {
  const match = expression.exec(text);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

function meets(actual, minimum) {
  return actual && (actual[0] > minimum[0] || (actual[0] === minimum[0] && actual[1] >= minimum[1]));
}

export function inspectToolchain(backend, {
  platform = process.platform,
  env = process.env,
  run = spawnSync,
  exists = existsSync,
  sdkPaths = ['C:/Program Files (x86)/Windows Kits/10/Include', 'C:/Program Files/Windows Kits/10/Include']
} = {}) {
  if (!BACKEND_TOOLS[backend]) throw new TypeError(`Unknown backend: ${backend}`);
  const missing = [];
  const add = name => { if (!missing.includes(name)) missing.push(name); };
  if (platform !== 'win32' && backend !== 'python') add('Windows desktop build support');

  if (backend === 'python') {
    const candidates = platform === 'win32' ? [['py', ['-3', '--version']], ['python', ['--version']]]
      : [['python3', ['--version']], ['python', ['--version']]];
    const found = candidates.some(([command, args]) => meets(
      version(probe(command, args, { env, run }), /Python (\d+)\.(\d+)/), [3, 10]));
    if (!found) add('Python >=3.10');
  } else if (backend === 'golang') {
    if (!meets(version(probe(env.EWP_GO || 'go', ['version'], { env, run }), /\bgo(\d+)\.(\d+)/), [1, 22])) add('Go >=1.22');
    if (!env.CXX && !probe('g++', ['--version'], { env, run })) add('MinGW-w64 C++ compiler');
    if (platform === 'win32' && !sdkPaths.some(path => exists(path))) add('Windows SDK');
  } else if (backend === 'rust') {
    const cargo = version(probe(env.EWP_CARGO || 'cargo', ['--version'], { env, run }), /\bcargo (\d+)\.(\d+)/);
    const compiler = probe(env.RUSTC || 'rustc', ['-vV'], { env, run });
    const host = /^host:\s*(.+)$/m.exec(compiler)?.[1]?.trim() ?? '';
    if (!meets(cargo, [1, 0]) || !compiler || (platform === 'win32' && !host.endsWith('-windows-msvc'))) add('Rust/Cargo with the MSVC target');
    if (!hasMsvc({ env, run, exists })) add('Visual Studio C++ Build Tools');
    if (platform === 'win32' && !sdkPaths.some(path => exists(path))) add('Windows SDK');
  } else {
    if (!meets(version(probe(env.EWP_CMAKE || 'cmake', ['--version'], { env, run }), /cmake version (\d+)\.(\d+)/), [3, 24])) add('CMake >=3.24');
    if (!hasMsvc({ env, run, exists })) add('Visual Studio C++ Build Tools');
    if (platform === 'win32' && !sdkPaths.some(path => exists(path))) add('Windows SDK');
  }

  return { backend, missing, available: missing.length === 0 };
}

export function toolchainGuidance(result, language = 'zh-CN') {
  if (!result.missing.length) return '';
  const lines = [language === 'en'
    ? `Missing ${result.backend} build requirements: ${result.missing.join(', ')}.`
    : `检测到缺少 ${result.backend} 构建环境：${result.missing.join('、')}。`];
  for (const requirement of BACKEND_TOOLS[result.backend]) {
    if (result.missing.includes(requirement.name)) lines.push(`${requirement.name}: ${requirement.url}`);
  }
  if (result.backend === 'rust' && result.missing.some(name => name.includes('Visual Studio') || name.includes('Windows SDK'))) {
    lines.push(`Visual Studio Build Tools: ${BACKEND_TOOLS.rust[1].url}`);
  }
  if (result.backend === 'cpp' && result.missing.some(name => name.includes('Visual Studio') || name.includes('Windows SDK'))) {
    lines.push(`Visual Studio Build Tools / Windows SDK: ${BACKEND_TOOLS.cpp[1].url}`);
  }
  lines.push(language === 'en'
    ? 'Install the missing tools, reopen the terminal, then rerun npm run init. Toolchains are not downloaded automatically; project files and existing environments are preserved.'
    : '请安装缺少的工具，重新打开终端后运行 npm run init；不会自动下载工具链、删除项目文件或已有环境。');
  return lines.join('\n');
}
