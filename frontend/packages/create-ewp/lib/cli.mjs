import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { AI_TOOLS, createProject, normalizeAi, TEMPLATES, validateTarget } from './create.mjs';

export const HELP = `create-ewp 0.1.0 — 创建桌面项目 / Create a desktop project
Node >=22.12.0; desktop: Python >=3.10, Windows + WebView2

Usage / 用法:
  npm create ewp@latest
  npm create ewp@latest "My App" -- --template vue-ts --no-install --no-start
  create-ewp [project-name] [options]

Options / 参数:
  --template <name>  vanilla | vue | react | vanilla-ts | vue-ts | react-ts
  --dir <path>       项目目标目录 / Destination directory (may contain spaces)
  --ai <tools>       可选 AI 指引 / codex,claude,copilot or none (default: none)
  --yes, -y         跳过提示，默认 vanilla、不安装、不启动 / Skip prompts
  --no-install      不安装依赖 / Do not install dependencies
  --no-start        不启动 / Do not start
  --install         安装 npm 依赖 / Install npm dependencies only
  --start           安装后初始化 Python 并启动桌面 / Initialize Python and start
  --help, -h        显示帮助 / Show help

非交互默认不安装、不启动 / Non-interactive defaults: no install, no start.
目标必须为空，包含 .git 也会拒绝 / Target must be empty, including .git.
`;

export function parseArgs(argv = []) {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true };
  const options = {};
  const set = (key, value) => {
    if (key in options && options[key] !== value) throw new Error(`冲突参数 / Conflicting option: ${key}`);
    options[key] = value;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (arg === '--yes' || arg === '-y') { options.yes = true; continue; }
    if (arg === '--ai' || arg.startsWith('--ai=')) {
      const value = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : argv[++i];
      if (!value || value.startsWith('--')) throw new Error(`参数缺少值 / Missing value: ${arg}`);
      const ai = normalizeAi(value);
      if ('ai' in options && JSON.stringify(options.ai) !== JSON.stringify(ai)) throw new Error('Conflicting option: ai');
      options.ai = ai;
      continue;
    }
    if (['--no-install', '--install', '--no-start', '--start'].includes(arg)) {
      set(arg.endsWith('install') ? 'install' : 'start', !arg.startsWith('--no-'));
      continue;
    }
    if (arg === '--template' || arg.startsWith('--template=') || arg === '--dir' || arg.startsWith('--dir=')) {
      const key = arg.startsWith('--template') ? 'template' : 'directory';
      const value = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : argv[++i];
      if (!value || value.startsWith('--')) throw new Error(`参数缺少值 / Missing value: ${arg}`);
      set(key, value);
      continue;
    }
    if (arg.startsWith('-')) throw new Error(`未知参数 / Unknown option: ${arg}`);
    if ('name' in options) throw new Error('只允许一个项目名称 / Only one project name is allowed.');
    options.name = arg;
  }
  if (options.template && !TEMPLATES.includes(options.template)) {
    throw new Error(`未知模板 / Unknown template: ${options.template}. ${TEMPLATES.join(', ')}`);
  }
  if (options.start && options.install === false) throw new Error('--start 需要安装依赖 / --start requires installation; remove --no-install.');
  return options;
}

export function quoteDirectory(path, platform = process.platform) {
  // Single-quoted PowerShell/POSIX paths preserve spaces and shell metacharacters.
  return platform === 'win32' ? `'${path.replaceAll("'", "''")}'` : `'${path.replaceAll("'", "'\\''")}'`;
}

