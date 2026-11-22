/**
 * The spreadsheet format for importing workouts and cardio, shared by the
 * browser (preview) and the server (which re-checks everything it receives).
 *
 * Sheet "Workouts": one row per set.
 *   Date* · Workout · Exercise* · Muscle group · Set · Weight (kg) · Reps* · Warm-up · Notes
 * Sheet "Cardio": one row per activity.
 *   Date* · Start time · Activity* · Name · Duration (min)* · Distance (km) · Calories · Avg heart rate
 *
 * Headers are matched loosely (case, spaces and punctuation are ignored, and
 * common alternatives such as "Weight (lb)" or "kcal" work). Every text value is
 * cleaned (control characters removed, length capped) and every number is
 * range-checked before it gets anywhere near the database.
 */

import { MUSCLE_GROUPS } from "@/lib/utils";

export type Cell = string | number | boolean | null;
export type Sheet = { name: string; rows: Cell[][] };

export const LIMITS = {
  fileBytes: 5 * 1024 * 1024,
  /** Uncompressed size of any one part of an .xlsx (guards against zip bombs). */
  partBytes: 40 * 1024 * 1024,
  setRows: 5000,
  cardioRows: 2000,
  workoutName: 80,
  exerciseName: 80,
  muscle: 40,
  notes: 200,
  activityName: 80,
  /** New custom exercises one import may create. */
  newExercises: 100,
} as const;

export const SET_COLUMNS = ["Date", "Workout", "Exercise", "Muscle group", "Set", "Weight (kg)", "Reps", "Warm-up", "Notes"] as const;
export const CARDIO_COLUMNS = ["Date", "Start time", "Activity", "Name", "Duration (min)", "Distance (km)", "Calories", "Avg heart rate"] as const;

/** Activity choices offered in the template, with the type key the app uses (Garmin-style). */
export const ACTIVITY_TYPES: { label: string; key: string }[] = [
  { label: "Running", key: "running" },
  { label: "Treadmill running", key: "treadmill_running" },
  { label: "Walking", key: "walking" },
  { label: "Hiking", key: "hiking" },
  { label: "Cycling", key: "cycling" },
  { label: "Indoor cycling", key: "indoor_cycling" },
  { label: "Swimming", key: "lap_swimming" },
  { label: "Rowing", key: "indoor_rowing" },
  { label: "Elliptical", key: "elliptical" },
  { label: "Stair climbing", key: "stair_climbing" },
  { label: "HIIT", key: "hiit" },
  { label: "Yoga", key: "yoga" },
  { label: "Pilates", key: "pilates" },
  { label: "Strength training", key: "strength_training" },
  { label: "Boxing", key: "boxing" },
  { label: "Tennis", key: "tennis" },
  { label: "Badminton", key: "badminton" },
  { label: "Football", key: "soccer" },
  { label: "Basketball", key: "basketball" },
  { label: "Other", key: "other" },
];

/* ------------------------------------------------------------------ */
/* Cleaning                                                            */
/* ------------------------------------------------------------------ */

// C0/C1 control characters, zero-width and bidi-override characters.
 
const UNSAFE = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g;

/** Plain, single-line text: control characters removed, spaces collapsed, length capped. */
export function cleanText(v: unknown, max: number): string {
  if (v == null || typeof v === "object") return "";
  return String(v).normalize("NFC").replace(UNSAFE, " ").replace(/\s+/g, " ").trim().slice(0, max).trim();
}

const headerKey = (v: unknown) => cleanText(v, 60).toLowerCase().replace(/[^a-z0-9]/g, "");
/** Key for matching exercise names: "Push-up" = "push up" = "PUSH UP". */
export const exerciseKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

/* ------------------------------------------------------------------ */
/* Values                                                              */
/* ------------------------------------------------------------------ */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n: number) => String(n).padStart(2, "0");

