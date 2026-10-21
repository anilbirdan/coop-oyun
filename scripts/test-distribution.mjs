import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {runProcess} from '../src/engine.mjs';
import {hashFile,readJSON} from '../src/storage.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const expectedArchive=process.env.COOP_ARCHIVE_SHA;
const expectedSource=process.env.COOP_SOURCE_HASH;
if(process.platform!=='darwin'||process.arch!=='arm64'||![expectedArchive,expectedSource].every(value=>/^[a-f0-9]{64}$/.test(value||'')))throw new Error('ARM64 Mac ve iki sabit ozet gerekir.');
const archive=path.join(root,'.local/distribution/Coop-Oyun-M5-0.3.0.zip');
if(await hashFile(archive)!==expectedArchive)throw new Error('Dagitim ZIP ozeti eslesmiyor.');
const unpack=path.join(root,'.local/distribution/open');await fs.mkdir(unpack,{recursive:true});
await runProcess('/usr/bin/ditto',['-xk',archive,unpack],{timeout:120000});
const bundle=path.join(unpack,'Coop Oyun.app');
const resources=path.join(bundle,'Contents/Resources');
const manifest=await readJSON(path.join(resources,'build-manifest.json'));
if(manifest.sourceHash!==expectedSource||manifest.version!=='0.3.0')throw new Error('Dagitim kaynak surumu sinanan surumle eslesmiyor.');
if(await hashFile(path.join(resources,'node'))!==manifest.nodeBinarySha256)throw new Error('Paket Node ikilisi eslesmiyor.');
for(const [name,hash] of Object.entries(manifest.sourceFiles)){
  const target=path.resolve(resources,'app',name);
  const relative=path.relative(path.join(resources,'app'),target);
  if(relative.startsWith('..')||path.isAbsolute(relative)||await hashFile(target)!==hash)throw new Error('Paket kaynak dosyasi eslesmiyor: '+name);
}
const nodeVersion=await runProcess(path.join(resources,'node'),['--version']);
if(nodeVersion!=='v22.23.3')throw new Error('Paket Node surumu eslesmiyor.');
const sessionFile=path.join(os.homedir(),'Library/Application Support/CoopOyun/session.json');
if(await readJSON(sessionFile,null))throw new Error('Mevcut uygulama oturumuna dokunulmadi.');
let session;
try{
  await runProcess('/usr/bin/open',['-n',bundle],{timeout:15000});
  for(let i=0;i<150;i++){
    session=await readJSON(sessionFile,null);
    if(session)break;
    await delay(100);
  }
  if(!session)throw new Error('Dagitim uygulamasi baslamadi.');
  const headers={Authorization:'Bearer '+session.token};
  const response=await fetch(session.origin+'api/state',{headers,signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error('Dagitim API yaniti basarisiz.');
  const state=await response.json();
  if(state.version!=='0.3.0'||!state.mac||state.games.map(game=>game.id).join(',')!=='bellwright,palworld,raft')throw new Error('Dagitim uygulama durumu yanlis.');
  const quit=await fetch(session.origin+'api/quit',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(5000)});
  if(!quit.ok)throw new Error('Dagitim uygulamasi normal kapanamadi.');
  for(let i=0;i<100&&await readJSON(sessionFile,null);i++)await delay(100);
  if(await readJSON(sessionFile,null))throw new Error('Dagitim oturumu kapanistan sonra kaldi.');
  console.log('COOP_DISTRIBUTION_REPORT='+JSON.stringify({passed:true,archiveSha256:expectedArchive,sourceHash:expectedSource,macOS:await runProcess('/usr/bin/sw_vers',['-productVersion']),nodeVersion,launchServicesVerified:true,gameVerified:false,coOpVerified:false,finderClickVerified:false}));
}finally{
  if(session&&await readJSON(sessionFile,null))await fetch(session.origin+'api/quit',{method:'POST',headers:{Authorization:'Bearer '+session.token,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(5000)}).catch(()=>{});
}
