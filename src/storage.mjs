import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}
export async function readJSON(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw new Error('Kayıt dosyası okunamadı. Dosya korunuyor: ' + path.basename(file)); }
}
export async function writeJSON(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = file + '.' + randomUUID() + '.tmp';
  try {
    await fs.writeFile(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
    await fs.rename(temp, file);
  } finally { await fs.rm(temp, { force: true }); }
}
export async function hashFile(file) {
  const { createReadStream } = await import('node:fs');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
export function inside(root, ...parts) {
  const target = path.resolve(root, ...parts);
  const relative = path.relative(path.resolve(root), target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Veri klasörü dışına çıkılamaz.');
  return target;
}
