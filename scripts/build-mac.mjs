import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { releases } from '../src/releases.mjs';
import { hashFile } from '../src/storage.mjs';
import { runProcess } from '../src/engine.mjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const staging = path.join(project, '.local/build-mac-0.2');
const bundle = path.join(staging, 'Coop Oyun.app');
const contents = path.join(bundle, 'Contents');
const resources = path.join(contents, 'Resources');
const archive = path.join(project, '.local/vendor', releases.node.file);
if (await hashFile(archive) !== releases.node.sha256) throw new Error('Node arşivinin SHA256 özeti uyuşmuyor.');
await fs.mkdir(path.join(contents, 'MacOS'), {recursive:true});
await fs.mkdir(path.join(resources, 'app'), {recursive:true});
const extract = path.join(staging, 'node-extract'); await fs.mkdir(extract, {recursive:true});
const root = `node-v${releases.node.version}-darwin-arm64`;
await runProcess(process.platform === 'win32' ? 'tar.exe' : '/usr/bin/tar', ['-xf', archive, '-C', extract, root + '/bin/node', root + '/LICENSE'], {timeout:120000});
await fs.copyFile(path.join(extract, root, 'bin/node'), path.join(resources, 'node'));
await fs.copyFile(path.join(extract, root, 'LICENSE'), path.join(resources, 'NODE-LICENSE.txt'));
const node = await fs.open(path.join(resources, 'node'));
const header = Buffer.alloc(12); try { await node.read(header, 0, 12, 0); } finally { await node.close(); }
if (header.readUInt32LE(0) !== 0xfeedfacf || header.readUInt32LE(4) !== 0x0100000c) throw new Error('Paket içindeki Node ARM64 Mach-O değil.');
for (const folder of ['src', 'public']) await fs.cp(path.join(project, folder), path.join(resources, 'app', folder), {recursive:true, force:true});
for (const file of ['package.json', 'README.md', 'UYUMLULUK.md', 'KARARLAR.md', 'DOGRULAMA.md']) await fs.copyFile(path.join(project, file), path.join(resources, 'app', file));
await fs.writeFile(path.join(contents, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>Coop Oyun</string>
<key>CFBundleDisplayName</key><string>Coop Oyun</string>
<key>CFBundleIdentifier</key><string>local.coopoyun.launcher</string>
<key>CFBundleExecutable</key><string>CoopOyun</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>2</string>
<key>CFBundleShortVersionString</key><string>0.2.0</string>
<key>LSMinimumSystemVersion</key><string>14.0</string>
<key>LSUIElement</key><true/>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>\n`);
const launcher = `#!/bin/bash
set -eu
MACOS_DIR="$(cd "$(dirname "$0")" && pwd)"
RESOURCES="$MACOS_DIR/../Resources"
LOG_DIR="$HOME/Library/Logs/CoopOyun"
mkdir -p "$LOG_DIR"
if ! "$RESOURCES/node" "$RESOURCES/app/src/server.mjs" --bundle >> "$LOG_DIR/launcher.log" 2>&1; then
  /usr/bin/osascript -e 'display dialog "Coop başlatılamadı. Hata kaydı açılacak." buttons {"Tamam"} default button "Tamam"'
  /usr/bin/open -t "$LOG_DIR/launcher.log"
  exit 1
fi
`;
await fs.writeFile(path.join(contents, 'MacOS/CoopOyun'), launcher, {mode:0o755});
await fs.writeFile(path.join(staging, 'ONCE-OKU.txt'), 'Coop Oyun 0.2 — Apple Silicon Mac\n\nCoop Oyun uygulamasını Uygulamalar klasörüne taşıyıp açın.\nKurulum ekranında Ücretsiz motoru indir ve kur seçeneğini kullanın.\nNode ayrıca kurulmaz. Motor kurulumu yaklaşık 186 MB indirir.\nOyunlar için kendi Windows Steam lisansınız gerekir.\n\nBu paket imzalı/noter onaylı değildir. macOS ilk açılışı engelleyebilir.\nGüvenlik ayarlarını kapatmayın.\nMac üzerinde çalıştırma ve oyun/co-op testleri henüz yapılmadı.\n');
await fs.writeFile(path.join(resources, 'build-manifest.json'), JSON.stringify({version:'0.2.0', target:'darwin-arm64', nodeVersion:releases.node.version, nodeArchiveSha256:releases.node.sha256, nodeBinarySha256:await hashFile(path.join(resources,'node')), macExecutionVerified:false, releases}, null, 2));
const pythonIndex = process.argv.indexOf('--python');
const python = pythonIndex >= 0 ? process.argv[pythonIndex + 1] : (process.platform === 'win32' ? 'python' : 'python3');
const destination = path.join(project, 'dist/Coop-Oyun-M5-0.2.0.zip');
await fs.mkdir(path.dirname(destination), {recursive:true});
await runProcess(python, [path.join(project, 'scripts/zip-mac.py'), staging, destination], {timeout:300000});
const sha = await hashFile(destination);
await fs.writeFile(destination + '.sha256', sha + '  ' + path.basename(destination) + '\n');
const report={package:path.basename(destination),bytes:(await fs.stat(destination)).size,sha256:sha,node:'darwin-arm64, Mach-O header checked',zipIntegrityVerified:true,unixExecutablePermissionsVerified:true,macExecutionVerified:false};
await fs.writeFile(path.join(project,'PAKET_DOGRULAMA.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
