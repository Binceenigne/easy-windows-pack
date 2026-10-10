import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { AI_TOOLS, createProject, creatorError, LANGUAGES, localizeError, normalizeAi, normalizeLanguage, normalizePackageName, projectFiles, projectManifest, templatesDirectory, TEMPLATES, validateTarget } from '../frontend/packages/create-ewp/lib/create.mjs';
import { HELP, helpText, main, npmCommand, parseArgs, quoteDirectory, runNpm } from '../frontend/packages/create-ewp/lib/cli.mjs';

const repository = fileURLToPath(new URL('../', import.meta.url));
const packageDirectory = join(repository, 'frontend/packages/create-ewp');
const english = { language: 'en' };
const parse = (args, options = {}) => parseArgs(args, { env: {}, ...options });

function temporary(t) {
  const root = mkdtempSync(join(tmpdir(), 'create-ewp space-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

// Prepare isolated fixtures from authoritative resources without editing the
// runtime, Python tools or generated package resources in the checkout.
function preparedTemplates(t) {
  const root = temporary(t);
  const templatesDir = join(root, 'templates');
  cpSync(templatesDirectory, templatesDir, { recursive: true });
  cpSync(join(repository, 'backend/base/ewpcore'), join(templatesDir, 'common/backend/base/ewpcore'), {
    recursive: true, filter: source => !/(__pycache__|\.pyc$)/.test(source)
  });
  mkdirSync(join(templatesDir, 'common/scripts'), { recursive: true });
  for (const resource of ['scripts/dev.py', 'startup.cmd', 'scripts/startup.cmd', 'LICENSE']) {
    cpSync(join(repository, resource), join(templatesDir, 'common', resource));
  }
  rmSync(join(templatesDir, 'common/build.cmd'), { force: true });
  return { root, templatesDir };
}

function promptFixture(values) {
  const cancellation = Symbol('prompt-cancel');
  const seen = [];
  const events = [];
  const next = options => { seen.push(options); return values.shift(); };
  return { seen, events, cancellation, text: next, select: next, multiselect: next, confirm: next,
    isCancel: value => value === cancellation, intro() {},
    outro(message) { events.push(message); }, cancel(message) { events.push(message); } };
}

function assertLinks(directory, path) {
  for (const [, target] of readFileSync(join(directory, path), 'utf8').matchAll(/\]\(([^)]+)\)/g)) {
    assert.ok(existsSync(resolve(directory, dirname(path), target)), `${path}: ${target}`);
  }
}

test('ESM package owns create-ewp and publishes only generator resources', () => {
  const pkg = JSON.parse(readFileSync(join(packageDirectory, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'create-ewp');
  assert.equal(pkg.engines.node, '>=22.12.0');
  assert.equal(pkg.type, 'module');
  assert.deepEqual(pkg.bin, { 'create-ewp': './bin/create-ewp.mjs' });
  assert.deepEqual(Object.keys(pkg.dependencies), ['@clack/prompts']);
  assert.deepEqual(pkg.files, ['bin', 'lib', 'templates', 'README.md', 'LICENSE']);
  assert.match(readFileSync(join(packageDirectory, 'bin/create-ewp.mjs'), 'utf8'), /^#!\/usr\/bin\/env node/);
});

test('argument parsing handles separators, equals syntax and Chinese defaults', () => {
  assert.deepEqual(parse(['My App', '--', '--template', 'vue-ts', '--no-install', '--no-start']), {
    language: 'zh-CN', name: 'My App', template: 'vue-ts', install: false, start: false
  });
  assert.deepEqual(parse(['--dir=Some folder', '--template=react', '-y']), {
    language: 'zh-CN', directory: 'Some folder', template: 'react', yes: true
  });
  assert.deepEqual(parse([]), { language: 'zh-CN' });
  assert.deepEqual(parse(['--help']), { language: 'zh-CN', help: true });
  assert.match(HELP, /非交互默认不安装/);
  assert.equal(normalizeLanguage('ZH-cn'), 'zh-CN');
  assert.equal(normalizeLanguage('zh'), 'zh-CN');
});

test('explicit language wins over environment, then project, then Chinese fallback', t => {
  const root = temporary(t);
  mkdirSync(join(root, 'frontend/src'), { recursive: true });
  writeFileSync(join(root, 'frontend/package.json'), JSON.stringify({ ewp: { language: 'en' } }));
  const cwd = join(root, 'frontend/src');
  assert.equal(parse([], { cwd }).language, 'en');
  assert.equal(parse([], { cwd, env: { EWP_LANG: 'zh-CN' } }).language, 'zh-CN');
  assert.equal(parse(['--lang', 'en'], { cwd, env: { EWP_LANG: 'zh-CN' } }).language, 'en');
  assert.equal(parse(['--lang=zh-CN'], { cwd, env: { EWP_LANG: 'en' } }).language, 'zh-CN');
  assert.equal(parse(['--lang=en'], { cwd, env: { EWP_LANG: 'invalid' } }).language, 'en');
  assert.equal(parse([], { cwd: temporary(t) }).language, 'zh-CN');
  assert.equal(parse(['--lang=zh', '--lang=zh-CN']).language, 'zh-CN');
  writeFileSync(join(root, 'frontend/package.json'), '\uFEFF' + JSON.stringify({ ewp: { language: 'en' } }));
  assert.equal(parse([], { cwd }).language, 'en');
  for (const content of ['null', '[]', '{']) {
    writeFileSync(join(root, 'frontend/package.json'), content);
    assert.equal(parse([], { cwd }).language, 'zh-CN');
  }
});

test('argument errors use the selected language even when --lang follows the invalid flag', () => {
  const invalid = [
    [['--template'], /缺少值/, /Missing value/], [['--dir='], /缺少值/, /Missing value/],
    [['--template=svelte'], /未知模板/, /Unknown template/], [['--wat'], /未知参数/, /Unknown option/],
    [['a', 'b'], /只允许一个/, /Only one/], [['--start', '--no-install'], /需要安装/, /requires installation/],
    [['--install', '--no-install'], /参数冲突/, /Conflicting/], [['--ai'], /缺少值/, /Missing value/],
    [['--ai=none,codex'], /不能.*组合/, /cannot be combined/], [['--ai=bad'], /AI 工具选择无效/, /Invalid AI/],
    [['--ai=none', '--ai=codex'], /参数冲突/, /Conflicting/]
  ];
  for (const [args, zh, en] of invalid) {
    assert.throws(() => parse([...args, '--lang=zh-CN']), zh);
    assert.throws(() => parse([...args, '--lang=en']), en);
  }
  assert.throws(() => parse(['--lang']), /缺少值/);
  assert.throws(() => parse(['--lang=']), /缺少值/);
  assert.throws(() => parse(['--lang=invalid']), /语言无效/);
  assert.throws(() => parse(['--lang=invalid'], { env: { EWP_LANG: 'en' } }), /Invalid language/);
  assert.throws(() => parse(['--lang=en', '--lang=zh-CN']), /参数冲突/);
  assert.throws(() => parse(['--lang=zh-CN', '--lang=en']), /Conflicting/);
});

test('filesystem failures and creator errors localize without losing process exit codes', () => {
  for (const language of LANGUAGES) {
    for (const code of ['ENOENT', 'EACCES', 'EPERM', 'EEXIST', 'ENOTDIR', 'EISDIR', 'EIO']) {
      const error = localizeError(Object.assign(new Error('raw system error'), { code, path: '/fixture' }), language);
      assert.equal(error.language, language);
      assert.match(error.message, /\/fixture/);
      assert.doesNotMatch(error.message, /raw system error/);
      assert.equal(/[\u3400-\u9fff]/u.test(error.message), language === 'zh-CN');
    }
  }
  const failed = creatorError('npmFailed', { command: 'install', code: 7, directory: '/fixture' }, 'zh-CN');
  failed.exitCode = 7;
  const localized = localizeError(failed, 'en');
  assert.equal(localized.exitCode, 7);
  assert.match(localized.message, /failed \(exit 7\)/);
});

test('package names normalize independently of directories and cannot inject source', () => {
  for (const [input, expected] of [
    ['My Desktop App', 'my-desktop-app'], ['Éclair 2026', 'eclair-2026'], ['@scope/My App', 'scope-my-app'],
    ['中文', 'ewp-app'], ['---', 'ewp-app'], ['"</title><script>', 'title-script'],
    ['uninstall', 'ewp-app'], ['CON', 'ewp-app'], ['lpt9', 'ewp-app'], ['node_modules', 'ewp-app']
  ]) assert.equal(normalizePackageName(input), expected);
  assert.equal(normalizePackageName('a'.repeat(300)).length, 80);
});

test('six templates × two languages × all AI combinations generate consistent resources and valid links', async t => {
  const { root, templatesDir } = preparedTemplates(t);
  for (const template of TEMPLATES) for (const language of LANGUAGES) for (let mask = 0; mask < 8; mask++) {
    await t.test(`${template} ${language} AI=${mask}`, () => {
      const ai = AI_TOOLS.filter((_, index) => mask & (1 << index));
      const result = createProject({ directory: join(root, `${template}-${language}-${mask}`), name: 'My App', template, language, ai, templatesDir });
      const read = path => readFileSync(join(result.directory, path), 'utf8');
      const pkg = JSON.parse(read('frontend/package.json'));
      assert.equal(pkg.name, 'my-app');
      assert.equal(pkg.version, '0.1.0');
      assert.equal(pkg.dependencies.easywindowspack, '^0.1.2');
      assert.deepEqual(pkg.ewp, { language });
      assert.equal(pkg.scripts.ewp, 'ewp');
      for (const task of ['help', 'info', 'menu', 'init', 'dev', 'browser', 'frontend', 'demo', 'wheel', 'exe', 'app', 'installer', 'bundle', 'test', 'check', 'full-build']) {
        assert.equal(pkg.scripts[task], `ewp ${task === 'help' ? '--help' : task}`);
      }
      assert.equal(pkg.scripts.build, 'ewp build');
      assert.equal(pkg.scripts['build:all'], 'ewp full-build');
      assert.equal(pkg.scripts['build:wheel'], 'ewp build --wheel');
      assert.equal(pkg.scripts['build:exe'], 'ewp build --exe');
      assert.equal(pkg.scripts['build:app'], 'ewp app');
      assert.deepEqual(JSON.parse(read('ewp.pack.json')), {
        schemaVersion: 1,
        application: { id: pkg.name, name: pkg.name, version: pkg.version },
        build: { mode: 'onefile', installer: false }, installer: { language },
        features: [], prerequisites: [], hooks: {},
        postInstall: [
          { id: 'startup', type: 'startup', name: language === 'en' ? 'Start with Windows' : '开机自启', default: false },
          { id: 'launch', type: 'launch', name: language === 'en' ? 'Launch after installation' : '安装后启动', default: false }
        ]
      });
      for (const task of ['frontend:build', 'frontend:dev', 'frontend:preview']) assert.equal(pkg.scripts[task], `ewp ${task}`);
      assert.match(read('pyproject.toml'), /name = "my-app-desktop"/);
      assert.match(read('pyproject.toml'), /version = "0.1.0"/);
      assert.match(read('pyproject.toml'), /easy_windows_pack = "backend\/base\/ewpcore"/);
      assert.match(read('pyproject.toml'), /\[project.optional-dependencies\][\s\S]*tray =[\s\S]*dev =/);
      assert.equal(read('backend/base/ewpcore/__init__.py'), readFileSync(join(repository, 'backend/base/ewpcore/__init__.py'), 'utf8'));
      for (const source of ['scripts/dev.py', 'startup.cmd', 'scripts/startup.cmd']) {
        assert.equal(read(source), readFileSync(join(repository, source), 'utf8'), source);
      }
      assert.ok(existsSync(join(result.directory, 'tests/test_smoke.py')));
      // Dependencies are deliberately absent here: check distribution only.
      assert.equal(read('tests/npm-runtime.test.mjs'), readFileSync(join(templatesDir, 'common/tests/npm-runtime.test.mjs'), 'utf8'));
      const config = read('frontend/vite.config.mjs');
      assert.match(config, /base: '\.\/'/);
      assert.match(config, /outDir: '\.\.\/output\/frontend'/);
      assert.match(config, /fs: \{ strict: true, allow: \[root\] \}/);
      assert.match(config, /new URL\('\.\/', import.meta.url\)/);
      const extension = template.startsWith('react') ? (template.endsWith('-ts') ? 'tsx' : 'jsx') : template.endsWith('-ts') ? 'ts' : 'js';
      assert.match(read('frontend/index.html'), new RegExp(`/src/main\\.${extension}`));
      assert.match(read('frontend/index.html'), new RegExp(`lang="${language}"`));
      assert.ok(existsSync(join(result.directory, `frontend/src/main.${extension}`)));
      const demoPath = `frontend/src/${template.startsWith('vue') ? 'App.vue' : template.startsWith('react') ? `App.${extension}` : `main.${extension}`}`;
      const demo = read(demoPath);
      const host = read('backend/src/demo.py');
      const readme = read('README.md');
      for (const content of [demo, host, readme]) {
        assert.doesNotMatch(content, /__EWP_\w+__/);
        assert.equal(/[\u3400-\u9fff]/u.test(content), language === 'zh-CN');
      }
      assert.match(demo, language === 'en' ? /Your next desktop app/ : /构建你的下一个桌面应用/);
      assert.match(demo, language === 'en' ? /Count/ : /计数/);
      assert.match(host, /root \/ "frontend\/package.json"/);
      assert.match(host, language === 'en' ? /enable desktop debugging/ : /启用桌面调试/);
      assert.match(readme, /npm run demo.*-- --debug/);
      assert.match(readme, /npm run build:all/);
      assert.match(readme, /Vite/);
      assert.equal(existsSync(join(result.directory, 'README.en.md')), false);
      assert.equal(existsSync(join(result.directory, 'frontend/tsconfig.json')), template.endsWith('-ts'));
      if (template.endsWith('-ts')) {
        assert.deepEqual(JSON.parse(read('frontend/tsconfig.json')).include, ['src/**/*']);
        assert.ok(pkg.scripts.typecheck);
      } else assert.equal(pkg.scripts.typecheck, undefined);
      for (const old of ['package.json', 'package-lock.json', 'vite.config.mjs', 'tsconfig.json', 'build.cmd', 'node_modules', '.agents', '.claude', '.easy-dev', 'agent.md']) {
        assert.equal(existsSync(join(result.directory, old)), false, old);
      }
      const paths = ['AGENTS.md', 'CLAUDE.md', '.github/copilot-instructions.md'];
      paths.forEach((path, index) => assert.equal(existsSync(join(result.directory, path)), ai.includes(AI_TOOLS[index]), path));
      for (const [path, enabled] of [
        ['docs/.agents', ai.includes('codex')], ['docs/.claude', ai.includes('claude')],
        ['docs/.easy-dev', ai.length > 0], ['.github', ai.includes('copilot')]
      ]) assert.equal(existsSync(join(result.directory, path)), enabled, path);
      for (const path of ['docs/index.md', 'docs/design.md']) {
        assert.ok(result.files.includes(path), path);
        assert.ok(read(path).trimEnd().split('\n').length < 15, path);
        assert.doesNotMatch(read(path), /backend\/base|ewpcore|PyInstaller|scripts\/dev\.py|full-build/);
      }
      if (!ai.length) assert.deepEqual(readdirSync(join(result.directory, 'docs')).sort(), ['design.md', 'index.md']);
      for (const path of result.files.filter(path => path.endsWith('.md') && /AGENTS|CLAUDE|copilot|docs\//.test(path))) {
        assertLinks(result.directory, path);
        assert.equal(/[\u3400-\u9fff]/u.test(read(path)), language === 'zh-CN', path);
      }
      if (ai.length) {
        const skill = 'docs/.easy-dev/skills/easy-dev/SKILL.md';
        assert.equal(resolve(result.directory, dirname(skill), '../../../..'), result.directory);
        assert.match(read(skill), language === 'en' ? /four levels/ : /上四级/);
        assert.doesNotMatch(read(skill), /five levels|上五级/);
        const guidance = read('docs/.easy-dev/agent.md');
        assert.match(guidance, /frontend\/src\//);
        assert.match(guidance, /backend\/src\/demo.py/);
        assert.equal(guidance.includes('npm run typecheck'), template.endsWith('-ts'));
        for (const content of [guidance, read(skill)]) {
          assert.match(content, /\]\([^)]*index\.md\)/);
          assert.match(content, /\]\([^)]*design\.md\)/);
          assert.doesNotMatch(content, /backend\/base|ewpcore|prepare-npm|npm publish/);
          assert.ok(content.trimEnd().split('\n').length < 15);
        }
      }
      if (template.startsWith('vue')) {
        assert.match(config, /plugin-vue/);
        assert.match(read('frontend/src/Frame.vue'), /<Teleport v-if="content" :to="content"><slot/);
        assert.match(read('frontend/src/Frame.vue'), /onBeforeUnmount.*dispose/);
        assert.match(demo, /count\+\+/);
        assert.equal(pkg.dependencies.react, undefined);
      } else if (template.startsWith('react')) {
        assert.match(config, /plugin-react/);
        assert.match(read(`frontend/src/Frame.${extension}`), /createPortal\(children, content\)/);
        assert.match(read(`frontend/src/Frame.${extension}`), /instance\.dispose\(\)/);
        assert.match(demo, /setCount\(value => value \+ 1\)/);
        assert.equal(pkg.dependencies.vue, undefined);
      } else {
        assert.doesNotMatch(config, /plugin-vue|plugin-react/);
        assert.match(demo, /content \}/);
      }
    });
  }
  assert.deepEqual(normalizeAi('none'), []);
  assert.deepEqual(normalizeAi('claude,codex,codex'), ['codex', 'claude']);
  assert.deepEqual(parse(['--ai=codex,claude,copilot']).ai, AI_TOOLS);
});

test('generated pack configs are accepted by the real Python schema and use project-relative defaults', {
  skip: !process.env.CREATE_EWP_PYTHON && 'Set CREATE_EWP_PYTHON to the configured Python interpreter.'
}, t => {
  const { root, templatesDir } = preparedTemplates(t);
  const projects = [];
  for (const template of TEMPLATES) for (const language of LANGUAGES) {
    projects.push(createProject({ directory: join(root, `Pack ${template} ${language}`), name: 'My Desktop App', template, language, templatesDir }));
  }
  for (const name of ['a'.repeat(180), 'uninstall', 'CON', 'lpt9', '中文']) {
    projects.push(createProject({ directory: join(root, `Names ${projects.length}`), name, templatesDir }));
  }
  const harness = `import copy, importlib.util, json, os, sys
from pathlib import Path
def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module
repository = Path(sys.argv[1])
pack = load('ewp_pack_contract', repository / 'backend/base/ewpcore/packaging.py')
installer = load('ewp_installer_contract', repository / 'backend/base/ewpcore/installer.py')
results = []
for directory in json.load(sys.stdin):
    root = Path(directory)
    config = pack.load_pack_config(root)
    alternate = root / 'config files' / 'My Desktop & App.json'
    alternate.parent.mkdir()
    alternate.write_text(json.dumps(config), encoding='utf-8')
    assert pack.load_pack_config(root, Path('config files/My Desktop & App.json')) == config
    manifest = copy.deepcopy(config)
    manifest['applicationPath'] = manifest['appPath'] = config['application']['id'] + '.exe'
    manifest['installer'].pop('files')
    installer.validate_manifest(manifest)
    local = Path(os.environ.get('LOCALAPPDATA', Path.home() / 'AppData/Local'))
    assert installer.default_directory(manifest) == (local / 'Programs' / config['application']['id']).absolute()
    results.append({'config': config, 'directory': str(installer.default_directory(manifest))})
print(json.dumps(results))
`;
  const result = spawnSync(process.env.CREATE_EWP_PYTHON, ['-X', 'utf8', '-c', harness, repository], {
    cwd: tmpdir(), input: JSON.stringify(projects.map(project => project.directory)), encoding: 'utf8', timeout: 20000
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  const rows = JSON.parse(result.stdout);
  assert.equal(rows.length, projects.length);
  rows.forEach(({ config, directory }, index) => {
    const project = projects[index];
    assert.equal(config.application.id, project.name);
    assert.equal(config.application.name, project.name);
    assert.equal(config.schemaVersion, 1);
    assert.deepEqual(config.build, { mode: 'onefile', installer: false });
    assert.deepEqual(config.installer, { language: project.language, files: [] });
    assert.deepEqual(config.features, []);
    assert.deepEqual(config.prerequisites, []);
    assert.deepEqual(config.hooks, {});
    assert.ok(config.postInstall.every(option => option.default === false));
    assert.deepEqual(config.postInstall.map(option => option.type), ['startup', 'launch']);
    assert.equal(config.postInstall.some(option => option.type === 'setting'), false);
    assert.equal(directory.split(/[\\/]/).at(-1), project.name);
  });
});

test('invalid AI selections fail before writes or installation', async t => {
  const { root, templatesDir } = preparedTemplates(t);
  for (const value of ['unknown', 'none,codex', 'codex,', '']) {
    const directory = join(root, 'invalid-ai');
    assert.throws(() => createProject({ directory, ai: value, templatesDir, ...english }), /AI selection/);
    await assert.rejects(main([directory, '--ai', value, '--lang=en'], {
      templatesDir, interactive: false, env: {}, run() { assert.fail('must not install'); }, log() {}
    }), /AI selection|Missing value/);
    assert.equal(existsSync(directory), false);
  }
  const prompts = promptFixture([['unknown']]);
  await assert.rejects(main(['invalid-prompt', '--template=vanilla', '--no-install', '--no-start', '--lang=en'], {
    cwd: root, templatesDir, interactive: true, env: {}, prompts, log() {}
  }), /AI selection/);
  assert.equal(existsSync(join(root, 'invalid-prompt')), false);
});

test('explicit --lang skips only language selection and explicit AI none skips AI selection', async t => {
  const { root, templatesDir } = preparedTemplates(t);
  for (const explicit of [false, true]) {
    const directory = `empty-ai-${explicit}`;
    const prompts = promptFixture(explicit ? [] : [[]]);
    assert.equal(await main([directory, '--template=vanilla', '--no-install', '--no-start', '--lang=en', ...(explicit ? ['--ai=none'] : [])], {
      cwd: root, templatesDir, interactive: true, env: { EWP_LANG: 'zh-CN' }, prompts, log() {}
    }), 0);
    assert.equal(prompts.seen.length, explicit ? 0 : 1);
    for (const path of ['AGENTS.md', 'CLAUDE.md', '.github']) assert.equal(existsSync(join(root, directory, path)), false);
  }
});

test('nonempty targets and Windows-invalid paths are rejected without writes', t => {
  const { root, templatesDir } = preparedTemplates(t);
  const existing = join(root, 'existing');
  mkdirSync(existing);
  writeFileSync(join(existing, 'keep.txt'), 'keep');
  assert.throws(() => createProject({ directory: existing, templatesDir, ...english }), /not empty/);
  assert.equal(readFileSync(join(existing, 'keep.txt'), 'utf8'), 'keep');
  assert.deepEqual(readdirSync(existing), ['keep.txt']);
  const dot = join(root, 'dot');
  mkdirSync(join(dot, '.git'), { recursive: true });
  assert.throws(() => createProject({ directory: '.', cwd: dot, templatesDir, ...english }), /not empty/);
  assert.deepEqual(readdirSync(dot), ['.git']);
  assert.throws(() => validateTarget(join(existing, 'keep.txt'), root, 'en'), /not a directory/);
  for (const directory of ['', ' ', 'bad\nname', 'CON', 'aux.txt', 'bad?', 'trailing.', 'trailing ']) {
    assert.throws(() => validateTarget(directory, root, 'en'), /Invalid|Windows-compatible/);
  }
});

test('empty dot target and nested paths with spaces remain supported', t => {
  const { root, templatesDir } = preparedTemplates(t);
  const empty = join(root, 'empty');
  mkdirSync(empty);
  const result = createProject({ directory: '.', cwd: empty, name: 'My App', templatesDir });
  assert.equal(result.directory, resolve(empty));
  assert.equal(JSON.parse(readFileSync(join(empty, 'frontend/package.json'), 'utf8')).name, 'my-app');
  const nested = createProject({ directory: 'Parent folder/My App', cwd: root, templatesDir });
  assert.equal(nested.name, 'my-app');
  assert.ok(existsSync(join(nested.directory, '.gitignore')));
});

test('symlink or junction targets cannot redirect generation', t => {
  const root = temporary(t);
  const original = join(root, 'real');
  mkdirSync(original);
  const link = join(root, 'linked');
  symlinkSync(original, link, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => validateTarget(link, root, 'en'), /Linked directories/);
  assert.throws(() => validateTarget(join(link, 'new-app'), root, 'en'), /Linked directories/);
  assert.deepEqual(readdirSync(original), []);
});

test('missing prepared resources, localized READMEs and invalid templates fail before writes', t => {
  const { root, templatesDir } = preparedTemplates(t);
  for (const [language, readme] of [['en', 'README.en.md'], ['zh-CN', 'README.md']]) {
    rmSync(join(templatesDir, 'common', readme));
    const destination = join(root, `untouched-${language}`);
    assert.throws(() => createProject({ directory: destination, templatesDir, language }), new RegExp(readme.replaceAll('.', '\\.')));
    assert.equal(existsSync(destination), false);
  }
  const missing = join(root, 'missing');
  mkdirSync(join(missing, 'common'), { recursive: true });
  assert.throws(() => createProject({ directory: join(root, 'untouched'), templatesDir: missing, ...english }), /Missing prepared common resource/);
  assert.throws(() => projectFiles({ template: '../common', ...english }), /Unknown template/);
  assert.throws(() => projectManifest('app', 'svelte', 'en'), /Unknown template/);
});

test('template symlinks cannot copy arbitrary outside files', t => {
  const { root, templatesDir } = preparedTemplates(t);
  const outside = join(root, 'outside');
  mkdirSync(outside);
  writeFileSync(join(outside, 'secret'), 'not copied');
  symlinkSync(outside, join(templatesDir, 'common/linked'), process.platform === 'win32' ? 'junction' : 'dir');
  const target = join(root, 'new');
  assert.throws(() => createProject({ directory: target, templatesDir, ...english }), /Template symlinks/);
  assert.equal(existsSync(target), false);
});

test('noninteractive and --yes never prompt or launch network processes by default', async t => {
  const { root, templatesDir } = preparedTemplates(t);
  for (const [directory, interactive, extra] of [['headless', false, []], ['yes', true, ['--yes']]]) {
    assert.equal(await main([directory, ...extra], {
      cwd: root, templatesDir, interactive, env: {}, log() {},
      run() { assert.fail('must not install or start'); }, prompts: { intro() { assert.fail('must not prompt'); } }
    }), 0);
    const pkg = JSON.parse(readFileSync(join(root, directory, 'frontend/package.json'), 'utf8'));
    assert.equal(pkg.ewp.language, 'zh-CN');
  }
});

test('no flags always prompts for human language first and selection beats the environment', async t => {
  const { root, templatesDir } = preparedTemplates(t);
  for (const language of LANGUAGES) {
    const opposite = language === 'en' ? 'zh-CN' : 'en';
    const prompts = promptFixture([language, `App ${language}`, 'vue', 'ts', ['claude'], true, false]);
    const runs = [];
    const output = [];
    assert.equal(await main([], {
      cwd: root, templatesDir, interactive: true, env: { EWP_LANG: opposite }, prompts,
      log: message => output.push(message), run: async (...args) => runs.push(args)
    }), 0);
    assert.equal(prompts.seen[0].message, '语言 / Language');
    assert.equal(prompts.seen[0].initialValue, opposite);
    assert.deepEqual(prompts.seen[0].options.map(option => option.value), LANGUAGES);
    assert.equal(prompts.seen[1].message, language === 'en' ? 'Project name' : '项目名称');
    assert.deepEqual(prompts.seen[2].options.map(option => option.value), ['vanilla', 'vue', 'react']);
    assert.deepEqual(prompts.seen[3].options.map(option => option.value), ['js', 'ts']);
    assert.deepEqual(prompts.seen[4].initialValues, []);
    assert.equal(prompts.seen[4].required, false);
    assert.deepEqual(prompts.seen[4].options.map(option => option.value), AI_TOOLS);
    assert.deepEqual(runs, [[['install'], join(root, `App ${language}/frontend`), { language, env: { EWP_LANG: language } }]]);
    assert.match(output.join('\n'), language === 'en' ? /Project created:[\s\S]*Desktop development:[\s\S]*Command help/ : /项目已创建：[\s\S]*桌面开发：[\s\S]*命令帮助/);
    assert.equal(prompts.events.at(-1), language === 'en' ? 'Ready' : '准备完成');
    const pkg = JSON.parse(readFileSync(join(root, `App ${language}/frontend/package.json`), 'utf8'));
    assert.equal(pkg.ewp.language, language);
    assert.equal(existsSync(join(root, `App ${language}/docs/.agents`)), false);
  }
});

test('cancellation at the language prompt and every subsequent prompt leaves no project', async t => {
  const { root, templatesDir } = preparedTemplates(t);
  for (const language of LANGUAGES) for (let index = 0; index < 7; index++) {
    const directory = `Cancelled ${language} ${index}`;
    const values = [language, directory, 'react', 'ts', ['codex'], true, false];
    const prompts = promptFixture(values);
    values[index] = prompts.cancellation;
    assert.equal(await main([], {
      cwd: root, templatesDir, interactive: true, env: { EWP_LANG: language }, prompts, log() {}, run() { assert.fail('cancelled'); }
    }), 130);
    assert.equal(existsSync(join(root, directory)), false);
    assert.equal(existsSync(join(root, 'ewp-app')), false);
    assert.match(prompts.events.at(-1), language === 'en' ? /Cancelled; no project/ : /操作已取消，未创建项目/);
  }
});

test('interactive errors and project-name validation use the selected language', async t => {
  const { root, templatesDir } = preparedTemplates(t);
  for (const language of LANGUAGES) {
    const prompts = promptFixture([language, `Conflict ${language}`, 'vanilla', 'js', [], false, true]);
    await assert.rejects(main([], {
      cwd: root, templatesDir, interactive: true, env: {}, prompts, log() {}
    }), language === 'en' ? /Starting requires npm/ : /启动需要 npm/);
    assert.equal(existsSync(join(root, `Conflict ${language}`)), false);
    assert.match(prompts.seen[1].validate('CON'), language === 'en' ? /Windows-compatible/ : /不兼容 Windows/);
  }
});

test('startup runs install, init and dev with one language; failures preserve files', async t => {
  const { root, templatesDir } = preparedTemplates(t);
  for (const language of LANGUAGES) {
    const runs = [];
    assert.equal(await main([`Started ${language}`, '--template=react-ts', '--start', `--lang=${language}`], {
      cwd: root, templatesDir, interactive: false, env: { EWP_LANG: language === 'en' ? 'zh-CN' : 'en' }, log() {},
      run: async (args, cwd, options) => {
        runs.push(args);
        assert.equal(cwd, join(root, `Started ${language}/frontend`));
        assert.equal(options.language, language);
        assert.equal(options.env.EWP_LANG, language);
      }
    }), 0);
    assert.deepEqual(runs, [['install'], ['run', 'init'], ['run', 'dev']]);
    const stopped = [];
    await assert.rejects(main([`Failed ${language}`, '--start', `--lang=${language}`], {
      cwd: root, templatesDir, interactive: false, env: {}, log() {},
      run: async args => { stopped.push(args); throw creatorError('npmFailed', { command: 'install', code: 7, directory: root }, language === 'en' ? 'zh-CN' : 'en'); }
    }), language === 'en' ? /npm install failed/ : /npm install 执行失败/);
    assert.deepEqual(stopped, [['install']]);
    assert.ok(existsSync(join(root, `Failed ${language}/frontend/package.json`)));
  }
});

test('help and executable errors work in both languages outside a project', async t => {
  const cwd = temporary(t);
  for (const language of LANGUAGES) {
    const output = [];
    assert.equal(await main(['--help', `--lang=${language}`], {
      cwd, interactive: true, env: {}, log: value => output.push(value), templatesDir: join(cwd, 'missing')
    }), 0);
    assert.equal(output[0], helpText(language));
    assert.match(output[0], language === 'en' ? /Create a desktop project/ : /创建桌面项目/);
    assert.match(output[0], /--lang > EWP_LANG/);
    const environment = { ...process.env, EWP_LANG: language === 'en' ? 'zh-CN' : 'en' };
    const help = spawnSync(process.execPath, [join(packageDirectory, 'bin/create-ewp.mjs'), '--help', `--lang=${language}`], { cwd, env: environment, encoding: 'utf8' });
    assert.equal(help.status, 0, help.stderr);
    assert.equal(help.stdout.trim(), helpText(language).trim());
    const error = spawnSync(process.execPath, [join(packageDirectory, 'bin/create-ewp.mjs'), '--unknown', `--lang=${language}`], { cwd, env: environment, encoding: 'utf8' });
    assert.equal(error.status, 1);
    assert.match(error.stderr, language === 'en' ? /create-ewp: error: Unknown option/ : /create-ewp: 错误: 未知参数/);
  }
  assert.deepEqual(readdirSync(cwd), []);
});

test('printed directories quote spaces, apostrophes and shell metacharacters', () => {
  assert.equal(quoteDirectory("C:\\My App\\It's $safe; & okay", 'win32'), "'C:\\My App\\It''s $safe; & okay'");
  assert.equal(quoteDirectory("/tmp/It's $safe", 'linux'), "'/tmp/It'\\''s $safe'");
});

test('npm launch executes in a directory with spaces without shell path interpolation', t => {
  const cwd = temporary(t);
  const spec = npmCommand(['--version']);
  const result = spawnSync(spec.command, spec.args, { ...spec.options, cwd, encoding: 'utf8', timeout: 20000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\d+\.\d+\.\d+/);
  for (const language of LANGUAGES) {
    assert.throws(() => npmCommand([], { env: {}, platform: 'win32', execPath: join(cwd, 'node.exe'), language }), language === 'en' ? /npm was not found/ : /找不到 npm/);
  }
});

test('npm child failure is localized and preserves its exit code and selected environment', async t => {
  const cwd = temporary(t);
  const cli = join(cwd, 'npm-cli.js');
  writeFileSync(cli, 'process.exit(process.env.EWP_LANG === process.argv[2] ? 7 : 9);');
  for (const language of LANGUAGES) {
    await assert.rejects(runNpm([language], cwd, { language, env: { ...process.env, EWP_LANG: 'opposite', npm_execpath: cli } }), error => {
      assert.equal(error.exitCode, 7);
      assert.equal(error.language, language);
      assert.match(error.message, language === 'en' ? /failed \(exit 7\)/ : /执行失败（退出码 7）/);
      return true;
    });
  }
});

test('npm pack dry-run includes both README resources and all templates', t => {
  const cwd = temporary(t);
  const spec = npmCommand(['pack', packageDirectory, '--dry-run', '--json', '--ignore-scripts']);
  const result = spawnSync(spec.command, spec.args, { ...spec.options, cwd, encoding: 'utf8', timeout: 20000 });
  assert.equal(result.status, 0, result.stderr);
  const files = JSON.parse(result.stdout)[0].files.map(file => file.path);
  for (const template of TEMPLATES) assert.ok(files.some(path => path.startsWith(`templates/${template}/frontend/src/`)), template);
  for (const path of ['templates/common/_gitignore', 'templates/common/README.md', 'templates/common/README.en.md', 'templates/common/tests/npm-runtime.test.mjs', 'bin/create-ewp.mjs', 'lib/create.mjs']) {
    assert.ok(files.includes(path), path);
  }
  assert.ok(files.every(path => /^(bin\/|lib\/|templates\/|package\.json$|README\.md$|LICENSE$)/.test(path)), files.join('\n'));
  assert.equal(files.some(path => path.includes('node_modules/') || path.endsWith('.pyc')), false);
  assert.equal(lstatSync(packageDirectory).isDirectory(), true);
});

test('generated demo parses localized help/errors and passes --debug to the host', {
  skip: !process.env.CREATE_EWP_PYTHON && 'Set CREATE_EWP_PYTHON to the configured Python interpreter.'
}, t => {
  const { root, templatesDir } = preparedTemplates(t);
  const harness = `import json, runpy, sys, types
from pathlib import Path
source = Path(sys.argv[1])
arguments = json.loads(sys.argv[2])
compile(source.read_text(encoding='utf-8'), str(source), 'exec')
sys.modules['webview'] = types.SimpleNamespace(start=lambda **kwargs: print(json.dumps(kwargs)))
sys.modules['easy_windows_pack'] = types.SimpleNamespace(WindowConfig=lambda **kwargs: kwargs, create_window=lambda *args, **kwargs: None)
sys.argv = [str(source), *arguments]
runpy.run_path(str(source), run_name='__main__')
`;
  for (const template of TEMPLATES) for (const language of LANGUAGES) {
    const result = createProject({ directory: join(root, `${template}-${language}`), template, language, templatesDir });
    const source = join(result.directory, 'backend/src/demo.py');
    const run = args => spawnSync(process.env.CREATE_EWP_PYTHON, ['-X', 'utf8', '-c', harness, source, JSON.stringify(args)], {
      cwd: result.directory, env: { ...process.env, EWP_DEV_URL: 'http://127.0.0.1:12345/' }, encoding: 'utf8', timeout: 20000
    });
    const help = run(['--help']);
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, language === 'en' ? /usage:[\s\S]*show this help message/ : /用法：[\s\S]*显示帮助并退出/);
    assert.match(help.stdout, /--debug/);
    const error = run(['--unknown']);
    assert.equal(error.status, 2, error.stderr);
    assert.match(error.stderr, language === 'en' ? /error: unrecognized arguments/ : /错误: 无法识别的参数/);
    for (const debug of [false, true]) {
      const launched = run(debug ? ['--debug'] : []);
      assert.equal(launched.status, 0, launched.stderr);
      assert.equal(JSON.parse(launched.stdout).debug, debug);
    }
  }
});

test('integration: six templates in both languages build, typecheck and retain reactive content in the real frame', {
  skip: !process.env.CREATE_EWP_VALIDATION_DIR && 'Set CREATE_EWP_VALIDATION_DIR to isolated frontend validation dependencies.',
  timeout: 300000
}, async t => {
  const deps = join(process.env.CREATE_EWP_VALIDATION_DIR, 'node_modules');
  const { root, templatesDir } = preparedTemplates(t);
  const runtime = join(root, 'runtime');
  cpSync(join(repository, 'frontend/packages/easywindowspack'), runtime, {
    recursive: true, filter: source => !/[\\/]node_modules(?:[\\/]|$)/.test(source)
  });
  mkdirSync(join(runtime, 'assets'), { recursive: true });
  for (const [source, destination] of [
    ['frontend/frame/ewpframe/window-frame.js', 'window-frame.js'],
    ['frontend/components/titlebar/window-frame.css', 'window-frame.css']
  ]) cpSync(join(repository, source), join(runtime, 'assets', destination));
  const markup = readFileSync(join(repository, 'frontend/components/titlebar/window-frame.html'), 'utf8');
  writeFileSync(join(runtime, 'assets/frame-template.mjs'), `export const frameTemplate = ${JSON.stringify(markup)};\n`);
  const { build, preview } = await import(pathToFileURL(join(deps, 'vite/dist/node/index.js')).href);
  const { chromium } = await import(pathToFileURL(join(deps, 'playwright/index.mjs')).href);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const template of TEMPLATES) for (const language of LANGUAGES) {
      const project = createProject({ directory: join(root, `App ${template} ${language}`), template, language, templatesDir });
      const modules = join(project.directory, 'frontend/node_modules');
      mkdirSync(modules);
      for (const entry of readdirSync(deps)) {
        if (entry.startsWith('.') || entry === 'easywindowspack') continue;
        symlinkSync(join(deps, entry), join(modules, entry), process.platform === 'win32' ? 'junction' : 'dir');
      }
      symlinkSync(runtime, join(modules, 'easywindowspack'), process.platform === 'win32' ? 'junction' : 'dir');
      await build({ configFile: join(project.directory, 'frontend/vite.config.mjs'), logLevel: 'silent' });
      assert.ok(existsSync(join(project.directory, 'output/frontend/index.html')), template);
      if (template.endsWith('-ts')) {
        const checker = template.startsWith('vue') ? 'vue-tsc/bin/vue-tsc.js' : 'typescript/bin/tsc';
        const checked = spawnSync(process.execPath, [join(deps, checker), '--noEmit', '--project', join(project.directory, 'frontend/tsconfig.json')], {
          cwd: project.directory, encoding: 'utf8', timeout: 30000
        });
        assert.equal(checked.status, 0, `${template}: ${checked.stdout}\n${checked.stderr}`);
      }
      const server = await preview({ configFile: join(project.directory, 'frontend/vite.config.mjs'), preview: { port: 0, open: false }, logLevel: 'silent' });
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      try {
        await page.goto(server.resolvedUrls.local[0]);
        assert.equal(await page.locator('html').getAttribute('lang'), language);
        const frame = page.locator('[data-ewp-window-frame]');
        await frame.waitFor();
        assert.equal(await frame.count(), 1, template);
        assert.equal(await frame.locator('[data-ewp-title]').textContent(), project.name, template);
        assert.equal(await frame.locator('h1').textContent(), language === 'en' ? 'Your next desktop app.' : '构建你的下一个桌面应用。');
        const counter = frame.locator('[data-ewp-content] .counter');
        await counter.click();
        await counter.click();
        assert.equal(await counter.textContent(), language === 'en' ? 'Count: 2' : '计数: 2', template);
        await frame.locator('select').selectOption('windows');
        assert.equal(await frame.getAttribute('data-window-style'), 'windows', template);
        assert.deepEqual(errors, [], template);
      } finally {
        await page.close();
        server.httpServer.closeAllConnections?.();
        await new Promise((resolveClose, reject) => server.httpServer.close(error => error ? reject(error) : resolveClose()));
      }
    }
  } finally { await browser.close(); }
});