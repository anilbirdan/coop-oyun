import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { Engine, runProcess } from './engine.mjs';
import { inside, readJSON, writeJSON } from './storage.mjs';
import { installOfficialEngine } from './installer.mjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const staticFiles = { '/': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'] };
const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };

async function body(req) {
  let data = '';
  for await (const chunk of req) { data += chunk; if (data.length > 16000) throw new Error('İstek çok büyük.'); }
  try { return JSON.parse(data || '{}'); } catch { throw new Error('İstek okunamadı.'); }
}

export async function createApp({ dataDir, engine, port = 0 } = {}) {
  engine ||= new Engine({ dataDir: dataDir || (process.platform === 'darwin' ? path.join(os.homedir(), 'Library/Application Support/CoopOyun') : path.join(project, '.local')) });
  await engine.initialize();
  const token = randomBytes(32).toString('hex');
  let origin;
  let busy = null;
  const jobs = [];
  const logQueues = new Set();
  async function startJob(label, operation, { concurrent = false } = {}) {
    if (busy && !concurrent) throw new Error('Bir işlem devam ediyor. Tamamlanmasını bekleyin.');
    const job = { id: randomUUID(), label, state: 'running', at: new Date().toISOString(), log: '' };
    jobs.push(job);
    if (jobs.length > 40) jobs.splice(0, jobs.length - 40);
    const logFile = inside(engine.dataDir, 'logs', job.id + '.log');
    await fs.mkdir(path.dirname(logFile), { recursive: true });
    if (busy && !concurrent) { jobs.splice(jobs.indexOf(job), 1); throw new Error('Bir işlem devam ediyor. Tamamlanmasını bekleyin.'); }
    if (!concurrent) busy = job.id;
    let queue = Promise.resolve();
    const log = message => {
      job.log = (job.log + message).slice(-20000);
      queue = queue.then(() => fs.appendFile(logFile, message, { mode: 0o600 })).catch(() => { job.log += '\nKayıt dosyası yazılamadı.\n'; });
    };
    log(label + '\n');
    const completion = Promise.resolve().then(() => operation(log)).then(() => { job.state = 'done'; }, error => { job.state = 'failed'; log(error.message + '\n'); }).finally(async () => {
      if (busy === job.id) busy = null;
      await queue;
    });
    logQueues.add(completion);
    completion.finally(() => logQueues.delete(completion));
    return job.id;
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    const expectedHost = new URL(origin).host;
    if (req.headers.host !== expectedHost) return json(res, 403, { error: 'Bağlantı adresi kabul edilmedi.' });
    const url = new URL(req.url, origin);
    try {
      if (req.method === 'GET' && staticFiles[url.pathname]) {
        const [file, mime] = staticFiles[url.pathname];
        res.writeHead(200, { 'Content-Type': mime });
        return res.end(await fs.readFile(path.join(project, 'public', file)));
      }
      if (!url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Sayfa bulunamadı.' });
      if (req.headers.authorization !== `Bearer ${token}` || (req.headers.origin && req.headers.origin !== origin)) return json(res, 403, { error: 'Bu pencerenin erişim anahtarı geçersiz. Başlatma bağlantısını yeniden açın.' });
      if (req.method === 'GET' && url.pathname === '/api/state') return json(res, 200, { ...await engine.status(), busy, jobs });
      if (req.method === 'GET' && url.pathname === '/api/support') return json(res, 200, {
        ...await engine.supportReport(), exportedAt: new Date().toISOString(),
        jobs: jobs.slice(-4).map(({label, state, log}) => ({label, state, log}))
      });
      if (req.method === 'GET' && url.pathname === '/api/export') {
        res.setHeader('Content-Disposition', 'attachment; filename="coop-test-kayitlari.json"');
        const state = await engine.status();
        return json(res, 200, { exportedAt: new Date().toISOString(), platform: state.platform, engine: state.engine, games: state.games.map(({ id, tests }) => ({ id, tests })) });
      }
      if (req.method !== 'POST') return json(res, 405, { error: 'Bu işlem desteklenmiyor.' });
      const input = await body(req);
      if (url.pathname === '/api/choose') {
        engine.requireMac();
        const chosen = await runProcess('/usr/bin/osascript', ['-e', 'POSIX path of (choose folder with prompt "İndirip açtığınız Wine veya DXMT klasörünü seçin")'], { timeout: 120000 });
        return json(res, 200, { path: chosen.trim() });
      }
      if (url.pathname === '/api/engine') return json(res, 202, { job:await startJob('Motor hazırlanıyor', log => engine.importEngine({ winePath:input.winePath, dxmtPath:input.dxmtPath }, log)) });
      if (url.pathname === '/api/setup') {
        engine.requireMac();
        return json(res, 202, { job:await startJob('Ücretsiz motor kuruluyor', log => installOfficialEngine(engine, log)) });
      }
      if (url.pathname === '/api/doctor') {
        engine.requireMac();
        return json(res,202,{job:await startJob('Mac ve Windows ortamı kontrol ediliyor',log=>engine.diagnose(log))});
      }
      if (url.pathname === '/api/quit') {
        if (busy) throw new Error('Devam eden işlem bitmeden uygulama kapatılamaz.');
        json(res, 200, { ok:true });
        setImmediate(() => server.emit('app-quit'));
        return;
      }
      if (url.pathname === '/api/action') {
        const { game, action } = input;
        const operations = {
          prepare: log => engine.prepare(game, log), steamInstall: log => engine.installSteam(game, log),
          steam: log => engine.launch(game, 'steam', log), install: log => engine.launch(game, 'install', log),
          play: log => engine.launch(game, 'play', log), stop: log => engine.stop(game, log),
        };
        if (!operations[action]) throw new Error('İşlem bulunamadı.');
        engine.requireMac();
        return json(res, 202, { job: await startJob(`${game}: ${action}`, operations[action], { concurrent: action === 'stop' }) });
      }
      if (url.pathname === '/api/test') {
        if (busy) throw new Error('Devam eden işlemden sonra test kaydını kaydedin.');
        busy = 'test-save';
        try { await engine.saveTest(input.game, input.result); }
        finally { busy = null; }
        return json(res, 200, { ok: true });
      }
      return json(res, 404, { error: 'İşlem bulunamadı.' });
    } catch (error) { return json(res, 400, { error: error.message }); }
  });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  } catch (error) { await engine.close(); throw error; }
  origin = `http://127.0.0.1:${server.address().port}`;
  return {
    server, origin, token, url: `${origin}/#${token}`,
    async close() { await new Promise(resolve => server.close(resolve)); await Promise.all([...logQueues]); await engine.close(); },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dataDir = process.env.COOP_DATA_DIR ? path.resolve(process.env.COOP_DATA_DIR) : (process.platform === 'darwin' ? path.join(os.homedir(), 'Library/Application Support/CoopOyun') : path.join(project, '.local'));
  const sessionFile = path.join(dataDir, 'session.json');
  let app;
  try { app = await createApp({dataDir}); }
  catch (error) {
    // Relaunching the app reopens the existing, authenticated local window.
    if (process.platform === 'darwin' && error.message.includes('zaten açık')) {
      const previous = await readJSON(sessionFile, null);
      if (previous && /^http:\/\/127\.0\.0\.1:\d+\/$/.test(previous.origin) && /^[a-f0-9]{64}$/.test(previous.token)) {
        try {
          const response = await fetch(previous.origin + 'api/state', {headers:{Authorization:'Bearer ' + previous.token}, signal:AbortSignal.timeout(2000)});
          if (response.ok) { await runProcess('/usr/bin/open', [previous.origin + '#' + previous.token]); process.exit(0); }
        } catch {}
      }
    }
    console.error(error.message); process.exit(1);
  }
  await writeJSON(sessionFile, {origin:app.origin + '/', token:app.token});
  console.log('Coop Oyun — yerel uygulama\n' + app.url + '\nBu pencere açık kalmalı. Çıkmak için Ctrl+C.');
  if (process.platform === 'darwin' && !process.argv.includes('--no-browser')) {
    const opener = spawn('/usr/bin/open', [app.url], { stdio: 'ignore', shell: false });
    opener.on('error', () => console.log('Bağlantıyı tarayıcıda açın.'));
  }
  let closing = false;
  const close = async () => {
    if (closing) return; closing = true;
    await app.close(); await fs.rm(sessionFile, {force:true}); process.exit(0);
  };
  app.server.once('app-quit', close);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, close);
}
