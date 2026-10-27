import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSpec, loadPackConfig, stageApp, installerScript, initialize, installFrontend } from '../scripts/backend.mjs';

function project(t, backend) {
  const root = mkdtempSync(join(tmpdir(), 'ewp-native-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'frontend'));
  writeFileSync(join(root, 'frontend/package.json'), JSON.stringify({ name: 'sample-app', version: '0.1.0', ewp: { backend, language: 'en' } }));
  return root;
}
test('init can retry every failed stage and repeat success without erasing project data', async t => {
  const root = project(t, 'rust');
  mkdirSync(join(root, 'backend'));
  writeFileSync(join(root, 'backend/keep.rs'), 'user code');
  const initialManifest = readFileSync(join(root, 'frontend/package.json'), 'utf8');
  const stages = ['install', 'check', 'frontend', 'backend'];
  for (const failed of stages) {
    const calls = [];
    let failure = failed;
    const services = Object.fromEntries(stages.map(stage => [stage, async (path, options) => {
      assert.equal(path, root);
      if (stage === 'install') assert.equal(options.language, 'en');
      if (stage === 'backend') assert.equal(options.debug, true);
      calls.push(stage);
      if (failure === stage) throw new Error(`${stage} unavailable`);
    }]));
    services.log = () => calls.push('ready');
    await assert.rejects(initialize(root, {}, services), new RegExp(`${failed} unavailable`));
    assert.deepEqual(calls, stages.slice(0, stages.indexOf(failed) + 1));
    failure = null;
    for (let retry = 0; retry < 2; retry++) {
      calls.length = 0;
      assert.equal(await initialize(root, {}, services), 0);
      assert.deepEqual(calls, [...stages, 'ready']);
      assert.equal(readFileSync(join(root, 'backend/keep.rs'), 'utf8'), 'user code');
      assert.equal(readFileSync(join(root, 'frontend/package.json'), 'utf8'), initialManifest);
    }
  }
});

test('init installs frontend dev dependencies in the project before loading Vite', async t => {
  const root = project(t, 'rust');
  const npmCli = join(root, 'npm-cli.js');
  writeFileSync(npmCli, '// npm fixture');
  const env = { npm_execpath: npmCli, NODE_ENV: 'production' };
  let calls = 0;
  await installFrontend(root, { env, language: 'en', execute: async (command, args, options) => {
    calls++;
    assert.equal(command, process.execPath);
    assert.deepEqual(args, [npmCli, 'install', '--include=dev', '--no-audit', '--no-fund']);
    assert.equal(options.cwd, join(root, 'frontend'));
    assert.deepEqual(options.env, env);
    assert.equal(existsSync(join(root, 'frontend/node_modules')), false);
  } });
  assert.equal(calls, 1);
});

test('native init reloads script policy without changing caller configuration', async t => {
  const root = project(t, 'rust');
  const npmCli = join(root, 'npm-cli.js');
  writeFileSync(npmCli, '// npm fixture');
  const npmrc = join(root, 'frontend/.npmrc');
  writeFileSync(npmrc, 'allow-scripts=esbuild\n');
  for (const key of ['npm_config_allow_scripts', 'NPM_CONFIG_ALLOW_SCRIPTS']) {
    const env = { npm_execpath: npmCli, [key]: 'esbuild', npm_lifecycle_event: 'init',
      npm_config_ignore_scripts: 'true', npm_config_strict_allow_scripts: 'true',
      npm_config_userconfig: join(root, 'user.npmrc') };
    const original = { ...env };
    await installFrontend(root, { env, execute: async (_command, _args, options) => {
      assert.ok(Object.keys(options.env).every(name => name.toLowerCase() !== 'npm_config_allow_scripts'));
      const expected = { ...env };
      delete expected[key];
      assert.deepEqual(options.env, expected);
    } });
    assert.deepEqual(env, original);
    assert.equal(readFileSync(npmrc, 'utf8'), 'allow-scripts=esbuild\n');
  }
});

test('native compiler plans preserve paths, debug/release and CGO', t => {
  for (const backend of ['cpp', 'rust', 'golang']) {
    const root = project(t, backend);
    const spec = buildSpec(root, { env: { EWP_GO: 'custom-go', EWP_CARGO: 'custom-cargo', EWP_CMAKE: 'custom-cmake' } });
    assert.ok(spec.executable.startsWith(root));
    assert.equal(spec.commands[0].command, { cpp: 'custom-cmake', rust: 'custom-cargo', golang: 'custom-go' }[backend]);
    if (backend === 'rust') assert.match(spec.commands[0].env.RUSTFLAGS, /crt-static/);
    if (backend === 'golang') assert.equal(spec.commands[0].env.CGO_ENABLED, '1');
    assert.notDeepEqual(buildSpec(root, { debug: true }).commands, spec.commands);
  }
});
test('native configuration refuses unsupported modes and deployment hooks', t => {
  const root = project(t, 'cpp');
  assert.equal(loadPackConfig(root, { task: 'installer' }).install, true);
  assert.throws(() => loadPackConfig(root, { mode: 'onefile' }), /onedir/);
  writeFileSync(join(root, 'ewp.pack.json'), JSON.stringify({ application: { id: '../escape' } }));
  assert.throws(() => loadPackConfig(root), /safe application/);
  writeFileSync(join(root, 'ewp.pack.json'), JSON.stringify({ hooks: { install: 'danger' } }));
  assert.throws(() => loadPackConfig(root), /does not support hooks/);
});
test('portable application stages the exe and frontend with safe uninstall', t => {
  const root = project(t, 'golang');
  mkdirSync(join(root, 'output/frontend/assets'), { recursive: true });
  writeFileSync(join(root, 'output/frontend/index.html'), '<script type="module" src="./assets/app.js"></script>');
  writeFileSync(join(root, 'output/frontend/assets/app.js'), 'export const a=1;');
  const exe = join(root, 'host.exe'); writeFileSync(exe, 'test executable');
  const config = loadPackConfig(root);
  config.postInstall = [{ type: 'startup', name: 'Startup', default: false }, { type: 'launch', name: 'Launch', default: false }];
  const directory = stageApp(root, exe, config);
  assert.equal(readFileSync(join(directory, 'sample-app.exe'), 'utf8'), 'test executable');
  assert.ok(existsSync(join(directory, 'frontend/assets/app.js')));
  writeFileSync(join(directory, 'user-file.txt'), 'keep');
  stageApp(root, exe, config);
  assert.equal(readFileSync(join(directory, 'user-file.txt'), 'utf8'), 'keep');
  const script = installerScript(directory, join(root, 'setup.exe'), config);
  assert.match(script, /RequestExecutionLevel user/);
  assert.match(script, /Section \/o "Startup"/);
  assert.match(script, /MUI_PAGE_COMPONENTS/);
  assert.doesNotMatch(script, /RMDir\s+\/r/i);
  assert.match(script, /Delete "\$INSTDIR\\frontend\\assets\\app.js"/);
  assert.doesNotMatch(script, /user-file.txt/);
});