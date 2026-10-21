import fs from 'node:fs/promises';
import path from 'node:path';
import {findRuntime} from './engine.mjs';
import {hashFile,readJSON} from './storage.mjs';
import {supportsDXMT} from './macho.mjs';

export async function applyVerifiedDriver(winePath,driverPath,asset,wineAsset){
  const runtime=await findRuntime(winePath);
  const manifest=await readJSON(path.join(driverPath,'manifest.json'),null);
  if(!manifest||manifest.version!==asset.version||manifest.sourceCommit!==asset.sourceCommit||manifest.wineArchiveSha256!==wineAsset.sha256||manifest.driverSha256!==asset.binarySha256||manifest.windowsCommandVerified!==true||manifest.basicD3D11FrameVerified!==true)throw new Error('Surucu kaydi beklenen Wine ve dogrulama bilgileriyle eslesmiyor.');
  const binary=path.join(driverPath,'winemac.so');
  if(await hashFile(binary)!==asset.binarySha256||!supportsDXMT(await fs.readFile(binary)))throw new Error('Surucu dosyasi dogrulanamadi.');
  const canonical=await fs.realpath(runtime.root);
  const destination=path.join(runtime.root,'lib/wine/x86_64-unix/winemac.so');
  const parent=await fs.realpath(path.dirname(destination));
  const relative=path.relative(canonical,parent);
  if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error('Surucu hedefi Wine klasoru disinda.');
  const license=await fs.readFile(path.join(driverPath,'COPYING.LIB'));
  const sourceNotice=await fs.readFile(path.join(driverPath,'SOURCE.md'));
  const notices=path.join(runtime.root,'coop-driver');await fs.mkdir(notices);
  await fs.writeFile(path.join(notices,'COPYING.LIB'),license,{flag:'wx'});
  await fs.writeFile(path.join(notices,'SOURCE.md'),sourceNotice,{flag:'wx'});
  await fs.writeFile(path.join(notices,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});
  await fs.rm(destination,{force:true});
  await fs.copyFile(binary,destination);
  if(await hashFile(destination)!==asset.binarySha256)throw new Error('Kopyalanan surucu ozeti eslesmiyor.');
  return manifest;
}
