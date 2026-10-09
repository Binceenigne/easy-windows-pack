import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { AI_TOOLS, createProject, creatorError, LANGUAGES, localizeError, normalizeAi, normalizeLanguage, TEMPLATES, validateTarget } from './create.mjs';

export function helpText(language = 'zh-CN') {
  return normalizeLanguage(language) === 'en' ? `create-ewp — Create a desktop project
Node >=22.12.0; desktop: Python >=3.10, Windows + WebView2

Usage:
  npm create ewp@latest
  npm create ewp@latest "My App" -- --template vue-ts --no-install --no-start
  create-ewp [project-name] [options]

Options:
  --lang <language>  zh-CN | en (priority: --lang > EWP_LANG > project > zh-CN)
  --template <name>  vanilla | vue | react | vanilla-ts | vue-ts | react-ts
  --dir <path>       Destination directory (may contain spaces)
  --ai <tools>       codex,claude,copilot or none (default: none)
  --yes, -y         Skip prompts; default: vanilla, no install, no start
  --no-install      Do not install dependencies
  --no-start        Do not start
  --install         Install npm dependencies only
  --start           Install, initialize Python and start desktop
  --help, -h        Show help

The first interactive prompt selects the language; --lang skips it.
Non-interactive defaults: project language or zh-CN, no install, no start.
Target must be empty, including .git.
` : `create-ewp — 创建桌面项目
需要 Node >=22.12.0；桌面需要 Python >=3.10、Windows 和 WebView2。

用法：
  npm create ewp@latest
  npm create ewp@latest "My App" -- --template vue-ts --no-install --no-start
  create-ewp [项目名称] [参数]

参数：
  --lang <语言>      zh-CN | en（优先级：--lang > EWP_LANG > 项目设置 > zh-CN）
  --template <模板>  vanilla | vue | react | vanilla-ts | vue-ts | react-ts
  --dir <路径>       项目目标目录，可包含空格
  --ai <工具>        codex,claude,copilot 或 none（默认 none）
  --yes, -y         跳过提示，默认 vanilla、不安装、不启动
  --no-install      不安装依赖
  --no-start        不启动
  --install         仅安装 npm 依赖
  --start           安装依赖、初始化 Python 并启动桌面
  --help, -h        显示帮助

交互的第一个提示选择语言；显式 --lang 跳过此提示。
非交互默认不安装、不启动，使用项目语言或简体中文。
目标必须为空，包含 .git 也会拒绝。
`;
}

export const HELP = helpText();

function projectLanguage(cwd) {
  for (let current = resolve(cwd); ; current = dirname(current)) {
    try {
      const manifest = JSON.parse(readFileSync(join(current, 'frontend/package.json'), 'utf8').replace(/^\uFEFF/, ''));
      if (manifest?.ewp?.language !== undefined) return manifest.ewp.language;
    } catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes(error.code) && !(error instanceof SyntaxError)) throw error;
    }
    if (dirname(current) === current) return 'zh-CN';
  }
}

// Resolve output language before validating other flags, even when --lang is last.
function argumentLanguage(argv, env, cwd) {
  let requested;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--lang') requested = argv[++i];
    else if (argv[i].startsWith('--lang=')) requested = argv[i].slice(7);
  }
  // A valid explicit flag must not be invalidated by an unrelated environment value.
  if (requested && !requested.startsWith('-')) {
    return normalizeLanguage(requested, env.EWP_LANG === 'en' ? 'en' : 'zh-CN');
  }
  return normalizeLanguage(env.EWP_LANG || projectLanguage(cwd));
}

