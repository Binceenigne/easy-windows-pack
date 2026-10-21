// Real generated projects, runtime task routing and compiler outputs.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createProject } from '../frontend/packages/create-ewp/lib/create.mjs';
import { pathToFileURL } from 'node:url';
const repository = resolve('.');
const validation = resolve('build/generated-native');
const native = resolve('build/native-backends');
const tools = join(native, 'toolchains');
mkdirSync(validation, { recursive: true });
const env = { ...process.env, EWP_LANG: 'en', CMAKE_BUILD_PARALLEL_LEVEL: '4' };
env.EWP_MAKENSIS = join(tools, 'nsis/nsis-3.11/makensis.exe');
const vs = 'D:\\DevTools\\VSBuildTools\\VC\\Auxiliary\\Build\\vcvars64.bat';
const imported = spawnSync('cmd.exe', ['/d', '/c', `call "${vs}" >nul & set`], { encoding: 'utf8' });
if (imported.status) throw new Error('Cannot import VS environment');
// Never print the developer environment: it contains inherited credentials.
for (const line of imported.stdout.split(/\r?\n/)) {
  const index = line.indexOf('='); if (index <= 0) continue;
  const key = line.slice(0, index);
  if (key.toLowerCase() === 'path') { delete env.PATH; env.Path = line.slice(index + 1); }
  else env[key] = line.slice(index + 1);
}
env.EWP_CMAKE = 'D:/DevTools/CMake/bin/cmake.exe';
env.EWP_CMAKE_ARGS = JSON.stringify(['-G', 'Visual Studio 17 2022', '-A', 'x64',
  `-DFETCHCONTENT_SOURCE_DIR_WEBVIEW=${join(native, 'vendor/webview-0.12.0')}`,
  `-DFETCHCONTENT_SOURCE_DIR_NLOHMANN_JSON=${join(native, 'vendor/json-3.11.3')}`]);