function ymd(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** True for a real calendar date written YYYY-MM-DD. */
export function isRealDate(s: unknown): s is string {
  if (typeof s !== "string" || !DATE_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  return ymd(y, m, d) === s;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * A date from a cell: an Excel date number, or text like 2026-11-20,
 * 20/11/2026 (day first), 20 Nov 2026 or Nov 20, 2026.
 */
export function parseDate(v: Cell, date1904 = false): string | null {
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v < 1 || v > 2958465) return null;
    // Excel day 25569 (1900 system) / 24107 (1904 system) is 1970-01-01.
    const ms = (Math.floor(v) - (date1904 ? 24107 : 25569)) * 86_400_000;
    const d = new Date(ms);
    return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = cleanText(v, 40);
  if (!s) return null;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return ymd(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})\s+([a-z]{3})[a-z]*\.?,?\s+(\d{4})$/i);
  if (m && MONTHS.includes(m[2].toLowerCase())) return ymd(+m[3], MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[1]);
  m = s.match(/^([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/i);
  if (m && MONTHS.includes(m[1].toLowerCase())) return ymd(+m[3], MONTHS.indexOf(m[1].toLowerCase()) + 1, +m[2]);
  return null;
}

/** A number from a cell: 60, "60", "60.5", "60,5", "60 kg". Null when blank, NaN when not a number. */
export function parseNumber(v: Cell): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  if (typeof v === "boolean") return NaN;
  const s = cleanText(v, 40).toLowerCase().replace(/\s*(kg|kgs|lb|lbs|km|kcal|cal|bpm|min|mins|minutes|reps?)$/, "");
  if (!s) return null;
  if (!/^-?\d+([.,]\d+)?$/.test(s)) return NaN;
  return Number(s.replace(",", "."));
}

/** Minutes from 45, "45", "0:45:00", "45:30" (mm:ss) or an Excel time (fraction of a day). */
export function parseMinutes(v: Cell): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v > 0 && v < 1 ? v * 1440 : v;
  const s = cleanText(v, 20);
  let m = s.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (m) return +m[1] * 60 + +m[2] + +m[3] / 60;
  m = s.match(/^(\d{1,3}):(\d{2})$/);
  if (m) return +m[1] + +m[2] / 60;
  const n = parseNumber(s);
  return n;
}

/** "HH:MM" from "7:05", "07:05:00", "7:05 pm" or an Excel time. */
export function parseClock(v: Cell): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const frac = v - Math.floor(v);
    if (!(frac >= 0 && frac < 1)) return null;
    const mins = Math.round(frac * 1440) % 1440;
    return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
  }
  const m = cleanText(v, 20).toLowerCase().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/);
  if (!m) return null;
  let h = +m[1];
  const min = +m[2];
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (m[3] === "pm" ? 12 : 0);
  }
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}

function parseBool(v: Cell): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1;
  return /^(y|yes|true|1|x|✓|warm ?-?up|w)$/i.test(cleanText(v, 20));
}

export function muscleGroupFor(v: Cell): string {
  const s = cleanText(v, LIMITS.muscle).toLowerCase();
  return MUSCLE_GROUPS.find((g) => g.toLowerCase() === s) ?? "Other";
}

export function activityTypeFor(v: Cell): string | null {
  const s = cleanText(v, 60);
  if (!s) return null;
  const k = headerKey(s);
  const hit = ACTIVITY_TYPES.find((t) => headerKey(t.label) === k || headerKey(t.key) === k);
  if (hit) return hit.key;
  const alias: Record<string, string> = { run: "running", walk: "walking", bike: "cycling", ride: "cycling", swim: "lap_swimming", row: "indoor_rowing", gym: "strength_training", weights: "strength_training", spin: "indoor_cycling" };
  if (alias[k]) return alias[k];
  const snake = s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
  return snake || null;
}

export const activityLabel = (key: string) =>
  ACTIVITY_TYPES.find((t) => t.key === key)?.label ?? key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/* ------------------------------------------------------------------ */
/* Headers                                                             */
/* ------------------------------------------------------------------ */

