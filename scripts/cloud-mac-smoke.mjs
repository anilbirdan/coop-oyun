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
const report={at:new Date().toISOString(),commit:process.env.GITHUB_SHA||null,platform:process.platform,arch:process.arch,steps:[],gameLaunchVerified:false,graphicsVerified:false,coOpVerified:false,finderLaunchVerified:false,launchServicesVerified:false};
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
      const runtime=await engine.engineFor();
      const prefix=path.join(local,'loader-diagnostic');
      await fs.mkdir(prefix,{recursive:true});
      const env={...process.env,...engine.libraryEnvironment(runtime),WINEPREFIX:prefix,WINEARCH:'win64',WINEDEBUG:'+all',WINELOADER:runtime.binary,WINESERVER:path.join(runtime.root,'bin/wineserver'),WINEDLLPATH:['x86_64-unix','x86_64-windows','i386-windows'].map(name=>path.join(runtime.root,'lib/wine',name)).join(':')};
      console.log('LOADER_DIAGNOSTIC explicit loader/server/DLL paths');
      let tail='';
      try{await runProcess(runtime.binary,['wineboot','-i'],{env,timeout:90000,maxOutput:24000,log:message=>{tail=(tail+message).slice(-24000);}});console.log('LOADER_DIAGNOSTIC cmd='+await runProcess(runtime.binary,['cmd','/c','ver'],{env,timeout:30000}));}
      catch(error){console.error('LOADER_DIAGNOSTIC '+error.message);}
      finally{console.log('LOADER_TRACE_TAIL\n'+tail);await runProcess(env.WINESERVER,['-k'],{env,timeout:15000}).catch(()=>{});}
      const debuggerPrefix=path.join(local,'debugger-prefix');await fs.mkdir(debuggerPrefix,{recursive:true});
      try{console.log('LLDB_EXIT_BACKTRACE\n'+await runProcess('/usr/bin/lldb',['--batch','-o','breakpoint set -n exit -n _exit','-o','run','-o','thread backtrace all','--',runtime.binary,'wineboot','-i'],{env:{...env,WINEPREFIX:debuggerPrefix,WINEDEBUG:'err+all,warn+all'},timeout:60000,maxOutput:16000}));}catch(error){console.log('LLDB_EXIT_BACKTRACE '+error.message);}
      await runProcess(env.WINESERVER,['-k'],{env:{...env,WINEPREFIX:debuggerPrefix},timeout:15000}).catch(()=>{});
      const baseline=path.join(local,'baseline-runtime');await fs.mkdir(baseline,{recursive:true});
      try{
        await runProcess('/usr/bin/tar',['-xf',path.join(engine.dataDir,'downloads',releases.libraries.file),'-C',baseline],{timeout:180000});
        const baselineRoot=path.join(baseline,'Wine Devel.app/Contents/Resources/wine');
        const baselinePrefix=path.join(local,'baseline-prefix');await fs.mkdir(baselinePrefix,{recursive:true});
        const baselineEnv={...process.env,DYLD_LIBRARY_PATH:path.join(baselineRoot,'lib'),WINEPREFIX:baselinePrefix,WINEARCH:'win64',WINEDEBUG:'err+all,warn+all'};
        console.log('BASELINE_WINE_COMMAND\n'+await runProcess(path.join(baselineRoot,'bin/wine'),['cmd','/c','ver'],{env:baselineEnv,timeout:90000,maxOutput:6000}));
        await runProcess(path.join(baselineRoot,'bin/wineserver'),['-k'],{env:baselineEnv,timeout:15000}).catch(()=>{});
      }catch(error){console.log('BASELINE_WINE_COMMAND '+error.message);}
      throw original;
    }
    report.wineDiagnostic={...result,graphicsVerified:false,coOpVerified:false};
    if(!result.windows.trim())throw new Error('Windows surum komutu bos sonuc verdi.');
  }).catch(error=>{wineFailure=error;});
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
  report.passed=report.steps.length===6&&report.steps.every(step=>step.status==='passed');
  await writeJSON(path.join(local,'cloud-mac-report.json'),report);
  const markdown=['# Bulut Mac temel test sonucu','',...report.steps.map(step=>`- ${step.name}: ${step.status}${step.error?' — '+step.error:''}`),'','Oyun acilisi, grafik, Steam girisi ve co-op bu testle dogrulanmaz. Finder ile acilis da sinanmadi.',''];
  await fs.writeFile(path.join(local,'cloud-mac-report.md'),markdown.join('\n'));
  console.log('COOP_CLOUD_REPORT='+JSON.stringify(report));
}
