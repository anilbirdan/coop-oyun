import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Engine, findRuntime, runProcess } from '../src/engine.mjs';
import { inside, readJSON, writeJSON } from '../src/storage.mjs';

async function fixture(t, options = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'coop-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const calls = [];
  const dataDir = path.join(dir, 'data');
  const runner = async (binary, args, settings = {}) => {
    calls.push({ binary, args, ...settings });
    if (args.includes('--version')) return 'wine-11.18';
    if (args[0]==='cmd') return 'Microsoft Windows 10.0.19045';
    if (args[0] === 'wineboot') {
      assert.equal((await fs.stat(settings.env.WINEPREFIX)).isDirectory(),true,'Wine prefix must exist before boot');
      await fs.mkdir(path.join(settings.env.WINEPREFIX,'drive_c/windows/system32'),{recursive:true});
    }
    if (args.includes('/S')) {
      const steam = path.join(settings.env.WINEPREFIX, 'drive_c/Program Files (x86)/Steam');
      await fs.mkdir(steam, { recursive: true }); await fs.writeFile(path.join(steam, 'steam.exe'), 'fake-steam');
    }
    return '';
  };
  const engine = new Engine({ dataDir, platform: 'darwin', runner, downloader: file => fs.writeFile(file, 'fake-installer'), ...options });
  const winePath = path.join(dir, 'Wine with spaces.app');
  const base = path.join(winePath, 'Contents/Resources/wine');
  for (const directory of ['bin', 'lib/wine/x86_64-unix', 'lib/wine/x86_64-windows']) await fs.mkdir(path.join(base, directory), { recursive: true });
  for (const name of ['wine', 'wineserver']) await fs.writeFile(path.join(base, 'bin', name), 'original-' + name);
  const edge = Buffer.from('_macdrv_functions\0');
  const trie = Buffer.concat([Buffer.from([0,1]),edge,Buffer.from([2+edge.length+1]),Buffer.from([1,0,0])]);
  const driver = Buffer.alloc(48+trie.length); driver.writeUInt32LE(0xfeedfacf,0); driver.writeUInt32LE(1,16); driver.writeUInt32LE(0x80000033,32); driver.writeUInt32LE(16,36); driver.writeUInt32LE(48,40); driver.writeUInt32LE(trie.length,44); trie.copy(driver,48);
  await fs.writeFile(path.join(base,'lib/wine/x86_64-unix/winemac.so'),driver);
  const dxmtPath = path.join(dir, 'DXMT/x64'); await fs.mkdir(dxmtPath, { recursive: true });
  for (const name of ['winemetal.so', 'winemetal.dll', 'd3d11.dll', 'dxgi.dll']) {
    const bytes = Buffer.alloc(256); bytes.write('MZ'); bytes.writeUInt32LE(128, 0x3c); bytes.write('PE\0\0',128); bytes.writeUInt16LE(0x8664,132);
    await fs.writeFile(path.join(dxmtPath, name), bytes);
  }
  return { dir, engine, calls, winePath, dxmtPath, base };
}

test('Windows blocks all real Wine actions before any process runs', async t => {
  const { engine, calls } = await fixture(t, { platform: 'win32' });
  for (const operation of [() => engine.prepare('raft', () => {}), () => engine.installSteam('palworld', () => {}), () => engine.launch('bellwright', 'play', () => {}), () => engine.stop('raft', () => {}), () => engine.importEngine({}, () => {})]) await assert.rejects(operation, /Mac değil/);
  assert.equal(calls.length, 0);
});

test('engine import uses private copy, hashes DXMT, preserves source and pins Wine', async t => {
  const f = await fixture(t);
  const record = await f.engine.importEngine(f);
  assert.equal(record.version, 'wine-11.18');
  assert.equal(record.gameVerified, false);
  assert.equal(record.hashes['d3d11.dll'].length, 64);
  assert.equal(await fs.readFile(path.join(f.base, 'bin/wine'), 'utf8'), 'original-wine');
  await assert.rejects(fs.access(path.join(f.base, 'lib/wine/x86_64-windows/d3d11.dll')));
  assert.ok(f.calls[0].binary.startsWith(path.join(f.engine.dataDir, 'engines')));
});

