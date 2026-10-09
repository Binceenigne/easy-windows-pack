import { lstatSync, readdirSync, readFileSync, mkdirSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { basename, dirname, join, parse, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TEMPLATES = Object.freeze(['vanilla', 'vue', 'react', 'vanilla-ts', 'vue-ts', 'react-ts']);
export const templatesDirectory = fileURLToPath(new URL('../templates/', import.meta.url));

export const AI_TOOLS = Object.freeze(['codex', 'claude', 'copilot']);
const aiPaths = { codex: 'AGENTS.md', claude: 'CLAUDE.md', copilot: '.github/copilot-instructions.md' };

export const LANGUAGES = Object.freeze(['zh-CN', 'en']);
const errorMessages = {
  invalidLanguage: ['语言无效：{value}。请选择 zh-CN 或 en。', 'Invalid language: {value}. Use zh-CN or en.'],
  invalidAi: ['AI 工具选择无效。请选择 codex,claude,copilot 或 none。', 'Invalid AI selection. Use codex,claude,copilot or none.'],
  mixedAi: ['AI 选项 none 不能与其他工具组合。', 'AI selection none cannot be combined with other tools.'],
  conflict: ['参数冲突：{option}', 'Conflicting option: {option}'],
  missingValue: ['参数缺少值：{option}', 'Missing value: {option}'],
  unknownOption: ['未知参数：{option}', 'Unknown option: {option}'],
  extraName: ['只允许一个项目名称。', 'Only one project name is allowed.'],
  unknownTemplate: ['未知模板：{template}。可选：{templates}', 'Unknown template: {template}. Available: {templates}'],
  startConflict: ['--start 需要安装依赖，请移除 --no-install。', '--start requires installation; remove --no-install.'],
  startNeedsInstall: ['启动需要 npm 依赖。请选择安装或取消启动。', 'Starting requires npm dependencies. Choose installation or do not start.'],
  nodeVersion: ['需要 Node >=22.12.0。', 'Node >=22.12.0 is required.'],
  npmMissing: ['PATH 中找不到 npm。', 'npm was not found on PATH.'],
  npmQuote: ['npm 参数无法安全引用。', 'Cannot safely quote npm argument.'],
  npmFailed: ['npm {command} 执行失败（退出码 {code}）。项目文件已保留：{directory}', 'npm {command} failed (exit {code}). Project files were kept: {directory}'],
  npmLaunch: ['无法启动 npm {command}（{code}）。项目文件已保留：{directory}', 'Cannot launch npm {command} ({code}). Project files were kept: {directory}'],
  linkedDirectory: ['拒绝符号链接目录：{path}', 'Linked directories are not allowed: {path}'],
  notDirectory: ['目标或父路径不是目录：{path}', 'Target or parent is not a directory: {path}'],
  invalidDirectory: ['项目目录无效。', 'Invalid project directory.'],
  windowsDirectory: ['目录名不兼容 Windows：{path}', 'Directory name is not Windows-compatible: {path}'],
  nonemptyDirectory: ['目标目录非空，不会覆盖任何内容：{path}', 'Target directory is not empty; nothing will be overwritten: {path}'],
  templateLink: ['模板禁止符号链接：{path}', 'Template symlinks are not allowed: {path}'],
  missingResource: ['缺少公共模板资源：{path}。打包 create-ewp 前请运行主项目 prepare。', 'Missing prepared common resource: {path}. Run the repository prepare step before packing create-ewp.'],
  unsafeDirectory: ['目录不可用：{path}', 'Unsafe directory: {path}'],
  escapedPath: ['模板路径越界：{path}', 'Template path escapes the project: {path}'],
  fsMissing: ['文件或目录不存在：{path}', 'File or directory does not exist: {path}'],
  fsDenied: ['无法访问文件或目录（{code}）：{path}', 'Cannot access file or directory ({code}): {path}'],
  fsExists: ['文件或目录已存在，不会覆盖：{path}', 'File or directory already exists; nothing will be overwritten: {path}'],
  fsDirectory: ['文件或目录类型不正确（{code}）：{path}', 'Incorrect file or directory type ({code}): {path}'],
  fsFailed: ['文件操作失败（{code}）：{path}', 'File operation failed ({code}): {path}']
};

export function creatorError(key, parameters = {}, language = 'zh-CN') {
  const text = errorMessages[key][language === 'en' ? 1 : 0];
  const error = new Error(text.replace(/\{(\w+)\}/g, (_, name) => String(parameters[name] ?? '')));
  return Object.assign(error, { language, i18nKey: key, parameters });
}

export function normalizeLanguage(value = 'zh-CN', errorLanguage = 'zh-CN') {
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (normalized === 'zh' || normalized === 'zh-cn') return 'zh-CN';
    if (normalized === 'en') return 'en';
  }
  throw creatorError('invalidLanguage', { value }, errorLanguage);
}

export function localizeError(error, language = 'zh-CN') {
  if (error.i18nKey) {
    const localized = creatorError(error.i18nKey, error.parameters, language);
    if (error.exitCode !== undefined) localized.exitCode = error.exitCode;
    return localized;
  }
  const keys = { ENOENT: 'fsMissing', EACCES: 'fsDenied', EPERM: 'fsDenied', EEXIST: 'fsExists', ENOTDIR: 'fsDirectory', EISDIR: 'fsDirectory' };
  if (error.code && (error.path || error.syscall)) {
    return creatorError(keys[error.code] ?? 'fsFailed', { code: error.code, path: error.path ?? error.dest ?? '' }, language);
  }
  return error;
}

export function normalizeAi(value = [], language = 'zh-CN') {
  const selected = typeof value === 'string' ? value.split(',').map(part => part.trim()) : value;
  if (!Array.isArray(selected) || selected.some(tool => ![...AI_TOOLS, 'none'].includes(tool))) {
    throw creatorError('invalidAi', {}, language);
  }
  if (selected.includes('none')) {
    if (selected.length !== 1) throw creatorError('mixedAi', {}, language);
    return [];
  }
  return AI_TOOLS.filter(tool => selected.includes(tool));
}

function aiInstructions(template, language) {
  if (language === 'zh-CN') return `# 项目开发指引\n\n这是使用 ${template} 和 Python/pywebview 的 Easy Windows Pack 桌面应用。\n\n- 前端源码、package.json、Vite/TypeScript 配置与 node_modules 放在 frontend/；在该目录运行 npm 命令。\n- 先运行 npm install、npm run init，再运行 npm run dev。浏览器开发使用 npm run frontend:dev；根 startup.cmd 打开开发菜单。npm run help 查看命令。\n- UI 位于 frontend/src/，应用桥接方法位于 backend/src/demo.py。复用 easywindowspack 公开导出和 CSS，卸载时释放窗口外壳。\n- backend/base/ewpcore/ 是共享桌面运行时；应用行为保持独立，并保留 easy_windows_pack 公开导入名。\n- scripts/dev.py 编排 Python 和打包，scripts/startup.cmd 提供 Windows 菜单；脚本放在 scripts/。\n- 使用 npm run frontend:build${template.endsWith('-ts') ? ' 和 npm run typecheck' : ''} 验证；npm test 运行 Python 测试。npm run build 默认构建 EXE；npm run build -- --wheel 构建 wheel；npm run build:all 执行完整构建。\n- 生产前端位于 output/frontend/，其他产物位于 output/，临时构建数据位于 build/。不要编辑生成产物或提交依赖。\n- 浏览器预览不能验证原生拖拽、缩放、托盘或宿主 API；修改桥接时检查桌面行为。\n- 修改前检查现有实现，保持任务边界，并报告实际执行的检查。\n`;
  return `# Project guidance\n\nThis is an Easy Windows Pack desktop app using ${template} and Python/pywebview.\n\n- Frontend source, package.json, Vite/TypeScript configuration and node_modules belong in frontend/. Run npm commands there.\n- Start with npm install, then npm run init and npm run dev. Use npm run frontend:dev for browser-only work. The root startup.cmd opens the development menu.\n- Edit frontend/src/ for UI and backend/src/demo.py for application bridge methods. Reuse the public easywindowspack exports and CSS; dispose mounted frames when unmounting.\n- backend/base/ewpcore/ contains the shared desktop runtime. Keep application behavior separate and preserve the public easy_windows_pack imports.\n- scripts/dev.py orchestrates Python and packaging; scripts/startup.cmd owns the Windows menu. Keep scripts under scripts/.\n- Validate with npm run frontend:build${template.endsWith('-ts') ? ' and npm run typecheck' : ''}; npm test runs Python tests. npm run build creates an EXE; npm run build -- --wheel creates a wheel.\n- Production assets go to output/frontend/; other build artifacts go to output/ and temporary build data to build/. Never edit generated output or commit dependencies.\n- Browser previews cannot validate native dragging, resize, tray or host APIs. Check desktop behavior when changing the bridge.\n- Review existing code before editing, keep changes scoped, and report the checks actually run.\n`;
}

export function normalizePackageName(value) {
  const name = String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 180).replace(/-+$/g, '');
  return name && !['node_modules', 'favicon-ico'].includes(name) ? name : 'ewp-app';
}

