// Official portable toolchains, confined to build/native-backends/toolchains.
// node tests/native-backends-toolchains.mjs
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import {existsSync} from 'node:fs';
import {setDefaultResultOrder} from 'node:dns';
setDefaultResultOrder('ipv4first');
const nativeFetch=globalThis.fetch;
async function fetch(url, options={}) {
  for(let attempt=0;;attempt++){
    try{return await nativeFetch(url,{signal:AbortSignal.timeout(60000),...options});}
    catch(error){if(attempt>=3)throw error;console.log(`Retry ${attempt+1}: ${url}`);}
  }
}

const root = resolve('build/native-backends/toolchains');
await mkdir(root, { recursive: true });
async function download(url, name, hash) {
  const destination = resolve(root, name);
  let bytes;
  try { bytes = await readFile(destination); } catch {}
  if (!bytes || (hash && createHash('sha256').update(bytes).digest('hex') !== hash)) {
    console.log(`Downloading ${new URL(url).origin}${new URL(url).pathname}`);
    const headers={'User-Agent':'ewp-native-validation','Accept':'application/octet-stream'};
    const github=new URL(url).hostname==='release-assets.githubusercontent.com';
    const zig=new URL(url).hostname==='ziglang.org';
    const head=github||zig?null:await fetch(url,{method:'HEAD',headers,signal:AbortSignal.timeout(30000)});
    if(head&&!head.ok)throw Error(`${head.status}: ${url}`);
    const size=github?190836485:zig?82229343:Number(head.headers.get('content-length'));
    const chunkSize=github||zig?256*1024:1024*1024;
    if(size>chunkSize){
      const chunks=new Array(Math.ceil(size/chunkSize));let next=0,finished=0;
      await Promise.all(Array.from({length:16},async()=>{while(next<chunks.length){
        const index=next++;const begin=index*chunkSize,end=Math.min(size,begin+chunkSize)-1;
        for(let attempt=0;;attempt++){
          try{
            if(github||zig){
              const file=destination+`.chunk-${index}`;
              let chunk;try{chunk=await readFile(file);}catch{}
              if(chunk?.length!==end-begin+1){
                await new Promise((resolve,reject)=>{const child=spawn('curl.exe',['--silent','--show-error','--fail','--location','--connect-timeout','10','--max-time','60','--range',`${begin}-${end}`,'--output',file,url],{stdio:['ignore','ignore','pipe']});let err='';child.stderr.on('data',x=>err+=x);child.on('exit',code=>code===0?resolve():reject(Error(err)));child.on('error',reject);});
                chunk=await readFile(file);
              }
              if(chunk.length!==end-begin+1)throw Error('Incomplete asset chunk');chunks[index]=chunk;break;
            }
            const r=await fetch(url,{headers:{...headers,Range:`bytes=${begin}-${end}`},signal:AbortSignal.timeout(60000)});
            if(r.status!==206)throw Error(`Range returned ${r.status}`);
            const chunk=Buffer.from(await r.arrayBuffer());if(chunk.length!==end-begin+1)throw Error('Incomplete chunk');chunks[index]=chunk;break;
          }catch(e){if(attempt>=2)throw e;}
        }
        finished++;if(finished%16===0||finished===chunks.length)console.log(`${name}: ${finished}/${chunks.length} chunks`);
      }}));
      bytes=Buffer.concat(chunks);
    }else{
      const response=await fetch(url,{headers,signal:AbortSignal.timeout(60000)});
      if(!response.ok)throw Error(`${response.status}: ${url}`);
      bytes=Buffer.from(await response.arrayBuffer());
    }
    if (hash && createHash('sha256').update(bytes).digest('hex') !== hash) throw Error(`SHA256 mismatch: ${name}`);
    await writeFile(destination + '.partial', bytes);
    await rename(destination + '.partial', destination);
  }
  console.log(`${name}: ${bytes.length} bytes SHA256 ${createHash('sha256').update(bytes).digest('hex')}`);
  return destination;
}
function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) throw Error(`${command} exited ${result.status}: ${result.error || ''}`);
}
if(process.argv[2]==='zig'){
  const zip=await download('https://ziglang.org/download/0.14.1/zig-x86_64-windows-0.14.1.zip','zig-x86_64-windows-0.14.1.zip','554f5378228923ffd558eac35e21af020c73789d87afeabf4bfd16f2e6feed2c');
  if(!existsSync(zip.replace(/\.zip$/,'')))run('tar.exe',['-xf',zip,'-C',root]);
  process.exit(0);
}
let go;
if(process.argv[2]!=='mingw'){
const releases = await (await fetch('https://go.dev/dl/?mode=json')).json();
go = releases[0].files.find(file => file.os === 'windows' && file.arch === 'amd64' && file.kind === 'archive');
const goZip = await download(`https://go.dev/dl/${go.filename}`, go.filename, go.sha256);
if(!existsSync(resolve(root,'go/bin/go.exe')))run('tar.exe', ['-xf', goZip, '-C', root]);
}

const release = await (await fetch('https://api.github.com/repos/mstorsjo/llvm-mingw/releases/latest', {
  headers: { 'User-Agent': 'ewp-native-validation' },
})).json();
const mingw = release.assets.find(asset => /ucrt-x86_64.zip$/.test(asset.name));
let manifest;
if(process.argv[2]!=='mingw'){
manifest = await (await fetch('https://static.rust-lang.org/dist/channel-rust-stable.toml')).text();
for (const component of ['rustc', 'rust-std', 'cargo']) {
  const section = manifest.split(`[pkg.${component}.target.x86_64-pc-windows-msvc]\n`)[1]?.split('\n[')[0];
  const url = section?.match(/^xz_url = "([^"]+)"/m)?.[1];
  const hash = section?.match(/^xz_hash = "([^"]+)"/m)?.[1];
  if (!url || !hash) throw Error(`Missing official manifest component ${component}`);
  const archive = await download(url, new URL(url).pathname.split('/').pop(), hash);
  if(!existsSync(archive.replace(/\.tar\.xz$/, '')))run('tar.exe', ['-xf', archive, '-C', root]);
}
}
const redirect = await fetch(mingw.url + '?download=' + Date.now(), {
  redirect:'manual',headers:{'User-Agent':'ewp-native-validation','Accept':'application/octet-stream'},
});
const assetURL=redirect.status===302?redirect.headers.get('location'):mingw.browser_download_url;
const mingwZip = await download(assetURL, mingw.name, mingw.digest?.replace('sha256:', ''));
if(!existsSync(mingwZip.replace(/\.zip$/, '')))run('tar.exe', ['-xf', mingwZip, '-C', root]);
await writeFile(resolve(root, 'sources.json'), JSON.stringify({ go, mingw, rustManifest: manifest }, null, 2));
console.log(`Toolchain archives extracted under ${root}`);