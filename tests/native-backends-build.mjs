// Build isolated copies: node tests/native-backends-build.mjs cpp|golang|rust
import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
const backend = process.argv[2] || 'cpp';
if (!['cpp', 'golang', 'rust'].includes(backend)) throw Error('Expected cpp, golang or rust');
const root = resolve('build/native-backends');
const source = resolve('frontend/packages/create-ewp/templates/backends', backend, 'backend');
const copy = join(root, backend, 'backend');
await mkdir(copy, {recursive:true});
await cp(source, copy, {recursive:true, filter: path => !/[\\/](build|target|validation|vendor)([\\/]|$)/.test(path.slice(source.length))});
const tools = join(root, 'toolchains');
const env = {...process.env};
function run(command, args, cwd = root, quiet = false) {
  console.log(JSON.stringify({command,args,cwd}));
  const result = spawnSync(command, args, {cwd,env,encoding:'utf8',stdio:quiet?'pipe':'inherit',maxBuffer:30*1024*1024});
  if (result.status !== 0) throw Error(`Build failed (${result.status}): ${result.error || command}`);
  return result.stdout;
}
// Read the installed VS developer environment without changing machine PATH.
const vs = 'D:/DevTools/VSBuildTools/VC/Auxiliary/Build/vcvars64.bat';
if (backend !== 'golang') {
  const vars = run('cmd.exe', ['/d','/c',`call ${vs.replaceAll('/', '\\')} >nul & set`], root, true);
  for (const line of vars.split(/\r?\n/)) {
    const at = line.indexOf('=');
    if (at > 0) { const key = line.slice(0,at); if (key.toLowerCase()==='path') env.Path=line.slice(at+1); else env[key]=line.slice(at+1); }
  }
}
let executable;
if (backend === 'cpp') {
  const cmake = 'D:/DevTools/CMake/bin/cmake.exe';
  // Reuse only previously downloaded official source archives, never old objects.
  const cached = resolve(source,'build/vendor');
  const vendor=join(root,'vendor');await mkdir(vendor,{recursive:true});
  const sources=[];
  for(const [key,folder]of [['WEBVIEW','webview-0.12.0'],['NLOHMANN_JSON','json-3.11.3']]){
    if(!existsSync(join(vendor,folder))&&existsSync(join(cached,folder)))await cp(join(cached,folder),join(vendor,folder),{recursive:true});
    if(existsSync(join(vendor,folder)))sources.push(`-DFETCHCONTENT_SOURCE_DIR_${key}=${join(vendor,folder)}`);
  }
  run(cmake,['-S',copy,'-B',join(root,'cpp/build'),'-G','Visual Studio 17 2022','-A','x64',...sources]);
  run(cmake,['--build',join(root,'cpp/build'),'--config','Release','--parallel','4']);
  executable = join(root,'cpp/build/ewp-host.exe');
} else if (backend === 'golang') {
  const mingw = (await readdir(tools,{withFileTypes:true})).find(x=>x.isDirectory()&&x.name.startsWith('llvm-mingw-'))?.name;
  const bin = mingw?join(tools,mingw,'bin'):join(tools,'zig-x86_64-windows-0.14.1');
  env.CC=mingw?join(bin,'x86_64-w64-mingw32-gcc.exe'):`${join(bin,'zig.exe')} cc -target x86_64-windows-gnu`;
  env.CXX=mingw?join(bin,'x86_64-w64-mingw32-g++.exe'):`${join(bin,'zig.exe')} c++ -target x86_64-windows-gnu`;
  env.ZIG_GLOBAL_CACHE_DIR=join(root,'zig-cache');
  // Zig ships a subset of MinGW headers. Use the installed SDK only for WinRT
  // declaration headers (EventToken.h required by official WebView2.h).
  if(!mingw){
    const sdk=join(root,'sdk-headers');await mkdir(sdk,{recursive:true});
    await cp('C:/Program Files (x86)/Windows Kits/10/Include/10.0.26100.0/winrt/EventToken.h',join(sdk,'EventToken.h'));
    env.CGO_CXXFLAGS=`-g -O2 -I${sdk}`;
  }
  env.Path=`${bin};${env.Path || env.PATH}`; delete env.PATH;
  env.CGO_ENABLED='1'; env.GOCACHE=join(root,'go-cache'); env.GOMODCACHE=join(root,'go-mod');
  executable=join(root,'golang/ewp-host.exe');
  const go=join(tools,'go/bin/go.exe');
  run(go,['version']);
  let module=join(env.GOMODCACHE,'github.com/webview/webview_go@v0.0.0-20240831120633-6173450d4dd6');
  if(process.argv.includes('--github-source')){
    // Network fallback for validation only: the same pinned upstream commit,
    // downloaded from its official GitHub archive. The template stays unchanged.
    const archive=join(root,'webview-go.zip');
    if(!existsSync(archive)){
      const response=await fetch('https://codeload.github.com/webview/webview_go/legacy.zip/6173450d4dd6');
      if(!response.ok)throw Error('Cannot download pinned upstream webview_go');
      await writeFile(archive,Buffer.from(await response.arrayBuffer()));
    }
    run('tar.exe',['-xf',archive,'-C',root]);
    module=join(root,(await readdir(root)).find(x=>x.startsWith('webview-webview_go-6173450')));
    run(go,['mod','edit',`-replace=github.com/webview/webview_go=${module}`],copy);
  }else run(go,['mod','download'],copy);
  // Declaration headers are exact copies of the module which supplies the ABI.
  for (const [local,upstream] of [['webview.h','libs/webview/include/webview.h'],['WebView2.h','libs/mswebview2/include/WebView2.h'],['webview.LICENSE','libs/webview/LICENSE'],['WebView2.LICENSE','libs/mswebview2/LICENSE']]) {
    const a=await readFile(join(copy,'include',local)); const b=await readFile(join(module,upstream));
    if (!a.equals(b)) throw Error(`Vendored declaration does not match pinned module: ${local}`);
  }
  run(go,['build','-trimpath','-ldflags=-H=windowsgui','-o',executable,'.'],copy);
} else {
  const directories=await readdir(tools);
  const rust=join(tools,directories.find(x=>/^rustc-.*windows-msvc$/.test(x)),'rustc');
  const std=join(tools,directories.find(x=>/^rust-std-.*windows-msvc$/.test(x)),'rust-std-x86_64-pc-windows-msvc');
  const cargo=join(tools,directories.find(x=>/^cargo-.*windows-msvc$/.test(x)),'cargo/bin/cargo.exe');
  if(!existsSync(join(rust,'lib/rustlib/x86_64-pc-windows-msvc/lib')))await cp(join(std,'lib'),join(rust,'lib'),{recursive:true});
  env.RUSTC=join(rust,'bin/rustc.exe'); env.CARGO_HOME=join(root,'cargo-home'); env.CARGO_TARGET_DIR=join(root,'rust/target-final');
  env.CARGO_HTTP_MULTIPLEXING='false';env.CARGO_HTTP_TIMEOUT='30';env.CARGO_NET_RETRY='2';
  env.Path=`${join(rust,'bin')};${env.Path || env.PATH}`; delete env.PATH;
  run(env.RUSTC,['--version']); run(cargo,['--version']);
  if(process.argv.includes('--clean'))run(cargo,['clean','--manifest-path',join(copy,'Cargo.toml'),'--release']);
  run(cargo,['build','--manifest-path',join(copy,'Cargo.toml'),'--release','-j','4']);
  run(cargo,['test','--manifest-path',join(copy,'Cargo.toml'),'--release','-j','4']);
  executable=join(env.CARGO_TARGET_DIR,'release/ewp-host.exe');
}
await writeFile(join(root,`${backend}-build.json`),JSON.stringify({backend,executable,source,copy},null,2));
console.log(JSON.stringify({backend,executable}));