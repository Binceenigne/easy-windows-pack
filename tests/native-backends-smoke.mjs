// Real native HWND + WebView2 smoke. node tests/native-backends-smoke.mjs <host.exe> [--production]
import {createServer} from 'node:http';
import {spawn, spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import assert from 'node:assert/strict';
const executable=resolve(process.argv[2]);
const production=process.argv.includes('--production');
const nativeTitlebar=process.argv.includes('--native-titlebar');
const folder=resolve('build/native-backends/smoke',production?'production':'development', executable.includes('golang')?'golang':executable.includes('rust')?'rust':'cpp','assets space \u8d44\u6e90');
await mkdir(folder,{recursive:true});
const frame=await readFile('frontend/frame/ewpframe/window-frame.js','utf8');
let finish;const completed=new Promise(r=>finish=r);let foreignRequests=0,foreignExecutions=0;
const foreign=createServer((req,res)=>{foreignRequests++;if(req.url.startsWith('/executed'))foreignExecutions++;res.setHeader('Content-Type','text/html');res.end('<script>fetch("/executed?bridge="+!!window.ewpNative);window.__ewp_rpc?.("window_action",["close"])</script>');});
foreign.listen(0,'127.0.0.1');await once(foreign,'listening');
const foreignURL=`http://127.0.0.1:${foreign.address().port}/untrusted`;
let workarea;
const server=createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  if(req.url==='/result') {let body='';for await(const chunk of req)body+=chunk;res.end('ok');finish(JSON.parse(body));return;}
  if(req.url==='/redirect-navigation'){res.writeHead(302,{Location:foreignURL});res.end();return;}
  if(req.url==='/workarea'){
    const r=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',resolve('tests/native-backends-window.ps1'),'-ProcessId',String(child.pid),'-Action','inspect'],{encoding:'utf8'});
    if(r.status!==0){res.writeHead(500);res.end(r.stderr);return;}workarea=JSON.parse(r.stdout.replace(/^\uFEFF/,''));res.setHeader('Content-Type','application/json');res.end(JSON.stringify(workarea));return;
  }
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end(page);
});
server.listen(0,'127.0.0.1');await once(server,'listening');
const serverURL=`http://127.0.0.1:${server.address().port}`;
const page=`<!doctype html><meta charset="utf-8"><div data-ewp-window-frame data-titlebar-mode="default"><button data-ewp-action="maximize">Max</button></div><script>${frame}</script><script type="module" src="${production?'./module.js':'data:text/javascript,window.moduleReady%3Dtrue'}"></script><script>
const results=[];const wait=ms=>new Promise(r=>setTimeout(r,ms));
function check(x,name){if(!x)throw Error(name);results.push(name);}
const call=(method,...args)=>window.easyWindowsPack.call(method,...args);
window.addEventListener('load',async()=>{try{
check(window.moduleReady===true,'ES module loaded');
check(typeof window.ewpNative?.call==='function','native bridge installed');
check(typeof window.pywebview?.api?.native_drag==='function','frame API adapter installed');
let state=await call('get_window_state');check(state.ok&&state.visible&&state.resizable&&!state.maximized,'initial HWND state');
${nativeTitlebar?`{check(state.titleBarMode==='native'&&state.activeTitleBarMode==='native','native startup mode');
const bounds=await(await fetch(${JSON.stringify(serverURL+'/workarea')})).json();check(bounds.nativeCaption,'HWND has WS_CAPTION');
await call('set_window_size',840,560);await wait(100);state=await call('get_window_state');check(state.windowSize.width===840&&state.windowSize.height===560,'native chrome client size');
state=await call('set_titlebar_mode','default');check(state.restartRequired&&state.activeTitleBarMode==='native'&&state.titleBarMode==='default','native to frameless requires restart');
state=await call('set_titlebar_mode','native');check(!state.restartRequired&&state.activeTitleBarMode==='native','unchanged native mode needs no restart');
await fetch(${JSON.stringify(serverURL+'/result')},{method:'POST',body:JSON.stringify({ok:true,results})});await call('window_action','close');return;}`:''}
check((await call('get_window_size')).windowSize.width>0,'get_window_size');
check((await call('set_always_on_top',true)).alwaysOnTop===true,'set topmost');check((await call('toggle_always_on_top')).alwaysOnTop===false,'toggle topmost');
state=await call('set_window_size',840,560);await wait(100);state=await call('get_window_state');check(state.windowSize.width===840&&state.windowSize.height===560,'physical client size');
for(const [method,args,label] of [['set_window_size',['840',560],'string size'],['set_window_size',[840.5,560],'fractional size'],['set_window_size',[1e100,560],'overflow size'],['set_window_size',[100,560],'undersized'],['set_always_on_top',['false'],'string boolean'],['native_drag',['unknown'],'unknown drag'],['unknown_method',[],'unknown method'],['get_window_state',[1],'extra args']])check(!(await call(method,...args)).ok,'reject '+label);
document.querySelector('[data-ewp-action="maximize"]').click();await wait(250);state=await call('get_window_state');check(state.maximized,'real frame maximize button');
check(document.querySelector('[data-ewp-window-frame]').classList.contains('ewp-window-maximized'),'frame state synchronization');
const bounds=await(await fetch(${JSON.stringify(serverURL+'/workarea')})).json();check(bounds.maximized&&Math.abs(bounds.client.width-bounds.work.width)<=2&&Math.abs(bounds.client.height-bounds.work.height)<=2,'maximize respects monitor work area');
check(!(await call('native_drag','right')).ok,'reject maximized resize');
check(!(await call('window_action','maximize')).maximized,'maximize toggles restore');
check(!(await call('window_action','minimize')).visible,'minimize');check((await call('window_action','restore')).visible,'restore');
check(!(await call('hide_window')).visible,'hide');check((await call('show_window')).visible,'show');
check((await call('set_titlebar_mode','minimal')).titleBarMode==='minimal','minimal mode');state=await call('set_titlebar_mode','native');check(state.restartRequired&&state.titleBarMode==='native'&&state.activeTitleBarMode==='minimal','native mode restart contract');
await call('set_titlebar_mode','default');
const remote=${JSON.stringify(foreignURL)};window.open(remote);const iframe=document.createElement('iframe');iframe.src=remote;document.body.append(iframe);
const link=document.createElement('a');link.href=remote;document.body.append(link);link.click();await wait(250);check(!location.href.includes('/untrusted'),'remote link canceled');location.href=remote;await wait(250);check(!location.href.includes('/untrusted'),'remote script navigation canceled');
${production?`location.href='https://ewp.local/other.html';await wait(200);check(location.pathname==='/index.html','other asset document canceled');
for(const path of ['/../outside-secret.txt','/%2e%2e%2foutside-secret.txt','/%5c..%5coutside-secret.txt','/index.html%3Asecret']){let body='';try{body=await(await fetch(path)).text();}catch{}check(!body.includes('OUTSIDE_EWP_SECRET'),'confine resource '+path);}`:`location.href='/redirect-navigation';await wait(250);check(location.pathname==='/','cross origin redirect canceled');`}
check((await call('get_window_state')).ok,'bridge remains trusted');
await fetch(${JSON.stringify(serverURL+'/result')},{method:'POST',body:JSON.stringify({ok:true,results})});await call('window_action','close');
}catch(error){await fetch(${JSON.stringify(serverURL+'/result')},{method:'POST',body:JSON.stringify({ok:false,results,error:String(error),url:location.href})});await call('window_action','close');}});
</script>`;
if(production){await writeFile(resolve(folder,'../outside-secret.txt'),'OUTSIDE_EWP_SECRET');await writeFile(resolve(folder,'index.html'),page);await writeFile(resolve(folder,'other.html'),'<script>throw Error("untrusted")</script>');await writeFile(resolve(folder,'module.js'),'window.moduleReady=true;');}
const env={...process.env,EWP_HOST_NO_DIALOG:'1',EWP_HOST_TRACE:'1',WEBVIEW2_USER_DATA_FOLDER:resolve(folder,'../profiles',Date.now().toString())};
delete env.EWP_DEV_URL;delete env.EWP_ASSETS;delete env.EWP_TITLEBAR_MODE;
const child=spawn(executable,[production?'--assets':'--url',production?folder:serverURL+'/', '--title','EWP Native Smoke \u539f\u751f',...(nativeTitlebar?['--titlebar-mode','native']:[])],{env,stdio:['ignore','pipe','pipe']});
child.stdout.on('data',data=>process.stdout.write(data));child.stderr.on('data',data=>process.stderr.write(data));
const exited=once(child,'exit');child.once('error',e=>finish({ok:false,error:String(e)}));
const timeout=setTimeout(()=>{finish({ok:false,error:'host timed out'});child.kill();},45000);
try{
 const result=await completed;console.log(JSON.stringify({...result,foreignRequests,foreignExecutions,workarea},null,2));
 await writeFile(resolve(folder,'result.json'),JSON.stringify({...result,foreignRequests,foreignExecutions,workarea},null,2));
 assert.equal(result.ok,true,result.error);assert.equal(foreignExecutions,0,'untrusted document script executed');
 const [code]=await exited;assert.equal(code,0,'host exit');
}finally{clearTimeout(timeout);if(child.exitCode===null)child.kill();server.closeAllConnections();foreign.closeAllConnections();server.close();foreign.close();}