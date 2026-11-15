# Daily analysis plan — Garmin + food log + training

Status: **v1, implemented** (`lib/analysis/*`). Calibration v1.1 below; formulas still to be checked against real data.
Original status: **draft v1**, written from Garmin's published Personal API spec and
Oura/WHOOP/Garmin methodology research. Next step: confirm every input
against the user's real **data inventory** (Garmin → All Garmin data →
"Data inventory (Markdown)"), then lock formulas and prompts and build.

## 1. Design principles (what Oura, WHOOP and Garmin have in common)

| Principle | Where it comes from | How we apply it |
|---|---|---|
| Compare you to **your own baseline**, not population norms | Oura contributors use personal averages (≈2 weeks to learn them); WHOOP weighs inputs vs rolling personal baselines | Every signal becomes a z-score vs your 28-day mean/SD (needs ≥14 days) |
| **Short vs long window** | Oura "balance" contributors: 14-day weighted average (last 2–5 days weigh more) vs ~2-month average | 7-day EWMA vs 28/60-day averages for HRV, RHR, load, sleep |
| Overnight signals drive a **once-a-day morning score** | WHOOP recovery is computed on waking and fixed for the day; Oura readiness uses overnight lowest RHR, HRV, temperature | Readiness is computed once the night's sleep/HRV is synced and frozen for the day |
| **Deviation in either direction** can be bad | Oura treats sharp HRV/activity swings both ways as imbalance (third-party interpretation) | Scores penalise large |z| both ways for HRV and load |
| **Sleep need** is dynamic | WHOOP: baseline + strain + debt + naps; Garmin exposes its own sleep need with history/HRV/nap adjustments | Use Garmin's `sleepNeed` when present; fallback = 7.5h baseline + debt + load adjustment |
| **Load** = intensity × duration, acute vs chronic | Garmin acute load (EPOC-weighted, ~7 days), Training Load Focus (4 weeks); WHOOP strain from time in HR zones (log scale 0–21) | Daily load from Garmin `activityTrainingLoad` (fallback: HR-zone minutes) + your logged strength volume; acute (7d) : chronic (28d) ratio |
| Vendors **don't publish weights** | Oura/WHOOP keep formulas private | Our formulas and weights are written down here, so they can be tuned |

**Architecture:** all numbers are computed **deterministically in code**
(same inputs → same scores). A cheaper model (Haiku 5.5 / Sonnet 5.5) only
turns the computed "day card" into a short narrative, with no arithmetic. That keeps
daily cost low and makes results explainable and testable.

## 2. Available inputs (per Garmin's spec — to confirm with your inventory)

| Area | Garmin dataset → fields | App data |
|---|---|---|
| Sleep | `sleep_summary`/`sleep_detail`: sleepTimeSeconds, deep/light/rem/awake seconds, awakeCount, sleepScores.overall (+components), avgSleepStress, averageRespirationValue, averageSpO2Value / lowestSpO2Value, avgHeartRate, **sleepNeed** (baseline, actual, sleepHistory/hrv/nap adjustments, recommended bedtime), sleep start/end (local) | — |
| HRV | `hrv_daily`: lastNightAvg, lastNight5MinHigh, weeklyAvg, baseline (lowUpper, balancedLow/Upper), status · `hrv_detail`: every 5-min reading | — |
| Heart | `daily_summary`: restingValue, min/max · `user_summary`: lastSevenDaysAvgRestingHeartRate · `heart_rate_detail`: intraday series | — |
| Recovery/stress | `body_battery_daily`/`daily_summary`: max/min/charged/drained, at-wake value, activity impacts · `daily_summary.stress`: avg/max, low/med/high/rest durations | — |
| Activity & load | `activities`: duration, calories, avg/max HR, **hrTimeInZone_1–5**, **activityTrainingLoad**, aerobic/anaerobic trainingEffect, **vO2MaxValue**, power, totalSets/activeSets/totalReps, summarizedExerciseSets · `activity_workouts`: structured steps · `daily_summary`: steps, intensity minutes (moderate/vigorous), floors | Workouts → sets (reps × kg), PRs |
| Energy | `daily_summary.calories`: burnedTotal / burnedActive / burnedResting (BMR), consumedValue | Meals: kcal, protein, carbs, fat, meal type, time; plan targets |
| Body | `weight_entries`: weight, body fat, body water, muscle/bone mass, visceral fat, metabolic age | Manual body stats, goal weight/body fat |
| Other | `hydration_daily` (intake, sweat loss), `spo2_detail`, `fitness_age`, `hr_zones` (max/resting/LT HR), `wellness_activities` (breathwork), Garmin food log | — |