test('incompatible version fails without replacing previous engine', async t => {
  const f = await fixture(t);
  const original = await f.engine.importEngine(f);
  f.engine.runner = async () => 'wine-7.7';
  await assert.rejects(() => f.engine.importEngine(f), /11.18 motorunu/);
  const settings = await readJSON(path.join(f.engine.dataDir, 'settings.json'));
  assert.equal(settings.engineId, original.id);
  assert.equal((await fs.readdir(path.join(f.engine.dataDir, 'engines'))).length, 1);
});

test('each game has isolated Steam, engine binding and scoped shutdown', async t => {
  const f = await fixture(t);
  const first = await f.engine.importEngine(f);
  await f.engine.installSteam('palworld', () => {});
  const second = await f.engine.importEngine(f);
  await f.engine.installSteam('raft', () => {});
  assert.notEqual(first.id, second.id);
  await f.engine.launch('palworld', 'play', () => {});
  const launch = f.calls.at(-1);
  assert.deepEqual(launch.args.slice(1), ['-applaunch', '1623730']);
  assert.ok(launch.binary.includes(first.id));
  assert.equal(launch.env.WINEPREFIX, f.engine.prefix('palworld'));
  assert.equal(launch.env.WINEDLLOVERRIDES, 'dxgi,d3d11=n,b');
  assert.equal(launch.background, true);
  await f.engine.stop('raft', () => {});
  assert.deepEqual(f.calls.at(-1).args, ['-k']);
  assert.equal(f.calls.at(-1).env.WINEPREFIX, f.engine.prefix('raft'));
  assert.ok(f.calls.at(-1).binary.includes(second.id));
  assert.notEqual(f.engine.prefix('raft'), f.engine.prefix('palworld'));
});

test('invalid game or missing Steam never launches a process', async t => {
  const { engine, calls } = await fixture(t);
  await assert.rejects(() => engine.launch('../outside', 'play'), /listede/);
  await assert.rejects(() => engine.launch('raft', 'play'), /ortamını/);
  assert.equal(calls.length, 0);
  assert.throws(() => inside(engine.dataDir, '../outside'), /dışına/);
});

test('successful reports require actual hardware and build, preserve join and host separately', async t => {
  const { engine } = await fixture(t);
  const result = { hardware: '', macOS: '', gameBuild: '', notes: '', launch: 'passed', join: 'failed', host: 'unknown', save: 'unknown' };
  await assert.rejects(() => engine.saveTest('raft', result), /gerçek Mac/);
  Object.assign(result, { hardware: 'M5 16 GB', macOS: '26', gameBuild: 'test-build' });
  await engine.saveTest('raft', result);
  const state = await engine.status();
  const report = state.games.find(game => game.id === 'raft').tests[0];
  assert.equal(report.source, 'user-reported'); assert.equal(report.join, 'failed'); assert.equal(report.host, 'unknown');
  assert.equal(report.engineId, null);
});

test('malformed state is preserved and reported instead of overwritten', async t => {
  const { engine } = await fixture(t);
  await fs.mkdir(engine.dataDir, { recursive: true });
  const settings = path.join(engine.dataDir, 'settings.json'); await fs.writeFile(settings, '{broken');
  await assert.rejects(() => engine.status(), /korunuyor/);
  assert.equal(await fs.readFile(settings, 'utf8'), '{broken');
});

test('instance lock prevents simultaneous writes and is released on close', async t => {
  const { engine } = await fixture(t);
  await engine.initialize();
  const other = new Engine({ dataDir: engine.dataDir });
  await assert.rejects(() => other.initialize(), /zaten açık/);
  await engine.close();
  await other.initialize(); await other.close();
});

