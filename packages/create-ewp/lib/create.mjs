import { lstatSync, readdirSync, readFileSync, mkdirSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { basename, dirname, join, parse, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TEMPLATES = Object.freeze(['vanilla', 'vue', 'react', 'vanilla-ts', 'vue-ts', 'react-ts']);
export const templatesDirectory = fileURLToPath(new URL('../templates/', import.meta.url));

export function normalizePackageName(value) {
  const name = String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 180).replace(/-+$/g, '');
  return name && !['node_modules', 'favicon-ico'].includes(name) ? name : 'ewp-app';
}

function stat(path) {
  try { return lstatSync(path); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function assertNoLinks(path) {
  for (let current = path; ; current = dirname(current)) {
    const entry = stat(current);
    if (entry?.isSymbolicLink()) throw new Error(`拒绝符号链接目录 / Linked directories are not allowed: ${current}`);
    if (entry && !entry.isDirectory()) throw new Error(`目标或父路径不是目录 / Target or parent is not a directory: ${current}`);
    if (dirname(current) === current) break;
  }
}

export function validateTarget(directory, cwd = process.cwd()) {
  if (typeof directory !== 'string' || !directory.trim() || /[\0\r\n]/.test(directory)) {
    throw new Error('项目目录无效 / Invalid project directory.');
  }
  const target = resolve(cwd, directory);
  const parts = relative(parse(target).root, target).split(/[\\/]/);
  for (const part of parts) {
    if (!part || /[<>:"|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part)
      || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) {
      throw new Error(`目录名不兼容 Windows / Directory name is not Windows-compatible: ${part}`);
    }
  }
  assertNoLinks(target);
  if (stat(target) && readdirSync(target).length) {
    throw new Error(`目标目录非空，绝不覆盖 / Target directory is not empty; nothing will be overwritten: ${target}`);
  }
  return target;
}

function collectFiles(root, prefix = '') {
  const files = new Map();
  for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })) {
    if (/^(?:\.git|__pycache__|node_modules)$/.test(entry.name) || /\.pyc$/.test(entry.name)) continue;
    const path = join(prefix, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`模板禁止符号链接 / Template symlinks are not allowed: ${path}`);
    if (entry.isDirectory()) {
      for (const [key, value] of collectFiles(root, path)) files.set(key, value);
    } else if (entry.isFile()) {
      const output = path.split(/[\\/]/).map(part => part === '_gitignore' ? '.gitignore' : part).join('/');
      files.set(output, readFileSync(join(root, path)));
    }
  }
  return files;
}

export function projectManifest(name, template) {
  if (!TEMPLATES.includes(template)) throw new Error(`未知模板 / Unknown template: ${template}`);
  const framework = template.replace(/-ts$/, '');
  const typescript = template.endsWith('-ts');
  const dependencies = { easywindowspack: '^0.1.0' };
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
    scripts: {
      init: 'ewp init', dev: 'ewp dev', build: 'ewp build',
      'build:wheel': 'ewp build --wheel',
      'build:exe': 'ewp build --exe',
      'frontend:build': 'ewp frontend:build', 'frontend:dev': 'ewp frontend:dev',
      'frontend:preview': 'ewp frontend:preview', test: 'ewp test',
      ...(typescript ? { typecheck: framework === 'vue' ? 'vue-tsc --noEmit' : 'tsc --noEmit' } : {})
    }, dependencies, devDependencies
  };
}

function viteConfig(framework) {
  const plugin = framework === 'vanilla' ? '' : `import ${framework} from '@vitejs/plugin-${framework}';\n`;
  return `import { defineConfig } from 'vite';\nimport { fileURLToPath } from 'node:url';\n${plugin}\nconst root = fileURLToPath(new URL('./frontend/', import.meta.url));\nexport default defineConfig({\n  root,\n  base: './',\n  ${framework === 'vanilla' ? '' : `plugins: [${framework}()],\n  `}build: { outDir: '../output/frontend', emptyOutDir: true },\n  server: { host: '127.0.0.1', fs: { strict: true, allow: [root] } },\n  preview: { host: '127.0.0.1' }\n});\n`;
}