**Not available from the Personal API:** skin/body temperature deviation
(Oura's key illness signal), Garmin Training Readiness, Training Status,
acute load and recovery time. We compute our own equivalents below.

## 3. Metric catalogue

Notation: `z(x)` = (today − 28-day mean) / 28-day SD, clipped to ±3.
"Need" = minimum history before the metric is shown.

### 3.1 Readiness (0–100), like Oura Readiness / WHOOP Recovery
Computed once per morning, after the night syncs.

| Contributor | Input | Scoring | Weight |
|---|---|---|---:|
| HRV | lastNightAvg vs 28-day baseline; Garmin `status` as a cross-check | z ≥ −0.25 → 100; −1 → 75; −2 → 30; −3 → 0; mild penalty above +2.5 (unusual spike) | 30% |
| Resting HR | sleep avg HR or restingValue vs baseline | z ≤ +0.25 → 100; +1 → 75; +2 → 30; +3 → 0 | 20% |
| Sleep | sleep score (or duration ÷ need) | Score 40 → 0, 60 → 55, 80+ → 100 (or 60% / 80% / 95% of need) | 20% |
| Sleep balance | 7-day sleep debt (Σ need − actual) | 0 h → 100, 2 h → 80, 5 h → 30, 8 h → 0 | 10% |
| Load balance | acute:chronic load ratio (§3.3) | 0.8–1.3 → 100; 1.5 → 40; ≥ 1.8 → 0; < 0.6 → 70 (detraining) | 10% |
| Respiration / SpO2 | sleep respiration z; lowest SpO2 | Respiration z > +2 or SpO2 < 90 % → 0, else 100 | 10% |

- **Bands:** ≥ 70 "Ready to push" · 45–69 "Train as planned" · < 45 "Take it easy".
- **Missing inputs:** weights are re-normalised and confidence is shown.
- **Need:** 14 nights of HRV/RHR history.

### 3.2 Sleep
- **Sleep performance** = actual ÷ need (WHOOP-style). Garmin's need comes first.
- **Sleep debt:** 7-day rolling Σ(need − actual), clamped ≥ 0.
- **Consistency:** SD of bedtime and wake time over 7 nights. ≤ 30 min is good; ≥ 75 min is poor (Oura "sleep regularity").
- **Stage mix:** deep % and REM % vs your own 28-day norm (not population norms).
- **Disturbances:** awake time, awake count, avg sleep stress, respiration and SpO2 dips.
- **Bedtime guidance:** Garmin's recommended bedtime window, when present.

### 3.3 Training load / strain (WHOOP Strain, Garmin acute load)
- **Daily cardio load** = Σ `activityTrainingLoad` over the day's activities. Fallback: TRIMP-style Σ(zone minutes × zone weight 1/2/3/4/5).
- **Daily strength load** = Σ working-set volume (kg × reps) from the app, scaled to the cardio-load range using your own history (z-scored). Garmin strength activities also add `totalSets`/`totalReps`.
- **Strain (0–21):** log-scaled daily total, so going from 0 to 10 is easy and from 18 to 21 is hard:
  `21 × (1 − e^(−load / k))`, with k fitted so that your 90th-percentile day ≈ 16.
- **Acute (7d EWMA) : chronic (28d EWMA) ratio.** Above 1.5 means a spike (injury/overreach risk); below 0.8 means detraining. It starts from the first day with training data, is seeded with that first week's average, and is shown only after 4 weeks, so a history that begins mid-window can't fake a spike.
- **Intensity minutes:** weekly moderate + 2 × vigorous vs the 150-minute guideline.
- **Fitness trend:** VO2 max (per activity), fitness age, aerobic/anaerobic training effect distribution over 4 weeks (like Training Load Focus).

### 3.4 Energy & nutrition
- **Energy balance:** intake (photo log) − Garmin total burn. Calculated per day, plus a 7-day sum and the implied kg/week. Only fully-logged days count (≥ 2 meals or ≥ 1,000 kcal).
- **Measured maintenance:** already built. Intake + weight trend; falls back to Garmin's average burn.
- **Protein:** g/kg body weight vs target; distribution across meals, aiming for ≥ 3 meals with ≥ 0.3 g/kg.
- **Carbs around training:** carbs eaten 0–4 h before and after higher-load sessions.
- **Late eating:** time of last meal vs sleep start (minutes). Used in the correlations below.
- **Hydration:** Garmin intake vs goal, plus sweat loss on training days.
- **Logging completeness:** days logged out of 7. Insights are suppressed when logging is sparse.

### 3.5 Body composition
- **Weight:** 7-day EMA, rate vs plan pace, and plateau detection (≥ 14 days within ±0.2 kg while in a deficit).
- **Body fat and muscle mass:** trend from Garmin scale weigh-ins (Index scale fields) or manual entries.

### 3.6 Stress
- **Day:** average stress, high-stress minutes vs baseline, and the Body Battery charged/drained balance.
- **Recovery quality:** average sleep stress and Body Battery at wake.

### 3.7 Personal patterns (like Oura tags → impact)
Activates after 28+ days. Each pattern is a lagged Spearman correlation, reported only when n ≥ 12, |ρ| ≥ 0.35 and p < 0.05, and phrased as an association, never as causation. Candidates:
- last meal within 2 h of bed → sleep score / HRV that night
- evening carbs or total kcal → sleep score
- alcohol keywords in meal items (beer, wine, …) → next-night HRV and RHR
- training load (day d) → HRV and readiness (day d+1, d+2)
- protein g/kg → next-day readiness
- sleep debt → daytime stress and food intake
- steps / active kcal → sleep score

## 4. Daily report

**Inputs.** A compact **day card** (≈1–2k tokens) is built in code:

- yesterday: training, intake vs targets, energy balance
- last night: sleep, HRV, RHR, respiration, SpO2
- this morning: readiness and its contributors
- 7-day trends
- active patterns
- the plan: goal, pace, targets

Each value carries its baseline and a direction (↑ ↓ →).

**Output** (structured; the app renders it):
1. **Headline**: one sentence plus the readiness band.
2. **What stood out**: 2–4 bullets, each citing numbers vs baseline.
3. **Today's plan**:
   - **Training:** intensity guidance from readiness and load ratio, plus a suggested session type.
   - **Nutrition:** today's kcal/protein targets, adjusted for planned activity; a timing tip if late eating hurts your sleep.
   - **Recovery:** bedtime from Garmin's recommendation or the sleep-debt plan.
4. **Watch-outs**: only when triggered, e.g. 3+ days of HRV below baseline, a load spike, respiration up with RHR up (possible illness), logging gaps.
5. **Weekly review** (Mondays): averages vs the previous week, progress to goal, and the strongest personal pattern.

**Prompt rules** for the narrative model:
- Never invent or recompute numbers; use only the card.
- Be specific and brief (≤ 180 words, plus bullets).
- Use "associated with", never causal claims, for patterns.
- No medical diagnosis. Suggest seeing a professional only for persistent red flags (e.g. SpO2 < 90 % repeatedly).

**Models:** Haiku 5.5 for the daily report (≈ $0.001/day), Sonnet 5.5 for the weekly review or as fallback. The model choice stays configurable.

## 5. To confirm with your inventory

1. Which datasets have data: HRV (device support), sleep score, sleep need, respiration, SpO2, Body Battery, scale composition fields, `hrTimeInZone`, `activityTrainingLoad`, `summarizedExerciseSets`, `vO2MaxValue`, hydration.
2. How far back each goes, which sets the baseline windows and when each metric unlocks.
3. Sleep-need structure: is `baseline`/`actual` in minutes, and how are the adjustments expressed?
4. HRV reading cadence, the `status` values used, and the baseline field shape.
5. Strength activities logged on the watch vs in the app, to avoid double counting.
6. Whether a Garmin food log exists, to dedupe intake against the photo log.

Once confirmed, each metric moves from "planned" to "locked" with its exact field
paths, the build follows, and the prompts above become the production prompts.
