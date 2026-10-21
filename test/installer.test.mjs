import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { downloadVerified, officialFetch, validateArchiveListing } from '../src/installer.mjs';
import { findDXMT } from '../src/engine.mjs';

test('download validates exact size and pinned digest before publishing, reuses cache', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'coop-download-')); t.after(() => fs.rm(root, {recursive:true, force:true}));
  const bytes = Buffer.from('official test content');
  const asset = {file:'test.tar.gz', url:'https://github.com/test/archive', size:bytes.length, sha256:createHash('sha256').update(bytes).digest('hex')};
  let calls = 0;
  const fetcher = async () => { calls++; return new Response(bytes); };
  const target = await downloadVerified(asset, root, () => {}, fetcher);
  assert.deepEqual(await fs.readFile(target), bytes);
  await downloadVerified(asset, root, () => {}, fetcher); assert.equal(calls, 1);
  await fs.writeFile(target, 'corrupt');
  await assert.rejects(() => downloadVerified(asset, root, () => {}, fetcher), /özet/);
  assert.equal(await fs.readFile(target,'utf8'), 'corrupt');
});
test('wrong digest and oversized downloads cannot become executable packages', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'coop-baddownload-')); t.after(() => fs.rm(root, {recursive:true, force:true}));
  const asset = {file:'test.tar.gz', url:'https://github.com/test/archive', size:3, sha256:'0'.repeat(64)};
  await assert.rejects(() => downloadVerified(asset, root, () => {}, async () => new Response('abc')), /doğrulanamadı/);
  await assert.rejects(() => downloadVerified(asset, root, () => {}, async () => new Response('abcdef')), /büyük/);
  assert.deepEqual(await fs.readdir(root), []);
});
test('redirect policy allows GitHub release storage, blocks foreign and downgraded addresses', async () => {
  const result = await officialFetch('https://github.com/test', {fetcher:async url => url.includes('github.com/') ? new Response(null,{status:302,headers:{location:'https://release-assets.githubusercontent.com/test'}}) : new Response('ok')});
  assert.equal(await result.text(),'ok');
  for (const destination of ['https://evil.example/payload','http://github.com/test']) await assert.rejects(() => officialFetch('https://github.com/test', {fetcher:async () => new Response(null,{status:302,headers:{location:destination}})}), /dışına/);
});
test('archive listing rejects traversal, unexpected roots and absolute paths', () => {
  validateArchiveListing('Wine Devel.app/\nWine Devel.app/Contents/file','Wine Devel.app');
  for (const listing of ['../other','/etc/passwd','Wine Devel.app/../../other','Another/file','Wine Devel.app/..\\file','']) assert.throws(() => validateArchiveListing(listing,'Wine Devel.app'));
});
test('DXMT detects builtin and skips actual i386-windows directory', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'coop-dxmt-')); t.after(() => fs.rm(root, {recursive:true, force:true}));
  const x64 = path.join(root,'x86_64-windows'); const x32 = path.join(root,'i386-windows');
  await fs.mkdir(x64); await fs.mkdir(x32); await fs.mkdir(path.join(root,'x86_64-unix'));
  const pe = Buffer.alloc(256); pe.write('MZ'); pe.writeUInt32LE(128,0x3c); pe.write('PE\0\0',128); pe.writeUInt16LE(0x8664,132); pe.write('Wine builtin DLL',64);
  for (const name of ['winemetal.dll','d3d11.dll','dxgi.dll']) {await fs.writeFile(path.join(x64,name),pe); await fs.writeFile(path.join(x32,name),'32-bit');}
  await fs.writeFile(path.join(root,'x86_64-unix/winemetal.so'),'test');
  const found = await findDXMT(root); assert.equal(found.mode,'builtin'); assert.ok(found.files['d3d11.dll'].includes('x86_64-windows'));
  pe.writeUInt16LE(0x14c,132); await fs.writeFile(path.join(x64,'d3d11.dll'),pe);
  await assert.rejects(() => findDXMT(root),/64 bit/);
});