function stat(path) {
  try { return lstatSync(path); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function assertNoLinks(path, language) {
  for (let current = path; ; current = dirname(current)) {
    const entry = stat(current);
    if (entry?.isSymbolicLink()) throw creatorError('linkedDirectory', { path: current }, language);
    if (entry && !entry.isDirectory()) throw creatorError('notDirectory', { path: current }, language);
    if (dirname(current) === current) break;
  }
}

export function validateTarget(directory, cwd = process.cwd(), language = 'zh-CN') {
  language = normalizeLanguage(language);
  try {
  if (typeof directory !== 'string' || !directory.trim() || /[\0\r\n]/.test(directory)) {
    throw creatorError('invalidDirectory', {}, language);
  }
  const target = resolve(cwd, directory);
  const parts = relative(parse(target).root, target).split(/[\\/]/);
  for (const part of parts) {
    if (!part || /[<>:"|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part)
      || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) {
      throw creatorError('windowsDirectory', { path: part }, language);
    }
  }
  assertNoLinks(target, language);
  if (stat(target) && readdirSync(target).length) {
    throw creatorError('nonemptyDirectory', { path: target }, language);
  }
  return target;
  } catch (error) { throw localizeError(error, language); }
}

function collectFiles(root, language, prefix = '') {
  const files = new Map();
  for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })) {
    if (/^(?:\.git|__pycache__|node_modules)$/.test(entry.name) || /\.pyc$/.test(entry.name)) continue;
    const path = join(prefix, entry.name);
    if (entry.isSymbolicLink()) throw creatorError('templateLink', { path }, language);
    if (entry.isDirectory()) {
      for (const [key, value] of collectFiles(root, language, path)) files.set(key, value);
    } else if (entry.isFile()) {
      const output = path.split(/[\\/]/).map(part => part === '_gitignore' ? '.gitignore' : part).join('/');
      files.set(output, readFileSync(join(root, path)));
    }
  }
  return files;
}

