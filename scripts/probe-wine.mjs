import fs from 'node:fs/promises';
import path from 'node:path';
import {runProcess} from '../src/engine.mjs';
import {releases} from '../src/releases.mjs';

// Only on the disposable cloud Mac, after verified official archives are cached.
export async function probeWine(engine,local){
  const runtime=await engine.engineFor();
  const unpack=path.join(local,'raw-sikarugir');await fs.mkdir(unpack,{recursive:true});
  await runProcess('/usr/bin/tar',['-xf',path.join(engine.dataDir,'downloads',releases.wine.file),'-C',unpack],{timeout:180000});
  const raw=path.join(unpack,releases.wine.folder);
  for(const name of await fs.readdir(path.join(runtime.root,'lib'))){
    if(name.endsWith('.dylib'))await fs.cp(path.join(runtime.root,'lib',name),path.join(raw,'lib',name),{verbatimSymlinks:true});
  }
  const variants=[
    {name:'raw-no-dxmt',arch:'win64'},
    {name:'raw-wow64',arch:'wow64'},
    {name:'raw-fallback-libraries',arch:'win64',fallback:true},
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
