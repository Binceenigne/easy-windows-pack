// Real process argument/path rejection + bundled path confinement.
// node tests/native-backends-security.mjs <host.exe>
import {spawnSync} from 'node:child_process';
import {mkdir,writeFile,symlink,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const executable=resolve(process.argv[2]);
const name=executable.includes('golang')?'golang':executable.includes('rust')?'rust':'cpp';
const root=resolve('build/native-backends/security',name);await mkdir(root,{recursive:true});
const env={...process.env,EWP_HOST_NO_DIALOG:'1'};delete env.EWP_DEV_URL;delete env.EWP_ASSETS;delete env.EWP_TITLEBAR_MODE;
const cases=[['--unknown'],['--url'],['--titlebar-mode','invalid'],['--url','https://example.com/'],['--url','http://localhost.evil.test/'],['--url','http://localhost:5173@evil.test/'],['--url','file:///C:/Windows/win.ini'],['--assets',root],['--url','http://localhost:5173','--assets',root]];
const assets=resolve(root,'assets space Unicode-\u8d44\u6e90');await mkdir(assets,{recursive:true});await writeFile(resolve(assets,'index.html'),'<!doctype html>');
const outside=resolve(root,'outside');await mkdir(outside,{recursive:true});await writeFile(resolve(outside,'secret.txt'),'outside secret');
const link=resolve(assets,'escape');await rm(link,{force:true,recursive:true});await symlink(outside,link,'junction');cases.push(['--assets',assets]);
const results=[];
try{
 for(const args of cases){
  const result=spawnSync(executable,args,{env,encoding:'utf8',timeout:15000,windowsHide:true});
  assert.equal(result.error,undefined,`Host hung or could not start: ${JSON.stringify(args)} ${result.error}`);
  assert.ok(result.status!==0,`Accepted invalid input: ${JSON.stringify(args)}`);
  results.push({args,status:result.status,error:result.stderr?.slice(0,500)});
 }
 const help=spawnSync(executable,['--help'],{env,encoding:'utf8',timeout:10000});assert.equal(help.status,0);
 await writeFile(resolve(root,'result.json'),JSON.stringify({ok:true,results},null,2));console.log(JSON.stringify({ok:true,name,rejected:results.length}));
}finally{await rm(link,{force:true,recursive:true});}