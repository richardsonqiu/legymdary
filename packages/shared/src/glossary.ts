/** Plain-language explanations shown behind the "?" buttons. */
export const GLOSSARY = {
  readiness:
    "A 0–100 score of how recovered you are today, from last night's sleep, HRV and resting heart rate compared with your normal. 70+ = go hard, 45–69 = normal day, below 45 = take it easy.",
  hrv:
    "Heart-rate variability: tiny changes in time between heartbeats. Higher than your normal usually means well rested; lower can mean stress, poor sleep, illness or hard training.",
  restingHr: "Your heart rate at rest. A few beats above your normal often means fatigue, stress, alcohol or getting sick.",
  sleep: "How long and how well you slept compared with what your body needs. Sleep debt is the sleep you're short over the last 7 nights.",
  bodyBattery:
    "Garmin's 0 to 100 energy meter. Sleep and rest charge it, stress and activity drain it. Waking above 75 means a good recharge. Below 40 means you started the day low.",
  strain: "How hard yesterday was on your body, 0–21. Most training days land between 8 and 16.",
  loadRatio:
    "Your last week of training compared with your last month. 0.8–1.3 is the sweet spot; above 1.5 means you ramped up fast, which raises injury risk.",
  energy: "Calories eaten minus calories burned (from Garmin). Negative = you're in a deficit (losing), positive = surplus (gaining).",
  patterns: "Links we found in your own history, like 'late dinners go with worse sleep'. They show what tends to happen together, not what causes what.",
  maintenance:
    "The calories that would keep your weight the same. Eat below it to lose fat, above it to gain. We measure it from your food log and weight trend when we can.",
  bmr: "Basal metabolic rate: calories your body burns at complete rest just to stay alive. Your daily total is higher because you move.",
  macros: "Protein, carbs and fat: the three nutrients with calories. Protein keeps your muscle, carbs fuel training, fat supports hormones.",
  leanMass: "Everything in your body that isn't fat: muscle, bone, organs and water. Keeping it while losing fat is the goal.",
  bodyComp:
    "From your InBody scan. Skeletal muscle = the muscle you train. Visceral fat = fat around your organs (under 10 is healthy). Waist-hip ratio = belly fat indicator (men under 0.90, women under 0.85).",
  segmental:
    "How much lean mass each arm, leg and your trunk has compared with the ideal for your height (100%). Big gaps between upper and lower body show what to train more.",
} as const;
export type GlossaryKey = keyof typeof GLOSSARY;
