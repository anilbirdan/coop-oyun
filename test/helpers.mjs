// Shared test data; not a test file itself.
export function fakeWrapper(marker = 'coop-wrapper') {
  const bytes = Buffer.alloc(4096); bytes.write('MZ'); bytes.writeUInt32LE(128, 0x3c); bytes.write('PE\0\0', 128); bytes.writeUInt16LE(0x8664, 132); bytes.writeUInt16LE(2, 128 + 24 + 68); bytes.write(marker, 1024);
  return bytes;
}