export function parseArgs(argv = [], { env = process.env, cwd = process.cwd() } = {}) {
  const language = argumentLanguage(argv, env, cwd);
  const options = { language };
  let requestedLanguage;
  const set = (key, value) => {
    if (key in options && options[key] !== value) throw creatorError('conflict', { option: key }, language);
    options[key] = value;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (arg === '--lang' || arg.startsWith('--lang=')) {
      const value = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : argv[++i];
      if (!value || value.startsWith('-')) throw creatorError('missingValue', { option: '--lang' }, language);
      const normalized = normalizeLanguage(value, language);
      if (requestedLanguage && requestedLanguage !== normalized) throw creatorError('conflict', { option: '--lang' }, language);
      requestedLanguage = normalized;
      continue;
    }
    if (arg === '--help' || arg === '-h') { options.help = true; continue; }
    // Help requires only language flags and works without a project or templates.
    if (argv.includes('--help') || argv.includes('-h')) continue;
    if (arg === '--yes' || arg === '-y') { options.yes = true; continue; }
    if (arg === '--ai' || arg.startsWith('--ai=')) {
      const value = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : argv[++i];
      if (!value || value.startsWith('--')) throw creatorError('missingValue', { option: arg }, language);
      const ai = normalizeAi(value, language);
      if ('ai' in options && JSON.stringify(options.ai) !== JSON.stringify(ai)) throw creatorError('conflict', { option: 'ai' }, language);
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
      if (!value || value.startsWith('--')) throw creatorError('missingValue', { option: arg }, language);
      set(key, value);
      continue;
    }
    if (arg.startsWith('-')) throw creatorError('unknownOption', { option: arg }, language);
    if ('name' in options) throw creatorError('extraName', {}, language);
    options.name = arg;
  }
  if (options.template && !TEMPLATES.includes(options.template)) {
    throw creatorError('unknownTemplate', { template: options.template, templates: TEMPLATES.join(', ') }, language);
  }
  if (options.start && options.install === false) throw creatorError('startConflict', {}, language);
  return options;
}

export function quoteDirectory(path, platform = process.platform) {
  // Single-quoted PowerShell/POSIX paths preserve spaces and shell metacharacters.
  return platform === 'win32' ? `'${path.replaceAll("'", "''")}'` : `'${path.replaceAll("'", "'\\''")}'`;
}