export function projectManifest(name, template, language = 'zh-CN') {
  language = normalizeLanguage(language);
  if (!TEMPLATES.includes(template)) throw creatorError('unknownTemplate', { template, templates: TEMPLATES.join(', ') }, language);
  const framework = template.replace(/-ts$/, '');
  const typescript = template.endsWith('-ts');
  const dependencies = { easywindowspack: '^0.1.1' };
  const devDependencies = { vite: '^7.3.7' };
  if (framework === 'vue') {
    dependencies.vue = '^3.5.0';
    devDependencies['@vitejs/plugin-vue'] = '^6.0.0';
    if (typescript) devDependencies['vue-tsc'] = '^3.0.0';
  }
  if (framework === 'react') {
    dependencies.react = '^19.0.0';
    dependencies['react-dom'] = '^19.0.0';
    devDependencies['@vitejs/plugin-react'] = '^5.0.0';
    if (typescript) {
      devDependencies['@types/react'] = '^19.0.0';
      devDependencies['@types/react-dom'] = '^19.0.0';
    }
  }
  if (typescript) devDependencies.typescript = '~5.9.0';
  return {
    name: normalizePackageName(name), version: '0.1.0', private: true, type: 'module',
    engines: { node: '>=22.12.0' },
    ewp: { language },
    scripts: {
      ewp: 'ewp', init: 'ewp init', dev: 'ewp dev', browser: 'ewp browser',
      frontend: 'ewp frontend', demo: 'ewp demo', wheel: 'ewp wheel',
      exe: 'ewp exe', bundle: 'ewp bundle', build: 'ewp build',
      'build:wheel': 'ewp build --wheel',
      'build:exe': 'ewp build --exe',
      'build:all': 'ewp full-build', 'full-build': 'ewp full-build',
      menu: 'ewp menu', info: 'ewp info', help: 'ewp --help', check: 'ewp check',
      'frontend:build': 'ewp frontend:build', 'frontend:dev': 'ewp frontend:dev',
      'frontend:preview': 'ewp frontend:preview', test: 'ewp test',
      ...(typescript ? { typecheck: framework === 'vue' ? 'vue-tsc --noEmit' : 'tsc --noEmit' } : {})
    }, dependencies, devDependencies
  };
}