export function npmCommand(args, { env = process.env, platform = process.platform, execPath = process.execPath } = {}) {
  const npmCli = env.npm_execpath;
  const candidates = [npmCli, join(dirname(execPath), 'node_modules/npm/bin/npm-cli.js'), join(dirname(execPath), '../lib/node_modules/npm/bin/npm-cli.js')];
  const script = candidates.find(path => path && /npm-cli\.js$/.test(path) && existsSync(path));
  if (script) return { command: execPath, args: [resolve(script), ...args], options: {} };
  if (platform !== 'win32') return { command: 'npm', args, options: {} };
  const path = Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1] ?? '';
  const batch = path.split(';').map(part => join(part.replace(/^"|"$/g, ''), 'npm.cmd')).find(existsSync);
  if (!batch) throw new Error('找不到 npm / npm was not found on PATH.');
  const quote = token => {
    if (/["%\r\n\0]/.test(token)) throw new Error('npm 参数无法安全引用 / Cannot safely quote npm argument.');
    return `"${token}"`;
  };
  return {
    command: env.ComSpec || env.COMSPEC || join(env.SystemRoot || 'C:\\Windows', 'System32/cmd.exe'),
    args: ['/d', '/s', '/v:off', '/c', `"${[batch, ...args].map(quote).join(' ')}"`],
    options: { windowsVerbatimArguments: true }
  };
}

export async function runNpm(args, directory) {
  const spec = npmCommand(args);
  const child = spawn(spec.command, spec.args, { ...spec.options, cwd: directory, stdio: 'inherit', shell: false, detached: process.platform !== 'win32' });
  let interrupted = false;
  const interrupt = () => {
    interrupted = true;
    if (!child.pid) return;
    if (process.platform === 'win32') {
      const killer = spawn(join(process.env.SystemRoot || 'C:\\Windows', 'System32/taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      killer.once('error', () => child.kill());
    } else {
      try { process.kill(-child.pid, 'SIGINT'); } catch { child.kill('SIGINT'); }
    }
  };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  try {
    const code = await new Promise((resolveExit, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolveExit(interrupted || signal ? 130 : code ?? 1));
    });
    if (code) {
      const error = new Error(`npm ${args.join(' ')} 失败 / failed (exit ${code}). 项目已保留 / Project files were kept: ${directory}`);
      error.exitCode = code;
      throw error;
    }
  } finally {
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
  }
}

/** Injectable prompts/process execution let tests verify behavior without a TTY. */
export async function main(argv = process.argv.slice(2), {
  cwd = process.cwd(), interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY),
  prompts, run = runNpm, log = console.log, templatesDir
} = {}) {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 12)) throw new Error('需要 Node >=22.12.0 / Node >=22.12.0 is required.');
  const options = parseArgs(argv);
  if (options.help) { log(HELP); return 0; }
  const ask = interactive && !options.yes;
  let p;
  const cancellation = Symbol('cancelled');
  const answer = async result => {
    const value = await result;
    if (p.isCancel(value)) throw cancellation;
    return value;
  };
  try {
    if (ask) {
      p = prompts ?? await import('@clack/prompts');
      p.intro('Easy Windows Pack — 创建项目 / Create project');
      if (!options.name && !options.directory) {
        options.name = await answer(p.text({
          message: '项目名称 / Project name', placeholder: 'ewp-app', defaultValue: 'ewp-app',
          validate(value) { try { validateTarget(value || 'ewp-app', cwd); } catch (error) { return error.message; } }
        }));
      }
      if (!options.template) {
        const framework = await answer(p.select({
          message: '选择框架 / Select a framework', initialValue: 'vanilla',
          options: [{ value: 'vanilla', label: 'Vanilla' }, { value: 'vue', label: 'Vue' }, { value: 'react', label: 'React' }]
        }));
        const language = await answer(p.select({
          message: '选择语言 / Select a language', initialValue: 'js',
          options: [{ value: 'js', label: 'JavaScript' }, { value: 'ts', label: 'TypeScript' }]
        }));
        options.template = framework + (language === 'ts' ? '-ts' : '');
      }
      if (options.ai === undefined) options.ai = await answer(p.multiselect({
        message: '可选 AI 指引（空格多选，回车跳过）/ Optional AI guidance',
        required: false, initialValues: [],
        options: AI_TOOLS.map(value => ({ value, label: { codex: 'Codex (AGENTS.md)', claude: 'Claude (CLAUDE.md)', copilot: 'Copilot (.github/copilot-instructions.md)' }[value] }))
      }));
      if (options.install === undefined) options.install = await answer(p.confirm({ message: '安装 npm 依赖？/ Install npm dependencies?', initialValue: false }));
      if (options.start === undefined) options.start = await answer(p.confirm({ message: '初始化 Python 并启动桌面？/ Initialize Python and start desktop?', initialValue: false }));
    }
    const directory = options.directory ?? options.name ?? 'ewp-app';
    const install = options.install ?? Boolean(options.start);
    if (options.start && !install) throw new Error('启动需要 npm 依赖 / Starting requires npm dependencies. Choose installation or do not start.');
    const result = createProject({ directory, name: options.name ? basename(options.name) : undefined, template: options.template ?? 'vanilla', ai: options.ai ?? [], cwd, templatesDir });
    log(`项目已创建 / Project created: ${result.directory} (${result.template})`);
    const frontend = join(result.directory, 'frontend');
    if (install) await run(['install'], frontend);
    const commands = [`cd ${quoteDirectory(frontend)}`];
    if (!install) commands.push('npm install');
    commands.push('npm run init', 'npm run dev');
    log(`桌面开发 / Desktop development:\n  ${commands.join('\n  ')}\n浏览器预览 / Browser preview: npm run frontend:dev`);
    if (ask) p.outro(options.start ? '正在启动 / Starting desktop' : '准备完成 / Ready');
    if (options.start) {
      await run(['run', 'init'], frontend);
      await run(['run', 'dev'], frontend);
    }
    return 0;
  } catch (error) {
    if (error === cancellation) { p.cancel('操作已取消，未创建项目 / Cancelled; no project was created.'); return 130; }
    throw error;
  }
}