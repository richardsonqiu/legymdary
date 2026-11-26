/**
 * Server-only. Builds the import template as a real .xlsx (Excel, Google
 * Sheets and Numbers open it) without any spreadsheet library: a few XML
 * parts zipped with Node's zlib. Every cell is written as an inline string or
 * a number, never a formula.
 */
import { crc32, deflateRawSync } from "node:zlib";
import { ACTIVITY_TYPES, CARDIO_COLUMNS, SET_COLUMNS } from "@/lib/sheet-import/format";
import { MUSCLE_GROUPS } from "@legymdary/shared";

type XCell = string | number | { v: string | number; s: number } | null;

const esc = (s: string) =>
  s
     
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const colName = (i: number) => {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

// Style ids (see STYLES below).
const S = { header: 1, date: 2, time: 3, wrap: 4, title: 5, muted: 6 } as const;

function cellXml(c: XCell, ref: string): string {
  if (c == null || c === "") return "";
  const v = typeof c === "object" ? c.v : c;
  const s = typeof c === "object" ? ` s="${c.s}"` : "";
  if (typeof v === "number") return `<c r="${ref}"${s}><v>${v}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
}

type SheetSpec = {
  name: string;
  rows: XCell[][];
  widths: number[];
  /** Column index → style for the empty input rows below the header. */
  colStyles?: Record<number, number>;
  freezeHeader?: boolean;
  validations?: { col: number; formula: string }[];
  /** Data rows to pre-format (for date / time columns). */
  inputRows?: number;
};

function sheetXml(spec: SheetSpec): string {
  const cols = spec.widths
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"${spec.colStyles?.[i] != null ? ` style="${spec.colStyles[i]}"` : ""}/>`)
    .join("");
  const rows = spec.rows
    .map((r, ri) => `<row r="${ri + 1}">${r.map((c, ci) => cellXml(c, `${colName(ci)}${ri + 1}`)).join("")}</row>`)
    .join("");
  const pane = spec.freezeHeader
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : `<sheetViews><sheetView workbookViewId="0"/></sheetViews>`;
  const last = (spec.inputRows ?? 0) + 1;
  const dv = spec.validations?.length
    ? `<dataValidations count="${spec.validations.length}">${spec.validations
        .map(
          (v) =>
            // showErrorMessage="0": the list is a suggestion, other values are allowed.
            `<dataValidation type="list" allowBlank="1" showInputMessage="0" showErrorMessage="0" sqref="${colName(v.col)}2:${colName(v.col)}${last}"><formula1>${esc(v.formula)}</formula1></dataValidation>`,
        )
        .join("")}</dataValidations>`
    : "";
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `${pane}<sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols><sheetData>${rows}</sheetData>${dv}</worksheet>`
  );
}