test('real process runner preserves argument boundaries and returns nonzero errors', async () => {
  const value = 'space path; $(not-a-command) & "quoted"';
  const output = await runProcess(process.execPath, ['-e', 'process.stdout.write(process.argv[1])', value]);
  assert.equal(output, value);
  await assert.rejects(() => runProcess(process.execPath, ['-e', 'process.stderr.write("failure"); process.exit(3)']),error=>error.exitCode===3&&error.output==='failure'&&/3.*failure/.test(error.message));
});

test('Wine layout fails closed when runtime support files are absent', async t => {
  const { dir } = await fixture(t);
  await assert.rejects(() => findRuntime(dir), /tanınmadı/);
});

test('interrupted prefix preparation keeps its original engine on retry', async t => {
  const f = await fixture(t);
  const first = await f.engine.importEngine(f);
  const originalRunner = f.engine.runner;
  f.engine.runner = async () => { throw new Error('interrupted'); };
  await assert.rejects(() => f.engine.prepare('bellwright', () => {}), /interrupted/);
  f.engine.runner = originalRunner;
  const second = await f.engine.importEngine(f);
  assert.notEqual(first.id, second.id);
  await f.engine.prepare('bellwright', () => {});
  const binding = await readJSON(path.join(f.engine.prefix('bellwright'), 'coop.json'));
  assert.equal(binding.engineId, first.id);
});

test('builtin DXMT selects builtin loading and keeps its DLLs in runtime', async t => {
  const f = await fixture(t);
  const dll = path.join(f.dxmtPath,'d3d11.dll');
  const bytes = await fs.readFile(dll); bytes.write('Wine builtin DLL',64); await fs.writeFile(dll,bytes);
  const record = await f.engine.importEngine(f); assert.equal(record.graphicsMode,'builtin');
  await f.engine.prepare('palworld',()=>{});
  const boot = f.calls.find(call=>call.args[0]==='wineboot');
  assert.equal(boot.env.WINEDLLOVERRIDES,'dxgi,d3d11=b');
  await assert.rejects(fs.access(path.join(f.engine.prefix('palworld'),'drive_c/windows/system32/d3d11.dll')));
  assert.ok(await fs.readFile(path.join(f.engine.prefix('palworld'),'drive_c/windows/system32/winemetal.dll')));
});

test('missing DXMT driver exports are rejected before any Wine binary is executed',async t=>{
  const f=await fixture(t);
  const driver=Buffer.alloc(32); driver.writeUInt32LE(0xfeedfacf,0);
  await fs.writeFile(path.join(f.base,'lib/wine/x86_64-unix/winemac.so'),driver);
  await assert.rejects(()=>f.engine.importEngine(f),/grafik bağlantısını/);
  assert.equal(f.calls.length,0);
});

test('system diagnosis records command result separately from graphics and coop',async t=>{
  const f=await fixture(t); await f.engine.importEngine(f);
  const result=await f.engine.diagnose(()=>{});
  assert.equal(result.wineCommandPassed,true);
  assert.equal(result.graphicsVerified,false);
  assert.equal(result.coOpVerified,false);
  assert.ok(f.calls.filter(call=>call.env?.WINEPREFIX?.includes('diagnostics')).every(call=>call.env.WINEPREFIX!==f.engine.prefix('palworld')));
});

test('already exited Wine server is confirmed with wait; actual wait failures remain errors',async t=>{
  const f=await fixture(t);await f.engine.importEngine(f);
  const original=f.engine.runner;
  let waitFails=false;
  f.engine.runner=async(binary,args,options)=>{
    if(args[0]==='-k'){const error=new Error('no server');error.exitCode=1;error.output='';throw error;}
    if(args[0]==='-w'&&waitFails)throw new Error('server wait failed');
    return original(binary,args,options);
  };
  assert.equal((await f.engine.diagnose(()=>{})).wineCommandPassed,true);
  assert.ok(f.calls.some(call=>call.args[0]==='-w'));
  waitFails=true;await assert.rejects(()=>f.engine.diagnose(()=>{}),/server wait failed/);
});
