import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {steamDiagnostics} from '../src/steam-diagnostics.mjs';

test('Steam diagnostics reads bounded known logs, detects failure, excludes account files',async t=>{
  const prefix=await fs.mkdtemp(path.join(os.tmpdir(),'coop-diag-'));
  t.after(()=>fs.rm(prefix,{recursive:true,force:true}));
  const root=path.join(prefix,'drive_c/Program Files (x86)/Steam/logs');
  await fs.mkdir(root,{recursive:true});
  await fs.writeFile(path.join(root,'cef_log.txt'),'old'.repeat(10000)+'EGL_BAD_ALLOC');
  await fs.writeFile(path.join(root,'loginusers.vdf'),'PRIVATE_ACCOUNT');
  const result=await steamDiagnostics(prefix);
  assert.equal(result.logs.length,1);
  assert.equal(result.logs[0].truncated,true);
  assert.equal(Buffer.byteLength(result.logs[0].text),12000);
  assert.match(result.hint,/görüntü oluşturma hatası/);
  assert.ok(!JSON.stringify(result).includes('PRIVATE_ACCOUNT'));
});

test('missing Steam logs are not interpreted as successful launch',async()=>{
  const result=await steamDiagnostics(path.join(os.tmpdir(),'coop-no-prefix-'+Date.now()));
  assert.deepEqual(result.logs,[]);
  assert.match(result.hint,/başarıyla açıldığı anlamına gelmez/);
});
