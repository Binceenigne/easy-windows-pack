// Download the official NSIS portable archive in bounded parallel ranges.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
const folder = resolve('build/native-backends/toolchains/nsis');
mkdirSync(folder, { recursive: true });
const url = 'https://master.dl.sourceforge.net/project/nsis/NSIS%203/3.11/nsis-3.11.zip';
const size = 2361546;
const chunkSize = 65536;
const chunks = Array.from({ length: Math.ceil(size / chunkSize) });
let next = 0;
await Promise.all(Array.from({ length: 16 }, async () => {
  while (next < chunks.length) {
    const index = next++;
    const start = index * chunkSize, end = Math.min(size, start + chunkSize) - 1;
    const path = join(folder, `chunk-${index}`);
    if (!existsSync(path) || readFileSync(path).length !== end - start + 1) {
      for (let attempt = 0; ; attempt++) try { await new Promise((done, reject) => {
        const child = spawn('curl.exe', ['--silent', '--show-error', '--fail', '--location', '--connect-timeout', '10', '--max-time', '50', '--range', `${start}-${end}`, '--output', path, url], { stdio: ['ignore', 'ignore', 'pipe'] });
        let error = ''; child.stderr.on('data', data => { error += data; });
        child.once('error', reject); child.once('exit', code => code ? reject(Error(error)) : done());
      }); break; } catch (error) { if (attempt >= 2) throw error; }
    }
    chunks[index] = readFileSync(path);
    if (chunks[index].length !== end - start + 1) throw new Error('Incomplete official archive chunk');
    console.log(`NSIS ${index + 1}/${chunks.length}`);
  }
}));
writeFileSync(join(folder, 'nsis.zip'), Buffer.concat(chunks));
console.log('Official NSIS archive downloaded');