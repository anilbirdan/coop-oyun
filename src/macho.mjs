// Read the Mach-O export trie. No native library is loaded or executed.
export function exportedSymbols(bytes) {
  if (bytes.length < 32 || bytes.readUInt32LE(0) !== 0xfeedfacf) throw new Error('Mac grafik sürücüsü Mach-O 64 bit biçiminde değil.');
  let at = 32; let trie;
  const commands = bytes.readUInt32LE(16);
  if (commands > 4096) throw new Error('Mac dosyasının komut tablosu geçersiz.');
  for (let i = 0; i < commands; i++) {
    if (at + 8 > bytes.length) throw new Error('Mac dosyası eksik.');
    const command = bytes.readUInt32LE(at); const size = bytes.readUInt32LE(at + 4);
    if (size < 8 || at + size > bytes.length) throw new Error('Mac dosyasının komut boyutu geçersiz.');
    let offset; let length;
    if (command === 0x80000022 && size >= 48) {offset = bytes.readUInt32LE(at + 40); length = bytes.readUInt32LE(at + 44);}
    if (command === 0x80000033 && size >= 16) {offset = bytes.readUInt32LE(at + 8); length = bytes.readUInt32LE(at + 12);}
    if (length) {if (offset + length > bytes.length) throw new Error('Mac dışa aktarma tablosu eksik.'); trie = bytes.subarray(offset, offset + length);}
    at += size;
  }
  if (!trie) return [];
  const result = []; const visited = new Set();
  function uleb(position) {
    let value = 0; let multiplier = 1;
    for (let i = 0; i < 8; i++) {
      if (position >= trie.length) throw new Error('Mac simge tablosu eksik.');
      const byte = trie[position++]; value += (byte & 0x7f) * multiplier;
      if (!Number.isSafeInteger(value)) throw new Error('Mac simge tablosu taşması.');
      if (!(byte & 0x80)) return [value, position];
      multiplier *= 128;
    }
    throw new Error('Mac simge tablosu geçersiz.');
  }
  function visit(position, prefix, depth) {
    if (depth > 256 || visited.has(position) || result.length > 50000) throw new Error('Mac simge ağacı geçersiz.');
    visited.add(position);
    let [terminal, next] = uleb(position);
    if (terminal) result.push(prefix);
    next += terminal;
    if (next >= trie.length) throw new Error('Mac simge ağacı eksik.');
    const count = trie[next++];
    for (let i = 0; i < count; i++) {
      const end = trie.indexOf(0, next);
      if (end < 0) throw new Error('Mac simge adı eksik.');
      const edge = trie.toString('utf8', next, end); let child;
      [child, next] = uleb(end + 1); visit(child, prefix + edge, depth + 1);
    }
  }
  visit(0, '', 0); return result;
}
export function supportsDXMT(bytes) {
  const exports = exportedSymbols(bytes);
  return exports.includes('_macdrv_functions') || ['_get_win_data', '_release_win_data', '_macdrv_view_create_metal_view', '_macdrv_view_get_metal_layer', '_macdrv_view_release_metal_view'].every(name => exports.includes(name));
}
