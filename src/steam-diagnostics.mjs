import fs from 'node:fs/promises';
import path from 'node:path';

// Read only bounded tails of known logs. Never collect login/config files.
export async function steamDiagnostics(prefix) {
  const logs = [];
  for (const folder of ['Program Files (x86)', 'Program Files']) {
    for (const name of ['bootstrap_log.txt', 'cef_log.txt', 'webhelper.txt']) {
      const file = path.join(prefix, 'drive_c', folder, 'Steam', 'logs', name);
      let handle;
      try {
        const base = await fs.realpath(prefix);
        const resolved = await fs.realpath(file);
        const relative = path.relative(base, resolved);
        if (relative.startsWith('..') || path.isAbsolute(relative)) continue;
        handle = await fs.open(resolved, 'r');
        const stat = await handle.stat();
        if (!stat.isFile()) continue;
        const bytes = Buffer.alloc(Math.min(stat.size, 12000));
        const { bytesRead } = await handle.read(bytes, 0, bytes.length, Math.max(0, stat.size - bytes.length));
        const content = bytes.subarray(0, bytesRead).toString('utf8');
        logs.push({ name: folder + '/' + name, text: content, truncated: stat.size > bytes.length });
      } catch (error) {
        if (error.code !== 'ENOENT') logs.push({ name, text: 'Kayıt okunamadı: ' + (error.code || 'bilinmeyen hata') });
      } finally { await handle?.close(); }
    }
  }
  const content = logs.map(log => log.text).join('\n');
  const graphicsError = /EGL_BAD_ALLOC|cross-process swapchain|GPU process.*(?:crash|exited)|exit_code=-1073740791/i.test(content);
  return { logs, hint: graphicsError
    ? 'Steam kaydında görüntü oluşturma hatası var. Bu kayıt tek başına kesin nedeni veya çözümü doğrulamaz.'
    : logs.length ? 'Steam kayıtları bulundu. Giriş ekranının açıldığı otomatik doğrulanmadı.'
    : 'Henüz Steam hata kaydı bulunamadı. Bu, Steam’in başarıyla açıldığı anlamına gelmez.' };
}
