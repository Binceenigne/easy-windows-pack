// Real mouse and Windows keyboard input against each host; no CDP or fake HWND.
// node tests/native-backends-input.mjs <host.exe>
import {createServer} from 'node:http';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const executable=resolve(process.argv[2]);
const name=executable.includes('golang')?'golang':executable.includes('rust')?'rust':'cpp';
const directory=resolve('build/native-backends/input',name);await mkdir(directory,{recursive:true});
let poll, task, readyResolve, mouseResolve, issuedResolve;const ready=new Promise(r=>readyResolve=r);
let pendingResult;let requestId=0;
const mouse=[];
function send(){if(poll&&task){poll.end(JSON.stringify(task));poll=null;task=null;}}
const server=createServer(async(req,res)=>{
 if(req.url==='/next'){poll=res;send();return;}
 if(req.url==='/ready'){res.end('ok');readyResolve();return;}
 if(req.url==='/issued'){res.end('ok');issuedResolve?.();issuedResolve=null;return;}
 if(req.url==='/mouse'){mouse.push(Date.now());res.end('ok');mouseResolve?.();mouseResolve=null;return;}
 if(req.url==='/result'){let body='';for await(const c of req)body+=c;res.end('ok');pendingResult?.(JSON.parse(body));pendingResult=null;return;}
 res.setHeader('Content-Type','text/html');res.end(`<!doctype html><style>html,body{margin:0;width:100%;height:100%;background:#202832;color:white}#drag{height:40px;background:#404860}#resize{position:fixed;bottom:0;right:0;width:24px;height:24px;background:#bca}</style><div id="drag">Native move</div><div id="resize"></div><script>
const call=(m,...a)=>ewpNative.call(m,a);
for(const [id,direction]of [['drag','move'],['resize','bottom-right']])document.getElementById(id).onmousedown=e=>{if(e.button!==0)return;e.preventDefault();fetch('/mouse',{method:'POST'});call('native_drag',direction)};
window.addEventListener('load',async()=>{await fetch('/ready');for(;;){const t=await(await fetch('/next')).json();if(t.method==='native_drag')await fetch('/issued',{method:'POST'});const value=t.method==='probe'?{height:innerHeight,width:innerWidth,dpr:devicePixelRatio,element:document.elementFromPoint(220,20)?.outerHTML}:await call(t.method,...t.args);await fetch('/result',{method:'POST',body:JSON.stringify(value)});}});
</script>`);
});server.listen(0,'127.0.0.1');await once(server,'listening');
const env={...process.env,EWP_HOST_NO_DIALOG:'1',WEBVIEW2_USER_DATA_FOLDER:resolve(directory,'profile')};delete env.EWP_DEV_URL;delete env.EWP_ASSETS;
const child=spawn(executable,['--url',`http://127.0.0.1:${server.address().port}/`,'--title',`EWP Input ${name}`],{env,stdio:'inherit'});
const exited=once(child,'exit');
const timeout=setTimeout(()=>child.kill(),60000);
function native(action='inspect',point){
 const result=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',resolve('tests/native-backends-window.ps1'),'-ProcessId',String(child.pid),'-Action',action,...(point?['-X',String(point.x),'-Y',String(point.y)]:[])],{encoding:'utf8',windowsHide:true});
 if(result.status!==0)throw Error(result.stderr);return JSON.parse(result.stdout.replace(/^\uFEFF/,''));
}
async function call(method,...args){return await new Promise((r,j)=>{const timer=setTimeout(()=>j(Error(`RPC ${method} timed out`)),10000);pendingResult=value=>{clearTimeout(timer);r(value);};task={id:++requestId,method,args};send();});}
async function drag(from,to,direction){
 native('move',from);
 await new Promise(r=>setImmediate(r));
 console.log(JSON.stringify({press:native('press',from)}));
 const issued=new Promise(r=>issuedResolve=r);
 const dragging=call('native_drag',direction);
 await issued;
 native('move',{x:Math.round((from.x+to.x)/2),y:Math.round((from.y+to.y)/2)});
 await new Promise(r=>setImmediate(r));
 native('move',to);native('release');
 await dragging;
 return native();
}
const results=[];
try{
 await Promise.race([ready,exited.then(()=>{throw Error('Host exited before ready')})]);
 await call('set_window_size',900,600);let before=native();
 console.log(JSON.stringify({probe:await call('probe')}));
 const inputProbe=native('press',{x:before.rect.left+200,y:before.rect.top+20});
 const held=native();native('release');
 if(!held.leftDown){
	 const report={ok:false,unsupported:true,reason:'SendInput returned 1 but GetAsyncKeyState(VK_LBUTTON) remains up; this desktop did not deliver the injected mouse press',inputProbe,held};
	 await writeFile(resolve(directory,'result.json'),JSON.stringify(report,null,2));
	 console.log(JSON.stringify(report));await call('window_action','close');await exited;process.exitCode=2;
 }else{
 let from={x:before.rect.left+220,y:before.rect.top+20};
 let after=await drag(from,{x:from.x+110,y:from.y+85},'move');
 console.log(JSON.stringify({phase:'drag',before,after,mouseEvents:mouse.length}));
 assert.ok(Math.abs(after.rect.left-before.rect.left)>=70&&Math.abs(after.rect.top-before.rect.top)>=50,'native drag did not move HWND');results.push({test:'native mouse drag',before,after});
 before=after;from={x:before.rect.right-10,y:before.rect.bottom-10};
 after=await drag(from,{x:from.x+100,y:from.y+70},'bottom-right');
 assert.ok(after.client.width-before.client.width>=70&&after.client.height-before.client.height>=40,'native resize did not change client area');results.push({test:'native mouse resize',before,after});
 await call('window_action','maximize');before=native();
 from={x:Math.round(before.work.left+before.work.width/2),y:before.work.top+20};
 after=await drag(from,{x:from.x-120,y:from.y+200},'move');
 assert.equal(after.maximized,false,'maximized drag did not restore');assert.ok(after.client.width<before.client.width,'maximized drag retained full width');results.push({test:'maximized drag restore',before,after});
 native('snap');after=native();
 assert.equal(after.maximized,false);assert.ok(Math.abs(after.client.width-after.work.width/2)<35,'Win+Left did not snap to half the work area');
 assert.ok(Math.abs(after.client.height-after.work.height)<35,'snap ignored work area');results.push({test:'Windows Win+Left snap',after});
 native('restore');await call('window_action','close');const[code]=await exited;assert.equal(code,0);
 await writeFile(resolve(directory,'result.json'),JSON.stringify({ok:true,results,mouseEvents:mouse.length},null,2));console.log(JSON.stringify({ok:true,name,tests:results.map(x=>x.test),mouseEvents:mouse.length}));
 }
}finally{
 clearTimeout(timeout);if(child.exitCode===null){try{native('release');}catch{}child.kill();}
 poll?.end('{}');server.closeAllConnections();server.close();
}