export function npmCommand(args, { env = process.env, platform = process.platform, execPath = process.execPath, language = 'zh-CN' } = {}) {
  const npmCli = env.npm_execpath;
  const candidates = [npmCli, join(dirname(execPath), 'node_modules/npm/bin/npm-cli.js'), join(dirname(execPath), '../lib/node_modules/npm/bin/npm-cli.js')];
  const script = candidates.find(path => path && /npm-cli\.js$/.test(path) && existsSync(path));
  if (script) return { command: execPath, args: [resolve(script), ...args], options: {} };
  if (platform !== 'win32') return { command: 'npm', args, options: {} };
  const path = Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1] ?? '';
  const batch = path.split(';').map(part => join(part.replace(/^"|"$/g, ''), 'npm.cmd')).find(existsSync);
  if (!batch) throw creatorError('npmMissing', {}, language);
  const quote = token => {
    if (/["%\r\n\0]/.test(token)) throw creatorError('npmQuote', {}, language);
    return `"${token}"`;
  };
  return {
    command: env.ComSpec || env.COMSPEC || join(env.SystemRoot || 'C:\\Windows', 'System32/cmd.exe'),
    args: ['/d', '/s', '/v:off', '/c', `"${[batch, ...args].map(quote).join(' ')}"`],
    options: { windowsVerbatimArguments: true }
  };
}

export async function runNpm(args, directory, { language = 'zh-CN', env = process.env } = {}) {
  const spec = npmCommand(args, { language, env });
  const child = spawn(spec.command, spec.args, { ...spec.options, cwd: directory, env: { ...env, EWP_LANG: language }, stdio: 'inherit', shell: false, detached: process.platform !== 'win32' });
  let interrupted = false;
  const interrupt = () => {
    interrupted = true;
    if (!child.pid) return;
    if (process.platform === 'win32') {
      const killer = spawn(join(env.SystemRoot || 'C:\\Windows', 'System32/taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      killer.once('error', () => child.kill());
    } else {
      try { process.kill(-child.pid, 'SIGINT'); } catch { child.kill('SIGINT'); }
    }
  };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  try {
    const code = await new Promise((resolveExit, reject) => {
      child.once('error', error => reject(creatorError('npmLaunch', { command: args.join(' '), code: error.code ?? 'UNKNOWN', directory }, language)));
      child.once('exit', (code, signal) => resolveExit(interrupted || signal ? 130 : code ?? 1));
    });
    if (code) {
      const error = creatorError('npmFailed', { command: args.join(' '), code, directory }, language);
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
  prompts, run = runNpm, log = console.log, templatesDir, env = process.env
} = {}) {
  const options = parseArgs(argv, { env, cwd });
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 12)) throw creatorError('nodeVersion', {}, options.language);
  if (options.help) { log(helpText(options.language)); return 0; }
  const text = (zh, en) => options.language === 'en' ? en : zh;
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
      p.intro('Easy Windows Pack');
      if (!argv.some(arg => arg === '--lang' || arg.startsWith('--lang='))) {
        options.language = normalizeLanguage(await answer(p.select({
          message: '语言 / Language', initialValue: options.language,
          options: LANGUAGES.map(value => ({ value, label: value === 'en' ? 'English' : '简体中文' }))
        })), options.language);
      }
      if (!options.name && !options.directory) {
        options.name = await answer(p.text({
          message: text('项目名称', 'Project name'), placeholder: 'ewp-app', defaultValue: 'ewp-app',
          validate(value) { try { validateTarget(value || 'ewp-app', cwd, options.language); } catch (error) { return error.message; } }
        }));
      }
      if (!options.template) {
        const framework = await answer(p.select({
          message: text('选择框架', 'Select a framework'), initialValue: 'vanilla',
          options: [{ value: 'vanilla', label: 'Vanilla' }, { value: 'vue', label: 'Vue' }, { value: 'react', label: 'React' }]
        }));
        const programmingLanguage = await answer(p.select({
          message: text('选择编程语言', 'Select a programming language'), initialValue: 'js',
          options: [{ value: 'js', label: 'JavaScript' }, { value: 'ts', label: 'TypeScript' }]
        }));
        options.template = framework + (programmingLanguage === 'ts' ? '-ts' : '');
      }
      if (options.ai === undefined) options.ai = await answer(p.multiselect({
        message: text('可选 AI 指引（空格多选，回车跳过）', 'Optional AI guidance (Space to select, Enter to skip)'),
        required: false, initialValues: [],
        options: AI_TOOLS.map(value => ({ value, label: { codex: 'Codex (AGENTS.md)', claude: 'Claude (CLAUDE.md)', copilot: 'Copilot (.github/copilot-instructions.md)' }[value] }))
      }));
      if (options.install === undefined) options.install = await answer(p.confirm({ message: text('安装 npm 依赖？', 'Install npm dependencies?'), initialValue: false }));
      if (options.start === undefined) options.start = await answer(p.confirm({ message: text('初始化 Python 并启动桌面？', 'Initialize Python and start desktop?'), initialValue: false }));
    }
    const directory = options.directory ?? options.name ?? 'ewp-app';
    const install = options.install ?? Boolean(options.start);
    if (options.start && !install) throw creatorError('startNeedsInstall', {}, options.language);
    const result = createProject({ directory, name: options.name ? basename(options.name) : undefined, template: options.template ?? 'vanilla', ai: options.ai ?? [], language: options.language, cwd, templatesDir });
    log(`${text('项目已创建：', 'Project created: ')}${result.directory} (${result.template})`);
    const frontend = join(result.directory, 'frontend');
    const runOptions = { language: options.language, env: { ...env, EWP_LANG: options.language } };
    if (install) await run(['install'], frontend, runOptions);
    const commands = [`cd ${quoteDirectory(frontend)}`];
    if (!install) commands.push('npm install');
    commands.push('npm run init', 'npm run dev');
    log(`${text('桌面开发：', 'Desktop development:')}\n  ${commands.join('\n  ')}\n${text('浏览器预览：', 'Browser preview: ')}npm run frontend:dev\n${text('命令帮助：', 'Command help: ')}npm run help`);
    if (ask) p.outro(options.start ? text('正在启动桌面', 'Starting desktop') : text('准备完成', 'Ready'));
    if (options.start) {
      await run(['run', 'init'], frontend, runOptions);
      await run(['run', 'dev'], frontend, runOptions);
    }
    return 0;
  } catch (error) {
    if (error === cancellation) { p.cancel(text('操作已取消，未创建项目。', 'Cancelled; no project was created.')); return 130; }
    throw localizeError(error, options.language);
  }
}