function viteConfig(framework) {
  const plugin = framework === 'vanilla' ? '' : `import ${framework} from '@vitejs/plugin-${framework}';\n`;
  return `import { defineConfig } from 'vite';\nimport { fileURLToPath } from 'node:url';\n${plugin}\nconst root = fileURLToPath(new URL('./', import.meta.url));\nexport default defineConfig({\n  root,\n  base: './',\n  cacheDir: fileURLToPath(new URL('./node_modules/.vite/', import.meta.url)),\n  ${framework === 'vanilla' ? '' : `plugins: [${framework}()],\n  `}build: { outDir: '../output/frontend', emptyOutDir: true },\n  server: { host: '127.0.0.1', fs: { strict: true, allow: [root] } },\n  preview: { host: '127.0.0.1' }\n});\n`;
}

function pythonProject(name, language) {
  return `[build-system]\nrequires = ["setuptools>=68"]\nbuild-backend = "setuptools.build_meta"\n\n[project]\nname = "${name}-desktop"\nversion = "0.1.0"\ndescription = "${language === 'en' ? 'Easy Windows Pack desktop application' : 'Easy Windows Pack 桌面应用'}"\nreadme = "README.md"\nrequires-python = ">=3.10"\ndependencies = ["pywebview>=5.4,<7"]\n\n[project.optional-dependencies]\ntray = ["pystray>=0.19.5,<0.20", "Pillow>=10"]\ndev = ["build>=1.2", "wheel>=0.43", "setuptools>=68", "pyinstaller==6.22.2; sys_platform == 'win32'"]\n\n[tool.setuptools]\npackages = ["easy_windows_pack"]\npackage-dir = { "" = "backend/base", easy_windows_pack = "backend/base/ewpcore" }\n\n[tool.setuptools.data-files]\n"share/${name}-desktop/frontend" = ["output/frontend/index.html"]\n"share/${name}-desktop/frontend/assets" = ["output/frontend/assets/*"]\n`;
}

function tsConfig(framework) {
  return {
    compilerOptions: {
      target: 'ES2022', lib: ['ES2022', 'DOM', 'DOM.Iterable'], module: 'ESNext',
      moduleResolution: 'Bundler', strict: true, skipLibCheck: true, noEmit: true,
      isolatedModules: true, verbatimModuleSyntax: true, types: ['vite/client'],
      ...(framework === 'react' ? { jsx: 'react-jsx' } : {})
    }, include: ['src/**/*']
  };
}

