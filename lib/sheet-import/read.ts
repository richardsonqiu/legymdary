/**
 * Reads a spreadsheet the user picked into plain rows of cells, in the browser
 * (also runs in Node for tests). Supports .xlsx (Excel, Google Sheets and
 * Numbers exports) and .csv.
 *
 * Safety:
 * - files over 5 MB are refused before reading;
 * - each zipped part is inflated with a hard byte cap (no zip bombs);
 * - XML is read with small regular expressions, never an XML parser, so DTDs
 *   and entities in a crafted file can't expand or fetch anything;
 * - formulas are never evaluated: only the value Excel saved is used.
 */

import { LIMITS, type Cell, type Sheet } from "@/lib/sheet-import/format";

export class SheetFileError extends Error {}

export type Workbook = { sheets: Sheet[]; date1904: boolean };

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

type ZipEntry = { name: string; method: number; compSize: number; size: number; offset: number };

function zipEntries(buf: Uint8Array): Map<string, ZipEntry> {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (u32(buf, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new SheetFileError("This file looks damaged. Save it again as .xlsx and retry.");
  const count = u16(buf, eocd + 10);
  let p = u32(buf, eocd + 16);
  const dec = new TextDecoder();
  const out = new Map<string, ZipEntry>();
  for (let n = 0; n < count && n < 2000; n++) {
    if (p + 46 > buf.length || u32(buf, p) !== 0x02014b50) throw new SheetFileError("This file looks damaged. Save it again as .xlsx and retry.");
    const method = u16(buf, p + 10);
    const compSize = u32(buf, p + 20);
    const size = u32(buf, p + 24);
    const nameLen = u16(buf, p + 28);
    const extraLen = u16(buf, p + 30);
    const commentLen = u16(buf, p + 32);
    const offset = u32(buf, p + 42);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen)).replace(/\\/g, "/").replace(/^\//, "");
    out.set(name, { name, method, compSize, size, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function inflate(data: Uint8Array, cap: number): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new SheetFileError("This browser can't open .xlsx files. Update it, or save the sheet as .csv.");
  }
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw") as unknown as TransformStream<Uint8Array, Uint8Array>);
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel();
      throw new SheetFileError("This spreadsheet is too large to import. Split it into smaller files.");
    }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const part of parts) {
    out.set(part, o);
    o += part.byteLength;
  }
  return out;
}

async function readPart(buf: Uint8Array, entries: Map<string, ZipEntry>, name: string): Promise<string | null> {
  const e = entries.get(name);
  if (!e) return null;
  if (e.size > LIMITS.partBytes) throw new SheetFileError("This spreadsheet is too large to import. Split it into smaller files.");
  if (e.offset + 30 > buf.length || u32(buf, e.offset) !== 0x04034b50) throw new SheetFileError("This file looks damaged. Save it again as .xlsx and retry.");
  const start = e.offset + 30 + u16(buf, e.offset + 26) + u16(buf, e.offset + 28);
  const data = buf.subarray(start, start + e.compSize);
  let bytes: Uint8Array;
  if (e.method === 0) bytes = data;
  else if (e.method === 8) bytes = await inflate(data, LIMITS.partBytes);
  else throw new SheetFileError("This .xlsx uses a compression this app can't read. Save it again from Excel or Google Sheets.");
  return new TextDecoder().decode(bytes);
}

/* ------------------------------------------------------------------ */
/* Tiny XML helpers (regex, no entity expansion beyond the 5 + numeric) */
/* ------------------------------------------------------------------ */

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function unescapeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    }
    return ENT[e.toLowerCase()] ?? "";
  });
}
const attr = (tag: string, name: string) => {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`)) ?? tag.match(new RegExp(`\\s${name}\\s*=\\s*'([^']*)'`));
  return m ? unescapeXml(m[1]) : null;
};
/** Text of every <t> inside a string item, skipping phonetic runs (<rPh>). */
function textOf(xml: string): string {
  const noPh = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let out = "";
  for (const m of noPh.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += m[1];
  return unescapeXml(out);
}

function colIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/i)?.[0].toUpperCase() ?? "";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const MAX_ROWS = 20_000;
const MAX_COLS = 40;

