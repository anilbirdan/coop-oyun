import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { createWriteStream, openSync, closeSync } from 'node:fs';
import { Readable } from 'node:stream';
import { games, gameById } from './catalog.mjs';
import { exists, hashFile, inside, readJSON, writeJSON } from './storage.mjs';
import { supportsDXMT } from './macho.mjs';

export function runProcess(binary, args, { env = process.env, log, timeout = 120000, background = false, outputFile, maxOutput = 32000, requireFullOutput = false } = {}) {
  return new Promise((resolve, reject) => {
    if (background) {
      const descriptor = outputFile ? openSync(outputFile,'a',0o600) : null;
      const child = spawn(binary, args, { env, shell:false, windowsHide:true, detached:true, stdio:descriptor === null ? 'ignore' : ['ignore',descriptor,descriptor] });
      const release = () => { if (descriptor !== null) closeSync(descriptor); };
      child.once('error', error => { release(); reject(new Error('Program başlatılamadı: ' + error.message)); });
      child.once('spawn', () => { release(); child.unref(); resolve(''); });
      return;
    }
    let output = '';
    const child = spawn(binary, args, { env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true; child.kill('SIGTERM');
      child.stdout.destroy(); child.stderr.destroy();
      reject(new Error('İşlem süresi doldu. Hata kaydını kontrol edin.'));
    }, timeout);
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
      output = output + chunk.toString();
      if (output.length > maxOutput && requireFullOutput) {
        child.kill('SIGTERM'); clearTimeout(timer);
        reject(new Error('Komut çıktısı sınırı aştı; eksik çıktı kullanılmadı.'));
      }
      output = output.slice(-maxOutput);
      log?.(chunk.toString());
    });
    child.once('error', error => { clearTimeout(timer); reject(new Error('Program başlatılamadı: ' + error.message)); });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      if (timedOut) reject(new Error('İşlem süresi doldu. Hata kaydını kontrol edin.'));
      else if (code !== 0) reject(new Error(`Program hata verdi (${code ?? signal}). ${output.slice(-1200)}`));
      else resolve(output.trim());
    });
  });
}

const runtimeCandidates = ['', 'Contents/Resources/wine', 'Contents/SharedSupport/wine'];
export async function findRuntime(root) {
  for (const relative of runtimeCandidates) {
    const base = path.join(root, relative);
    for (const name of ['wine', 'wine64']) {
      const binary = path.join(base, 'bin', name);
      if (await exists(binary) && await exists(path.join(base, 'lib/wine/x86_64-unix')) && await exists(path.join(base, 'lib/wine/x86_64-windows'))) {
        if (!await exists(path.join(base, 'bin/wineserver'))) continue;
        return { root: base, binary, server: path.join(base, 'bin/wineserver') };
      }
    }
  }
  throw new Error('Wine klasörü tanınmadı. Wine uygulamasını veya bin ve lib klasörlerinin bulunduğu ana klasörü seçin.');
}

export async function findDXMT(root) {
  const wanted = ['winemetal.so', 'winemetal.dll', 'd3d11.dll', 'dxgi.dll'];
  const found = {};
  async function visit(dir, depth) {
    if (depth > 5) return;
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const file = path.join(dir, entry.name);
      // Only x64 DXMT: never mix the x32 and x64 DLLs.
      if (entry.isDirectory() && !/^(x32|x86|i386|arm64|i386-windows|aarch64-windows)$/i.test(entry.name)) await visit(file, depth + 1);
      else if (entry.isFile() && wanted.includes(entry.name)) {
        if (found[entry.name]) throw new Error('Birden fazla DXMT dosyası var. Yalnızca 64 bit paketin klasörünü seçin.');
        found[entry.name] = file;
      }
    }
  }
  await visit(root, 0);
  if (!wanted.every(name => found[name])) throw new Error('DXMT dosyaları eksik. Açılmış 64 bit pakette winemetal.so, winemetal.dll, d3d11.dll ve dxgi.dll bulunmalı.');
  const pe = await fs.readFile(found['d3d11.dll']);
  if (pe.length < 64 || pe.toString('ascii', 0, 2) !== 'MZ') throw new Error('DXMT d3d11.dll geçerli bir Windows dosyası değil.');
  const offset = pe.readUInt32LE(0x3c);
  if (offset + 6 > pe.length || pe.toString('ascii', offset, offset + 4) !== 'PE\0\0' || pe.readUInt16LE(offset + 4) !== 0x8664) throw new Error('DXMT 64 bit x86 paketi gerekiyor.');
  return { files:found, mode:pe.includes(Buffer.from('Wine builtin DLL')) ? 'builtin' : 'native' };
}

