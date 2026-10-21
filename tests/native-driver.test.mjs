import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSpec, loadPackConfig, stageApp, installerScript } from '../scripts/backend.mjs';

function project(t, backend) {
  const root = mkdtempSync(join(tmpdir(), 'ewp-native-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'frontend'));
  writeFileSync(join(root, 'frontend/package.json'), JSON.stringify({ name: 'sample-app', version: '0.1.0', ewp: { backend, language: 'en' } }));
  return root;
}
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