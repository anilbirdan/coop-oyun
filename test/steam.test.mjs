import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { installWebHelperWrapper, purgeChromiumLocks, validateWrapperBinary, webHelperDirectories, steamBootstrapArgs, steamClientArgs } from '../src/steam.mjs';
import { Engine } from '../src/engine.mjs';
import { readJSON } from '../src/storage.mjs';
import { fakeWrapper } from './helpers.mjs';

async function steamTree(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'coop-steam-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const root = path.join(dir, 'Steam');
  const cef = path.join(root, 'bin/cef/cef.win64');
  await fs.mkdir(cef, { recursive: true });
  const valve = Buffer.alloc(700000, 1);
  await fs.writeFile(path.join(cef, 'steamwebhelper.exe'), valve);
  const wrapper = path.join(dir, 'wrapper.exe');
  await fs.writeFile(wrapper, fakeWrapper());
  return { dir, root, cef, valve, wrapper };
}

test('wrapper keeps Valve helper as _real and is idempotent', async t => {
  const s = await steamTree(t);
  assert.equal(await installWebHelperWrapper(s.root, s.wrapper), 1);
  assert.deepEqual(await fs.readFile(path.join(s.cef, 'steamwebhelper_real.exe')), s.valve);
  assert.deepEqual(await fs.readFile(path.join(s.cef, 'steamwebhelper.exe')), fakeWrapper());
  assert.equal(await installWebHelperWrapper(s.root, s.wrapper), 0);
  assert.deepEqual(await fs.readFile(path.join(s.cef, 'steamwebhelper_real.exe')), s.valve);
  assert.deepEqual((await fs.readdir(s.cef)).sort(), ['steamwebhelper.exe', 'steamwebhelper_real.exe']);
});

test('Steam update restoring its helper refreshes the backup, then reinstalls wrapper', async t => {
  const s = await steamTree(t);
  await installWebHelperWrapper(s.root, s.wrapper);
  const updated = Buffer.alloc(800000, 2);
  await fs.writeFile(path.join(s.cef, 'steamwebhelper.exe'), updated);
  assert.equal(await installWebHelperWrapper(s.root, s.wrapper), 1);
  assert.deepEqual(await fs.readFile(path.join(s.cef, 'steamwebhelper_real.exe')), updated);
  assert.deepEqual(await fs.readFile(path.join(s.cef, 'steamwebhelper.exe')), fakeWrapper());
});

test('older wrapper is replaced without touching the Valve backup', async t => {
  const s = await steamTree(t);
  await installWebHelperWrapper(s.root, s.wrapper);
  await fs.writeFile(path.join(s.cef, 'steamwebhelper.exe'), fakeWrapper('old-wrapper'));
  assert.equal(await installWebHelperWrapper(s.root, s.wrapper), 1);
  assert.deepEqual(await fs.readFile(path.join(s.cef, 'steamwebhelper_real.exe')), s.valve);
  assert.deepEqual(await fs.readFile(path.join(s.cef, 'steamwebhelper.exe')), fakeWrapper());
});

test('lost Valve helper fails closed and changes nothing', async t => {
  const s = await steamTree(t);
  await fs.writeFile(path.join(s.cef, 'steamwebhelper.exe'), fakeWrapper('a'));
  await fs.writeFile(path.join(s.cef, 'steamwebhelper_real.exe'), fakeWrapper('b'));
  await assert.rejects(() => installWebHelperWrapper(s.root, s.wrapper), /kayıp/);
  assert.deepEqual(await fs.readFile(path.join(s.cef, 'steamwebhelper.exe')), fakeWrapper('a'));
  await fs.rm(path.join(s.cef, 'steamwebhelper_real.exe'));
  await assert.rejects(() => installWebHelperWrapper(s.root, s.wrapper), /kayıp/);
});

test('wrapper binary must be a small x64 Windows GUI program', () => {
  assert.ok(validateWrapperBinary(fakeWrapper()));
  const consoleProgram = fakeWrapper(); consoleProgram.writeUInt16LE(3, 128 + 24 + 68);
  assert.throws(() => validateWrapperBinary(consoleProgram), /pencere/);
  const x86 = fakeWrapper(); x86.writeUInt16LE(0x14c, 132);
  assert.throws(() => validateWrapperBinary(x86), /64 bit/);
  assert.throws(() => validateWrapperBinary(Buffer.alloc(600000)), /geçersiz/);
});

test('missing CEF tree is reported, not guessed', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'coop-steam-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  assert.deepEqual(await webHelperDirectories(dir), []);
  await fs.writeFile(path.join(dir, 'w.exe'), fakeWrapper());
  await assert.rejects(() => installWebHelperWrapper(dir, path.join(dir, 'w.exe')), /ilk güncellemesini/);
});

