import fs from 'node:fs/promises';
import path from 'node:path';
import {runProcess} from '../src/engine.mjs';
import {releases} from '../src/releases.mjs';
import {downloadVerified} from '../src/installer.mjs';
import {supportsDXMT} from '../src/macho.mjs';

// Only on the disposable cloud Mac, after verified official archives are cached.
export async function probeWine(engine,local){
  const runtime=await engine.engineFor();
  // Compare the official WS11 packaging of the same Wine version. WS12 raw,
  // wow64 and fallback-library variants already failed in run 39665320266.
  const candidate={...releases.wine,file:'WS11WineSikarugir11.0_1.tar.xz',url:'https://github.com/Sikarugir-App/Engines/releases/download/v1.0/WS11WineSikarugir11.0_1.tar.xz',sha256:'266e852bdb98e80da09f09d4ee10fd9fd3dbb6b18b0801c0836f1430c4979fb6',size:167218856};
  const archive=await downloadVerified(candidate,path.join(engine.dataDir,'downloads'),message=>process.stdout.write(message));
  const unpack=path.join(local,'raw-sikarugir');await fs.mkdir(unpack,{recursive:true});
  await runProcess('/usr/bin/tar',['-xf',archive,'-C',unpack],{timeout:180000});
  const raw=path.join(unpack,releases.wine.folder);
  console.log('CANDIDATE_DXMT_EXPORTS='+supportsDXMT(await fs.readFile(path.join(raw,'lib/wine/x86_64-unix/winemac.so'))));
  for(const name of await fs.readdir(path.join(runtime.root,'lib'))){
    if(name.endsWith('.dylib'))await fs.cp(path.join(runtime.root,'lib',name),path.join(raw,'lib',name),{verbatimSymlinks:true});
  }
  const variants=[
    {name:'ws11-no-dxmt',arch:'win64'},
  ];
  const results=[];
  for(const variant of variants){
    const prefix=path.join(local,'probe-'+variant.name);await fs.mkdir(prefix,{recursive:true});
    const env={...process.env,WINEPREFIX:prefix,WINEARCH:variant.arch,WINEDEBUG:'err+all,warn+all'};
    const libraries=path.join(raw,'lib')+':'+path.join(raw,'lib/wine/x86_64-unix');
    delete env.DYLD_LIBRARY_PATH;delete env.DYLD_FALLBACK_LIBRARY_PATH;
    env[variant.fallback?'DYLD_FALLBACK_LIBRARY_PATH':'DYLD_LIBRARY_PATH']=libraries;
    let tail='';
    try{
      const output=await runProcess(path.join(raw,'bin/wine'),['cmd.exe','/c','ver'],{env,timeout:90000,maxOutput:6000,log:message=>{tail=(tail+message).slice(-6000);}});
      results.push({name:variant.name,passed:true,output});
    }catch(error){results.push({name:variant.name,passed:false,error:error.message,tail});}
    finally{await runProcess(path.join(raw,'bin/wineserver'),['-k'],{env,timeout:15000}).catch(()=>{});}
    console.log('WINE_PROBE='+JSON.stringify(results.at(-1)));
    if(results.at(-1).passed)break;
  }
  return results;
}
