import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/server.mjs';
import { Engine } from '../src/engine.mjs';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';

async function appFor(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'coop-server-'));
  const engine = new Engine({ dataDir: dir, platform: 'win32' });
  const app = await createApp({ engine });
  t.after(async () => { await app.close(); await fs.rm(dir, { recursive: true, force: true }); });
  return app;
}
test('loopback app renders assets; all three games present and actions disabled on Windows', async t => {
  const app = await appFor(t);
  const page = await fetch(app.origin);
  assert.equal(page.status, 200); assert.match(await page.text(), /Önce Steam’i açalım/);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  const response = await fetch(app.origin + '/api/state', { headers: { Authorization: `Bearer ${app.token}` } });
  const state = await response.json();
  assert.equal(state.mac, false); assert.deepEqual(state.games.map(game => game.id), ['bellwright', 'palworld', 'raft']);
  const denied = await fetch(app.origin + '/api/action', { method: 'POST', headers: { Authorization: `Bearer ${app.token}` }, body: JSON.stringify({ game: 'raft', action: 'play' }) });
  assert.equal(denied.status, 400); assert.match((await denied.json()).error, /Mac değil/);
});
test('private API rejects missing token and foreign web origin', async t => {
  const app = await appFor(t);
  assert.equal((await fetch(app.origin + '/api/state')).status, 403);
  assert.equal((await fetch(app.origin + '/api/support')).status, 403);
  assert.equal((await fetch(app.origin + '/api/test', { method: 'POST', headers: { Authorization: `Bearer ${app.token}`, Origin: 'https://foreign.example' }, body: '{}' })).status, 403);
  assert.equal((await fetch(app.origin + '/PLAN.md')).status, 404);
  assert.equal((await fetch(app.origin + '/src/server.mjs')).status, 404);
});
test('test report roundtrip persists separated outcomes and exports no access token', async t => {
  const app = await appFor(t);
  const headers = { Authorization: `Bearer ${app.token}`, 'Content-Type': 'application/json' };
  const result = { hardware: '', macOS: '', gameBuild: '', notes: 'henüz Mac yok', launch: 'unknown', join: 'unknown', host: 'unknown', save: 'unknown' };
  const saved = await fetch(app.origin + '/api/test', { method: 'POST', headers, body: JSON.stringify({ game: 'palworld', result }) });
  assert.equal(saved.status, 200);
  const exported = await fetch(app.origin + '/api/export', { headers });
  const data = await exported.json();
  assert.equal(data.games.find(game => game.id === 'palworld').tests[0].notes, result.notes);
  assert.equal(JSON.stringify(data).includes(app.token), false);
  const support = await (await fetch(app.origin + '/api/support', {headers})).json();
  assert.equal(support.games.length, 3);
  assert.equal(JSON.stringify(support).includes(app.token), false);
  assert.equal('dataDir' in support, false);
});

test('real CLI uses isolated data folder and exits through authenticated quit API',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'coop-cli-'));
  const serverFile=fileURLToPath(new URL('../src/server.mjs',import.meta.url));
  const child=spawn(process.execPath,[serverFile,'--no-browser'],{env:{...process.env,COOP_DATA_DIR:dir},stdio:'ignore'});
  let spawnError;child.once('error',error=>{spawnError=error;});
  t.after(async()=>{if(child.exitCode===null)child.kill('SIGTERM');await fs.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});});
  let session;
  for(let i=0;i<100;i++){
    if(spawnError)throw spawnError;
    if(child.exitCode!==null)throw new Error('Server exited: '+child.exitCode);
    try{session=JSON.parse(await fs.readFile(path.join(dir,'session.json'),'utf8'));break;}catch(error){if(error.code!=='ENOENT')throw error;}
    await delay(50);
  }
  assert.ok(session);
  const state=await fetch(session.origin+'api/state',{headers:{Authorization:'Bearer '+session.token}});
  assert.equal(state.status,200);assert.equal((await state.json()).dataDir,dir);
  const exit=new Promise(resolve=>child.once('exit',resolve));
  const result=await fetch(session.origin+'api/quit',{method:'POST',headers:{Authorization:'Bearer '+session.token,'Content-Type':'application/json'},body:'{}'});
  assert.equal(result.status,200);
  await Promise.race([exit,delay(5000).then(()=>{throw new Error('Quit timed out');})]);
  await assert.rejects(fs.access(path.join(dir,'instance.lock')));
  await assert.rejects(fs.access(path.join(dir,'session.json')));
});
