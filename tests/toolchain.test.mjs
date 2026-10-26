import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectToolchain, toolchainGuidance } from '../frontend/packages/create-ewp/lib/toolchain.mjs';

const missing = () => ({ status: null, error: { code: 'ENOENT' } });
const ok = stdout => ({ status: 0, stdout, stderr: '' });

test('missing tools report official links without downloading or executing installers', () => {
  const urls = { python: 'https://www.python.org/downloads/', golang: 'https://go.dev/dl/', rust: 'https://rustup.rs/', cpp: 'https://cmake.org/download/' };
  for (const backend of Object.keys(urls)) {
    const calls = [];
    const result = inspectToolchain(backend, { platform: 'win32', env: {}, exists: () => false, run(command, args, options) {
      calls.push([command, args]);
      assert.equal(options.windowsHide, true);
      assert.ok(options.timeout <= 10000);
      return missing();
    } });
    assert.equal(result.available, false);
    for (const language of ['en', 'zh-CN']) {
      const guidance = toolchainGuidance(result, language);
      assert.ok(guidance.includes(urls[backend]), guidance);
      assert.match(guidance, /npm run init/);
      assert.match(guidance, language === 'en' ? /not downloaded automatically/ : /不会自动下载/);
    }
    assert.ok(calls.length > 0);
    assert.ok(calls.every(([, args]) => !args.includes('install')));
  }
});

test('Python version checks allow a supported fallback and reject a failed interpreter', () => {
  const result = inspectToolchain('python', { platform: 'win32', env: {}, run: command => ok(command === 'py' ? 'Python 3.9.9' : 'Python 3.12.0') });
  assert.equal(result.available, true);
  assert.equal(toolchainGuidance(result), '');
  assert.equal(inspectToolchain('python', { platform: 'win32', run: () => ({ status: 1, stdout: 'Python 3.12.0' }) }).available, false);
});

test('Rust honors executable overrides and finds MSVC outside a developer shell', () => {
  const calls = [];
  const result = inspectToolchain('rust', { platform: 'win32', env: { EWP_CARGO: 'custom-cargo', RUSTC: 'custom-rustc' }, exists: () => true,
    run(command, args) {
      calls.push(command);
      if (command === 'custom-cargo') return ok('cargo 1.90.0');
      if (command === 'custom-rustc') return ok('rustc 1.90.0\nhost: x86_64-pc-windows-msvc');
      if (command.endsWith('vswhere.exe')) {
        assert.ok(args.includes('Microsoft.VisualStudio.Component.VC.Tools.x86.x64'));
        return ok('C:\\BuildTools');
      }
      return missing();
    }
  });
  assert.equal(result.available, true, result.missing.join(', '));
  assert.ok(calls.includes('custom-cargo'));
  assert.ok(calls.includes('custom-rustc'));
});

test('Go and CMake enforce minimum versions and report missing compilers', () => {
  const go = inspectToolchain('golang', { platform: 'win32', env: {}, run: command => command === 'go' ? ok('go version go1.21.9 windows/amd64') : missing() });
  assert.ok(go.missing.includes('Go >=1.22'));
  assert.ok(go.missing.includes('MinGW-w64 C++ compiler'));
  assert.match(toolchainGuidance(go, 'en'), /msys2.org/);
  const cmake = inspectToolchain('cpp', { platform: 'win32', env: { EWP_CMAKE: 'custom-cmake' }, exists: () => false, run: command => command === 'custom-cmake' ? ok('cmake version 3.23.0') : missing() });
  assert.ok(cmake.missing.includes('CMake >=3.24'));
  assert.match(toolchainGuidance(cmake, 'en'), /visualstudio.microsoft.com/);
});
