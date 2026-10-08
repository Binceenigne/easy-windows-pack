import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
mkdirSync(join(root, 'output/npm'), { recursive: true });
const assets = join(root, 'packages/easywindowspack/assets');
rmSync(assets, { recursive: true, force: true });
mkdirSync(assets, { recursive: true });
for (const [source, name] of [
  ['frontend/components/titlebar/window-frame.css', 'window-frame.css'],
  ['frontend/frame/ewpframe/window-frame.js', 'window-frame.js'],
  ['frontend/frame/ewpframe/desktop-updates.js', 'desktop-updates.js'],
  ['frontend/components/desktop/desktop-components.css', 'desktop-components.css'],
  ['frontend/components/desktop/desktop-components.js', 'desktop-components.js'],
]) cpSync(join(root, source), join(assets, name));
const template = readFileSync(join(root, 'frontend/components/titlebar/window-frame.html'), 'utf8');
writeFileSync(join(assets, 'frame-template.mjs'), `export const frameTemplate = ${JSON.stringify(template)};\n`);
const common = join(root, 'packages/create-ewp/templates/common');
for (const [source, destination] of [
  ['backend/base/ewpcore', 'backend/base/ewpcore'], ['scripts/dev.py', 'scripts/dev.py'],
  ['build.cmd', 'build.cmd'], ['LICENSE', 'LICENSE'],
]) {
  const target = join(common, destination);
  rmSync(target, { recursive: true, force: true });
  mkdirSync(join(target, '..'), { recursive: true });
  cpSync(join(root, source), target, {
    recursive: true,
    filter: sourcePath => !sourcePath.includes('__pycache__') && !sourcePath.endsWith('.pyc'),
  });
}
for (const name of ['easywindowspack', 'create-ewp']) cpSync(join(root, 'LICENSE'), join(root, 'packages', name, 'LICENSE'));
console.log('npm resources prepared from authoritative frontend/backend sources.');