export class Engine {
  constructor({ dataDir, platform = process.platform, runner = runProcess, downloader = downloadSteam } = {}) {
    this.dataDir = path.resolve(dataDir);
    this.platform = platform;
    this.runner = runner;
    this.downloader = downloader;
  }
  requireMac() {
    if (this.platform !== 'darwin') throw new Error('Bu bilgisayar Mac değil. Burada yalnızca arayüz ve kayıtlar kullanılabilir.');
  }
  async initialize() {
    await fs.mkdir(this.dataDir, { recursive: true });
    // A second app instance must not mutate the same Wine prefixes.
    this.lockPath = inside(this.dataDir, 'instance.lock');
    try {
      this.lock = await fs.open(this.lockPath, 'wx', 0o600);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const old = await readJSON(this.lockPath, {});
      if (!Number.isSafeInteger(old.pid) || old.pid < 1) throw new Error('Uygulama kilidi okunamıyor; veri klasörünü kontrol edin.');
      try { process.kill(old.pid, 0); throw new Error('Uygulama zaten açık. Açık pencereyi kullanın.'); }
      catch (check) { if (check.code !== 'ESRCH') throw check; }
      await fs.rm(this.lockPath);
      this.lock = await fs.open(this.lockPath, 'wx', 0o600);
    }
    await this.lock.writeFile(JSON.stringify({ pid: process.pid }));
  }
  async close() {
    if (this.lock) { await this.lock.close(); this.lock = null; await fs.rm(this.lockPath, { force: true }); }
  }
  prefix(id) { gameById(id); return inside(this.dataDir, 'games', id); }
  async status() {
    const config = await readJSON(inside(this.dataDir, 'settings.json'), {});
    const engine = config.engineId ? await readJSON(inside(this.dataDir, 'engines', config.engineId, 'engine.json'), null) : null;
    const library = await Promise.all(games.map(async game => {
      const prefix = this.prefix(game.id);
      const binding = await readJSON(path.join(prefix, 'coop.json'), null);
      const lastRun = await readJSON(path.join(prefix,'last-run.json'),null);
      let runtimeLog = '';
      if (lastRun && /^[a-f0-9-]{36}\.log$/.test(lastRun.log)) {
        const file = await fs.open(inside(this.dataDir,'logs',lastRun.log),'r').catch(()=>null);
        if (file) {
          try {const size=(await file.stat()).size; const bytes=Buffer.alloc(Math.min(size,12000)); await file.read(bytes,0,bytes.length,Math.max(0,size-bytes.length)); runtimeLog=bytes.toString('utf8');}
          finally {await file.close();}
        }
      }
      return { ...game, prepared:!!binding, steamInstalled:!!await this.steamPath(game.id), runtimeLog, tests:await readJSON(path.join(prefix,'tests.json'),[]) };
    }));
    return { version: '0.2.0', platform: this.platform, arch: os.arch(), mac: this.platform === 'darwin', dataDir: this.dataDir, engine, games: library };
  }
  async importEngine({ winePath, dxmtPath, provenance = null }, log = () => {}) {
    this.requireMac();
    if (typeof winePath !== 'string' || typeof dxmtPath !== 'string' || !path.isAbsolute(winePath) || !path.isAbsolute(dxmtPath)) throw new Error('Wine ve DXMT için tam klasör yolu seçin.');
    const source = await fs.realpath(winePath);
    const relative = path.relative(source, this.dataDir);
    const reverse = path.relative(this.dataDir, source);
    const managedSetup = provenance && /^setup-[a-f0-9-]{36}$/.test(reverse.split(path.sep)[0]) && !reverse.startsWith('..');
    if (!managedSetup && ((!relative.startsWith('..') && !path.isAbsolute(relative)) || (!reverse.startsWith('..') && !path.isAbsolute(reverse)))) throw new Error('Motor kaynağı uygulamanın veri klasörüyle iç içe olamaz.');
    const originalRuntime = await findRuntime(source);
    if (!supportsDXMT(await fs.readFile(path.join(originalRuntime.root, 'lib/wine/x86_64-unix/winemac.so')))) throw new Error('Bu Wine paketi DXMT grafik bağlantısını sunmuyor. Otomatik kurulumdaki motoru kullanın.');
    const dxmt = await findDXMT(dxmtPath);
    const id = randomUUID();
    const dir = inside(this.dataDir, 'engines', id);
    await fs.mkdir(dir, { recursive: true });
    try {
      log('Wine kişisel kopyası hazırlanıyor. Orijinal kurulum korunuyor.\n');
      const copy = path.join(dir, 'runtime');
      await fs.cp(source, copy, { recursive: true, verbatimSymlinks: true, force: false, errorOnExist: true });
      const runtime = await findRuntime(copy);
      for (const dirName of ['bin', 'lib/wine/x86_64-unix', 'lib/wine/x86_64-windows']) {
        const real = await fs.realpath(path.join(runtime.root, dirName));
        const rel = path.relative(copy, real);
        if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Wine paketi dış klasöre bağlı. Kendi içinde tam paket gerekiyor.');
      }
      const version = await this.runner(runtime.binary, ['--version'], { timeout: 15000, log });
      if (!/^wine-11\.0(?:\b|$)/.test(version)) throw new Error('Bu sürüm grafik bağlantısı bulunan Wine 11.0 motorunu bekliyor. Bulunan: ' + version);
      const hashes = {};
      for (const [name, from] of Object.entries(dxmt.files)) {
        const destination = name.endsWith('.so') ? path.join(runtime.root, 'lib/wine/x86_64-unix', name) : path.join(runtime.root, 'lib/wine/x86_64-windows', name);
        // Unlink first: copied package symlinks must never redirect writes to the source.
        await fs.rm(destination, { force: true });
        await fs.copyFile(from, destination);
        hashes[name] = await hashFile(destination);
      }
      const record = { id, version, graphics:'DXMT', graphicsMode:dxmt.mode, expectedDXMT:'0.80', dxmtVersionVerified:!!provenance, provenance, gameVerified:false, createdAt:new Date().toISOString(), binary:path.relative(dir, runtime.binary), root:path.relative(dir, runtime.root), hashes, wineHash:await hashFile(runtime.binary) };
      await writeJSON(path.join(dir, 'engine.json'), record);
      await writeJSON(inside(this.dataDir, 'settings.json'), { engineId: id });
      log('Motor kopyası kaydedildi. Grafik ve oyun başarısı henüz doğrulanmadı.\n');
      return record;
    } catch (error) { await fs.rm(dir, { recursive: true, force: true }); throw error; }
  }
  async engineFor(id) {
    const binding = id ? await readJSON(path.join(this.prefix(id), 'coop.json'), null) : null;
    const config = await readJSON(inside(this.dataDir, 'settings.json'), {});
    const engineId = binding?.engineId || config.engineId;
    if (!engineId || !/^[a-f0-9-]{36}$/.test(engineId)) throw new Error('Önce Ayarlar bölümünden motoru hazırlayın.');
    const dir = inside(this.dataDir, 'engines', engineId);
    const record = await readJSON(path.join(dir, 'engine.json'), null);
    if (!record) throw new Error('Motor kaydı bulunamadı.');
    return { record, binary: inside(dir, record.binary), root: inside(dir, record.root) };
  }
  environment(id, engine) {
    return { ...process.env, WINEPREFIX:this.prefix(id), WINEDEBUG:'-all', WINEDLLOVERRIDES:engine?.record.graphicsMode === 'builtin' ? 'dxgi,d3d11=b' : 'dxgi,d3d11=n,b', WINEARCH:'win64' };
  }
  async prepare(id, log) {
    this.requireMac(); gameById(id);
    const prefix = this.prefix(id);
    if (await exists(path.join(prefix, 'coop.json'))) return;
    // Pin an interrupted initial setup to the same engine on retry.
    const pending = await readJSON(path.join(prefix, 'pending.json'), null);
    const engine = pending ? await this.engineForPending(pending.engineId) : await this.engineFor();
    await fs.mkdir(prefix, { recursive: true });
    await writeJSON(path.join(prefix, 'pending.json'), { engineId: engine.record.id });
    log('Oyuna özel Windows ortamı hazırlanıyor.\n');
    await this.runner(engine.binary, ['wineboot', '-i'], { env:this.environment(id, engine), log });
    const system = path.join(prefix, 'drive_c/windows/system32');
    if (!await exists(system)) throw new Error('Wine ortamı tamamlanmadı; yeniden deneyebilirsiniz.');
    const prefixFiles = engine.record.graphicsMode === 'builtin' ? ['winemetal.dll'] : ['winemetal.dll', 'd3d11.dll', 'dxgi.dll'];
    for (const name of prefixFiles) {
      await fs.rm(path.join(system, name), { force: true });
      await fs.copyFile(path.join(engine.root, 'lib/wine/x86_64-windows', name), path.join(system, name));
    }
    await writeJSON(path.join(prefix, 'coop.json'), { engineId: engine.record.id, createdAt: new Date().toISOString() });
    await fs.rm(path.join(prefix, 'pending.json'), { force: true });
    log('Ortam hazırlandı. Steam kurulumu ve oyun testi henüz yapılmadı.\n');
  }
  async engineForPending(engineId) {
    if (typeof engineId !== 'string' || !/^[a-f0-9-]{36}$/.test(engineId)) throw new Error('Yarım kalan motor kaydı geçersiz.');
    const dir = inside(this.dataDir, 'engines', engineId);
    const record = await readJSON(path.join(dir, 'engine.json'), null);
    if (!record) throw new Error('Yarım kalan kurulumun motoru bulunamadı. Kayıtlar korunuyor.');
    return { record, binary: inside(dir, record.binary), root: inside(dir, record.root) };
  }
  async steamPath(id) {
    const prefix = this.prefix(id);
    for (const relative of ['drive_c/Program Files (x86)/Steam/steam.exe', 'drive_c/Program Files/Steam/steam.exe']) {
      if (await exists(path.join(prefix, relative))) return path.join(prefix, relative);
    }
    return null;
  }
  async installSteam(id, log) {
    this.requireMac();
    await this.prepare(id, log);
    if (await this.steamPath(id)) { log('Steam zaten kurulu.\n'); return; }
    const downloads = inside(this.dataDir, 'downloads');
    await fs.mkdir(downloads, { recursive: true });
    const installer = path.join(downloads, 'SteamSetup.exe');
    log('Steam, Valve adresinden indiriliyor.\n');
    await this.downloader(installer);
    log('İndirilen Steam dosyasının SHA256 özeti: ' + await hashFile(installer) + '\n');
    const engine = await this.engineFor(id);
    await this.runner(engine.binary, [installer, '/S'], { env:this.environment(id, engine), log, timeout:300000 });
    if (!await this.steamPath(id)) throw new Error('Steam kurulumu doğrulanamadı. Kayıtları kontrol edin.');
    log('Steam dosyaları bulundu. Çevrim içi giriş henüz doğrulanmadı.\n');
  }
  async launch(id, action, log) {
    this.requireMac(); const game = gameById(id);
    if (!['steam', 'install', 'play'].includes(action)) throw new Error('Geçersiz başlatma işlemi.');
    if (!await exists(path.join(this.prefix(id), 'coop.json'))) throw new Error('Önce oyun ortamını hazırlayın.');
    const steam = await this.steamPath(id);
    if (!steam) throw new Error('Önce bu oyun için Steam’i kurun.');
    const engine = await this.engineFor(id);
    const args = [steam];
    if (action === 'install') args.push(`steam://install/${game.appId}`);
    if (action === 'play') args.push('-applaunch', game.appId);
    const logName = randomUUID() + '.log';
    await fs.mkdir(inside(this.dataDir,'logs'),{recursive:true});
    await this.runner(engine.binary,args,{env:this.environment(id,engine),background:true,outputFile:inside(this.dataDir,'logs',logName)});
    await writeJSON(path.join(this.prefix(id),'last-run.json'),{at:new Date().toISOString(),log:logName,action});
    log('Steam’e başlatma isteği gönderildi. Oyunun açıldığını ve arkadaş bağlantısını oyun ekranından kontrol edin.\n');
  }
  async stop(id, log) {
    this.requireMac();
    if (!await exists(path.join(this.prefix(id), 'coop.json'))) throw new Error('Bu oyun için ortam henüz hazırlanmadı.');
    const engine = await this.engineFor(id);
    // WINEPREFIX scopes wineserver -k to this game, never all Wine installations.
    await this.runner(path.join(engine.root, 'bin/wineserver'), ['-k'], { env:this.environment(id, engine), log, timeout:15000 });
    log('Bu oyunun Steam ve oyun ortamına kapatma isteği gönderildi. Kaydedilmemiş ilerleme kaybolabilir.\n');
  }
  async diagnose(log) {
    this.requireMac();
    const engine = await this.engineFor();
    const macOS = await this.runner('/usr/bin/sw_vers',['-productVersion'],{timeout:15000});
    const chip = await this.runner('/usr/sbin/sysctl',['-n','machdep.cpu.brand_string'],{timeout:15000});
    log('Mac: ' + chip + ' · macOS ' + macOS + '\n');
    try { await this.runner('/usr/bin/arch',['-x86_64','/usr/bin/true'],{timeout:15000}); }
    catch { throw new Error('Intel uyumluluğu (Rosetta) başlatılamadı. Apple’ın Rosetta kurulumunu tamamladıktan sonra yeniden deneyin.'); }
    const prefix = inside(this.dataDir,'diagnostics',engine.record.id);
    const env = {...process.env, WINEPREFIX:prefix, WINEARCH:'win64', WINEDEBUG:'-all'};
    log('Ayrı denetim ortamında Windows komutu deneniyor.\n');
    await this.runner(engine.binary,['wineboot','-i'],{env,log,timeout:120000});
    const windows = await this.runner(engine.binary,['cmd','/c','ver'],{env,log,timeout:30000});
    await this.runner(path.join(engine.root,'bin/wineserver'),['-k'],{env,timeout:15000});
    const result = {at:new Date().toISOString(),engineId:engine.record.id,macOS,chip,memoryGB:Math.round(os.totalmem()/1024**3),windows,wineCommandPassed:true,graphicsVerified:false,coOpVerified:false};
    await writeJSON(inside(this.dataDir,'diagnostics.json'),result);
    log('Windows komutu tamamlandı. Grafik, Steam girişi ve arkadaş bağlantısı bu denetimle doğrulanmaz.\n');
    return result;
  }
  async saveTest(id, input) {
    const allowed = ['unknown', 'passed', 'failed'];
    if (!input || !['launch', 'join', 'host', 'save'].every(key => allowed.includes(input[key]))) throw new Error('Her test için bir sonuç seçin.');
    const fields = ['hardware', 'macOS', 'gameBuild', 'notes'];
    for (const key of fields) if (typeof input[key] !== 'string' || input[key].length > 2000) throw new Error('Test bilgileri geçersiz.');
    if (Object.values(input).includes('passed') && (!input.hardware.trim() || !input.macOS.trim() || !input.gameBuild.trim())) throw new Error('Başarılı test için gerçek Mac, macOS ve oyun sürümünü yazın.');
    const prefix = this.prefix(id);
    const tests = await readJSON(path.join(prefix, 'tests.json'), []);
    const binding = await readJSON(path.join(prefix, 'coop.json'), null);
    tests.push({ id: randomUUID(), at: new Date().toISOString(), source: 'user-reported', engineId: binding?.engineId ?? null, ...Object.fromEntries([...fields, 'launch', 'join', 'host', 'save'].map(key => [key, input[key]])) });
    await writeJSON(path.join(prefix, 'tests.json'), tests);
  }
}

export async function downloadSteam(destination) {
  const response = await fetch('https://cdn.akamai.steamstatic.com/client/installer/SteamSetup.exe', { redirect: 'error', signal: AbortSignal.timeout(120000) });
  if (!response.ok || !response.body) throw new Error('Steam indirilemedi. Bağlantınızı kontrol edin.');
  const temp = destination + '.part';
  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temp, { mode: 0o600 }));
    const stat = await fs.stat(temp);
    if (stat.size < 100000 || stat.size > 100000000) throw new Error('Steam indirme boyutu beklenmedik. Dosya çalıştırılmadı.');
    const file = await fs.open(temp, 'r');
    try { const bytes = Buffer.alloc(2); await file.read(bytes, 0, 2, 0); if (bytes.toString() !== 'MZ') throw new Error('Steam dosyası geçerli bir Windows programı değil.'); }
    finally { await file.close(); }
    await fs.rename(temp, destination);
  } finally { await fs.rm(temp, { force: true }); }
}
