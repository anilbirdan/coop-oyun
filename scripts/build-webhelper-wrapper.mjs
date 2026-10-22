// Builds wrapper/steamwebhelper.exe from wrapper/steamwebhelper-wrapper.c.
// Needs the mingw-w64 cross compiler (Mac: brew install mingw-w64).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProcess } from '../src/engine.mjs';
import { hashFile } from '../src/storage.mjs';
import { validateWrapperBinary } from '../src/steam.mjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const wrapperSource = path.join(project, 'wrapper/steamwebhelper-wrapper.c');
export const wrapperOutput = path.join(project, 'wrapper/steamwebhelper.exe');

export async function buildWrapper({ compiler = process.env.MINGW_GCC || 'x86_64-w64-mingw32-gcc' } = {}) {
  const temp = wrapperOutput + '.part';
  await fs.rm(temp, { force: true });
  await runProcess(compiler, ['-municode', '-O2', '-Wall', '-Wextra', '-s', '-static', '-o', temp, wrapperSource, '-mwindows'], { timeout: 120000 });
  validateWrapperBinary(await fs.readFile(temp));
  await fs.rename(temp, wrapperOutput);
  return { path: wrapperOutput, sha256: await hashFile(wrapperOutput), bytes: (await fs.stat(wrapperOutput)).size };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await buildWrapper(), null, 2));
}