const SET_ALIASES: Record<string, string[]> = {
  date: ["date", "day", "workoutdate"],
  workout: ["workout", "session", "workoutname", "sessionname", "routine"],
  exercise: ["exercise", "exercisename", "movement", "lift"],
  muscle: ["musclegroup", "muscle", "bodypart"],
  set: ["set", "setno", "setnumber", "setorder"],
  weightKg: ["weightkg", "weight", "kg", "load", "loadkg"],
  weightLb: ["weightlb", "weightlbs", "lb", "lbs", "loadlb", "loadlbs"],
  reps: ["reps", "rep", "repetitions"],
  warmup: ["warmup", "warmupset", "iswarmup"],
  notes: ["notes", "note", "comment", "comments"],
};
const CARDIO_ALIASES: Record<string, string[]> = {
  date: ["date", "day"],
  start: ["starttime", "start", "time"],
  activity: ["activity", "type", "activitytype", "sport"],
  name: ["name", "title", "activityname"],
  duration: ["durationmin", "duration", "minutes", "durationminutes", "mins", "time(min)", "timemin"],
  distance: ["distancekm", "distance", "km"],
  calories: ["calories", "kcal", "caloriesburned", "energy"],
  hr: ["avgheartrate", "averageheartrate", "avghr", "heartrate", "hr", "avgbpm"],
};

type Columns = Record<string, number>;

function mapHeader(row: Cell[], aliases: Record<string, string[]>): Columns {
  const out: Columns = {};
  row.forEach((cell, i) => {
    const k = headerKey(cell);
    if (!k) return;
    for (const [field, names] of Object.entries(aliases)) {
      if (out[field] == null && names.includes(k)) {
        out[field] = i;
        break;
      }
    }
  });
  return out;
}

