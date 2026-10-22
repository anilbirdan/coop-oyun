// Windows Steam on Mac Wine + DXMT: client flags, DLL overrides and the
// steamwebhelper wrapper. Without these the Steam window stays black and
// sign-in fails (CEF GPU process + out-of-process TLS under Wine).
// Approach: notpop/steam-on-m1-wine (MIT), ByMedion/macos-wine-steam,
// Gcenx/macOS_Wine_builds#159. Code written for this project.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { exists } from './storage.mjs';

// -no-cef-sandbox: Chromium sandbox needs Windows integrity tokens Wine lacks.
// -cef-single-process: Steam-level single process mode for its CEF browser.
// -noverifyfiles: stops Steam from restoring the original webhelper on start.
export const steamClientArgs = Object.freeze(['-no-cef-sandbox', '-cef-single-process', '-noverifyfiles']);
// Bootstrap run: same CEF flags, but Steam may verify and extract its files.
export const steamBootstrapArgs = Object.freeze(['-no-cef-sandbox', '-cef-single-process']);
// bcrypt/ncrypt builtin avoids clashes with Chromium BoringSSL; the overlay DLL
// hooks D3D11 and deadlocks games under DXMT, so Wine must not load it.
export const steamDllOverrides = 'bcrypt=b;ncrypt=b;gameoverlayrenderer,gameoverlayrenderer64=d';
// Valve's helper is many MB (Chromium); ours is far below this ceiling.
export const wrapperSizeCeiling = 500000;

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const defaultWrapperPath = path.join(project, 'wrapper/steamwebhelper.exe');

export function validateWrapperBinary(bytes) {
  if (bytes.length < 1024 || bytes.length >= wrapperSizeCeiling || bytes.toString('ascii', 0, 2) !== 'MZ') throw new Error('Steam arayüz sarmalayıcısı geçersiz.');
  const offset = bytes.readUInt32LE(0x3c);
  if (offset + 0x5e > bytes.length || bytes.toString('ascii', offset, offset + 4) !== 'PE\0\0' || bytes.readUInt16LE(offset + 4) !== 0x8664) throw new Error('Steam arayüz sarmalayıcısı 64 bit Windows programı değil.');
  // Optional header Subsystem: 2 = Windows GUI, same as Valve's helper.
  if (bytes.readUInt16LE(offset + 24 + 68) !== 2) throw new Error('Steam arayüz sarmalayıcısı pencere programı olarak derlenmemiş.');
  return true;
}

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
async function sizeOf(file) { try { return (await fs.stat(file)).size; } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
async function hashOf(file) { return sha256(await fs.readFile(file)); }

// Replace by rename so a running helper keeps its old file intact.
async function atomicWrite(destination, bytes) {
  const temp = destination + '.coop-' + randomUUID();
  try {
    await fs.writeFile(temp, bytes, { flag: 'wx', mode: 0o644 });
    await fs.rename(temp, destination);
  } finally { await fs.rm(temp, { force: true }); }
}

export async function webHelperDirectories(steamRoot) {
  const cef = path.join(steamRoot, 'bin/cef');
  let entries;
  try { entries = await fs.readdir(cef, { withFileTypes: true }); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const found = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || !/^cef\.win/i.test(entry.name)) continue;
    const dir = path.join(cef, entry.name);
    if (await exists(path.join(dir, 'steamwebhelper.exe')) || await exists(path.join(dir, 'steamwebhelper_real.exe'))) found.push(dir);
  }
  return found.sort();
}

// Installs the wrapper as steamwebhelper.exe and keeps Valve's original as
// steamwebhelper_real.exe. Valve's file is never overwritten by a wrapper.
// Returns how many directories changed (0 = already in place).
export async function installWebHelperWrapper(steamRoot, wrapperPath, log = () => {}) {
  const dirs = await webHelperDirectories(steamRoot);
  if (!dirs.length) throw new Error('Steam arayüz dosyaları bulunamadı. Steam ilk güncellemesini tamamlamadı.');
  const wrapper = await fs.readFile(wrapperPath);
  validateWrapperBinary(wrapper);
  const wrapperHash = sha256(wrapper);
  let changed = 0;
  for (const dir of dirs) {
    const target = path.join(dir, 'steamwebhelper.exe');
    const real = path.join(dir, 'steamwebhelper_real.exe');
    const targetSize = await sizeOf(target);
    const realSize = await sizeOf(real);
    const realIsValve = realSize !== null && realSize >= wrapperSizeCeiling;
    if (targetSize !== null && targetSize < wrapperSizeCeiling) {
      if (!realIsValve) throw new Error('Steam’in özgün arayüz dosyası kayıp (' + path.basename(dir) + '). Bu oyunun Steam kurulumunu yenileyin.');
      if (await hashOf(target) === wrapperHash) continue;
    } else if (targetSize !== null) {
      const valve = await fs.readFile(target);
      if (!realIsValve || await hashOf(real) !== sha256(valve)) {
        await atomicWrite(real, valve);
        if (await hashOf(real) !== sha256(valve)) throw new Error('Steam’in özgün arayüz dosyası yedeklenemedi.');
        log(path.basename(dir) + ': Steam’in özgün arayüz dosyası korundu.\n');
      }
    } else if (!realIsValve) {
      log(path.basename(dir) + ': arayüz dosyası yok, atlandı.\n');
      continue;
    }
    await atomicWrite(target, wrapper);
    if (await hashOf(target) !== wrapperHash) throw new Error('Steam arayüz sarmalayıcısı doğrulanamadı.');
    changed++;
  }
  if (changed) log('Steam arayüzü Mac için ayarlandı (' + changed + ' klasör).\n');
  return changed;
}

// Chromium leaves Singleton* files after a crash; the next Steam start then
// runs silently with no window. Only call while this prefix is stopped.
export async function purgeChromiumLocks(prefix) {
  const users = path.join(prefix, 'drive_c/users');
  let removed = 0;
  let accounts;
  try { accounts = await fs.readdir(users, { withFileTypes: true }); } catch (error) { if (error.code === 'ENOENT') return 0; throw error; }
  for (const account of accounts) {
    if (!account.isDirectory() || account.isSymbolicLink()) continue;
    const cache = path.join(users, account.name, 'AppData/Local/Steam/htmlcache');
    const visit = async (dir, depth) => {
      let entries;
      try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch (error) { if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return; throw error; }
      for (const entry of entries) {
        const file = path.join(dir, entry.name);
        if (/^Singleton/.test(entry.name) && !entry.isDirectory()) { await fs.rm(file, { force: true }); removed++; }
        else if (depth < 1 && entry.isDirectory() && !entry.isSymbolicLink()) await visit(file, depth + 1);
      }
    };
    await visit(cache, 0);
  }
  return removed;
}