function parseSheetXml(xml: string, shared: string[]): Cell[][] {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new SheetFileError("This file contains content the app won't read. Save it again from Excel or Google Sheets.");
  const rows: Cell[][] = [];
  let nextRow = 0;
  for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rAttr = attr(rm[1], "r");
    const r = rAttr ? Number(rAttr) - 1 : nextRow;
    nextRow = r + 1;
    if (!Number.isInteger(r) || r < 0 || r >= MAX_ROWS) continue;
    const row: Cell[] = [];
    let nextCol = 0;
    for (const cm of (rm[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(cm[1], "r");
      const c = ref ? colIndex(ref) : nextCol;
      nextCol = c + 1;
      if (c < 0 || c >= MAX_COLS) continue;
      const t = attr(cm[1], "t") ?? "n";
      const inner = cm[2] ?? "";
      const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let val: Cell = null;
      if (t === "s") val = v != null ? (shared[Number(v)] ?? null) : null;
      else if (t === "inlineStr") val = textOf(inner.match(/<is>([\s\S]*?)<\/is>/)?.[1] ?? "");
      else if (t === "str" || t === "d") val = v != null ? unescapeXml(v) : null;
      else if (t === "b") val = v === "1";
      else if (t === "e") val = null;
      else if (v != null && v.trim() !== "") {
        const n = Number(v);
        val = Number.isFinite(n) ? n : null;
      }
      row[c] = val;
    }
    for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = null;
    rows[r] = row;
  }
  for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
  return rows;
}

async function readXlsx(buf: Uint8Array): Promise<Workbook> {
  const entries = zipEntries(buf);
  const workbook = await readPart(buf, entries, "xl/workbook.xml");
  if (!workbook) throw new SheetFileError("That isn't an Excel workbook. Use the template, or save your sheet as .xlsx or .csv.");
  const rels = (await readPart(buf, entries, "xl/_rels/workbook.xml.rels")) ?? "";
  const relTarget = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], "Id");
    const target = attr(m[0], "Target");
    if (id && target) relTarget.set(id, target);
  }
  const sharedXml = await readPart(buf, entries, "xl/sharedStrings.xml");
  const shared: string[] = [];
  if (sharedXml) {
    if (/<!DOCTYPE|<!ENTITY/i.test(sharedXml)) throw new SheetFileError("This file contains content the app won't read. Save it again from Excel or Google Sheets.");
    for (const m of sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]));
  }
  const date1904 = /<workbookPr\b[^>]*\sdate1904\s*=\s*"(1|true)"/i.test(workbook);
  const sheets: Sheet[] = [];
  for (const m of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    if (sheets.length >= 10) break;
    const name = attr(m[0], "name") ?? `Sheet${sheets.length + 1}`;
    const rid = attr(m[0], "r:id");
    let target = rid ? relTarget.get(rid) : undefined;
    if (!target) continue;
    target = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
    // Resolve "../" and stay inside the archive.
    const parts: string[] = [];
    for (const seg of target.split("/")) {
      if (seg === "..") parts.pop();
      else if (seg && seg !== ".") parts.push(seg);
    }
    const xml = await readPart(buf, entries, parts.join("/"));
    if (xml == null) continue;
    sheets.push({ name, rows: parseSheetXml(xml, shared) });
  }
  if (!sheets.length) throw new SheetFileError("No sheets found in this workbook.");
  return { sheets, date1904 };
}

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

export function parseCsv(text: string): Cell[][] {
  const src = text.replace(/^﻿/, "");
  const nl = src.search(/\r?\n/);
  const firstLine = nl < 0 ? src : src.slice(0, nl);
  const counts = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length] as const);
  const delim = counts.sort((a, b) => b[1] - a[1])[0][0];
  const rows: Cell[][] = [];
  let row: Cell[] = [];
  let field = "";
  let quoted = false;
  let i = 0;
  const push = () => {
    row.push(field === "" ? null : field);
    field = "";
  };
  while (i < src.length) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field === "") {
      quoted = true;
      i++;
    } else if (ch === delim) {
      push();
      i++;
    } else if (ch === "\n" || ch === "\r") {
      push();
      rows.push(row.slice(0, MAX_COLS));
      row = [];
      if (rows.length >= MAX_ROWS) return rows;
      i += ch === "\r" && src[i + 1] === "\n" ? 2 : 1;
    } else {
      field += ch;
      i++;
    }
  }
  if (field !== "" || row.length) {
    push();
    rows.push(row.slice(0, MAX_COLS));
  }
  return rows;
}

/* ------------------------------------------------------------------ */

/** Reads an .xlsx or .csv file into sheets of rows. */
export async function readSpreadsheet(file: { name: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> }): Promise<Workbook> {
  if (file.size > LIMITS.fileBytes) throw new SheetFileError("That file is over 5 MB. Split it into smaller files.");
  if (file.size === 0) throw new SheetFileError("That file is empty.");
  const buf = new Uint8Array(await file.arrayBuffer());
  const isZip = buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
  if (isZip) return readXlsx(buf);
  if (/\.(xls|numbers|ods)$/i.test(file.name)) {
    throw new SheetFileError("This app reads .xlsx and .csv files. In your spreadsheet app choose Save As (or Download) and pick .xlsx.");
  }
  const text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
   
  if (/[\u0000-\u0008\u000e-\u001f]/.test(text.slice(0, 2000))) {
    throw new SheetFileError("That isn't a spreadsheet. Pick an .xlsx or .csv file.");
  }
  return { sheets: [{ name: file.name.replace(/\.[^.]+$/, "") || "Sheet1", rows: parseCsv(text) }], date1904: false };
}