/** Compose resources before touching the destination. No runtime copies live in lib. */
export function projectFiles({ name = 'ewp-app', template = 'vanilla', ai = [], language = 'zh-CN', templatesDir = templatesDirectory } = {}) {
  language = normalizeLanguage(language);
  try {
  const tools = normalizeAi(ai, language);
  const manifest = projectManifest(name, template, language);
  const common = join(templatesDir, 'common');
  const readmeResource = language === 'en' ? 'README.en.md' : 'README.md';
  for (const required of ['backend/base/ewpcore/__init__.py', 'scripts/dev.py', 'startup.cmd', 'scripts/startup.cmd', readmeResource]) {
    if (!stat(join(common, required))?.isFile()) {
      throw creatorError('missingResource', { path: required }, language);
    }
  }
  const files = collectFiles(common, language);
  files.delete('README.en.md');
  files.set('README.md', readFileSync(join(common, readmeResource)));
  for (const [path, content] of collectFiles(join(templatesDir, template), language)) files.set(path, content);
  const framework = template.replace(/-ts$/, '');
  const extension = framework === 'react' ? (template.endsWith('-ts') ? 'tsx' : 'jsx') : (template.endsWith('-ts') ? 'ts' : 'js');
  const demoMessages = language === 'en' ? {
    heading: 'Your next desktop app.',
    description: 'A lightweight window. A desktop app of your own.',
    windowStyle: 'Window style', counter: 'Count',
    hint: 'Edit', saveHint: 'and save to try HMR.',
    editFile: `frontend/src/${framework === 'vanilla' ? `main.${extension}` : framework === 'vue' ? 'App.vue' : `App.${extension}`}`,
    source: 'GitHub', docs: 'Documentation', resources: 'Project resources',
    hostDescription: 'Desktop application', hostTitle: 'Desktop App',
    buildFirst: 'Run npm run frontend:build first',
    hostDoc: 'Desktop host: development uses EWP_DEV_URL, production uses the Vite build.',
    usage: 'usage: ', options: 'options', help: 'show this help message and exit',
    debugHelp: 'enable desktop debugging', error: 'error', unknownArguments: 'unrecognized arguments: '
  } : {
    heading: '构建你的下一个桌面应用。',
    description: '一个轻量窗口，开启你的桌面应用。',
    windowStyle: '窗口外观', counter: '计数',
    hint: '编辑', saveHint: '并保存，体验热更新。',
    editFile: `frontend/src/${framework === 'vanilla' ? `main.${extension}` : framework === 'vue' ? 'App.vue' : `App.${extension}`}`,
    source: 'GitHub 源码', docs: '使用文档', resources: '项目资源',
    hostDescription: '桌面应用', hostTitle: '桌面应用',
    buildFirst: '请先运行 npm run frontend:build',
    hostDoc: '桌面宿主：开发使用 EWP_DEV_URL，生产使用 Vite 编译产物。',
    usage: '用法：', options: '参数', help: '显示帮助并退出',
    debugHelp: '启用桌面调试', error: '错误', unknownArguments: '无法识别的参数：'
  };
  for (const path of [`frontend/src/${framework === 'vanilla' ? `main.${extension}` : framework === 'vue' ? 'App.vue' : `App.${extension}`}`, 'backend/src/demo.py']) {
    const source = files.get(path);
    if (source) files.set(path, source.toString('utf8').replace(/__EWP_(\w+)__/g, (token, key) => demoMessages[key] ?? token));
  }
  files.set('frontend/package.json', JSON.stringify(manifest, null, 2) + '\n');
  files.set('pyproject.toml', pythonProject(manifest.name, language));
  files.set('frontend/vite.config.mjs', viteConfig(framework));
  files.set('frontend/index.html', `<!doctype html>\n<html lang="${language}">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>${manifest.name}</title>\n  </head>\n  <body>\n    <div id="app"></div>\n    <script type="module" src="/src/main.${extension}"></script>\n  </body>\n</html>\n`);
  if (template.endsWith('-ts')) files.set('frontend/tsconfig.json', JSON.stringify(tsConfig(framework), null, 2) + '\n');
  const english = language === 'en';
  const sharedSkill = 'docs/.easy-dev/skills/easy-dev/SKILL.md';
  if (tools.length) {
    files.set('docs/.easy-dev/agent.md', aiInstructions(template, language));
    files.set(sharedSkill, english
      ? `---\nname: easy-dev\ndescription: Develop and maintain this Easy Windows Pack application, including frontend, Python bridge and packaging changes.\n---\n# Easy Dev\n\nRead the [project development guidance](../../agent.md). Resolve project paths from the repository root, four levels above this file's directory.\n\nReuse existing components and public runtime APIs. Keep application code in frontend/src and backend/src, tools in scripts, and build products in output. Validate changed behavior and report checks actually run.\n`
      : `---\nname: easy-dev\ndescription: 开发和维护此 Easy Windows Pack 应用的前端、Python 桥接与打包功能。\n---\n# Easy Dev\n\n先读[项目开发指引](../../agent.md)。项目根目录位于本文件所在目录上四级，源码路径均相对项目根。\n\n复用现有组件和公开运行时 API。应用代码放在 frontend/src 和 backend/src，工具放在 scripts，产物放在 output。验证修改后的行为，并报告实际执行的检查。\n`);
  }
  for (const tool of tools) {
    const prefix = tool === 'copilot' ? '../' : '';
    let entry = english
      ? `# Project guidance\n\nRead [development guidance](${prefix}docs/.easy-dev/agent.md) before changing this project.\n`
      : `# 项目开发指引\n\n修改项目之前，先读[开发指引](${prefix}docs/.easy-dev/agent.md)。\n`;
    const skill = tool === 'copilot' ? sharedSkill : `docs/.${tool === 'codex' ? 'agents' : 'claude'}/skills/easy-dev/SKILL.md`;
    entry += english
      ? `\nExplicitly read the [Easy Dev skill](${prefix}${skill}); skills under docs/ are not automatically discovered.\n`
      : `\n显式读取 [Easy Dev Skill](${prefix}${skill})；docs/ 下的 Skill 不会自动发现。\n`;
    if (tool !== 'copilot') {
      files.set(skill, english
        ? `---\nname: easy-dev\ndescription: Route application development to the shared Easy Dev skill.\n---\n# Easy Dev\n\nRead the [shared Easy Dev skill](../../../.easy-dev/skills/easy-dev/SKILL.md) and follow its guidance.\n`
        : `---\nname: easy-dev\ndescription: 将应用开发路由至共用 Easy Dev Skill。\n---\n# Easy Dev\n\n读取[共用 Easy Dev Skill](../../../.easy-dev/skills/easy-dev/SKILL.md)，并遵循其中的开发约定。\n`);
    }
    files.set(aiPaths[tool], entry);
  }
  return files;
  } catch (error) { throw localizeError(error, language); }
}

