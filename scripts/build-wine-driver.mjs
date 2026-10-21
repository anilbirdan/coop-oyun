import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {downloadVerified} from '../src/installer.mjs';
import {releases} from '../src/releases.mjs';
import {runProcess} from '../src/engine.mjs';
import {supportsDXMT} from '../src/macho.mjs';
import {hashFile} from '../src/storage.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const local=path.join(root,'.local');
const runtime=path.join(local,'driver-runtime',releases.libraries.folder,'Contents/Resources/wine');
if(process.platform!=='darwin'||process.arch!=='arm64')throw new Error('Bu derleme gercek ARM64 Mac gerektirir.');
if(process.argv[2]==='prepare'){
  const archive=await downloadVerified(releases.libraries,path.join(local,'vendor'),message=>process.stdout.write(message));
  await fs.mkdir(path.join(local,'driver-runtime'),{recursive:true});
  await runProcess('/usr/bin/tar',['-xf',archive,'-C',path.join(local,'driver-runtime')],{timeout:180000});
  const headers={
    'macdrv_cocoa.h':['macdrv_view_create_metal_view','macdrv_view_get_metal_layer','macdrv_view_release_metal_view'],
  };
  for(const [file,names] of Object.entries(headers)){
    const target=path.join(local,'wine-source/dlls/winemac.drv',file);
    let text=await fs.readFile(target,'utf8');
    for(const name of names){
      const pattern=new RegExp('^extern ([^;\\n]*\\b'+name+'\\([^;\\n]*;)$','gm');
      let count=0;text=text.replace(pattern,(_,declaration)=>{count++;return 'extern __attribute__((visibility("default"))) '+declaration;});
      if(count!==1)throw new Error('Beklenen tek kaynak bildirimi bulunamadi: '+name+' / '+count);
    }
    await fs.writeFile(target,text);
  }
  const driverSource=path.join(local,'wine-source/dlls/winemac.drv');
  const header=path.join(driverSource,'macdrv.h');
  const originalHeader=await fs.readFile(header,'utf8');
  if(!originalHeader.includes('WineContentView    *client_view;'))throw new Error('Beklenen Wine 11.18 pencere alani bulunamadi; uyarlama uygulanmadi.');
  await fs.writeFile(header,'#define get_win_data coop_wine_get_win_data\n#define release_win_data coop_wine_release_win_data\n'+originalHeader);
  await fs.copyFile(path.join(root,'scripts/wine-dxmt-compat.c'),path.join(driverSource,'dxmt_compat.c'));
  const makefile=path.join(driverSource,'Makefile.in');
  const make=await fs.readFile(makefile,'utf8');
  if(!make.includes('SOURCES = \\\n'))throw new Error('Wine kaynak listesi taninamadi.');
  await fs.writeFile(makefile,make.replace('SOURCES = \\\n','SOURCES = \\\n\tdxmt_compat.c \\\n'));
  console.log('WINE_DRIVER_SOURCE=wine-11.18 / 7b3fff76fa5178f6ce0141b2c776afa2a822f101; three Metal exports and two old-layout compatibility exports');
}else if(process.argv[2]==='verify'){
  const candidates=['dlls/winemac.drv/winemac.so','dlls/winemac.drv/x86_64-unix/winemac.so'].map(file=>path.join(local,'wine-build',file));
  let compiled;for(const file of candidates)if(await fs.stat(file).catch(()=>null)){compiled=file;break;}
  if(!compiled)throw new Error('Derlenmis Mac surucusu bulunamadi.');
  if(!supportsDXMT(await fs.readFile(compiled)))throw new Error('Yeni surucu DXMT disari aktarimlarini sunmuyor.');
  await fs.copyFile(compiled,path.join(runtime,'lib/wine/x86_64-unix/winemac.so'));
  const prefix=path.join(local,'driver-prefix');await fs.mkdir(prefix,{recursive:true});
  const env={...process.env,DYLD_LIBRARY_PATH:path.join(runtime,'lib'),WINEPREFIX:prefix,WINEARCH:'win64',WINEDEBUG:'-all'};
  try{
    const windows=await runProcess(path.join(runtime,'bin/wine'),['cmd.exe','/c','ver'],{env,timeout:120000});
    if(!windows.includes('Microsoft Windows'))throw new Error('Windows komutu beklenen cevabi vermedi.');
    console.log('WINE_DRIVER_REPORT='+JSON.stringify({source:'7b3fff76fa5178f6ce0141b2c776afa2a822f101',wineArchiveSha256:releases.libraries.sha256,driverSha256:await hashFile(compiled),dxmtExportsVerified:true,windows,gameVerified:false,graphicsVerified:false,coOpVerified:false}));
  }finally{await runProcess(path.join(runtime,'bin/wineserver'),['-k'],{env,timeout:15000}).catch(()=>{});}
}else throw new Error('prepare veya verify gerekiyor.');