function pythonProject(name) {
  return `[build-system]\nrequires = ["setuptools>=68"]\nbuild-backend = "setuptools.build_meta"\n\n[project]\nname = "${name}-desktop"\nversion = "0.1.0"\ndescription = "Easy Windows Pack desktop application"\nreadme = "README.md"\nrequires-python = ">=3.10"\ndependencies = ["pywebview>=5.4,<7"]\n\n[project.optional-dependencies]\ntray = ["pystray>=0.19.5,<0.20", "Pillow>=10"]\ndev = ["build>=1.2", "wheel>=0.43", "setuptools>=68", "pyinstaller==6.22.2; sys_platform == 'win32'"]\n\n[tool.setuptools]\npackages = ["easy_windows_pack"]\npackage-dir = { easy_windows_pack = "backend/base/ewpcore" }\n\n[tool.setuptools.data-files]\n"share/${name}-desktop/frontend" = ["output/frontend/index.html"]\n"share/${name}-desktop/frontend/assets" = ["output/frontend/assets/*"]\n`;
}

function tsConfig(framework) {
  return {
    compilerOptions: {
      target: 'ES2022', lib: ['ES2022', 'DOM', 'DOM.Iterable'], module: 'ESNext',
      moduleResolution: 'Bundler', strict: true, skipLibCheck: true, noEmit: true,
      isolatedModules: true, verbatimModuleSyntax: true, types: ['vite/client'],
      ...(framework === 'react' ? { jsx: 'react-jsx' } : {})
    }, include: ['frontend/src/**/*']
  };
}

/** Compose resources before touching the destination. No runtime copies live in lib. */
export function projectFiles({ name = 'ewp-app', template = 'vanilla', templatesDir = templatesDirectory } = {}) {
  const manifest = projectManifest(name, template);
  const common = join(templatesDir, 'common');
  for (const required of ['backend/base/ewpcore/__init__.py', 'scripts/dev.py']) {
    if (!stat(join(common, required))?.isFile()) {
      throw new Error(`缺少公共模板资源 / Missing prepared common resource: ${required}. 请先运行主项目 prepare / Run the repository prepare step before packing create-ewp.`);
    }
  }
  const files = collectFiles(common);
  for (const [path, content] of collectFiles(join(templatesDir, template))) files.set(path, content);
  const framework = template.replace(/-ts$/, '');
  const extension = framework === 'react' ? (template.endsWith('-ts') ? 'tsx' : 'jsx') : (template.endsWith('-ts') ? 'ts' : 'js');
  files.set('package.json', JSON.stringify(manifest, null, 2) + '\n');
  files.set('pyproject.toml', pythonProject(manifest.name));
  files.set('vite.config.mjs', viteConfig(framework));
  files.set('frontend/index.html', `<!doctype html>\n<html lang="zh-CN">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>${manifest.name}</title>\n  </head>\n  <body>\n    <div id="app"></div>\n    <script type="module" src="/src/main.${extension}"></script>\n  </body>\n</html>\n`);
  if (template.endsWith('-ts')) files.set('tsconfig.json', JSON.stringify(tsConfig(framework), null, 2) + '\n');
  return files;
}

/** Non-interactive, dependency-free project generator. Existing content is never removed. */
export function createProject({ directory, name, template = 'vanilla', cwd = process.cwd(), templatesDir = templatesDirectory } = {}) {
  const target = validateTarget(directory, cwd);
  const packageName = normalizePackageName(name ?? basename(target));
  const files = projectFiles({ name: packageName, template, templatesDir });
  const createdFiles = [];
  const createdDirectories = [];
  function ensureDirectory(path) {
    const entry = stat(path);
    if (entry) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error(`目录不可用 / Unsafe directory: ${path}`);
      return;
    }
    ensureDirectory(dirname(path));
    mkdirSync(path);
    createdDirectories.push(path);
  }
  validateTarget(directory, cwd);
  try {
    ensureDirectory(target);
    for (const [path, content] of files) {
      const destination = resolve(target, path);
      if (!destination.startsWith(target + (process.platform === 'win32' ? '\\' : '/'))) {
        throw new Error(`模板路径越界 / Template path escapes the project: ${path}`);
      }
      ensureDirectory(dirname(destination));
      writeFileSync(destination, content, { flag: 'wx' });
      createdFiles.push(destination);
    }
  } catch (error) {
    for (const path of createdFiles.reverse()) { try { unlinkSync(path); } catch {} }
    for (const path of createdDirectories.reverse()) { try { rmdirSync(path); } catch {} }
    throw error;
  }
  return { directory: target, name: packageName, template, files: [...files.keys()] };
}