const STYLES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/><numFmt numFmtId="165" formatCode="hh:mm"/></numFmts>` +
  `<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font><font><sz val="10"/><color rgb="FF6B7280"/><name val="Calibri"/></font></fonts>` +
  `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0F766E"/><bgColor indexed="64"/></patternFill></fill></fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="7">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>` +
  `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>` +
  `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
  `<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
  `</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

/** Excel serial for a YYYY-MM-DD date. */
const serial = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000 + 25569;

function zip(files: { name: string; data: string }[]): Buffer {
  const enc = new TextEncoder();
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const raw = Buffer.from(enc.encode(f.data));
    const comp = deflateRawSync(raw);
    const name = Buffer.from(f.name, "utf8");
    const crc = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(0x00210000, 10); // fixed time/date (1980-01-01)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, comp);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt32LE(0x00210000, 12);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(comp.length, 20);
    cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, name);
    offset += 30 + name.length + comp.length;
  }
  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cdBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cdBuf, end]);
}

/**
 * The template workbook. `exercises` (the user's library) fills the Lists
 * sheet that the Exercise column's dropdown points at; `today` dates the example.
 */
export function buildTemplate(exercises: { name: string; muscleGroup: string }[], today: string): Buffer {
  const INPUT = 1000;
  const exList = exercises.slice(0, 2000);
  const muscles = [...MUSCLE_GROUPS, "Other"];

  const workouts: SheetSpec = {
    name: "Workouts",
    rows: [SET_COLUMNS.map((h) => ({ v: h, s: S.header }))],
    widths: [13, 22, 30, 15, 6, 12, 7, 9, 30],
    colStyles: { 0: S.date },
    freezeHeader: true,
    inputRows: INPUT,
    validations: [
      { col: 2, formula: `Lists!$A$2:$A$${Math.max(2, exList.length + 1)}` },
      { col: 3, formula: `Lists!$E$2:$E$${muscles.length + 1}` },
      { col: 7, formula: `"Yes,No"` },
    ],
  };
  const cardio: SheetSpec = {
    name: "Cardio",
    rows: [CARDIO_COLUMNS.map((h) => ({ v: h, s: S.header }))],
    widths: [13, 11, 20, 26, 15, 14, 10, 15],
    colStyles: { 0: S.date, 1: S.time },
    freezeHeader: true,
    inputRows: INPUT,
    validations: [{ col: 2, formula: `Lists!$D$2:$D$${ACTIVITY_TYPES.length + 1}` }],
  };

  const d = serial(today);
  const ex = (date: number, w: string, e: string, m: string, set: number, kg: number | null, reps: number, warm: string, note = ""): XCell[] => [
    { v: date, s: S.date }, w, e, m, set, kg, reps, warm, note,
  ];
  const example: SheetSpec = {
    name: "Example",
    rows: [
      [{ v: "A filled-in example. Copy rows like these into the Workouts and Cardio sheets.", s: S.title }],
      [],
      SET_COLUMNS.map((h) => ({ v: h, s: S.header })),
      ex(d - 2, "Push day", "Barbell Bench Press", "Chest", 1, 40, 10, "Yes", "Empty bar warm-up"),
      ex(d - 2, "Push day", "Barbell Bench Press", "Chest", 2, 60, 8, "No"),
      ex(d - 2, "Push day", "Barbell Bench Press", "Chest", 3, 60, 7, "No"),
      ex(d - 2, "Push day", "Overhead Press", "Shoulders", 1, 35, 8, "No"),
      ex(d - 2, "Push day", "Push-Up", "Chest", 1, null, 15, "No", "Bodyweight: leave weight blank"),
      ex(d, "Legs", "Barbell Back Squat", "Quads", 1, 80, 5, "No"),
      [],
      CARDIO_COLUMNS.map((h) => ({ v: h, s: S.header })),
      [{ v: d - 1, s: S.date }, { v: 7.5 / 24, s: S.time }, "Running", "Morning run", 32, 5.2, 340, 152],
      [{ v: d, s: S.date }, null, "Cycling", "", 45, 18, null, null],
    ],
    widths: [13, 22, 30, 15, 15, 14, 10, 15, 30],
  };

  const help: [string, string][] = [
    ["Workouts sheet", "One row per set. Rows with the same Date and Workout become one session, in the order you list them."],
    ["Date", "Required. Type it as 2026-11-20 (or 20/11/2026, day first)."],
    ["Workout", "The session name, e.g. Push day. Leave blank for \"Imported workout\"."],
    ["Exercise", "Required. Pick from the list or type your own. New names are added to your exercises."],
    ["Muscle group", "Only used for new exercises. Blank means Other."],
    ["Set", "Optional. Set number, used to order the sets."],
    ["Weight (kg)", "Leave blank for bodyweight. Rename the column to Weight (lb) to type pounds."],
    ["Reps", "Required. A whole number."],
    ["Warm-up", "Yes for warm-up sets (they don't count toward volume or PRs)."],
    ["Notes", "Optional, up to 200 characters."],
    ["", ""],
    ["Cardio sheet", "One row per activity: runs, rides, swims, classes."],
    ["Date / Activity / Duration (min)", "Required. Duration in minutes (45) or as 0:45:00."],
    ["Start time, Name, Distance (km), Calories, Avg heart rate", "Optional."],
    ["", ""],
    ["Importing", "In the app open Connections, then Import file, and pick this file (.xlsx or .csv). You see a preview first, and can undo an import afterwards."],
    ["Duplicates", "A workout with the same date and name as one already in your log is skipped, so importing the same file twice is safe."],
    ["Limits", "Up to 5,000 sets and 2,000 activities per file, 5 MB at most."],
  ];
  const howTo: SheetSpec = {
    name: "How to fill",
    rows: [[{ v: "How to fill in this template", s: S.title }], [], ...help.map(([a, b]) => [a ? { v: a, s: S.wrap } : null, b ? { v: b, s: S.wrap } : null])],
    widths: [34, 90],
  };

  const listRows = Math.max(exList.length, ACTIVITY_TYPES.length, muscles.length);
  const lists: SheetSpec = {
    name: "Lists",
    rows: [
      [{ v: "Exercises in your library", s: S.header }, { v: "Muscle group", s: S.header }, null, { v: "Activities", s: S.header }, { v: "Muscle groups", s: S.header }],
      ...Array.from({ length: listRows }, (_, i) => [
        exList[i]?.name ?? null,
        exList[i]?.muscleGroup ?? null,
        null,
        ACTIVITY_TYPES[i]?.label ?? null,
        muscles[i] ?? null,
      ]),
    ],
    widths: [34, 16, 3, 20, 16],
    freezeHeader: true,
  };

  const sheets = [workouts, cardio, howTo, example, lists];
  const files = [
    {
      name: "[Content_Types].xml",
      data:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
        `</Types>`,
    },
    {
      name: "_rels/.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      data:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<bookViews><workbookView activeTab="0"/></bookViews><sheets>` +
        sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
        `</sheets></workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
        `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    { name: "xl/styles.xml", data: STYLES },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) })),
  ];
  return zip(files);
}

/** CSV templates (one per sheet) for people who prefer CSV. */
export function csvTemplate(kind: "workouts" | "cardio"): string {
  return "﻿" + (kind === "workouts" ? SET_COLUMNS : CARDIO_COLUMNS).join(",") + "\r\n";
}
