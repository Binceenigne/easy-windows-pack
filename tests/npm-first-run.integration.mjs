/**
 * node tests/npm-first-run.integration.mjs [--stage=first|wheel|exe|audit|startup]
 * Resume with --root=<reported space path>. Default runs all stages.
 * Only consumes output/npm tarballs; never prepares, repacks or publishes.
 * Generated consumer manifests use local tarballs until registry publication.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync,
  openSync, closeSync, realpathSync } from 'node:fs';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../', import.meta.url));
const option = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const stage = option('stage') || 'all';
assert.ok(['all', 'first', 'wheel', 'exe', 'audit', 'startup'].includes(stage));
const parent = join(repository, 'build/npm-first-run');
mkdirSync(parent, { recursive: true });
const root = option('root') ? resolve(option('root')) : mkdtempSync(join(parent, 'first run '));
const reportPath = join(root, 'report.json');
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const save = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
const sha256 = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const report = existsSync(reportPath) ? json(reportPath) : {
  startedAt: new Date().toISOString(), root, project: join(root, 'Fresh Vue App'),
  harness: join(root, 'package harness'), template: 'vue', commands: [], checks: {}, findings: [],
  startup: { status: 'pending' },
  packs: Object.fromEntries(['create-ewp', 'easywindowspack'].map(name => {
    const path = join(repository, 'output/npm', `${name}-0.1.0.tgz`);
    return [name, { path, sha256: sha256(path) }];
  }))
};
const project = report.project;
const frontend = join(project, 'frontend');
const python = join(project, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !['NODE_PATH', 'PYTHONPATH', 'PYTHONHOME', 'EWP_DEV_URL', 'EWP_DEV_REENTRY', 'VIRTUAL_ENV'].includes(key.toUpperCase())));
const env = { ...cleanEnv, CI: '1', NO_COLOR: '1', PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' };
const flush = () => { report.updatedAt = new Date().toISOString(); save(reportPath, report); };

function run(command, args, cwd, label, timeout = 600000) {
  const logs = join(root, 'logs');
  mkdirSync(logs, { recursive: true });
  const log = join(logs, `${String(report.commands.length + 1).padStart(2, '0')}-${label}.log`);
  const fd = openSync(log, 'w');
  const started = Date.now();
  console.log(`[first-run] ${label}: ${cwd}`);
  let result;
  try {
    // A shared file descriptor preserves stdout/stderr ordering without buffers.
    result = spawnSync(command, args, { cwd, env, shell: false, windowsHide: true,
      timeout, stdio: ['ignore', fd, fd] });
  } finally { closeSync(fd); }
  report.commands.push({ label, command, args, cwd, log, code: result.status,
    error: result.error?.message, durationMs: Date.now() - started });
  flush();
  const output = readFileSync(log, 'utf8');
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${label} failed: ${log}\n${output.slice(-9000)}`);
  console.log(`[first-run] ${label}: passed (${Date.now() - started}ms), ${log}`);
  return output;
}

function npm(args, cwd, label) {
  // Same bootstrap strategy as npm-pack.integration, without importing its tests.
  const candidates = [process.env.npm_execpath,
    join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    join(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js')];
  const cli = candidates.find(path => path && /npm-cli\.js$/.test(path) && existsSync(path));
  assert.ok(cli, 'npm-cli.js not found beside Node; set npm_execpath to the npm JS entry');
  return run(process.execPath, [resolve(cli), ...args], cwd, label);
}

function inside(parentPath, child) {
  const path = relative(realpathSync(parentPath), realpathSync(child));
  return path !== '..' && !path.startsWith('../') && !path.startsWith('..\\') && !isAbsolute(path);
}

function installedAudit(cwd) {
  const lock = json(join(cwd, 'package-lock.json'));
  for (const name of Object.keys(report.packs)) {
    const entry = lock.packages[`node_modules/${name}`];
    assert.match(entry.resolved, /^file:/);
    assert.equal(entry.version, '0.1.0');
    assert.ok(inside(cwd, join(cwd, 'node_modules', name)), `${name} escaped the consumer`);
    assert.equal(sha256(report.packs[name].path), report.packs[name].sha256, 'Tarball changed during validation');
  }
}

function firstRun() {
  assert.equal(existsSync(project), false, 'First run requires an untouched new project');
  const dependencies = Object.fromEntries(Object.entries(report.packs).map(([name, pack]) =>
    [name, `file:${pack.path.replaceAll('\\', '/')}`]));
  mkdirSync(report.harness);
  save(join(report.harness, 'package.json'), { name: 'first-run-harness', private: true, type: 'module', dependencies });
  npm(['install', '--prefer-offline', '--no-audit', '--no-fund'], report.harness, 'harness-install');
  installedAudit(report.harness);
  const runtime = join(report.harness, 'node_modules/easywindowspack/bin/ewp.mjs');
  run(process.execPath, [runtime, 'create', project, '--template', report.template,
    '--no-install', '--no-start'], report.harness, 'installed-ewp-create');
  assert.equal(existsSync(join(project, 'output/frontend')), false);
  assert.equal(existsSync(join(project, '.venv')), false);
  const manifestPath = join(frontend, 'package.json');
  for (const path of ['package.json', 'package-lock.json', 'vite.config.mjs', 'node_modules']) {
    assert.equal(existsSync(join(project, path)), false, `Root must not contain ${path}`);
  }
  const manifest = json(manifestPath);
  assert.equal(manifest.scripts.init, 'ewp init');
  assert.equal(manifest.scripts.build, 'ewp build');
  Object.assign(manifest.dependencies, dependencies);
  save(manifestPath, manifest);
  npm(['install', '--prefer-offline', '--no-audit', '--no-fund'], frontend, 'consumer-install');
  installedAudit(frontend);
  assert.equal(existsSync(join(project, 'output/frontend')), false, 'npm install must not prebuild the app');
  report.checks.noPrebuiltFrontend = true;
  flush();
  const output = npm(['run', 'init'], frontend, 'first-init');
  const npmAt = output.indexOf('Install frontend dependencies');
  const viteAt = output.search(/vite v[\d.]+ building/);
  const completeAt = output.indexOf('built in', viteAt);
  const pipAt = output.search(/-m pip install -e/);
  assert.ok(npmAt >= 0 && viteAt > npmAt && completeAt > viteAt && pipAt > completeAt,
    'Expected npm installation and completed Vite build before pip editable install');
  assert.ok(existsSync(join(project, 'output/frontend/index.html')));
  report.checks.firstInit = { status: 'passed', npmAt, viteAt, completeAt, pipAt };
  const outputEnv = run(python, ['-c', `import json,sys,pathlib,easy_windows_pack
root=pathlib.Path(sys.argv[1]).resolve()
origin=pathlib.Path(easy_windows_pack.__file__).resolve()
assert pathlib.Path(sys.prefix).resolve()==root/'.venv'
assert origin.is_relative_to(root/'backend/base/ewpcore')
print(json.dumps({'executable':sys.executable,'prefix':sys.prefix,'runtime':str(origin)}))`, project], project, 'project-python-provenance');
  report.checks.python = JSON.parse(outputEnv.trim());
  flush();
}

function buildWheel() {
  assert.equal(report.checks.firstInit?.status, 'passed', 'Successful first init is required');
  npm(['run', 'build', '--', '-w'], frontend, 'build-wheel');
  report.checks.wheelBuild = 'passed';
  flush();
}

function buildExe() {
  assert.equal(process.platform, 'win32', 'Default EXE validation requires Windows');
  assert.equal(report.checks.firstInit?.status, 'passed');
  npm(['run', 'build'], frontend, 'build-default-exe');
  report.checks.defaultExeBuild = 'passed';
  flush();
}

function audit() {
  const output = run(python, ['-c', `import hashlib,json,pathlib,sys,zipfile
from PyInstaller.archive.readers import CArchiveReader
root=pathlib.Path(sys.argv[1]).resolve()
compiled=root/'output/frontend'
assets={p.relative_to(compiled).as_posix():p.read_bytes() for p in compiled.rglob('*') if p.is_file()}
assert 'index.html' in assets and any(n.endswith('.js') for n in assets)
assert './assets/' in assets['index.html'].decode()
assert '/src/main' not in assets['index.html'].decode()
wheels=list((root/'output/wheels').glob('*.whl'))
assert len(wheels)==1, wheels
wheel=wheels[0]
with zipfile.ZipFile(wheel) as z:
    names=z.namelist()
    assert not any(n.endswith(('.ts','.tsx','.vue','.jsx')) for n in names), names
    frontend=[n for n in names if '/frontend/' in n]
    assert len(frontend)==len(assets), frontend
    for name,data in assets.items():
        matches=[n for n in frontend if n.endswith('/frontend/'+name)]
        assert len(matches)==1, (name,matches)
        assert z.read(matches[0])==data, name
exe=root/'output/exe/easy-windows-pack-demo.exe'
assert exe.read_bytes()[:2]==b'MZ'
archive=CArchiveReader(str(exe))
toc={n.replace(chr(92),'/'):n for n in archive.toc}
assert not any(n.endswith(('.ts','.tsx','.vue','.jsx')) for n in toc)
assert not any(n.startswith('frontend/') for n in toc)
front=[n for n in toc if n.startswith('output/frontend/')]
assert len(front)==len(assets), front
for name,data in assets.items():
    packed='output/frontend/'+name
    assert packed in toc, packed
    assert archive.extract(toc[packed])==data, packed
print(json.dumps({'wheel':str(wheel),'wheelEntries':names,'exe':str(exe),
    'exeFrontendEntries':front,'compiledAssets':{n:hashlib.sha256(d).hexdigest() for n,d in assets.items()},
    'sourceVueTsAbsent':True,'compiledBytesMatch':True}))`, project], project, 'inspect-wheel-exe');
  report.checks.archives = JSON.parse(output.trim());
  flush();
}

function startup() {
  assert.equal(process.platform, 'win32');
  const exe = report.checks.archives?.exe;
  assert.ok(exe && existsSync(exe), 'Audited EXE required');
  const script = `$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class FirstRunWindow {
  public delegate bool Callback(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] public static extern bool EnumWindows(Callback cb, IntPtr p);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder t, int n);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out Rect r);
  [DllImport("user32.dll")] public static extern bool SendMessageTimeout(IntPtr h, uint m, IntPtr w, IntPtr l, uint f, uint t, out IntPtr result);
  public struct Rect { public int Left, Top, Right, Bottom; }
}
'@
$exePath = '${exe.replaceAll("'", "''")}'
$appProcess = Start-Process -FilePath $exePath -WorkingDirectory '${project.replaceAll("'", "''")}' -PassThru
$observed = @()
try {
  $deadline = [DateTime]::UtcNow.AddSeconds(25)
  do {
    $processes = @(Get-CimInstance Win32_Process -Filter "Name='easy-windows-pack-demo.exe'" | Where-Object { $_.ExecutablePath -eq $exePath })
    $processIds = @($processes | ForEach-Object { [uint32]$_.ProcessId })
    foreach ($processId in $processIds) {
      try { $null = (Get-Process -Id $processId).WaitForInputIdle(1000) } catch {}
    }
    $script:windowsFound = @()
    $callback = [FirstRunWindow+Callback]{ param($handle, $unused)
      [uint32]$ownerId = 0
      $null = [FirstRunWindow]::GetWindowThreadProcessId($handle, [ref]$ownerId)
      if (($processIds -contains $ownerId) -and [FirstRunWindow]::IsWindowVisible($handle)) {
        $titleText = New-Object System.Text.StringBuilder 512
        $null = [FirstRunWindow]::GetWindowText($handle, $titleText, 512)
        $rect = New-Object FirstRunWindow+Rect
        $null = [FirstRunWindow]::GetWindowRect($handle, [ref]$rect)
        [IntPtr]$messageResult = [IntPtr]::Zero
        $responding = [FirstRunWindow]::SendMessageTimeout($handle, 0, [IntPtr]::Zero, [IntPtr]::Zero, 2, 1000, [ref]$messageResult)
        if (($rect.Right - $rect.Left) -ge 640 -and ($rect.Bottom - $rect.Top) -ge 420) {
          $script:windowsFound += [pscustomobject]@{ processId=$ownerId; handle=$handle.ToInt64(); title=$titleText.ToString(); width=($rect.Right-$rect.Left); height=($rect.Bottom-$rect.Top); responding=$responding }
        }
      }
      return $true
    }
    $null = [FirstRunWindow]::EnumWindows($callback, [IntPtr]::Zero)
    $observed = @($script:windowsFound)
  } while ($observed.Count -eq 0 -and [DateTime]::UtcNow -lt $deadline)
  if ($observed.Count -eq 0) { throw 'No visible app-sized EXE window within 25 seconds' }
  if (@($observed | Where-Object { $_.responding }).Count -eq 0) { throw 'EXE window is unresponsive' }
  [pscustomobject]@{ status='passed'; launcherPid=$appProcess.Id; windows=$observed; scope='Visible responsive native window; rendered page interaction not inspected' } | ConvertTo-Json -Depth 5 -Compress
} finally {
  & "$env:SystemRoot/System32/taskkill.exe" /PID $appProcess.Id /T /F *> $null
  Get-CimInstance Win32_Process -Filter "Name='easy-windows-pack-demo.exe'" | Where-Object { $_.ExecutablePath -eq $exePath } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}
`;
  const powershell = join(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const output = run(powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], project, 'windows-exe-startup', 60000);
  const resultLine = output.split(/\r?\n/).find(line => line.startsWith('{"status":'));
  assert.ok(resultLine, 'PowerShell startup JSON result missing');
  report.startup = JSON.parse(resultLine);
  for (const finding of report.findings) {
    if (finding.stage === 'startup' && finding.message.includes('CLIXML')) {
      finding.resolved = 'Harness now suppresses PowerShell progress and extracts the JSON result line';
    }
  }
  flush();
}

flush();
console.log(`[first-run] report: ${reportPath}`);
try {
  if (stage === 'all' || stage === 'first') firstRun();
  if (stage === 'all' || stage === 'wheel') buildWheel();
  if (stage === 'all' || stage === 'exe') buildExe();
  if (stage === 'all' || stage === 'audit') audit();
  if (stage === 'all' || stage === 'startup') startup();
  report.lastStage = { stage, status: 'passed' };
  flush();
} catch (error) {
  report.findings.push({ stage, message: error.message, at: new Date().toISOString() });
  report.lastStage = { stage, status: 'failed' };
  flush();
  console.error(error.stack);
  process.exitCode = 1;
}