"""Build and verify a Mac app zip with Unix executable permissions, on any host."""
import pathlib
import plistlib
import stat
import sys
import zipfile

root = pathlib.Path(sys.argv[1]).resolve()
destination = pathlib.Path(sys.argv[2]).resolve()
bundle = root / 'Coop Oyun.app'
plist = plistlib.loads((bundle / 'Contents/Info.plist').read_bytes())
assert plist['CFBundleExecutable'] == 'CoopOyun'
assert plist['CFBundlePackageType'] == 'APPL'

with zipfile.ZipFile(destination, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    paths = sorted(bundle.rglob('*')) + [root / 'ONCE-OKU.txt']
    for file in paths:
        if file.is_dir():
            continue
        assert not file.is_symlink(), f'Unexpected symlink: {file}'
        name = file.relative_to(root).as_posix()
        assert not name.startswith('/') and '..' not in name.split('/')
        executable = name.endswith('/Contents/MacOS/CoopOyun') or name.endswith('/Contents/Resources/node')
        info = zipfile.ZipInfo(name)
        info.create_system = 3
        info.external_attr = (stat.S_IFREG | (0o755 if executable else 0o644)) << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        with file.open('rb') as source, archive.open(info, 'w') as target:
            while chunk := source.read(1024 * 1024):
                target.write(chunk)

with zipfile.ZipFile(destination) as archive:
    assert archive.testzip() is None
    for name in ['Coop Oyun.app/Contents/MacOS/CoopOyun', 'Coop Oyun.app/Contents/Resources/node']:
        assert (archive.getinfo(name).external_attr >> 16) & 0o111
    assert archive.read('Coop Oyun.app/Contents/MacOS/CoopOyun').startswith(b'#!/bin/bash\n')
    assert all('.local' not in name and 'instance.lock' not in name for name in archive.namelist())
print('Mac bundle structure, executable permissions and ZIP integrity verified.')
