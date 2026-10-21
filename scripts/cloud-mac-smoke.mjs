import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {Engine,runProcess} from '../src/engine.mjs';
import {installOfficialEngine,downloadVerified} from '../src/installer.mjs';
import {releases} from '../src/releases.mjs';
import {readJSON,writeJSON} from '../src/storage.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const local=path.join(root,'.local');
const report={at:new Date().toISOString(),platform:process.platform,arch:process.arch,steps:[],gameLaunchVerified:false,graphicsVerified:false,coOpVerified:false,finderLaunchVerified:false};
let engine; let app;
async function step(name,operation){
  const result={name,status:'running'}; report.steps.push(result);
  console.log('STEP '+name);
  try{await operation();result.status='passed';}
  catch(error){result.status='failed';result.error=error.message;throw error;}
}
try{
  await fs.mkdir(local,{recursive:true});
  await step('Apple Silicon macOS',async()=>{
    if(process.platform!=='darwin'||process.arch!=='arm64')throw new Error('Bu test yalnizca gercek ARM64 macOS uzerinde calisir.');
    report.macOS=await runProcess('/usr/bin/sw_vers',['-productVersion']);
    await runProcess('/usr/bin/arch',['-x86_64','/usr/bin/true']);
  });
  engine=new Engine({dataDir:path.join(local,'cloud-engine')});await engine.initialize();
  await step('Resmi Wine ve DXMT kurulumu',async()=>{
    const record=await installOfficialEngine(engine,message=>process.stdout.write(message));
    report.engine={version:record.version,graphicsMode:record.graphicsMode,archiveHashes:record.provenance};
  });
  await step('Wine gercek Windows komutu',async()=>{
    const result=await engine.diagnose(message=>process.stdout.write(message));
    report.wineDiagnostic={...result,graphicsVerified:false,coOpVerified:false};
    if(!result.windows.trim())throw new Error('Windows surum komutu bos sonuc verdi.');
  });
  await engine.close();
  await step('Mac uygulama paketini uret',async()=>{
    await downloadVerified(releases.node,path.join(local,'vendor'),message=>process.stdout.write(message));
    await runProcess(process.execPath,[path.join(root,'scripts/build-mac.mjs'),'--python','python3'],{timeout:180000,log:message=>process.stdout.write(message)});
  });
  await step('Paket icindeki ARM64 Node ve yerel API',async()=>{
    const resources=path.join(local,'build-mac-0.2/Coop Oyun.app/Contents/Resources');
    const binary=path.join(resources,'node');
    const version=await runProcess(binary,['--version']);
    if(version!=='v'+releases.node.version)throw new Error('Paket Node surumu beklenenden farkli.');
    // Execute the shipped runtime and shipped server code, not a mocked process.
    app=spawn(binary,[path.join(resources,'app/src/server.mjs'),'--no-browser'],{shell:false,env:{...process.env,COOP_DATA_DIR:engine.dataDir},stdio:['ignore','pipe','pipe']});
    let spawnFailure; app.once('error',error=>{spawnFailure=error;});
    app.stdout.on('data',()=>{});app.stderr.on('data',bytes=>process.stderr.write(bytes));
    let session;
    for(let i=0;i<100;i++){
      if(spawnFailure)throw spawnFailure;
      if(app.exitCode!==null)throw new Error('Paket sunucusu erken kapandi: '+app.exitCode);
      session=await readJSON(path.join(engine.dataDir,'session.json'),null);
      if(session)break;
      await delay(100);
    }
    if(!session)throw new Error('Paket sunucusu baslamadi.');
    const response=await fetch(session.origin+'api/state',{headers:{Authorization:'Bearer '+session.token},signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error('Paket API cevap vermedi: '+response.status);
    const state=await response.json();
    if(!state.mac||!state.engine||state.games.map(game=>game.id).join(',')!=='bellwright,palworld,raft')throw new Error('Paket durumu beklenenden farkli.');
    report.packagedNodeVersion=version;
    const exit=new Promise(resolve=>app.once('exit',resolve));
    const quit=await fetch(session.origin+'api/quit',{method:'POST',headers:{Authorization:'Bearer '+session.token,'Content-Type':'application/json'},body:'{}'});
    if(!quit.ok)throw new Error('Paket normal kapanamadi.');
    await Promise.race([exit,delay(10000).then(()=>{throw new Error('Paket kapanis suresi doldu.');})]);
  });
}catch(error){report.error=error.message;process.exitCode=1;console.error(error.message);}
finally{
  if(app&&app.exitCode===null)app.kill('SIGTERM');
  await engine?.close();
  await fs.mkdir(local,{recursive:true});
  report.passed=report.steps.length===5&&report.steps.every(step=>step.status==='passed');
  await writeJSON(path.join(local,'cloud-mac-report.json'),report);
  const markdown=['# Bulut Mac temel test sonucu','',...report.steps.map(step=>`- ${step.name}: ${step.status}${step.error?' — '+step.error:''}`),'','Oyun acilisi, grafik, Steam girisi ve co-op bu testle dogrulanmaz. Finder ile acilis da sinanmadi.',''];
  await fs.writeFile(path.join(local,'cloud-mac-report.md'),markdown.join('\n'));
  console.log('COOP_CLOUD_REPORT='+JSON.stringify(report));
}
