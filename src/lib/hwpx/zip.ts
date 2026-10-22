// Plan 작업 15: .hwpx는 압축 묶음(zip) 파일이다. 새 패키지 없이 쓰려고, 압축하지 않고 담기만 하는 아주 작은 zip 만들기를 직접 둔다.
// 한글 규칙: 첫 파일은 mimetype이고 압축하지 않는다. 모든 파일을 "저장만(stored)" 하므로 규칙을 그대로 지킨다.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export type ZipEntry = { name: string; data: string | Uint8Array };

// 고정 시각(1980-01-01): 같은 내용이면 같은 파일이 나오게 한다.
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

/** 파일들을 주어진 순서대로 zip(저장만)으로 묶는다. */
export function buildZip(entries: readonly ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  const push = (chunk: Uint8Array) => {
    chunks.push(chunk);
    offset += chunk.length;
  };

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = typeof entry.data === "string" ? encoder.encode(entry.data) : entry.data;
    const crc = crc32(data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // 이름이 UTF-8
    local.setUint16(8, 0, true); // 저장만
    local.setUint16(10, DOS_TIME, true);
    local.setUint16(12, DOS_DATE, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);

    const headerOffset = offset;
    push(new Uint8Array(local.buffer));
    push(name);
    push(data);

    const entryHeader = new DataView(new ArrayBuffer(46));
    entryHeader.setUint32(0, 0x02014b50, true);
    entryHeader.setUint16(4, 20, true);
    entryHeader.setUint16(6, 20, true);
    entryHeader.setUint16(8, 0x0800, true);
    entryHeader.setUint16(10, 0, true);
    entryHeader.setUint16(12, DOS_TIME, true);
    entryHeader.setUint16(14, DOS_DATE, true);
    entryHeader.setUint32(16, crc, true);
    entryHeader.setUint32(20, data.length, true);
    entryHeader.setUint32(24, data.length, true);
    entryHeader.setUint16(28, name.length, true);
    entryHeader.setUint32(42, headerOffset, true);
    central.push(new Uint8Array(entryHeader.buffer), name);
  }

  const centralStart = offset;
  for (const chunk of central) push(chunk);
  const centralSize = offset - centralStart;

  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, centralStart, true);
  push(new Uint8Array(end.buffer));

  const out = new Uint8Array(offset);
  let position = 0;
  for (const chunk of chunks) {
    out.set(chunk, position);
    position += chunk.length;
  }
  return out;
}
