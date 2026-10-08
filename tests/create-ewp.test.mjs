import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createProject, normalizePackageName, projectFiles, templatesDirectory, TEMPLATES, validateTarget } from '../packages/create-ewp/lib/create.mjs';
import { HELP, main, npmCommand, parseArgs, quoteDirectory } from '../packages/create-ewp/lib/cli.mjs';

const repository = fileURLToPath(new URL('../', import.meta.url));
const packageDirectory = join(repository, 'packages/create-ewp');

function temporary(t) {
  const root = mkdtempSync(join(tmpdir(), 'create-ewp space-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

// The main agent owns prepare. Stage its authoritative resources in a temporary
// fixture so these unit tests neither edit repository scripts nor duplicate core.
function preparedTemplates(t) {
  const root = temporary(t);
  const templatesDir = join(root, 'templates');
  cpSync(templatesDirectory, templatesDir, { recursive: true });
  cpSync(join(repository, 'backend/base/ewpcore'), join(templatesDir, 'common/backend/base/ewpcore'), {
    recursive: true, filter: source => !/(__pycache__|\.pyc$)/.test(source)
  });
  mkdirSync(join(templatesDir, 'common/scripts'), { recursive: true });
  cpSync(join(repository, 'scripts/dev.py'), join(templatesDir, 'common/scripts/dev.py'));
  return { root, templatesDir };
}

function promptFixture(values) {
  const cancellation = Symbol('prompt-cancel');
  const seen = [];
  const next = options => { seen.push(options); return values.shift(); };
  return { seen, cancellation, text: next, select: next, confirm: next,
    isCancel: value => value === cancellation, intro() {}, outro() {},
    cancel(message) { seen.push(message); } };
}

test('ESM package owns only create-ewp and has a narrow publish allowlist', () => {
  const pkg = JSON.parse(readFileSync(join(packageDirectory, 'package.json'), 'utf8'));
  assert.equal(pkg.name, 'create-ewp');
  assert.equal(pkg.version, '0.1.0');
  assert.equal(pkg.engines.node, '>=22.12.0');
  assert.equal(pkg.type, 'module');
  assert.deepEqual(pkg.bin, { 'create-ewp': './bin/create-ewp.mjs' });
  assert.deepEqual(Object.keys(pkg.dependencies), ['@clack/prompts']);
  assert.deepEqual(pkg.files, ['bin', 'lib', 'templates', 'README.md', 'LICENSE']);
  assert.match(readFileSync(join(packageDirectory, 'bin/create-ewp.mjs'), 'utf8'), /^#!\/usr\/bin\/env node/);
});

test('argument parsing handles npm separators, equals syntax and explicit safe defaults', () => {
  assert.deepEqual(parseArgs(['My App', '--', '--template', 'vue-ts', '--no-install', '--no-start']), {
    name: 'My App', template: 'vue-ts', install: false, start: false
  });
  assert.deepEqual(parseArgs(['--dir=Some folder', '--template=react', '-y']), { directory: 'Some folder', template: 'react', yes: true });
  assert.deepEqual(parseArgs([]), {});
  assert.deepEqual(parseArgs(['--help']), { help: true });
  assert.match(HELP, /非交互默认不安装/);
  for (const args of [['--template'], ['--dir'], ['--dir='], ['--template', 'svelte'], ['--wat'], ['a', 'b'], ['--start', '--no-install'], ['--install', '--no-install']]) {
    assert.throws(() => parseArgs(args), /Missing|Unknown|Only one|requires|Conflicting/);
  }
});

test('package names normalize independently of directories and cannot inject source', () => {
  assert.equal(normalizePackageName('My Desktop App'), 'my-desktop-app');
  assert.equal(normalizePackageName('Éclair 2026'), 'eclair-2026');
  assert.equal(normalizePackageName('@scope/My App'), 'scope-my-app');
  assert.equal(normalizePackageName('中文'), 'ewp-app');
  assert.equal(normalizePackageName('---'), 'ewp-app');
  assert.equal(normalizePackageName('"</title><script>'), 'title-script');
  assert.ok(normalizePackageName('a'.repeat(300)).length <= 180);
});

test('nonempty targets, dot with .git, files and Windows-invalid paths are rejected without writes', t => {
  const { root, templatesDir } = preparedTemplates(t);
  const existing = join(root, 'existing');
  mkdirSync(existing);
  writeFileSync(join(existing, 'keep.txt'), 'keep');
  assert.throws(() => createProject({ directory: existing, templatesDir }), /not empty/);
  assert.equal(readFileSync(join(existing, 'keep.txt'), 'utf8'), 'keep');
  assert.deepEqual(readdirSync(existing), ['keep.txt']);
  const dot = join(root, 'dot');
  mkdirSync(join(dot, '.git'), { recursive: true });
  assert.throws(() => createProject({ directory: '.', cwd: dot, templatesDir }), /not empty/);
  assert.deepEqual(readdirSync(dot), ['.git']);
  assert.throws(() => validateTarget(join(existing, 'keep.txt')), /not a directory/);
  for (const directory of ['', ' ', 'bad\nname', 'CON', 'aux.txt', 'bad?', 'trailing.', 'trailing ']) {
    assert.throws(() => validateTarget(directory, root), /Invalid|Windows-compatible/);
  }
});

test('empty dot target and nested paths with spaces remain supported', t => {
  const { root, templatesDir } = preparedTemplates(t);
  const empty = join(root, 'empty');
  mkdirSync(empty);
  const result = createProject({ directory: '.', cwd: empty, name: 'My App', templatesDir });
  assert.equal(result.directory, resolve(empty));
  assert.equal(JSON.parse(readFileSync(join(empty, 'package.json'), 'utf8')).name, 'my-app');
  const nested = createProject({ directory: 'Parent folder/My App', cwd: root, templatesDir });
  assert.equal(nested.name, 'my-app');
  assert.ok(existsSync(join(nested.directory, '.gitignore')));
});

test('symlink/junction target or parent cannot redirect generation', t => {
  const root = temporary(t);
  const original = join(root, 'real');
  mkdirSync(original);
  const link = join(root, 'linked');
  symlinkSync(original, link, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => validateTarget(link), /Linked directories/);
  assert.throws(() => validateTarget(join(link, 'new-app')), /Linked directories/);
  assert.deepEqual(readdirSync(original), []);
});

test('missing prepared assets and invalid templates fail before target creation', t => {
  const root = temporary(t);
  const source = join(root, 'templates');
  mkdirSync(join(source, 'common'), { recursive: true });
  const destination = join(root, 'untouched');
  assert.throws(() => createProject({ directory: destination, templatesDir: source }), /Missing prepared common resource/);
  assert.equal(existsSync(destination), false);
  assert.throws(() => projectFiles({ template: '../common' }), /Unknown template/);
});

test('template symlinks cannot add arbitrary outside files to a generated project', t => {
  const { root, templatesDir } = preparedTemplates(t);
  const outside = join(root, 'outside');
  mkdirSync(outside);
  writeFileSync(join(outside, 'secret'), 'not copied');
  symlinkSync(outside, join(templatesDir, 'common/linked'), process.platform === 'win32' ? 'junction' : 'dir');
  const target = join(root, 'new');
  assert.throws(() => createProject({ directory: target, templatesDir }), /Template symlinks/);
  assert.equal(existsSync(target), false);
});

test('all six templates compose shared runtime, framework source and compatible build configuration', t => {
  const { root, templatesDir } = preparedTemplates(t);
  for (const template of TEMPLATES) {
    const result = createProject({ directory: join(root, template), name: 'My App', template, templatesDir });
    const read = path => readFileSync(join(result.directory, path), 'utf8');
    const pkg = JSON.parse(read('package.json'));
    assert.equal(pkg.name, 'my-app');
    assert.equal(pkg.dependencies.easywindowspack, '^0.1.0');
    assert.equal(pkg.scripts.init, 'ewp init');
    assert.equal(pkg.scripts.build, 'ewp build');
    assert.equal(pkg.scripts['build:wheel'], 'ewp build --wheel');
    assert.equal(pkg.scripts['build:exe'], 'ewp build --exe');
    assert.match(read('pyproject.toml'), /name = "my-app-desktop"/);
    assert.match(read('pyproject.toml'), /package-dir = \{ easy_windows_pack = "backend\/base\/ewpcore" \}/);
    assert.match(read('pyproject.toml'), /\[project.optional-dependencies\][\s\S]*tray =[\s\S]*dev =/);
    assert.equal(read('backend/base/ewpcore/__init__.py'), readFileSync(join(repository, 'backend/base/ewpcore/__init__.py'), 'utf8'));
    assert.equal(read('scripts/dev.py'), readFileSync(join(repository, 'scripts/dev.py'), 'utf8'));
    assert.ok(existsSync(join(result.directory, 'tests/test_smoke.py')));
    const config = read('vite.config.mjs');
    assert.match(config, /base: '\.\/'/);
    assert.match(config, /outDir: '\.\.\/output\/frontend'/);
    assert.match(config, /fs: \{ strict: true, allow: \[root\] \}/);
    const extension = template.startsWith('react') ? (template.endsWith('-ts') ? 'tsx' : 'jsx') : template.endsWith('-ts') ? 'ts' : 'js';
    assert.match(read('frontend/index.html'), new RegExp(`/src/main\\.${extension}`));
    assert.ok(existsSync(join(result.directory, `frontend/src/main.${extension}`)));
    assert.equal(existsSync(join(result.directory, 'tsconfig.json')), template.endsWith('-ts'));
    if (template.startsWith('vue')) {
      assert.match(config, /plugin-vue/);
      assert.match(read('frontend/src/Frame.vue'), /<Teleport v-if="content" :to="content"><slot/);
      assert.match(read('frontend/src/Frame.vue'), /onBeforeUnmount.*dispose/);
      assert.match(read('frontend/src/App.vue'), /count\+\+/);
      assert.equal(pkg.dependencies.react, undefined);
    } else if (template.startsWith('react')) {
      assert.match(config, /plugin-react/);
      const frame = read(`frontend/src/Frame.${extension}`);
      assert.match(frame, /createPortal\(children, content\)/);
      assert.match(frame, /instance\.dispose\(\)/);
      assert.match(read(`frontend/src/App.${extension}`), /setCount\(value => value \+ 1\)/);
      assert.equal(pkg.dependencies.vue, undefined);
    } else {
      assert.doesNotMatch(config, /plugin-vue|plugin-react/);
      assert.match(read(`frontend/src/main.${extension}`), /content \}/);
    }
  }
});

test('noninteractive and --yes do not prompt or launch network processes by default', async t => {
  const { root, templatesDir } = preparedTemplates(t);
  for (const [directory, interactive, extra] of [['headless', false, []], ['yes', true, ['--yes']]]) {
    const result = await main([directory, ...extra], {
      cwd: root, templatesDir, interactive, log() {},
      run() { assert.fail('must not install or start'); },
      prompts: { intro() { assert.fail('must not prompt'); } }
    });
    assert.equal(result, 0);
    assert.ok(existsSync(join(root, directory, 'package.json')));
  }
});

test('interactive arrows choose framework/language and install without Python initialization', async t => {
  const { root, templatesDir } = preparedTemplates(t);
  const prompts = promptFixture(['My App', 'vue', 'ts', true, false]);
  const runs = [];
  assert.equal(await main([], { cwd: root, templatesDir, interactive: true, prompts, log() {}, run: async (...args) => runs.push(args) }), 0);
  assert.deepEqual(runs, [[['install'], join(root, 'My App')]]);
  assert.deepEqual(prompts.seen[1].options.map(option => option.value), ['vanilla', 'vue', 'react']);
  assert.deepEqual(prompts.seen[2].options.map(option => option.value), ['js', 'ts']);
  assert.ok(existsSync(join(root, 'My App/frontend/src/main.ts')));
});

test('cancellation at every prompt leaves the project directory untouched', async t => {
  const { root, templatesDir } = preparedTemplates(t);
  for (let index = 0; index < 5; index++) {
    const values = [`Cancelled ${index}`, 'react', 'ts', true, false];
    const prompts = promptFixture(values);
    values[index] = prompts.cancellation;
    const result = await main([], { cwd: root, templatesDir, interactive: true, prompts, log() {}, run() { assert.fail('cancelled'); } });
    assert.equal(result, 130);
    assert.equal(existsSync(join(root, `Cancelled ${index}`)), false);
    assert.match(prompts.seen.at(-1), /Cancelled; no project/);
  }
});

test('startup runs npm install then Python init then dev; failures preserve files and stop the pipeline', async t => {
  const { root, templatesDir } = preparedTemplates(t);
  const runs = [];
  assert.equal(await main(['Started App', '--template', 'react-ts', '--start'], {
    cwd: root, templatesDir, interactive: false, log() {}, run: async (args, cwd) => { runs.push(args); assert.equal(cwd, join(root, 'Started App')); }
  }), 0);
  assert.deepEqual(runs, [['install'], ['run', 'init'], ['run', 'dev']]);
  const stopped = [];
  await assert.rejects(main(['Failed App', '--start'], {
    cwd: root, templatesDir, interactive: false, log() {}, run: async args => { stopped.push(args); throw new Error('installation failed'); }
  }), /installation failed/);
  assert.deepEqual(stopped, [['install']]);
  assert.ok(existsSync(join(root, 'Failed App/package.json')));
});

test('help works outside projects without loading prompts or requiring prepared resources', async t => {
  const cwd = temporary(t);
  const output = [];
  assert.equal(await main(['--help'], { cwd, interactive: true, log: value => output.push(value), templatesDir: join(cwd, 'missing') }), 0);
  assert.match(output.join(''), /create-ewp 0.1.0/);
  assert.deepEqual(readdirSync(cwd), []);
  const result = spawnSync(process.execPath, [join(packageDirectory, 'bin/create-ewp.mjs'), '--help'], { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--dir/);
});

test('printed directories quote spaces, apostrophes and shell metacharacters', () => {
  assert.equal(quoteDirectory("C:\\My App\\It's $safe; & okay", 'win32'), "'C:\\My App\\It''s $safe; & okay'");
  assert.equal(quoteDirectory("/tmp/It's $safe", 'linux'), "'/tmp/It'\\''s $safe'");
});

test('npm launch executes with a space-containing cwd without shell path interpolation', t => {
  const cwd = temporary(t);
  const spec = npmCommand(['--version']);
  const result = spawnSync(spec.command, spec.args, { ...spec.options, cwd, encoding: 'utf8', timeout: 20000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\d+\.\d+\.\d+/);
});

test('npm pack dry-run includes all templates and excludes local development dependencies', t => {
  const cwd = temporary(t);
  const spec = npmCommand(['pack', packageDirectory, '--dry-run', '--json', '--ignore-scripts']);
  const result = spawnSync(spec.command, spec.args, { ...spec.options, cwd, encoding: 'utf8', timeout: 20000 });
  assert.equal(result.status, 0, result.stderr);
  const files = JSON.parse(result.stdout)[0].files.map(file => file.path);
  for (const template of TEMPLATES) assert.ok(files.some(path => path.startsWith(`templates/${template}/frontend/src/`)), template);
  assert.ok(files.includes('templates/common/_gitignore'));
  assert.ok(files.includes('bin/create-ewp.mjs'));
  assert.ok(files.includes('lib/create.mjs'));
  assert.ok(files.every(path => /^(bin\/|lib\/|templates\/|package\.json$|README\.md$|LICENSE$)/.test(path)), files.join('\n'));
  assert.equal(files.some(path => path.includes('node_modules/') || path.endsWith('.pyc')), false);
  assert.equal(lstatSync(packageDirectory).isDirectory(), true);
});

test('integration: all templates build, typecheck and keep reactive content inside the real runtime frame', {
  skip: !process.env.CREATE_EWP_VALIDATION_DIR && 'Set CREATE_EWP_VALIDATION_DIR to an isolated directory containing validation dependencies.',
  timeout: 180000
}, async t => {
  const { pathToFileURL } = await import('node:url');
  const deps = join(process.env.CREATE_EWP_VALIDATION_DIR, 'node_modules');
  const { root, templatesDir } = preparedTemplates(t);
  const runtime = join(root, 'runtime');
  cpSync(join(repository, 'packages/easywindowspack'), runtime, {
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
    for (const template of TEMPLATES) {
      const project = createProject({ directory: join(root, `App ${template}`), template, templatesDir });
      const modules = join(project.directory, 'node_modules');
      mkdirSync(modules);
      for (const entry of readdirSync(deps)) {
        if (entry === '.bin' || entry.startsWith('.') || entry === 'easywindowspack') continue;
        symlinkSync(join(deps, entry), join(modules, entry), process.platform === 'win32' ? 'junction' : 'dir');
      }
      symlinkSync(runtime, join(modules, 'easywindowspack'), process.platform === 'win32' ? 'junction' : 'dir');
      await build({ configFile: join(project.directory, 'vite.config.mjs'), logLevel: 'silent' });
      assert.ok(existsSync(join(project.directory, 'output/frontend/index.html')), template);
      if (template.endsWith('-ts')) {
        const checker = template.startsWith('vue') ? 'vue-tsc/bin/vue-tsc.js' : 'typescript/bin/tsc';
        const checked = spawnSync(process.execPath, [join(deps, checker), '--noEmit', '--project', join(project.directory, 'tsconfig.json')], {
          cwd: project.directory, encoding: 'utf8', timeout: 30000
        });
        assert.equal(checked.status, 0, `${template}: ${checked.stdout}\n${checked.stderr}`);
      }
      const server = await preview({ configFile: join(project.directory, 'vite.config.mjs'), preview: { port: 0, open: false }, logLevel: 'silent' });
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      try {
        await page.goto(server.resolvedUrls.local[0]);
        const frame = page.locator('[data-ewp-window-frame]');
        await frame.waitFor();
        assert.equal(await frame.count(), 1, template);
        assert.equal(await frame.locator('[data-ewp-title]').textContent(), project.name, template);
        const counter = frame.locator('[data-ewp-content] .counter');
        await counter.click();
        await counter.click();
        assert.equal(await counter.textContent(), 'Count: 2', template);
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