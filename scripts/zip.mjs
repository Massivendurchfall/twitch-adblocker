// Packs the extension into twitch-adblocker-<version>.zip with manifest.json
// at the top, ready for "Load unpacked" after extracting or for a store upload.
// Leaves out tests, scripts and node_modules. Run: npm run zip
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INCLUDE = ['manifest.json', '_locales', 'icons', 'options', 'popup', 'rules', 'src', 'ui'];
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const out = path.join(root, `twitch-adblocker-${version}.zip`);

function walk(rel) {
  const abs = path.join(root, rel);
  if (!fs.statSync(abs).isDirectory()) return [rel];
  return fs.readdirSync(abs).sort().flatMap((name) => walk(path.join(rel, name)));
}

// Minimal zip writer: deflated entries, forward slashes, fixed timestamp.
const locals = [];
const centrals = [];
let offset = 0;
for (const rel of INCLUDE.flatMap(walk)) {
  const name = Buffer.from(rel.split(path.sep).join('/'));
  const data = fs.readFileSync(path.join(root, rel));
  const packed = zlib.deflateRawSync(data, { level: 9 });
  const crc = zlib.crc32(data);
  const fields = (head) => {
    head.writeUInt16LE(20, 0); // version needed
    head.writeUInt16LE(0x0800, 2); // UTF-8 names
    head.writeUInt16LE(8, 4); // deflate
    head.writeUInt16LE(0, 6); // time 00:00
    head.writeUInt16LE((2026 - 1980) << 9 | 1 << 5 | 1, 8); // date 2026-01-01
    head.writeUInt32LE(crc, 10);
    head.writeUInt32LE(packed.length, 14);
    head.writeUInt32LE(data.length, 18);
    head.writeUInt16LE(name.length, 22);
  };
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  fields(local.subarray(4));
  locals.push(local, name, packed);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4); // made by
  fields(central.subarray(6));
  central.writeUInt32LE(offset, 42);
  centrals.push(central, name);
  offset += local.length + name.length + packed.length;
}
const centralSize = centrals.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(centrals.length / 2, 8);
end.writeUInt16LE(centrals.length / 2, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);

fs.writeFileSync(out, Buffer.concat([...locals, ...centrals, end]));
console.log(`Wrote ${path.basename(out)} (${centrals.length / 2} files)`);
