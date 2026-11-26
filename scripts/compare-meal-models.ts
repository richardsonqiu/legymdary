/**
 * Compare meal-photo estimates across models, using the app's own prompt and schema.
 *
 *   npx tsx scripts/compare-meal-models.ts <photo-dir> [out.html]
 *
 * <photo-dir> holds .jpg/.jpeg/.png/.webp files. Optional files in the same folder:
 *   hints.json  {"lunch.jpg": "only ate half the rice"}  → sent as the user's description
 *   truth.json  {"lunch.jpg": 650}                        → known calories, to score accuracy
 *
 * Variants are set with VARIANTS="model:effort,model:effort" (default: Haiku 5.5 low,
 * Haiku 5.5 medium, Sonnet 5.5 low). Each variant runs in its own process with no backup
 * model, so every column shows that model alone. Needs ANTHROPIC_API_KEY (env or .env). Costs real money
 * (roughly $0.001 per photo on Haiku, $0.02 on Sonnet).
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

type Item = { name: string; portion: string; calories: number; protein: number; carbs: number; fat: number };
type RunOut = {
  file: string;
  ok: boolean;
  error?: string;
  ms: number;
  costUsd: number;
  model?: string;
  name?: string;
  confidence?: string;
  notes?: string;
  advisor?: string | null;
  items?: Item[];
};

const IMG = /\.(jpe?g|png|webp)$/i;

async function toJpeg(file: string) {
  // Same as the app's client: longest side ≤ 1024 px, JPEG.
  const buf = await sharp(file).rotate().resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  return buf.toString("base64");
}

async function child(dir: string) {
  const { analyzeMealImage } = await import("../lib/food-ai");
  const hints: Record<string, string> = readJson(path.join(dir, "hints.json"));
  const out: RunOut[] = [];
  for (const f of fs.readdirSync(dir).filter((f) => IMG.test(f)).sort()) {
    const t0 = Date.now();
    const res = await analyzeMealImage({ base64: await toJpeg(path.join(dir, f)), mediaType: "image/jpeg", hint: hints[f] ?? null });
    const ms = Date.now() - t0;
    const costUsd = res.usage.reduce((s, u) => s + u.costUsd, 0);
    const model = res.usage.at(-1)?.model;
    if (!res.ok) out.push({ file: f, ok: false, error: res.error, ms, costUsd, model });
    else
      out.push({
        file: f, ok: true, ms, costUsd, model,
        name: res.analysis.name, confidence: res.analysis.confidence, notes: res.analysis.notes, advisor: res.analysis.advisor,
        items: res.analysis.items.map((i) => ({ name: i.name, portion: i.portion, calories: i.calories, protein: i.protein, carbs: i.carbs, fat: i.fat })),
      });
    process.stderr.write(`  ${f}: ${res.ok ? "ok" : res.error} (${ms} ms)\n`);
  }
  process.stdout.write(JSON.stringify(out));
}

function readJson(p: string) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return {};
  }
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const total = (r?: RunOut) => (r?.items ?? []).reduce((a, i) => ({ kcal: a.kcal + i.calories, p: a.p + i.protein, c: a.c + i.carbs, f: a.f + i.fat }), { kcal: 0, p: 0, c: 0, f: 0 });

async function main() {
  const [dir, outFile = "meal-model-comparison.html"] = process.argv.slice(2);
  if (!dir) throw new Error("Usage: tsx scripts/compare-meal-models.ts <photo-dir> [out.html]");
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  const variants = (process.env.VARIANTS ?? "claude-haiku-5-5:low,claude-haiku-5-5:medium,claude-sonnet-5-5:low").split(",").map((v) => {
    const [model, effort = "low"] = v.split(":");
    return { model, effort, label: `${model.replace("claude-", "").replace(/-(\d)-(\d)$/, " $1.$2")} · ${effort}` };
  });

  const results: Record<string, RunOut[]> = {};
  for (const v of variants) {
    process.stderr.write(`Running ${v.label}\n`);
    const r = spawnSync("npx", ["tsx", __filename, "--child", dir], {
      env: { ...process.env, MEAL_AI_MODEL: v.model, MEAL_AI_BACKUP_MODEL: "", MEAL_AI_EFFORT: v.effort },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
      maxBuffer: 64 * 1024 * 1024,
    });
    if (r.status !== 0) throw new Error(`${v.label} failed`);
    results[v.label] = JSON.parse(r.stdout);
  }

  const files = fs.readdirSync(dir).filter((f) => IMG.test(f)).sort();
  const truth: Record<string, number> = readJson(path.join(dir, "truth.json"));
  const hints: Record<string, string> = readJson(path.join(dir, "hints.json"));
  const labels = variants.map((v) => v.label);

  // Summary per variant.
  const summary = labels.map((l) => {
    const rs = results[l];
    const scored = rs.filter((r) => r.ok && truth[r.file]);
    const mape = scored.length ? (scored.reduce((s, r) => s + Math.abs(total(r).kcal - truth[r.file]) / truth[r.file], 0) / scored.length) * 100 : null;
    return {
      l,
      ok: rs.filter((r) => r.ok).length,
      cost: rs.reduce((s, r) => s + r.costUsd, 0),
      ms: rs.reduce((s, r) => s + r.ms, 0) / Math.max(1, rs.length),
      mape,
      scored: scored.length,
    };
  });

  const photoCards = await Promise.all(
    files.map(async (f) => {
      const thumb = (await sharp(path.join(dir, f)).rotate().resize(480, 480, { fit: "inside" }).jpeg({ quality: 70 }).toBuffer()).toString("base64");
      const cols = labels
        .map((l) => {
          const r = results[l].find((x) => x.file === f);
          if (!r?.ok) return `<div class="col"><h4>${esc(l)}</h4><p class="err">${esc(r?.error ?? "no result")}</p></div>`;
          const t = total(r);
          const diff = truth[f] ? `<span class="diff">${t.kcal >= truth[f] ? "+" : ""}${Math.round(((t.kcal - truth[f]) / truth[f]) * 100)}% vs actual</span>` : "";
          return `<div class="col"><h4>${esc(l)}</h4>
            <div class="kcal">${t.kcal} kcal ${diff}</div>
            <div class="macros">P ${t.p} g · C ${t.c} g · F ${t.f} g</div>
            <div class="name">${esc(r.name)} <span class="conf">${esc(r.confidence)} confidence</span></div>
            <table>${(r.items ?? []).map((i) => `<tr><td>${esc(i.name)}<br><small>${esc(i.portion)}</small></td><td class="n">${i.calories}</td></tr>`).join("")}</table>
            <p class="note">${esc(r.notes)}</p>
            ${r.advisor ? `<p class="note">${esc(r.advisor)}</p>` : ""}
            <p class="meta">${(r.ms / 1000).toFixed(1)} s · $${r.costUsd.toFixed(4)}${r.model && !l.startsWith(r.model.replace("claude-", "").replace(/-(\d)-(\d)$/, " $1.$2")) ? ` · served by ${esc(r.model)}` : ""}</p></div>`;
        })
        .join("");
      return `<section class="photo"><div class="pic"><img src="data:image/jpeg;base64,${thumb}" alt="${esc(f)}"><p>${esc(f)}${hints[f] ? `<br><i>“${esc(hints[f])}”</i>` : ""}${truth[f] ? `<br><b>Actual: ${truth[f]} kcal</b>` : ""}</p></div><div class="cols">${cols}</div></section>`;
    }),
  );

  const rows = files
    .map((f) => `<tr><td>${esc(f)}</td>${truth[f] ? `<td class="n">${truth[f]}</td>` : `<td class="n">–</td>`}${labels.map((l) => { const r = results[l].find((x) => x.file === f); return `<td class="n">${r?.ok ? total(r).kcal : "failed"}</td>`; }).join("")}</tr>`)
    .join("");

  const html = `<title>Meal Model Comparison</title>
<style>
:root{--bg:#f6f6f3;--card:#fff;--fg:#17181a;--mut:#5e6168;--line:#e2e2de;--acc:#1f4fb5;--bad:#b3261e}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#131416;--card:#1c1d20;--fg:#ededE8;--mut:#9ea2aa;--line:#2e2f33;--acc:#8ca9f0;--bad:#f0767b;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#131416;--card:#1c1d20;--fg:#ededE8;--mut:#9ea2aa;--line:#2e2f33;--acc:#8ca9f0;--bad:#f0767b;color-scheme:dark}
body{background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,sans-serif;padding-block:24px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
main{max-width:1200px;margin:0 auto;display:flex;flex-direction:column;gap:24px}
h1{margin:0;font-size:28px}h2{margin:0;font-size:18px}
.wrap{overflow-x:auto}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}
.n{text-align:right;font-variant-numeric:tabular-nums}
.photo{background:var(--card);border-radius:12px;padding:16px;display:grid;grid-template-columns:minmax(0,240px) minmax(0,1fr);gap:16px}
.pic img{width:100%;border-radius:8px}.pic p{margin:6px 0 0;font-size:13px;color:var(--mut)}
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;min-width:0}
.col{min-width:0}.col h4{margin:0 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut)}
.kcal{font-size:24px;font-weight:700;font-variant-numeric:tabular-nums}.diff{font-size:13px;font-weight:600;color:var(--acc)}
.macros,.meta,.conf{color:var(--mut);font-size:13px}.name{font-weight:600;margin:4px 0}
.col table td{font-size:13px;padding:4px 0}.note{font-size:13px;margin:6px 0}.err{color:var(--bad)}
@media (max-width:640px){.photo{grid-template-columns:1fr}}
</style>
<main>
<h1>Meal model comparison</h1>
<p style="margin:0;color:var(--mut)">${files.length} photos · same prompt as the app · each model alone, no backup. Lower "avg error" is better (only for photos with a known calorie count).</p>
<div class="wrap"><table><tr><th>Setup</th><th class="n">Worked</th><th class="n">Avg error vs actual</th><th class="n">Avg time</th><th class="n">Cost, all photos</th><th class="n">Cost per photo</th></tr>
${summary.map((s) => `<tr><td>${esc(s.l)}</td><td class="n">${s.ok}/${files.length}</td><td class="n">${s.mape == null ? "–" : `${s.mape.toFixed(0)}% (${s.scored})`}</td><td class="n">${(s.ms / 1000).toFixed(1)} s</td><td class="n">$${s.cost.toFixed(4)}</td><td class="n">$${(s.cost / Math.max(1, files.length)).toFixed(4)}</td></tr>`).join("")}
</table></div>
<h2>Calories per photo</h2>
<div class="wrap"><table><tr><th>Photo</th><th class="n">Actual</th>${labels.map((l) => `<th class="n">${esc(l)}</th>`).join("")}</tr>${rows}</table></div>
${photoCards.join("\n")}
</main>`;
  fs.writeFileSync(outFile, html);
  fs.writeFileSync(outFile.replace(/\.html$/, ".json"), JSON.stringify({ variants: labels, results, truth, hints }, null, 2));
  process.stderr.write(`Wrote ${outFile}\n`);
}

if (process.argv[2] === "--child") child(process.argv[3]);
else main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