/** Non-interactive, dependency-free project generator. Existing content is never removed. */
export function createProject({ directory, name, template = 'vanilla', ai = [], language = 'zh-CN', cwd = process.cwd(), templatesDir = templatesDirectory } = {}) {
  language = normalizeLanguage(language);
  const target = validateTarget(directory, cwd, language);
  const packageName = normalizePackageName(name ?? basename(target));
  const files = projectFiles({ name: packageName, template, ai, language, templatesDir });
  const createdFiles = [];
  const createdDirectories = [];
  function ensureDirectory(path) {
    const entry = stat(path);
    if (entry) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) throw creatorError('unsafeDirectory', { path }, language);
      return;
    }
    ensureDirectory(dirname(path));
    mkdirSync(path);
    createdDirectories.push(path);
  }
  validateTarget(directory, cwd, language);
  try {
    ensureDirectory(target);
    for (const [path, content] of files) {
      const destination = resolve(target, path);
      if (!destination.startsWith(target + (process.platform === 'win32' ? '\\' : '/'))) {
        throw creatorError('escapedPath', { path }, language);
      }
      ensureDirectory(dirname(destination));
      writeFileSync(destination, content, { flag: 'wx' });
      createdFiles.push(destination);
    }
  } catch (error) {
    for (const path of createdFiles.reverse()) { try { unlinkSync(path); } catch {} }
    for (const path of createdDirectories.reverse()) { try { rmdirSync(path); } catch {} }
    throw localizeError(error, language);
  }
  return { directory: target, name: packageName, template, language, files: [...files.keys()] };
}