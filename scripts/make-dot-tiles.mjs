/**
 * 도트 텍스처 타일 생성기 (일회용).
 *
 * 디자인의 배경 질감은 1px 흰 점을 N px 간격으로 반복한 것이다(ASSET_MANIFEST).
 * RN에서는 `ImageBackground resizeMode="repeat"`로 까는 것이 가장 싸고, 그러려면
 * 타일 PNG가 필요하다. 이미지 라이브러리를 새로 넣지 않으려고 zlib만으로 쓴다 —
 * 알파를 파일에 구워 두므로 런타임에서 opacity를 만질 일도 없다.
 *
 *   node scripts/make-dot-tiles.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const TILES = [
  { name: 'dot-17', tile: 17, alpha: 0.075 },
  { name: 'dot-13', tile: 13, alpha: 0.05 },
  { name: 'dot-22', tile: 22, alpha: 0.045 },
];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** size × size RGBA. 좌상단에 dot × dot 크기의 흰 점 하나, 나머지는 투명. */
function tilePng(size, dot, alpha) {
  const a = Math.round(alpha * 255);
  const raw = Buffer.alloc(size * (size * 4 + 1)); // 행마다 필터 바이트 1

  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filter: None
    if (y >= dot) continue;
    for (let x = 0; x < dot; x += 1) {
      const p = rowStart + 1 + x * 4;
      raw[p] = 255;
      raw[p + 1] = 255;
      raw[p + 2] = 255;
      raw[p + 3] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  // 10~12: compression / filter / interlace = 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const { name, tile, alpha } of TILES) {
  for (const scale of [1, 2, 3]) {
    const suffix = scale === 1 ? '' : `@${scale}x`;
    const path = `assets/images/${name}${suffix}.png`;
    writeFileSync(path, tilePng(tile * scale, scale, alpha));
    console.log(`${path}  ${tile * scale}×${tile * scale}, dot ${scale}px, alpha ${alpha}`);
  }
}
