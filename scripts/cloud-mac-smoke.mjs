import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {Engine,runProcess} from '../src/engine.mjs';
import {installOfficialEngine,downloadVerified} from '../src/installer.mjs';
import {releases} from '../src/releases.mjs';
import {readJSON,writeJSON} from '../src/storage.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const local=path.join(root,'.local');
const version=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')).version;
const report={at:new Date().toISOString(),commit:process.env.GITHUB_SHA||null,platform:process.platform,arch:process.arch,steps:[],gameLaunchVerified:false,graphicsVerified:false,basicD3D11FrameVerified:false,coOpVerified:false,steamLoginVerified:false,finderLaunchVerified:false,launchServicesVerified:false};
const unpacked=path.join(local,'cloud-unpacked');
const bundle=path.join(unpacked,'Coop Oyun.app');
let engine; let app; let wineFailure;
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
    let result;
    try { result=await engine.diagnose(message=>process.stdout.write(message)); }
    catch(original){
      throw original;
    }
    report.wineDiagnostic={...result,graphicsVerified:false,coOpVerified:false};
    if(!result.windows.trim())throw new Error('Windows surum komutu bos sonuc verdi.');
  }).catch(error=>{wineFailure=error;});
  if(!wineFailure){
    await step('Kurulan motorla gercek Direct3D 11',async()=>{
      let installed;
      try{
        await engine.prepare('palworld',message=>process.stdout.write(message));
        installed=await engine.engineFor('palworld');
        const probe=path.join(local,'installed-d3d11-probe.exe');
        await runProcess('x86_64-w64-mingw32-gcc',[path.join(root,'scripts/d3d11-probe.c'),'-O2','-o',probe,'-luser32','-ldxguid'],{timeout:60000});
        const output=await runProcess(installed.binary,[probe],{env:{...engine.environment('palworld',installed),WINEDEBUG:'err+all',MVK_CONFIG_LOG_LEVEL:'0'},timeout:90000,maxOutput:8000,log:message=>process.stdout.write(message)});
        if(!output.includes('D3D11_PROBE resize_destroy_reopen_passed'))throw new Error('Kurulan motorda Direct3D goruntu ve pencere denetimi gecmedi.');
        report.basicD3D11FrameVerified=true;
      }finally{if(installed)await engine.stopServer(installed,engine.environment('palworld',installed)).catch(()=>{});}
    }).catch(error=>{wineFailure=error;});
  }else report.steps.push({name:'Kurulan motorla gercek Direct3D 11',status:'skipped'});
  if(!wineFailure){
    await step('Palworld ortami ve resmi Steam kurulumu',async()=>{
      try{
        await engine.installSteam('palworld',message=>process.stdout.write(message));
        if(!await engine.steamPath('palworld'))throw new Error('Steam exe dosyasi kurulumdan sonra bulunamadi.');
        report.steamFilesInstalled=true;
      }finally{await engine.stop('palworld',message=>process.stdout.write(message)).catch(()=>{});}
    }).catch(error=>{wineFailure=error;});
  }else report.steps.push({name:'Palworld ortami ve resmi Steam kurulumu',status:'skipped'});
  await engine.close();
  await step('Mac uygulama paketini uret',async()=>{
    await downloadVerified(releases.node,path.join(local,'vendor'),message=>process.stdout.write(message));
    await runProcess(process.execPath,[path.join(root,'scripts/build-mac.mjs'),'--python','python3'],{timeout:180000,log:message=>process.stdout.write(message)});
  });
  await step('Paket icindeki ARM64 Node ve yerel API',async()=>{
    await runProcess('/usr/bin/ditto',['-xk',path.join(root,`dist/Coop-Oyun-M5-${version}.zip`),unpacked],{timeout:120000});
    const resources=path.join(bundle,'Contents/Resources');
    const binary=path.join(resources,'node');
    const nodeVersion=await runProcess(binary,['--version']);
    if(nodeVersion!=='v'+releases.node.version)throw new Error('Paket Node surumu beklenenden farkli.');
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
    report.packagedNodeVersion=nodeVersion;
    report.packagedSourceHash=(await readJSON(path.join(resources,'build-manifest.json'))).sourceHash;
    const exit=new Promise(resolve=>app.once('exit',resolve));
    const quit=await fetch(session.origin+'api/quit',{method:'POST',headers:{Authorization:'Bearer '+session.token,'Content-Type':'application/json'},body:'{}'});
    if(!quit.ok)throw new Error('Paket normal kapanamadi.');
    await Promise.race([exit,delay(10000).then(()=>{throw new Error('Paket kapanis suresi doldu.');})]);
  });
  await step('ZIP uygulamasini macOS open ile ac',async()=>{
    const sessionFile=path.join(os.homedir(),'Library/Application Support/CoopOyun/session.json');
    if(await readJSON(sessionFile,null))throw new Error('Varsayilan uygulama oturumu zaten var; uzerine yazilmadi.');
    await runProcess('/usr/bin/open',['-n',bundle],{timeout:15000});
    let session;
    for(let i=0;i<150;i++){
      session=await readJSON(sessionFile,null);
      if(session)break;
      await delay(100);
    }
    if(!session){
      const details=await fs.readFile(path.join(os.homedir(),'Library/Logs/CoopOyun/launcher.log'),'utf8').catch(()=>'');
      throw new Error('Mac uygulama kabugu baslamadi. '+details.slice(-3000));
    }
    const headers={Authorization:'Bearer '+session.token};
    const result=await fetch(session.origin+'api/state',{headers,signal:AbortSignal.timeout(5000)});
    if(!result.ok||(await result.json()).version!==version)throw new Error('Mac open uygulama durumu dogrulanamadi.');
    const quit=await fetch(session.origin+'api/quit',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}'});
    if(!quit.ok)throw new Error('Mac uygulama kabugu kapanamadi.');
    report.launchServicesVerified=true;
  });
  if(wineFailure)throw wineFailure;
}catch(error){report.error=error.message;process.exitCode=1;console.error(error.message);}
finally{
  if(app&&app.exitCode===null)app.kill('SIGTERM');
  await engine?.close();
  await fs.mkdir(local,{recursive:true});
  report.passed=report.steps.length===8&&report.steps.every(step=>step.status==='passed');
  await writeJSON(path.join(local,'cloud-mac-report.json'),report);
  const markdown=['# Bulut Mac temel test sonucu','',...report.steps.map(step=>`- ${step.name}: ${step.status}${step.error?' — '+step.error:''}`),'','Kucuk Direct3D goruntu sinamasi oyun grafigi/performansi demek degildir. Steam girisi, oyun acilisi, co-op ve Finder tiklamasi bu testle dogrulanmaz.',''];
  await fs.writeFile(path.join(local,'cloud-mac-report.md'),markdown.join('\n'));
  console.log('COOP_CLOUD_REPORT='+JSON.stringify(report));
}
