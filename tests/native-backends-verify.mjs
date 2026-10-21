// Final verification of already-built hosts, with individual full logs/results.
import {spawnSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve('build/native-backends');await mkdir(resolve(root,'logs'),{recursive:true});
const hosts={cpp:'cpp/build/ewp-host.exe',golang:'golang/ewp-host.exe',rust:'rust/target-final/release/ewp-host.exe'};
const summary=[];
for(const [backend,host]of Object.entries(hosts)){
 for(const [name,script,extra]of [
    ['development','smoke',[]],['production','smoke',['--production']],['native-titlebar','smoke',['--native-titlebar']],['security','security',[]],['input','input',[]],
 ]){
  const run=spawnSync(process.execPath,[resolve(`tests/native-backends-${script}.mjs`),resolve(root,host),...extra],{encoding:'utf8',timeout:90000});
  await writeFile(resolve(root,`logs/${backend}-${name}.log`),(run.stdout||'')+(run.stderr||''));
  const unsupported=name==='input'&&run.stdout?.includes('"unsupported":true');
  const result={backend,test:name,status:unsupported?'unsupported':run.status===0?'passed':'failed',exitCode:run.status};
  summary.push(result);console.log(JSON.stringify(result));
  if(run.status!==0&&!unsupported){console.log(run.stdout,run.stderr);process.exitCode=1;}
 }
}
await writeFile(resolve(root,'verification.json'),JSON.stringify(summary,null,2));