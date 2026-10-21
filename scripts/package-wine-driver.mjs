import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runProcess} from '../src/engine.mjs';
import {hashFile} from '../src/storage.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const local=path.join(root,'.local');
const report=JSON.parse(await fs.readFile(path.join(local,'wine-driver-report.json'),'utf8'));
if(!report.windowsCommandVerified||!report.basicD3D11FrameVerified||report.error)throw new Error('Basarisiz aday paketlenmez.');
const version='11.18-coop1';
const output=path.join(local,'driver-dist');await fs.mkdir(output,{recursive:true});
const staging=path.join(local,'driver-package');
const folder=path.join(staging,'coop-wine-driver');await fs.mkdir(folder,{recursive:true});
let binary;
for(const name of ['dlls/winemac.drv/winemac.so','dlls/winemac.drv/x86_64-unix/winemac.so']){
  const file=path.join(local,'wine-build',name);
  if(await fs.stat(file).catch(()=>null)){binary=file;break;}
}
if(!binary||await hashFile(binary)!==report.driverSha256)throw new Error('Surucu test edilen dosyayla eslesmiyor.');
const source=path.join(local,'wine-source');
await fs.copyFile(binary,path.join(folder,'winemac.so'));
await fs.copyFile(path.join(source,'COPYING.LIB'),path.join(folder,'COPYING.LIB'));
const instructions=`# Coop Wine DXMT driver ${version}\n\nLGPL-2.1-or-later. Wine upstream source: ${report.source}.\nCorresponding modified Wine sources are supplied as the adjacent source archive.\nOnly the Mac driver is rebuilt. The complete Wine runtime is downloaded separately from its official publisher.\n\nBuild on macOS with Xcode command line tools, Homebrew bison and mingw-w64:\n\n    export PATH="$(brew --prefix bison)/bin:$PATH"\n    mkdir build && cd build\n    CC="clang -arch x86_64" CXX="clang++ -arch x86_64" ../configure --build=x86_64-apple-darwin --host=x86_64-apple-darwin --enable-win64 --disable-tests --without-x --without-wayland --without-gstreamer --without-vulkan --without-cups --without-freetype --without-fontconfig --without-gettext\n    make -j3 dlls/winemac.drv/winemac.so\n\nIf the build uses architecture subdirectories, the make target is dlls/winemac.drv/x86_64-unix/winemac.so.\nChanges: three Metal exports, compatibility window data, host client surface creation/update/destruction, global symbol lookup. Full build and real Windows D3D11 readback probe: https://github.com/${process.env.GITHUB_REPOSITORY}/tree/${process.env.GITHUB_SHA}/scripts\n\nThis verifies a small D3D11 frame, resize and window reopening. Games and co-op are not verified.\n`;
await fs.writeFile(path.join(source,'COOP-DXMT-BUILD.md'),instructions);
await fs.writeFile(path.join(folder,'SOURCE.md'),instructions);
const sourceArchive=path.join(output,`wine-driver-${version}-source.tar.xz`);
await runProcess('/usr/bin/tar',['-cJf',sourceArchive,'--exclude=.git','-C',source,'.'],{timeout:300000});
const listing=await runProcess('/usr/bin/tar',['-tf',sourceArchive],{timeout:120000,maxOutput:4000000,requireFullOutput:true});
if(listing.split(/\r?\n/).some(file=>file.split('/').includes('.git')))throw new Error('Kaynak paketine Git ic dosyasi girdi.');
const manifest={version,sourceCommit:report.source,buildCommit:process.env.GITHUB_SHA,wineArchiveSha256:report.wineArchiveSha256,driverSha256:report.driverSha256,sourceArchive:path.basename(sourceArchive),sourceArchiveSha256:await hashFile(sourceArchive),testRun:`https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,windowsCommandVerified:true,basicD3D11FrameVerified:true,gameVerified:false,coOpVerified:false};
await fs.writeFile(path.join(folder,'manifest.json'),JSON.stringify(manifest,null,2));
const archive=path.join(output,`wine-driver-${version}.tar.xz`);
await runProcess('/usr/bin/tar',['-cJf',archive,'-C',staging,'coop-wine-driver'],{timeout:120000});
const hashes=[];
for(const file of [archive,sourceArchive])hashes.push((await hashFile(file))+'  '+path.basename(file));
await fs.writeFile(path.join(output,'SHA256SUMS.txt'),hashes.join('\n')+'\n');
await fs.writeFile(path.join(local,'driver-release-notes.md'),`Deneysel Mac Wine 11.18 / DXMT surucusu.\n\nGercek bulut Mac testinde Windows komutu, D3D11 renk geri okuma, Present, pencere boyutlandirma ve kapatip yeniden acma gecti. Oyun ve co-op testi yapilmadi. M5 testi degildir.\n\nTam degistirilmis Wine kaynaklari ve LGPL lisansi ektedir. Test: ${manifest.testRun}\n`);
console.log('WINE_DRIVER_PACKAGE='+JSON.stringify({...manifest,archive:path.basename(archive),archiveSha256:await hashFile(archive),bytes:(await fs.stat(archive)).size}));