/** Finds the header row (within the first 10 rows) that has all the required columns. */
function findHeader(rows: Cell[][], aliases: Record<string, string[]>, required: string[][]) {
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const cols = mapHeader(rows[r] ?? [], aliases);
    if (required.every((alts) => alts.some((f) => cols[f] != null))) return { headerRow: r, cols };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Parsed result                                                       */
/* ------------------------------------------------------------------ */

export type ImportSet = { weight: number; reps: number; warmup: boolean; notes: string | null };
export type ImportExercise = { name: string; muscle: string; sets: ImportSet[] };
export type ImportSession = { date: string; name: string; exercises: ImportExercise[] };
export type ImportCardio = {
  date: string;
  start: string | null;
  type: string;
  name: string;
  durationSec: number;
  distanceM: number | null;
  kcal: number | null;
  avgHr: number | null;
};
export type RowIssue = { sheet: string; row: number; message: string };

export type ParsedImport = {
  sessions: ImportSession[];
  cardio: ImportCardio[];
  issues: RowIssue[];
  setCount: number;
  /** Sheets that were recognised, for the preview. */
  found: { workouts: string | null; cardio: string | null };
};

const isBlank = (row: Cell[] | undefined) => !row || row.every((c) => c == null || (typeof c === "string" && !c.trim()));

/**
 * Turns spreadsheet rows into workouts and cardio, collecting a message for
 * every row it had to skip. `today` (YYYY-MM-DD) rejects dates more than a day
 * ahead.
 */
export function parseSheets(sheets: Sheet[], opts: { today: string; date1904?: boolean }): ParsedImport {
  const issues: RowIssue[] = [];
  const maxDate = (() => {
    const [y, m, d] = opts.today.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + 1));
    return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
  })();
  const checkDate = (v: Cell, sheet: string, row: number): string | null => {
    const d = parseDate(v, opts.date1904);
    if (!d) {
      issues.push({ sheet, row, message: v == null || v === "" ? "Date is missing." : `"${cleanText(v, 30)}" isn't a date. Use 2026-11-20.` });
      return null;
    }
    if (d < "2000-01-01" || d > maxDate) {
      issues.push({ sheet, row, message: `${d} is outside the allowed dates (2000 to today).` });
      return null;
    }
    return d;
  };

  const byName = (re: RegExp) => sheets.find((s) => re.test(s.name.trim()));
  const setSheet =
    byName(/^(workouts?|sets?|strength|gym|lifts?)$/i) ??
    sheets.find((s) => findHeader(s.rows, SET_ALIASES, [["exercise"], ["reps"]]));
  const cardioSheet =
    byName(/^(cardio|activities|activity|runs?)$/i) ??
    sheets.find((s) => s !== setSheet && findHeader(s.rows, CARDIO_ALIASES, [["activity"], ["duration"]]));

  /* ---- sets ---- */
  const sessions = new Map<string, ImportSession>();
  let setCount = 0;
  if (setSheet) {
    const h = findHeader(setSheet.rows, SET_ALIASES, [["date"], ["exercise"], ["reps"]]);
    if (!h) {
      if (setSheet.rows.some((r, i) => i > 0 && !isBlank(r))) {
        issues.push({ sheet: setSheet.name, row: 1, message: "Couldn't find the Date, Exercise and Reps columns. Keep the template's header row." });
      }
    } else {
      const c = h.cols;
      const exIndex = new Map<string, Map<string, ImportExercise>>();
      const pending = new Map<ImportExercise, { set: number | null; seq: number; s: ImportSet }[]>();
      let seq = 0;
      for (let r = h.headerRow + 1; r < setSheet.rows.length; r++) {
        const row = setSheet.rows[r];
        if (isBlank(row)) continue;
        const rowNo = r + 1;
        if (setCount >= LIMITS.setRows) {
          issues.push({ sheet: setSheet.name, row: rowNo, message: `Only the first ${LIMITS.setRows.toLocaleString("en-US")} sets are imported at a time. Split the file.` });
          break;
        }
        const date = checkDate(row[c.date], setSheet.name, rowNo);
        if (!date) continue;
        const exercise = cleanText(row[c.exercise], LIMITS.exerciseName);
        if (!exercise) {
          issues.push({ sheet: setSheet.name, row: rowNo, message: "Exercise is missing." });
          continue;
        }
        const reps = parseNumber(row[c.reps]);
        if (reps == null || Number.isNaN(reps) || reps < 1 || reps > 1000 || !Number.isInteger(reps)) {
          issues.push({ sheet: setSheet.name, row: rowNo, message: "Reps must be a whole number from 1 to 1000." });
          continue;
        }
        let weight = 0;
        const kg = c.weightKg != null ? parseNumber(row[c.weightKg]) : null;
        const lb = c.weightLb != null ? parseNumber(row[c.weightLb]) : null;
        if (kg != null) weight = kg;
        else if (lb != null) weight = lb * 0.45359237;
        if (Number.isNaN(weight) || weight < 0 || weight > 1000) {
          issues.push({ sheet: setSheet.name, row: rowNo, message: "Weight must be a number from 0 to 1000 kg (leave it blank for bodyweight)." });
          continue;
        }
        const setNo = c.set != null ? parseNumber(row[c.set]) : null;
        const workout = (c.workout != null ? cleanText(row[c.workout], LIMITS.workoutName) : "") || "Imported workout";
        const key = `${date}|${workout.toLowerCase()}`;
        let session = sessions.get(key);
        if (!session) {
          session = { date, name: workout, exercises: [] };
          sessions.set(key, session);
          exIndex.set(key, new Map());
        }
        const exMap = exIndex.get(key)!;
        const ek = exerciseKey(exercise);
        let ex = exMap.get(ek);
        if (!ex) {
          ex = { name: exercise, muscle: muscleGroupFor(c.muscle != null ? row[c.muscle] : null), sets: [] };
          exMap.set(ek, ex);
          session.exercises.push(ex);
        }
        const s: ImportSet = {
          weight: Math.round(weight * 100) / 100,
          reps,
          warmup: c.warmup != null ? parseBool(row[c.warmup]) : false,
          notes: (c.notes != null ? cleanText(row[c.notes], LIMITS.notes) : "") || null,
        };
        const list = pending.get(ex) ?? [];
        list.push({ set: setNo != null && Number.isFinite(setNo) ? setNo : null, seq: seq++, s });
        pending.set(ex, list);
        setCount++;
      }
      // Put sets in the order of the Set column when it is filled in, else row order.
      for (const [ex, list] of pending) {
        const numbered = list.every((o) => o.set != null);
        list.sort((a, b) => (numbered ? a.set! - b.set! : 0) || a.seq - b.seq);
        ex.sets = list.map((o) => o.s);
      }
      for (const sess of sessions.values()) {
        if (sess.exercises.length > 50) {
          issues.push({ sheet: setSheet.name, row: 0, message: `${sess.date} "${sess.name}" has more than 50 exercises. Only the first 50 are kept.` });
          sess.exercises = sess.exercises.slice(0, 50);
        }
        for (const ex of sess.exercises) {
          if (ex.sets.length > 100) {
            issues.push({ sheet: setSheet.name, row: 0, message: `${sess.date} ${ex.name} has more than 100 sets. Only the first 100 are kept.` });
            ex.sets = ex.sets.slice(0, 100);
          }
        }
      }
    }
  }

  /* ---- cardio ---- */
  const cardio: ImportCardio[] = [];
  if (cardioSheet) {
    const h = findHeader(cardioSheet.rows, CARDIO_ALIASES, [["date"], ["activity"], ["duration"]]);
    if (!h) {
      if (cardioSheet.rows.some((r, i) => i > 0 && !isBlank(r))) {
        issues.push({ sheet: cardioSheet.name, row: 1, message: "Couldn't find the Date, Activity and Duration columns. Keep the template's header row." });
      }
    } else {
      const c = h.cols;
      for (let r = h.headerRow + 1; r < cardioSheet.rows.length; r++) {
        const row = cardioSheet.rows[r];
        if (isBlank(row)) continue;
        const rowNo = r + 1;
        if (cardio.length >= LIMITS.cardioRows) {
          issues.push({ sheet: cardioSheet.name, row: rowNo, message: `Only the first ${LIMITS.cardioRows.toLocaleString("en-US")} activities are imported at a time.` });
          break;
        }
        const date = checkDate(row[c.date], cardioSheet.name, rowNo);
        if (!date) continue;
        const type = activityTypeFor(row[c.activity]);
        if (!type) {
          issues.push({ sheet: cardioSheet.name, row: rowNo, message: "Activity is missing." });
          continue;
        }
        const minutes = parseMinutes(row[c.duration]);
        if (minutes == null || Number.isNaN(minutes) || minutes <= 0 || minutes > 1440) {
          issues.push({ sheet: cardioSheet.name, row: rowNo, message: "Duration must be minutes from 1 to 1440 (e.g. 45 or 0:45:00)." });
          continue;
        }
        const opt = (field: string, min: number, max: number, label: string): number | null | false => {
          if (c[field] == null) return null;
          const n = parseNumber(row[c[field]]);
          if (n == null) return null;
          if (Number.isNaN(n) || n < min || n > max) {
            issues.push({ sheet: cardioSheet.name, row: rowNo, message: `${label} must be a number from ${min} to ${max}.` });
            return false;
          }
          return n;
        };
        const km = opt("distance", 0, 1000, "Distance (km)");
        const kcal = opt("calories", 0, 20000, "Calories");
        const hr = opt("hr", 30, 250, "Avg heart rate");
        if (km === false || kcal === false || hr === false) continue;
        let start: string | null = null;
        if (c.start != null && row[c.start] != null && row[c.start] !== "") {
          start = parseClock(row[c.start]);
          if (!start) {
            issues.push({ sheet: cardioSheet.name, row: rowNo, message: "Start time must look like 07:30." });
            continue;
          }
        }
        cardio.push({
          date,
          start,
          type,
          name: (c.name != null ? cleanText(row[c.name], LIMITS.activityName) : "") || activityLabel(type),
          durationSec: Math.round(minutes * 60),
          distanceM: km != null ? Math.round(km * 1000) : null,
          kcal: kcal != null ? Math.round(kcal) : null,
          avgHr: hr != null ? Math.round(hr) : null,
        });
      }
    }
  }

  const list = [...sessions.values()].sort((a, b) => a.date.localeCompare(b.date));
  return { sessions: list, cardio, issues, setCount, found: { workouts: setSheet?.name ?? null, cardio: cardioSheet?.name ?? null } };
}
