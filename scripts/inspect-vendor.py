"""Inspect downloaded archives without executing any Mac or Windows binary."""
import hashlib
import json
import pathlib
import posixpath
import struct
import tarfile

root = pathlib.Path(__file__).resolve().parents[1]
vendor = root / '.local/vendor'

def macho(data):
    magic, cpu, _, _, ncmds, _, _, _ = struct.unpack_from('<8I', data)
    assert magic == 0xfeedfacf
    offset, symbols, libraries, trie = 32, [], [], None
    for _ in range(ncmds):
        command, size = struct.unpack_from('<II', data, offset)
        if command == 2:
            symoff, count, stroff, strsize = struct.unpack_from('<4I', data, offset + 8)
            strings = data[stroff:stroff + strsize]
            for i in range(count):
                index, kind, _, _, _ = struct.unpack_from('<IBBHQ', data, symoff + i * 16)
                end = strings.find(b'\0', index)
                name = strings[index:end].decode('utf-8', 'replace')
                symbols.append((name, kind))
        if command & 0x7fffffff in [0xc, 0x18, 0x1f, 0x23]:
            name_offset = struct.unpack_from('<I', data, offset + 8)[0]
            libraries.append(data[offset + name_offset:offset + size].split(b'\0')[0].decode())
        if command == 0x80000022:
            export_offset, export_size = struct.unpack_from('<II',data,offset+40)
            if export_size:
                trie = data[export_offset:export_offset+export_size]
        if command == 0x80000033:
            export_offset, export_size = struct.unpack_from('<II',data,offset+8)
            trie = data[export_offset:export_offset+export_size]
        offset += size
    exports = []
    def uleb(position):
        value, shift = 0, 0
        while True:
            byte = trie[position]; position += 1
            value |= (byte & 0x7f) << shift
            if not byte & 0x80:
                return value, position
            shift += 7
    def visit(position,prefix):
        terminal, at = uleb(position)
        if terminal:
            exports.append(prefix)
        at += terminal
        count = trie[at]; at += 1
        for _ in range(count):
            end = trie.index(0,at)
            edge = trie[at:end].decode(); at = end + 1
            child, at = uleb(at)
            visit(child,prefix+edge)
    if trie:
        visit(0,'')
    return cpu, symbols, libraries, exports

expected = {
    'WS12WineSikarugir11.0_1.tar.xz':'67e29fb3d74f363af39c69ba11f9b13a79812c5db07cf4748672658e4a200a0e',
    'wine-devel-11.18-osx64.tar.xz':'aa0ea4c82e636ae7bca2076387cb0a5affa26509ad13f119ecd0d62bd7ba6f82',
    'dxmt-v0.80-builtin.tar.gz':'8f260e36b5739e68f3bad613381441385c4dc7b85b78ba8de653d5a6a264529d',
    'node-v22.23.3-darwin-arm64.tar.gz':'23b25245dcfb9af7262f8ff142e9e2e0af025368117329e7a7458a51e5922f53',
}
report = {'macExecutionVerified':False, 'archives':{}}
for name, digest in expected.items():
    file = vendor / name
    with file.open('rb') as stream:
        assert hashlib.file_digest(stream, 'sha256').hexdigest() == digest, name
    with tarfile.open(file) as archive:
        entries = archive.getmembers()
        folder = entries[0].name.rstrip('/')
        for entry in entries:
            assert entry.name == folder or entry.name.startswith(folder + '/')
            assert '..' not in entry.name.split('/') and not entry.name.startswith('/')
            if entry.issym() or entry.islnk():
                target = posixpath.normpath(posixpath.join(posixpath.dirname(entry.name),entry.linkname)) if entry.issym() else entry.linkname
                assert target == folder or target.startswith(folder + '/'), (entry.name,entry.linkname)
        report['archives'][name] = {'sha256':digest,'entries':len(entries),'expandedBytes':sum(e.size for e in entries),'linksStayInsideArchive':True}
        if name.startswith('wine-') or name.startswith('WS12'):
            base = folder if name.startswith('WS12') else folder + '/Contents/Resources/wine'
            winemac = archive.extractfile(base + '/lib/wine/x86_64-unix/winemac.so').read()
            cpu, symbols, libraries, exports = macho(winemac)
            assert cpu == 0x01000007
            key = 'candidateMacDriver' if name.startswith('WS12') else 'rejectedMacDriver'
            report[key] = {'cpu':'x86_64','libraries':libraries,'exportCount':len(exports),'metalRelatedExports':[n for n in exports if any(s in n.lower() for s in ['metal','vulkan','window','surface','macdrv_functions'])]}
            if name.startswith('WS12'):
                report['candidateVersionFile'] = archive.extractfile(folder + '/version').read().decode()
                report['candidateGraphicsFiles'] = [e.name for e in entries if any(s in e.name.lower() for s in ['d3dmetal','dxmt','gstreamer'])][:25]
                report['candidateDXMTExportsPresent'] = '_macdrv_functions' in exports or all('_' + n in exports for n in ['get_win_data','release_win_data','macdrv_view_create_metal_view','macdrv_view_get_metal_layer','macdrv_view_release_metal_view'])
            report['wineBinaries'] = [e.name for e in entries if e.name.endswith(('/bin/wine','/bin/wine64','/bin/wineserver'))]
        if name.startswith('dxmt-'):
            cpu, symbols, libraries, exports = macho(archive.extractfile(folder + '/x86_64-unix/winemetal.so').read())
            assert cpu == 0x01000007
            report['dxmtMetal'] = {'cpu':'x86_64','libraries':libraries,'wineRelatedImports':[n for n,k in symbols if k & 0xe == 0 and any(s in n.lower() for s in ['macdrv','wine_get','metal_device'])]}
        if name.startswith('node-'):
            cpu, _, libraries, _ = macho(archive.extractfile(folder + '/bin/node').read())
            assert cpu == 0x0100000c
            report['node'] = {'cpu':'arm64','libraries':libraries}

output = root / 'VENDOR_DOGRULAMA.json'
output.write_text(json.dumps(report,ensure_ascii=False,indent=2) + '\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