env.EWP_GO = join(tools, 'go/bin/go.exe');
env.EWP_CARGO = join(tools, 'cargo-1.99.1-x86_64-pc-windows-msvc/cargo/bin/cargo.exe');
env.RUSTC = join(tools, 'rustc-1.99.1-x86_64-pc-windows-msvc/rustc/bin/rustc.exe');
env.CARGO_HOME = join(native, 'cargo-home');
env.CARGO_BUILD_JOBS = '4';
env.GOCACHE = join(native, 'go-cache');
env.GOMODCACHE = join(native, 'go-mod');
const zig = join(tools, 'zig-x86_64-windows-0.14.1/zig.exe');
env.CC = `${zig} cc -target x86_64-windows-gnu`;
env.CXX = `${zig} c++ -target x86_64-windows-gnu`;
env.ZIG_GLOBAL_CACHE_DIR = join(native, 'zig-cache');
env.CGO_CXXFLAGS = `-g -O2 -I${join(native, 'sdk-headers')}`;
const npmCli = join(process.execPath, '../node_modules/npm/bin/npm-cli.js');
const actualNpm = existsSync(npmCli) ? npmCli : createRequire(join(repository, 'frontend/package.json')).resolve('npm/bin/npm-cli.js');
const report = [];
function run(command, args, cwd, label, extraEnv = {}) {
  console.log(label);
  const result = spawnSync(command, args, { cwd, env: { ...env, ...extraEnv }, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  writeFileSync(join(validation, `${label}.log`), (result.stdout || '') + (result.stderr || ''));
  if (result.status !== 0) throw new Error(`${label} failed (${result.status}): ${(result.stderr || result.stdout || String(result.error)).slice(-3000)}`);
  return result.stdout;
}
for (const backend of (process.argv[2] ? [process.argv[2]] : ['cpp', 'golang', 'rust'])) {
  const root = join(validation, `App ${backend}`);
  if (!existsSync(root)) createProject({ directory: root, template: 'vanilla', backend, language: 'en' });
  // Install the actual packed runtime instead of resolving repository sources.
  const manifestPath = join(root, 'frontend/package.json');
  const manifest = JSON.parse(readFileSync(manifestPath));
  const version = JSON.parse(readFileSync('frontend/packages/easywindowspack/package.json')).version;
  manifest.dependencies.easywindowspack = `file:${join(repository, 'output/npm', `easywindowspack-${version}.tgz`).replaceAll('\\', '/')}`;
  manifest.overrides = { 'create-ewp': `file:${join(repository, 'output/npm', `create-ewp-${version}.tgz`).replaceAll('\\', '/')}` };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  cpSync(join(repository, 'scripts/backend.mjs'), join(root, 'scripts/backend.mjs'));
  if (backend === 'golang') {
    // Network is unavailable for proxy.golang.org; use the exact verified official commit.
    const module = join(native, readdirSync(native).find(name => name.startsWith('webview-webview_go-6173450')));
    run(env.EWP_GO, ['mod', 'edit', `-replace=github.com/webview/webview_go=${module}`], join(root, 'backend'), `${backend}-module`);
  }
  const frontend = join(root, 'frontend');
  run(process.execPath, [actualNpm, 'install', '--prefer-offline', '--no-audit', '--no-fund'], frontend, `${backend}-install`);
  for (const command of (process.argv.includes('--installer') ? ['installer'] : ['check', 'init', 'app', 'bundle'])) run(process.execPath, [actualNpm, 'run', command], frontend, `${backend}-${command}`);
  run('cmd.exe', ['/d', '/c', 'startup.cmd', 'info'], root, `${backend}-startup`);
  const config = JSON.parse(readFileSync(join(root, 'ewp.pack.json')));
  const executable = join(root, 'output/apps', config.application.id, `${config.application.id}.exe`);
  if (!existsSync(executable)) throw new Error('Missing staged executable');
  run(process.execPath, [join(repository, 'tests/native-backends-smoke.mjs'), executable, '--production'], repository, `${backend}-staged-smoke`);
  if (process.argv.includes('--installer')) {
    const setup = join(root, 'output/installers', `${config.application.id}-setup.exe`);
    const destination = join(validation, `Installed ${backend}`);
    // NSIS requires /D to be last and unquoted, including embedded spaces.
    // Fresh compiler output can remain locked by file indexing on this machine.
    // Execute a separate verification copy without altering the artifact.
    const verificationSetup = join(validation, `verify-${backend}-installer.exe`);
    cpSync(setup, verificationSetup);
    const installed = spawnSync(verificationSetup, ['/S', `/D=${destination}`], { env, windowsVerbatimArguments: true, encoding: 'utf8' });
    if (installed.status !== 0 || !existsSync(join(destination, `${config.application.id}.exe`))) throw new Error('Silent installation failed: ' + installed.status);
    run(process.execPath, [join(repository, 'tests/native-backends-smoke.mjs'), join(destination, `${config.application.id}.exe`), '--production'], repository, `${backend}-installed-smoke`);
    writeFileSync(join(destination, 'user-file.txt'), 'keep this file');
    // _?= executes the uninstaller in place and waits for it synchronously.
    const verificationUninstaller = join(validation, `verify-${backend}-uninstaller.exe`);
    cpSync(join(destination, 'uninstall.exe'), verificationUninstaller);
    const uninstalled = spawnSync(verificationUninstaller, ['/S', `_?=${destination}`], { env, windowsVerbatimArguments: true, encoding: 'utf8' });
    if (uninstalled.status !== 0 || existsSync(join(destination, `${config.application.id}.exe`)) || !existsSync(join(destination, 'user-file.txt'))) throw new Error('Safe uninstall failed: ' + (uninstalled.error?.message ?? uninstalled.status));
    report.push({ backend, installer: setup, installation: destination, safeUninstall: true });
  }
  report.push({ backend, root, executable, status: 'passed' });
  writeFileSync(join(validation, 'report.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report));