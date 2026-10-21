import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {applyVerifiedDriver} from '../src/driver.mjs';
import {hashFile} from '../src/storage.mjs';
async function fixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'coop-driver-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const wine=path.join(root,'wine');const driver=path.join(root,'driver');
  for(const name of ['bin','lib/wine/x86_64-unix','lib/wine/x86_64-windows'])await fs.mkdir(path.join(wine,name),{recursive:true});
  for(const name of ['wine','wineserver'])await fs.writeFile(path.join(wine,'bin',name),'fixture');
  const destination=path.join(wine,'lib/wine/x86_64-unix/winemac.so');await fs.writeFile(destination,'original');
  await fs.mkdir(driver);
  const edge=Buffer.from('_macdrv_functions\0');
  const trie=Buffer.concat([Buffer.from([0,1]),edge,Buffer.from([2+edge.length+1]),Buffer.from([1,0,0])]);
  const bytes=Buffer.alloc(48+trie.length);bytes.writeUInt32LE(0xfeedfacf,0);bytes.writeUInt32LE(1,16);bytes.writeUInt32LE(0x80000033,32);bytes.writeUInt32LE(16,36);bytes.writeUInt32LE(48,40);bytes.writeUInt32LE(trie.length,44);trie.copy(bytes,48);
  const binary=path.join(driver,'winemac.so');await fs.writeFile(binary,bytes);
  const asset={version:'fixture',sourceCommit:'a'.repeat(40),binarySha256:await hashFile(binary)};const wineAsset={sha256:'b'.repeat(64)};
  const manifest={version:asset.version,sourceCommit:asset.sourceCommit,wineArchiveSha256:wineAsset.sha256,driverSha256:asset.binarySha256,windowsCommandVerified:true,basicD3D11FrameVerified:true};
  await fs.writeFile(path.join(driver,'manifest.json'),JSON.stringify(manifest));
  await fs.writeFile(path.join(driver,'COPYING.LIB'),'fixture license');await fs.writeFile(path.join(driver,'SOURCE.md'),'fixture sources');
  return {wine,driver,asset,wineAsset,destination,binary,manifest};
}
test('driver for another Wine archive cannot overwrite original',async t=>{
  const f=await fixture(t);await assert.rejects(()=>applyVerifiedDriver(f.wine,f.driver,f.asset,{sha256:'wrong'}),/eslesmiyor/);
  assert.equal(await fs.readFile(f.destination,'utf8'),'original');
});
test('tampered driver cannot overwrite original even with matching manifest',async t=>{
  const f=await fixture(t);await fs.writeFile(f.binary,'changed');await assert.rejects(()=>applyVerifiedDriver(f.wine,f.driver,f.asset,f.wineAsset),/dogrulanamadi/);
  assert.equal(await fs.readFile(f.destination,'utf8'),'original');
});
test('verified driver is copied with corresponding source and license notices',async t=>{
  const f=await fixture(t);await applyVerifiedDriver(f.wine,f.driver,f.asset,f.wineAsset);
  assert.equal(await hashFile(f.destination),f.asset.binarySha256);
  assert.equal(await fs.readFile(path.join(f.wine,'coop-driver/COPYING.LIB'),'utf8'),'fixture license');
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(f.wine,'coop-driver/manifest.json'),'utf8')),f.manifest);
});
