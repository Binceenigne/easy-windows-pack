import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const brandIcons = ['ewp-color.svg', 'ewp-dark.svg', 'ewp-mono.svg'];
for (const source of ['startup.cmd', 'scripts/startup.cmd', 'scripts/dev.py', ...brandIcons.map(name => `frontend/src/assets/${name}`)]) {
  if (!existsSync(join(root, source))) throw new Error(`Missing authoritative npm resource: ${source}`);
}
mkdirSync(join(root, 'output/npm'), { recursive: true });
const assets = join(root, 'frontend/packages/easywindowspack/assets');
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
const common = join(root, 'frontend/packages/create-ewp/templates/common');
const brandAssets = join(common, 'frontend/src/assets');
rmSync(brandAssets, { recursive: true, force: true });
mkdirSync(brandAssets, { recursive: true });
for (const name of brandIcons) cpSync(join(root, 'frontend/src/assets', name), join(brandAssets, name));
// Remove the previously generated launcher when preparing an existing checkout.
rmSync(join(common, 'build.cmd'), { force: true });
for (const [source, destination] of [
  ['backend/base/ewpcore', 'backend/base/ewpcore'], ['scripts/dev.py', 'scripts/dev.py'],
  ['startup.cmd', 'startup.cmd'], ['scripts/startup.cmd', 'scripts/startup.cmd'], ['LICENSE', 'LICENSE'],
]) {
  const target = join(common, destination);
  rmSync(target, { recursive: true, force: true });
  mkdirSync(join(target, '..'), { recursive: true });
  cpSync(join(root, source), target, {
    recursive: true,
    filter: sourcePath => !sourcePath.includes('__pycache__') && !sourcePath.endsWith('.pyc'),
  });
}
for (const name of ['easywindowspack', 'create-ewp']) cpSync(join(root, 'LICENSE'), join(root, 'frontend/packages', name, 'LICENSE'));
console.log('npm resources prepared from authoritative frontend/backend sources.');