test('only Chromium Singleton files are purged from Steam htmlcache', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'coop-locks-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const cache = path.join(dir, 'drive_c/users/mac/AppData/Local/Steam/htmlcache');
  await fs.mkdir(path.join(cache, 'Default'), { recursive: true });
  for (const name of ['SingletonLock', 'SingletonSocket', 'Cookies', 'Default/SingletonCookie', 'Default/Preferences']) await fs.writeFile(path.join(cache, name), 'x');
  assert.equal(await purgeChromiumLocks(dir), 3);
  assert.deepEqual((await fs.readdir(cache)).sort(), ['Cookies', 'Default']);
  assert.deepEqual(await fs.readdir(path.join(cache, 'Default')), ['Preferences']);
  assert.equal(await purgeChromiumLocks(path.join(dir, 'missing')), 0);
});

async function engineFixture(t, options = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'coop-boot-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const calls = [];
  const engine = new Engine({ dataDir: path.join(dir, 'data'), platform: 'darwin', wrapperPath: path.join(dir, 'w.exe'), sleep: async () => {}, probe: async () => true, runner: async (binary, args, settings = {}) => {
    calls.push({ binary, args, ...settings });
    if (settings.background && args[0].endsWith('steam.exe') && options.bootstrap !== false) {
      const cef = path.join(path.dirname(args[0]), 'bin/cef/cef.win64');
      await fs.mkdir(cef, { recursive: true });
      if (!(await fs.readdir(cef)).length) await fs.writeFile(path.join(cef, 'steamwebhelper.exe'), Buffer.alloc(600000, 3));
    }
    return '';
  }, ...options.engine });
  await fs.writeFile(path.join(dir, 'w.exe'), fakeWrapper());
  // Minimal prepared prefix with an engine record and installed Steam.
  const engineId = '00000000-0000-4000-8000-000000000001';
  const engineDir = path.join(engine.dataDir, 'engines', engineId);
  await fs.mkdir(path.join(engineDir, 'runtime/bin'), { recursive: true });
  await fs.writeFile(path.join(engineDir, 'engine.json'), JSON.stringify({ id: engineId, binary: 'runtime/bin/wine', root: 'runtime', graphicsMode: 'builtin' }));
  await fs.writeFile(path.join(engine.dataDir, 'settings.json'), JSON.stringify({ engineId }));
  const prefix = engine.prefix('raft');
  await fs.mkdir(path.join(prefix, 'drive_c/Program Files (x86)/Steam'), { recursive: true });
  await fs.writeFile(path.join(prefix, 'drive_c/Program Files (x86)/Steam/steam.exe'), 'steam');
  await fs.writeFile(path.join(prefix, 'coop.json'), JSON.stringify({ engineId }));
  return { dir, engine, calls, prefix, cef: path.join(prefix, 'drive_c/Program Files (x86)/Steam/bin/cef/cef.win64') };
}

test('first Steam start bootstraps, stops only this prefix, then installs wrapper before launching', async t => {
  const f = await engineFixture(t);
  const lines = [];
  await f.engine.launch('raft', 'play', line => lines.push(line));
  const boot = f.calls.find(call => call.background);
  assert.deepEqual(boot.args.slice(1), [...steamBootstrapArgs]);
  const kill = f.calls.findIndex(call => call.args[0] === '-k');
  assert.ok(kill > f.calls.indexOf(boot));
  assert.equal(f.calls[kill].env.WINEPREFIX, f.prefix);
  const launch = f.calls.at(-1);
  assert.deepEqual(launch.args.slice(1), [...steamClientArgs, '-applaunch', '648800']);
  assert.match(launch.env.WINEDLLOVERRIDES, /^dxgi,d3d11=b;bcrypt=b;ncrypt=b;gameoverlayrenderer,gameoverlayrenderer64=d$/);
  assert.deepEqual(await fs.readFile(path.join(f.cef, 'steamwebhelper.exe')), fakeWrapper());
  assert.equal((await fs.stat(path.join(f.cef, 'steamwebhelper_real.exe'))).size, 600000);
  assert.equal((await readJSON(path.join(f.prefix, 'last-run.json'))).action, 'play');
  // Second launch: no new bootstrap, wrapper already in place.
  const before = f.calls.length;
  await f.engine.launch('raft', 'steam', () => {});
  assert.equal(f.calls.length, before + 1);
  assert.deepEqual(f.calls.at(-1).args.slice(1), [...steamClientArgs]);
});

test('bootstrap that never finishes stops the prefix and reports instead of launching', async t => {
  const f = await engineFixture(t, { bootstrap: false, engine: { bootstrapTimeout: -1 } });
  await assert.rejects(() => f.engine.launch('raft', 'steam', () => {}), /zamanında bitmedi/);
  assert.ok(f.calls.some(call => call.args[0] === '-k'));
  assert.equal(f.calls.filter(call => call.background).length, 1);
});

test('copy without a built wrapper still launches with Steam flags and warns', async t => {
  const f = await engineFixture(t);
  await fs.rm(path.join(f.dir, 'w.exe'));
  const lines = [];
  await f.engine.launch('raft', 'steam', line => lines.push(line));
  assert.ok(lines.some(line => line.includes('sarmalayıcısı bu kopyada yok')));
  assert.deepEqual(f.calls.at(-1).args.slice(1), [...steamClientArgs]);
  assert.equal((await fs.stat(path.join(f.cef, 'steamwebhelper.exe'))).size, 600000);
});
