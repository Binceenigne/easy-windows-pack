import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const languages = new AsyncLocalStorage();
const valid = value => value === 'zh-CN' || value === 'en';
export const VERSION = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;
export const withLanguage = (language, action) => languages.run(language, action);
export const text = (zh, en) => languages.getStore() === 'en' ? en : zh;

export function projectLanguage(cwd = process.cwd()) {
  for (let current = resolve(cwd); ; current = dirname(current)) {
    try {
      const manifest = JSON.parse(readFileSync(join(current, 'frontend/package.json'), 'utf8').replace(/^\uFEFF/, ''));
      // The closest project owns the setting, including an unset/invalid value.
      return valid(manifest.ewp?.language) ? manifest.ewp.language : 'zh-CN';
    } catch { /* Help must work without a readable project manifest. */ }
    if (dirname(current) === current) return 'zh-CN';
  }
}

export function languageArgs(argv = [], { env = process.env, cwd = process.cwd() } = {}) {
  const fallback = valid(env.EWP_LANG) ? env.EWP_LANG : projectLanguage(cwd);
  const args = [];
  const values = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--lang') {
      values.push(argv[i + 1] && !argv[i + 1].startsWith('-') ? argv[++i] : undefined);
    } else if (arg.startsWith('--lang=')) values.push(arg.slice(7));
    else args.push(arg);
  }
  const language = values.findLast(valid) ?? fallback;
  return withLanguage(language, () => {
    if (values.some(value => !valid(value))) throw new Error(text('--lang 需要 zh-CN 或 en。', '--lang requires zh-CN or en.'));
    if (new Set(values).size > 1) throw new Error(text('--lang 参数冲突，请只选择一种语言。', 'Conflicting --lang options; choose one language.'));
    return { args, language, explicit: values.length > 0 };
  });
}

export function helpText(language = 'zh-CN') {
  return withLanguage(language, () => text(
`easywindowspack ${VERSION} (Node >=22.12)
用法：ewp [命令] [参数]
全局帮助无需项目：ewp / ewp help / ewp -h / ewp --help
  create [项目名称] [参数]   创建项目；ewp create -h 查看创建帮助
  --version, -v, -V         显示版本

项目根目录：ewp <任务>；frontend 内：npm run <任务>
未全局安装时：npm --prefix frontend run ewp -- <任务>
  menu                     打开开发菜单（无需先初始化 Python）
  init                     初始化项目 Python .venv 与依赖
  dev [--web]              Vite + 桌面热更新；--web 仅浏览器
  browser | frontend:dev   Vite 浏览器热更新
  frontend | frontend:build  编译前端
  frontend:preview         预览已编译的前端
  demo [--debug]           编译前端后运行桌面演示，可开启开发者工具
  wheel | exe | bundle     构建 wheel / Windows EXE / 源码包
  app | build:app           按配置构建应用，默认使用配置中的模式
  installer                构建应用并强制生成安装包
  build [-w|--wheel] [-e|--exe] [--all]  默认构建 EXE，目标互斥
  build:all | full-build   完整构建：test → wheel → exe → bundle
  test | info | check      Python 测试 / 项目信息 / Node 检查

应用打包参数（app / installer / exe / build / full-build）：
  --mode onefile|onedir    覆盖应用模式；支持单文件或目录
  --config PATH           配置路径相对项目根，默认 ewp.pack.json；含空格时加引号
  --installer             同时生成安装包；build --wheel / -w 与以上参数互斥
新打包产物：output/apps/ 和 output/installers/；exe 不带以上参数时使用 output/exe/。
浏览器和 dev 参数：--no-open；--port <0..65535>（默认动态端口）
语言：--lang zh-CN|en > EWP_LANG > frontend/package.json ewp.language > zh-CN
语言参数可放在命令前后，仅覆盖本次输出。
npm：npm run help；npm run menu；npm run demo -- --debug；npm run build:all
npm wheel：npm run build -- -w（裸 -w 是 npm workspace 选项）
npm 应用：npm run app -- --mode onedir --config "configs/My App.json" --installer
Ctrl+C 关闭 Vite 与桌面进程树。
`,
`easywindowspack ${VERSION} (Node >=22.12)
Usage: ewp [command] [options]
Global help needs no project: ewp / ewp help / ewp -h / ewp --help
  create [project-name] [options]  Create a project; ewp create -h for creation help
  --version, -v, -V         Show version

Project root: ewp <task>; inside frontend: npm run <task>
Without a global install: npm --prefix frontend run ewp -- <task>
  menu                     Open development menu (no Python setup required)
  init                     Initialize the project's Python .venv and dependencies
  dev [--web]              Vite + desktop HMR; --web opens a browser only
  browser | frontend:dev   Vite browser development
  frontend | frontend:build  Build frontend
  frontend:preview         Preview the built frontend
  demo [--debug]           Build frontend and run desktop; optional developer tools
  wheel | exe | bundle     Build wheel / Windows EXE / source bundle
  app | build:app           Build the configured application using its configured mode
  installer                Build the application and always create an installer
  build [-w|--wheel] [-e|--exe] [--all]  Build EXE by default; choose one target
  build:all | full-build   Full build: test → wheel → exe → bundle
  test | info | check      Python tests / project information / Node checks

Application packaging options (app / installer / exe / build / full-build):
  --mode onefile|onedir    Override the application mode: single file or directory
  --config PATH           Relative to project root; default: ewp.pack.json; quote spaces
  --installer             Also create an installer; build --wheel / -w conflicts with these options
New outputs: output/apps/ and output/installers/; exe without these options uses output/exe/.
Browser and dev options: --no-open; --port <0..65535> (default: dynamic port)
Language: --lang zh-CN|en > EWP_LANG > frontend/package.json ewp.language > zh-CN
Language flags work before or after the command and only affect this invocation.
npm: npm run help; npm run menu; npm run demo -- --debug; npm run build:all
npm wheel: npm run build -- -w (bare -w is npm workspace)
npm app: npm run app -- --mode onedir --config "configs/My App.json" --installer
Ctrl+C closes Vite and the desktop process tree.
`));
}