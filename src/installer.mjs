import fs from 'node:fs/promises';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { Transform, Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import { releases } from './releases.mjs';
import { exists, hashFile, inside } from './storage.mjs';
import {applyVerifiedDriver} from './driver.mjs';

const hosts = new Set(['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com', 'nodejs.org']);
export async function officialFetch(url, { fetcher = fetch, signal } = {}) {
  for (let i = 0; i < 6; i++) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !hosts.has(parsed.hostname) || parsed.username || parsed.password || (parsed.port && parsed.port !== '443')) throw new Error('Resmî indirme adresi dışına çıkılamaz.');
    const response = await fetcher(url, { redirect: 'manual', signal });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location) throw new Error('İndirme yönlendirmesi eksik.');
      url = new URL(location, url).href;
    } else {
      if (!response.ok || !response.body) throw new Error('Dosya indirilemedi: HTTP ' + response.status);
      return response;
    }
  }
  throw new Error('Çok fazla indirme yönlendirmesi.');
}
export async function downloadVerified(asset, cache, log = () => {}, fetcher = fetch) {
  await fs.mkdir(cache, { recursive: true });
  const destination = inside(cache, asset.file);
  if (await exists(destination)) {
    if (await hashFile(destination) === asset.sha256) { log(asset.file + ' daha önce doğrulanmış; yeniden indirilmiyor.\n'); return destination; }
    throw new Error('Önbellekteki dosya özeti uyuşmuyor. Dosya korunuyor: ' + asset.file);
  }
  const temp = destination + '.' + randomUUID() + '.part';
  try {
    const response = await officialFetch(asset.url, { fetcher, signal: AbortSignal.timeout(600000) });
    let total = 0; let lastReported = 0;
    const counter = new Transform({ transform(chunk, encoding, done) {
      total += chunk.length;
      if (total > asset.size) return done(new Error('İndirilen dosya beklenenden büyük.'));
      if (total - lastReported > 16 * 1024 * 1024) { lastReported = total; log(asset.file + ': %' + Math.floor(total / asset.size * 100) + '\n'); }
      done(null, chunk);
    } });
    await pipeline(Readable.fromWeb(response.body), counter, createWriteStream(temp, { flags: 'wx', mode: 0o600 }));
    if (total !== asset.size || await hashFile(temp) !== asset.sha256) throw new Error('İndirme doğrulanamadı. Dosya kullanılmadı: ' + asset.file);
    await fs.rename(temp, destination);
    log(asset.file + ' — SHA256 doğrulandı.\n');
    return destination;
  } finally { await fs.rm(temp, { force: true }); }
}
export function validateArchiveListing(listing, expectedFolder) {
  const entries = listing.split(/\r?\n/).filter(Boolean);
  if (!entries.length) throw new Error('Arşiv boş.');
  for (const item of entries) {
    if (item.includes('\\') || /[\x00-\x1f]/.test(item) || item.startsWith('/') || /^[a-z]:/i.test(item) || item.split('/').includes('..') || !(item === expectedFolder || item.startsWith(expectedFolder + '/'))) throw new Error('Arşiv içindeki klasör yolu kabul edilmedi.');
  }
}
export async function installOfficialEngine(engine, log, { fetcher = fetch } = {}) {
  engine.requireMac();
  const disk = await fs.statfs(engine.dataDir);
  if (disk.bavail * disk.bsize < 4 * 1024 ** 3) throw new Error('Motor hazırlığı için en az 4 GB boş alan gerekiyor. Oyunlar için ayrıca alan gerekir.');
  const cache = inside(engine.dataDir, 'downloads');
  const work = inside(engine.dataDir, 'setup-' + randomUUID());
  await fs.mkdir(work, { recursive: true });
  try {
    const folders = {};
    for (const name of ['wine','dxmt','driver']) {
      const asset = releases[name]; log(asset.file + ' indiriliyor.\n');
      const archive = await downloadVerified(asset, cache, log, fetcher);
      const list = await engine.runner('/usr/bin/tar', ['-tf', archive], { timeout:120000, maxOutput:4000000, requireFullOutput:true });
      validateArchiveListing(list, asset.folder);
      const unpack = inside(work, name); await fs.mkdir(unpack);
      log(asset.file + ' açılıyor.\n');
      await engine.runner('/usr/bin/tar',['-xf',archive,'-C',unpack],{timeout:300000,log});
      folders[name]=inside(unpack,asset.folder);
    }
    await applyVerifiedDriver(folders.wine,folders.driver,releases.driver,releases.wine);
    return await engine.importEngine({winePath:folders.wine,dxmtPath:folders.dxmt,provenance:{wine:releases.wine.sha256,dxmt:releases.dxmt.sha256,driver:releases.driver.sha256,driverSource:releases.driver.sourceCommit}},log);
  } finally { await fs.rm(work, { recursive:true, force:true }); }
}
