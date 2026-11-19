/**
 * Browser-only. Streams the text of `export.xml` from what the user picked:
 * the `export.zip` the Health app makes, or an already-unzipped export.xml.
 *
 * Zip entries are located through the central directory (iPhone exports use
 * data descriptors, so local headers alone don't carry sizes), then inflated
 * with the built-in DecompressionStream — nothing is loaded into memory whole.
 */

export class ExportFileError extends Error {}

const u16 = (v: DataView, o: number) => v.getUint16(o, true);
const u32 = (v: DataView, o: number) => v.getUint32(o, true);
const u64 = (v: DataView, o: number) => Number(v.getBigUint64(o, true));

async function bytes(file: Blob, start: number, end: number): Promise<DataView> {
  return new DataView(await file.slice(start, end).arrayBuffer());
}

type Entry = { name: string; method: number; compSize: number; offset: number };

async function findExportEntry(file: File): Promise<Entry> {
  const tailLen = Math.min(file.size, 65_557);
  const tail = await bytes(file, file.size - tailLen, file.size);
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (u32(tail, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ExportFileError("This zip file looks damaged. Try exporting again.");
  let cdSize = u32(tail, eocd + 12);
  let cdOffset = u32(tail, eocd + 16);
  if (cdOffset === 0xffffffff || cdSize === 0xffffffff) {
    // Zip64: the locator sits just before the end-of-central-directory record.
    const loc = eocd - 20;
    if (loc < 0 || u32(tail, loc) !== 0x07064b50) throw new ExportFileError("Unsupported zip format.");
    const z64At = u64(tail, loc + 8);
    const z64 = await bytes(file, z64At, z64At + 56);
    cdSize = u64(z64, 40);
    cdOffset = u64(z64, 48);
  }
  const cd = await bytes(file, cdOffset, cdOffset + cdSize);
  const dec = new TextDecoder();
  for (let p = 0; p + 46 <= cd.byteLength && u32(cd, p) === 0x02014b50; ) {
    const method = u16(cd, p + 10);
    let compSize = u32(cd, p + 20);
    const uncompSize = u32(cd, p + 24);
    const nameLen = u16(cd, p + 28);
    const extraLen = u16(cd, p + 30);
    const commentLen = u16(cd, p + 32);
    let offset = u32(cd, p + 42);
    const name = dec.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen));
    // Zip64 extended info: 64-bit values replace the 0xFFFFFFFF placeholders, in order.
    let e = p + 46 + nameLen;
    const extraEnd = e + extraLen;
    while (e + 4 <= extraEnd) {
      const id = u16(cd, e);
      const size = u16(cd, e + 2);
      if (id === 0x0001) {
        let q = e + 4;
        if (uncompSize === 0xffffffff) q += 8;
        if (compSize === 0xffffffff) {
          compSize = u64(cd, q);
          q += 8;
        }
        if (offset === 0xffffffff) offset = u64(cd, q);
      }
      e += 4 + size;
    }
    // Some Windows zip tools write "\" as the folder separator.
    if (/(^|[/\\])export\.xml$/.test(name)) return { name, method, compSize, offset };
    p = extraEnd + commentLen;
  }
  throw new ExportFileError("No export.xml inside this zip. Pick the export.zip the Health app made.");
}

// DOM typings declare TextDecoderStream's input as BufferSource; Uint8Array chunks are fine.
const textDecoder = () => new TextDecoderStream() as unknown as TransformStream<Uint8Array, string>;

/** A progress-reporting pass-through counting bytes of the file read so far. */
function counter(onBytes: (n: number) => void) {
  let n = 0;
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, ctl) {
      n += chunk.byteLength;
      onBytes(n);
      ctl.enqueue(chunk);
    },
  });
}

/**
 * Returns a reader of export.xml text plus the number of file bytes it will
 * read (for a progress bar). `onBytes` reports bytes of the picked file consumed.
 */
export async function openExport(
  file: File,
  onBytes: (n: number) => void,
): Promise<{ total: number; reader: ReadableStreamDefaultReader<string> }> {
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const isZip = head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
  if (!isZip) {
    const start = new TextDecoder().decode(await file.slice(0, 2000).arrayBuffer());
    if (!start.includes("<HealthData") && !start.includes("<?xml")) {
      throw new ExportFileError("That isn't an Apple Health export. Pick export.zip (or export.xml).");
    }
    const reader = file
      .stream()
      .pipeThrough(counter(onBytes))
      .pipeThrough(textDecoder())
      .getReader();
    return { total: file.size, reader };
  }

  if (typeof DecompressionStream === "undefined") {
    throw new ExportFileError("This browser can't open zip files. Unzip it first and pick export.xml, or update your browser.");
  }
  const entry = await findExportEntry(file);
  const local = await bytes(file, entry.offset, entry.offset + 30);
  if (u32(local, 0) !== 0x04034b50) throw new ExportFileError("This zip file looks damaged. Try exporting again.");
  const dataStart = entry.offset + 30 + u16(local, 26) + u16(local, 28);
  let stream: ReadableStream<Uint8Array> = file
    .slice(dataStart, dataStart + entry.compSize)
    .stream()
    .pipeThrough(counter(onBytes));
  if (entry.method === 8) {
    stream = stream.pipeThrough(new DecompressionStream("deflate-raw") as unknown as TransformStream<Uint8Array, Uint8Array>);
  } else if (entry.method !== 0) {
    throw new ExportFileError("Unsupported zip compression. Unzip it first and pick export.xml.");
  }
  return { total: entry.compSize, reader: stream.pipeThrough(textDecoder()).getReader() };
}
