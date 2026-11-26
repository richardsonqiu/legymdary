/**
 * How to do each exercise: the animation pattern, main muscles, three steps
 * and two tips. Short and plain, for people new to the gym.
 */
import type { PatternKey } from "./exercise-patterns";

export type Guide = { pattern: PatternKey; muscles: string[]; steps: string[]; tips: string[]; note?: string };

const G: Record<PatternKey, Omit<Guide, "pattern">> = {
  squat: {
    muscles: ["Quads", "Glutes", "Core"],
    steps: ["Bar on your upper back, feet shoulder width, toes slightly out.", "Brace your core, then sit down and back until thighs are at least parallel.", "Drive up through your whole foot, chest up."],
    tips: ["Knees track over your toes, not caving in.", "Keep your heels down the whole time."],
  },
  frontSquat: {
    muscles: ["Quads", "Glutes", "Upper back"],
    steps: ["Bar resting on the front of your shoulders, elbows high.", "Sit straight down between your heels, chest tall.", "Stand up, keeping elbows pointing forward."],
    tips: ["If elbows drop, the bar rolls forward.", "Fingertips under the bar are enough; you don't need a full grip."],
  },
  legPress: {
    muscles: ["Quads", "Glutes"],
    steps: ["Sit with your back flat on the pad, feet hip width on the platform.", "Release the safety and lower until knees reach about 90°.", "Press back up without locking your knees hard."],
    tips: ["Keep your lower back on the pad at the bottom.", "Higher feet work glutes more, lower feet work quads."],
  },
  legExtension: {
    muscles: ["Quads"],
    steps: ["Knees line up with the machine's pivot, pad on your lower shins.", "Straighten your legs and squeeze at the top.", "Lower slowly to the start."],
    tips: ["Hold the handles so your hips stay down.", "Control the way down; don't let the stack slam."],
  },
  legCurl: {
    muscles: ["Hamstrings"],
    steps: ["Lie face down, pad just above your heels, knees just off the bench.", "Curl your heels toward your glutes.", "Lower slowly until your legs are almost straight."],
    tips: ["Keep your hips pressed into the bench.", "Don't swing; a slow lowering builds the most strength."],
  },
  deadlift: {
    muscles: ["Glutes", "Hamstrings", "Back"],
    steps: ["Bar over mid foot, hinge down and grip just outside your legs.", "Flat back, chest up, take the slack out of the bar.", "Push the floor away and stand tall, then hinge back down."],
    tips: ["The bar stays close, brushing your legs.", "Don't round your lower back; lower the weight if it does."],
  },
  rdl: {
    muscles: ["Hamstrings", "Glutes", "Lower back"],
    steps: ["Stand tall holding the bar, knees softly bent.", "Push your hips back and slide the bar down your thighs.", "Stop when you feel a strong stretch, then squeeze glutes to stand."],
    tips: ["Your knees barely move; this is a hinge, not a squat.", "Back stays flat; the bar usually stops around mid shin."],
  },
  hipThrust: {
    muscles: ["Glutes", "Hamstrings"],
    steps: ["Upper back on a bench, bar across your hips (use a pad).", "Feet flat, about shoulder width, shins vertical at the top.", "Drive hips up until your body is flat, squeeze, then lower."],
    tips: ["Tuck your chin and look forward, not at the ceiling.", "Don't arch your lower back at the top; squeeze your glutes."],
  },
  calfRaise: {
    muscles: ["Calves"],
    steps: ["Stand tall with the balls of your feet on the step or platform.", "Rise as high as you can onto your toes.", "Lower slowly until your heels drop below the step."],
    tips: ["Pause for a second at the top and the bottom.", "Keep your knees straight but not locked."],
  },
  seatedCalf: {
    muscles: ["Calves (soleus)"],
    steps: ["Sit with the pad on your lower thighs, balls of feet on the step.", "Lift your heels as high as you can.", "Lower slowly for a full stretch."],
    tips: ["Bent knees target the lower calf muscle.", "Slow reps work better than bouncing."],
  },
  lunge: {
    muscles: ["Quads", "Glutes"],
    steps: ["Hold dumbbells at your sides and take a long step forward.", "Lower until your back knee nearly touches the floor.", "Push through the front foot and step into the next lunge."],
    tips: ["Front knee stays over your foot, not caving in.", "Keep your torso upright."],
  },
  splitSquat: {
    muscles: ["Quads", "Glutes"],
    steps: ["Rear foot on a bench behind you, front foot a big step ahead.", "Lower straight down until your front thigh is near parallel.", "Drive up through the front heel."],
    tips: ["Most of your weight stays on the front leg.", "Find your balance with bodyweight before adding dumbbells."],
  },
  bench: {
    muscles: ["Chest", "Triceps", "Front shoulders"],
    steps: ["Lie with eyes under the bar, feet flat, shoulder blades squeezed together.", "Lower the bar to your mid chest, elbows about 45° from your body.", "Press up and slightly back over your shoulders."],
    tips: ["Use a spotter or safety arms when going heavy.", "Keep your butt on the bench."],
  },
  inclineBench: {
    muscles: ["Upper chest", "Front shoulders", "Triceps"],
    steps: ["Set the bench to 30 to 45°, shoulder blades pulled back.", "Lower the bar to your upper chest.", "Press straight up over your shoulders."],
    tips: ["A lower incline keeps it a chest exercise.", "Feet flat for a stable base."],
  },
  dbBench: {
    muscles: ["Chest", "Triceps", "Front shoulders"],
    steps: ["Lie back with a dumbbell in each hand above your chest.", "Lower them to the sides of your chest, elbows about 45°.", "Press up and bring them close together at the top."],
    tips: ["Kick the dumbbells up with your knees to get into position.", "Control the bottom; don't let your elbows drop too far."],
  },
  inclineDb: {
    muscles: ["Upper chest", "Front shoulders", "Triceps"],
    steps: ["Bench at 30 to 45°, dumbbells above your upper chest.", "Lower to the sides of your upper chest.", "Press up and together."],
    tips: ["Keep your shoulder blades pinned to the bench.", "Lighter than flat bench is normal."],
  },
  skullCrusher: {
    muscles: ["Triceps"],
    steps: ["Lie on a bench holding the bar above your chest, arms straight.", "Bend only at the elbows to lower the bar toward your forehead.", "Straighten your arms back up."],
    tips: ["Elbows stay pointing up, not flaring out.", "An EZ bar is easier on the wrists."],
  },
  chestPress: {
    muscles: ["Chest", "Triceps"],
    steps: ["Set the seat so handles are at mid chest height.", "Push the handles forward until your arms are straight.", "Return slowly until you feel a stretch in your chest."],
    tips: ["Keep your back against the pad.", "A great way to learn pressing before the barbell."],
  },
  pushUp: {
    muscles: ["Chest", "Triceps", "Core"],
    steps: ["Hands just wider than shoulders, body in a straight line.", "Lower your chest toward the floor, elbows about 45°.", "Push the floor away back to the top."],
    tips: ["Squeeze glutes so your hips don't sag.", "Too hard? Put your hands on a bench."],
  },
  dip: {
    muscles: ["Chest", "Triceps", "Shoulders"],
    steps: ["Support yourself on the bars, arms straight.", "Lower until your elbows bend about 90°.", "Press back up to straight arms."],
    tips: ["Lean forward for chest, stay upright for triceps.", "Use an assisted dip machine or a band if needed."],
  },
  pullUp: {
    muscles: ["Lats", "Upper back", "Biceps"],
    steps: ["Hang from the bar, hands just wider than shoulders.", "Pull your chest toward the bar, driving elbows down.", "Lower all the way until arms are straight."],
    tips: ["No kicking; control the whole rep.", "Use an assisted machine or band until you can do 5 clean reps."],
  },
  legRaise: {
    muscles: ["Lower abs", "Hip flexors"],
    steps: ["Hang from the bar with straight arms.", "Raise your legs until they're level with your hips or higher.", "Lower slowly without swinging."],
    tips: ["Bent knees make it easier.", "Tilt your pelvis up at the top to really work the abs."],
  },
  pulldown: {
    muscles: ["Lats", "Upper back", "Biceps"],
    steps: ["Sit with thighs under the pad, grip the bar a bit wider than shoulders.", "Pull the bar to your upper chest, elbows down and back.", "Let it rise slowly until your arms are straight."],
    tips: ["Lean back only slightly.", "Think of pulling with your elbows, not your hands."],
  },
  cableRow: {
    muscles: ["Mid back", "Lats", "Biceps"],
    steps: ["Sit tall, feet on the platform, knees slightly bent.", "Row the handle to your belly, squeezing shoulder blades together.", "Reach forward slowly to stretch."],
    tips: ["Torso stays mostly still; no rocking.", "Shoulders down, away from your ears."],
  },
  row: {
    muscles: ["Mid back", "Lats", "Biceps"],
    steps: ["Hinge forward with a flat back, bar hanging at arm's length.", "Row the bar to your lower ribs.", "Lower with control."],
    tips: ["Keep your torso angle steady; don't stand up to lift it.", "Squeeze your shoulder blades at the top."],
  },
  pendlay: {
    muscles: ["Upper back", "Lats"],
    steps: ["Back nearly flat, bar on the floor under your chest.", "Pull explosively to your lower chest.", "Set it back down on the floor each rep."],
    tips: ["Each rep starts dead still from the floor.", "Keep your back flat; lighter is fine."],
  },
  tbarRow: {
    muscles: ["Mid back", "Lats"],
    steps: ["Straddle the bar, hinge forward with a flat back.", "Row the handle to your chest.", "Lower until your arms are straight."],
    tips: ["Use a V handle for a close grip.", "Let your shoulders stretch forward at the bottom."],
  },
  dbRow: {
    muscles: ["Lats", "Mid back", "Biceps"],
    steps: ["One knee and hand on a bench, back flat.", "Pull the dumbbell toward your hip.", "Lower until your arm is straight, then switch sides."],
    tips: ["Pull toward the hip, not the chest, for the lats.", "Don't twist your torso to lift it."],
  },
  facePull: {
    muscles: ["Rear shoulders", "Upper back"],
    steps: ["Rope at face height, step back until arms are straight.", "Pull the rope toward your face, hands apart, elbows high.", "Return slowly."],
    tips: ["Great for posture and healthy shoulders.", "Light weight, high reps (12 to 20)."],
  },
  ohp: {
    muscles: ["Shoulders", "Triceps", "Core"],
    steps: ["Bar on your front shoulders, grip just outside them.", "Squeeze glutes and press straight up, moving your head back slightly.", "Lock out overhead, then lower to your collarbone."],
    tips: ["Don't lean back; brace your core.", "The bar finishes over your mid foot."],
  },
  seatedPress: {
    muscles: ["Shoulders", "Triceps"],
    steps: ["Sit upright, dumbbells at ear level, palms forward.", "Press overhead until arms are straight.", "Lower back to ear level."],
    tips: ["Keep your back against the pad.", "Don't clang the dumbbells together at the top."],
  },
  machinePress: {
    muscles: ["Shoulders", "Triceps"],
    steps: ["Set the seat so handles start at shoulder height.", "Press up until arms are straight.", "Lower slowly to the start."],
    tips: ["A safe way to learn overhead pressing.", "Back stays flat on the pad."],
  },
  frontRaise: {
    muscles: ["Front shoulders"],
    steps: ["Stand with dumbbells in front of your thighs.", "Raise one or both to shoulder height, arms almost straight.", "Lower slowly."],
    tips: ["No swinging; go lighter.", "Stop at shoulder height."],
  },
  curl: {
    muscles: ["Biceps", "Forearms"],
    steps: ["Stand tall, dumbbells at your sides, palms forward.", "Curl up, keeping your elbows by your sides.", "Lower all the way down."],
    tips: ["Elbows don't drift forward.", "If you have to swing, the weight is too heavy."],
  },
  barbellCurl: {
    muscles: ["Biceps", "Forearms"],
    steps: ["Hold the bar at shoulder width, palms up.", "Curl it up, elbows pinned to your sides.", "Lower until your arms are straight."],
    tips: ["Stand still; no leaning back.", "An EZ bar is kinder to the wrists."],
  },
  cableCurl: {
    muscles: ["Biceps"],
    steps: ["Face the low pulley holding the handle or bar.", "Curl up, elbows by your sides.", "Lower slowly against the cable."],
    tips: ["The cable keeps tension on the whole rep.", "Step back so the stack doesn't touch down between reps."],
  },
  preacher: {
    muscles: ["Biceps"],
    steps: ["Sit with the back of your upper arms flat on the pad.", "Curl the bar up toward your shoulders.", "Lower until your arms are nearly straight."],
    tips: ["Don't fully lock out at the bottom under load.", "Go lighter than standing curls."],
  },
  pushdown: {
    muscles: ["Triceps"],
    steps: ["Face the high pulley, elbows tucked at your sides.", "Push down until your arms are straight.", "Let it rise to chest height, elbows still."],
    tips: ["Only your forearms move.", "Lean forward slightly for balance."],
  },
  overheadExt: {
    muscles: ["Triceps (long head)"],
    steps: ["Face away from the cable, rope behind your head, one foot forward.", "Straighten your arms forward and up.", "Bend back behind your head for a stretch."],
    tips: ["Keep elbows pointing forward, close to your head.", "The stretch is where it builds the most."],
  },
  plank: {
    muscles: ["Core", "Shoulders"],
    steps: ["Forearms on the floor, elbows under your shoulders.", "Body in a straight line from head to heels.", "Hold and breathe steadily."],
    tips: ["Squeeze glutes so your hips don't sag.", "Quality over time: stop when your form slips."],
  },
  cableCrunch: {
    muscles: ["Abs"],
    steps: ["Kneel facing the high pulley, rope beside your head.", "Curl down, bringing your ribs toward your hips.", "Rise slowly."],
    tips: ["Hips stay still; your spine does the bending.", "Don't pull with your arms."],
  },
  abWheel: {
    muscles: ["Abs", "Lats"],
    steps: ["Kneel with the wheel under your shoulders.", "Roll forward slowly, keeping your back flat.", "Pull back with your abs to the start."],
    tips: ["Only go as far as you can without your lower back sagging.", "Start with short rollouts."],
  },
  lateralRaise: {
    muscles: ["Side shoulders"],
    steps: ["Stand with dumbbells at your sides.", "Raise them out to the sides to shoulder height, elbows soft.", "Lower slowly."],
    tips: ["Lead with your elbows, pinkies slightly up.", "Light weights; this muscle is small."],
  },
  cableLateral: {
    muscles: ["Side shoulders"],
    steps: ["Stand side on to a low pulley, handle in the far hand.", "Raise your arm out to shoulder height.", "Lower slowly across your body."],
    tips: ["The cable keeps tension at the bottom, unlike dumbbells.", "Do both sides."],
  },
  fly: {
    muscles: ["Chest"],
    steps: ["Lie on a bench, dumbbells above your chest, palms facing.", "Open your arms wide in an arc, elbows slightly bent.", "Bring them back together over your chest."],
    tips: ["Keep the same elbow bend throughout.", "Stop when you feel a stretch; don't go too deep."],
  },
  crossover: {
    muscles: ["Chest"],
    steps: ["Stand between high pulleys, a handle in each hand, step forward.", "Bring your hands together in front of your belly in an arc.", "Open back up slowly."],
    tips: ["Lean forward slightly from the hips.", "Squeeze your chest when hands meet."],
  },
  pecDeck: {
    muscles: ["Chest"],
    steps: ["Sit with your back flat, arms on the pads or handles.", "Bring the pads together in front of your chest.", "Open slowly until you feel a stretch."],
    tips: ["Shoulders stay down and back.", "Set the seat so your arms are at chest height."],
  },
  rearFly: {
    muscles: ["Rear shoulders", "Upper back"],
    steps: ["Hinge forward with a flat back, dumbbells hanging below.", "Raise them out to the sides, elbows soft.", "Lower slowly."],
    tips: ["Light weights, slow reps.", "Squeeze between your shoulder blades at the top."],
  },
  twist: {
    muscles: ["Obliques", "Abs"],
    steps: ["Sit leaning back slightly, knees bent, holding a weight.", "Rotate your torso to one side.", "Rotate to the other side."],
    tips: ["Turn your chest, not just your arms.", "Feet on the floor makes it easier."],
  },
};

/** Exercise name → pattern, for the built-in library. */
const BY_NAME: Record<string, PatternKey> = {
  "barbell bench press": "bench",
  "incline barbell bench press": "inclineBench",
  "dumbbell bench press": "dbBench",
  "incline dumbbell press": "inclineDb",
  "dumbbell fly": "fly",
  "cable crossover": "crossover",
  "machine chest press": "chestPress",
  "pec deck": "pecDeck",
  "push-up": "pushUp",
  "chest dip": "dip",
  deadlift: "deadlift",
  "barbell row": "row",
  "pendlay row": "pendlay",
  "t-bar row": "tbarRow",
  "pull-up": "pullUp",
  "chin-up": "pullUp",
  "lat pulldown": "pulldown",
  "seated cable row": "cableRow",
  "dumbbell row": "dbRow",
  "face pull": "facePull",
  "overhead press": "ohp",
  "seated dumbbell press": "seatedPress",
  "arnold press": "seatedPress",
  "lateral raise": "lateralRaise",
  "front raise": "frontRaise",
  "rear delt fly": "rearFly",
  "machine shoulder press": "machinePress",
  "cable lateral raise": "cableLateral",
  "barbell curl": "barbellCurl",
  "dumbbell curl": "curl",
  "hammer curl": "curl",
  "preacher curl": "preacher",
  "cable curl": "cableCurl",
  "triceps pushdown": "pushdown",
  "overhead cable extension": "overheadExt",
  "skull crusher": "skullCrusher",
  "close-grip bench press": "bench",
  "triceps dip": "dip",
  "back squat": "squat",
  "front squat": "frontSquat",
  "leg press": "legPress",
  "leg extension": "legExtension",
  "walking lunge": "lunge",
  "bulgarian split squat": "splitSquat",
  "romanian deadlift": "rdl",
  "lying leg curl": "legCurl",
  "hip thrust": "hipThrust",
  "standing calf raise": "calfRaise",
  "seated calf raise": "seatedCalf",
  plank: "plank",
  "hanging leg raise": "legRaise",
  "cable crunch": "cableCrunch",
  "russian twist": "twist",
  "ab wheel rollout": "abWheel",
};

/** Extra notes where a variation differs from its pattern. */
const NOTES: Record<string, string> = {
  "chin-up": "Palms facing you, hands shoulder width. Works the biceps a bit more than a pull-up.",
  "hammer curl": "Palms face each other the whole time (like holding a hammer). Works the forearms more.",
  "arnold press": "Start palms facing you at chin height and rotate them forward as you press up.",
  "close-grip bench press": "Hands about shoulder width and elbows tucked in, to work the triceps more.",
  "triceps dip": "Stay upright, elbows pointing back, to keep it on the triceps.",
  "chest dip": "Lean forward and let your elbows flare slightly, to work the chest.",
};

/** Keyword fallbacks for custom exercises. */
const KEYWORDS: [RegExp, PatternKey][] = [
  [/leg curl|hamstring curl/, "legCurl"],
  [/preacher/, "preacher"],
  [/cable curl/, "cableCurl"],
  [/barbell curl|ez.?bar curl/, "barbellCurl"],
  [/curl/, "curl"],
  [/front squat/, "frontSquat"],
  [/split squat|lunge|step.?up/, "lunge"],
  [/squat|goblet/, "squat"],
  [/leg press|hack/, "legPress"],
  [/romanian|rdl|stiff|good morning/, "rdl"],
  [/deadlift/, "deadlift"],
  [/hip thrust|glute bridge/, "hipThrust"],
  [/leg ext/, "legExtension"],
  [/leg curl|hamstring curl/, "legCurl"],
  [/seated calf/, "seatedCalf"],
  [/calf/, "calfRaise"],
  [/incline.*(dumbbell|db)/, "inclineDb"],
  [/incline/, "inclineBench"],
  [/(dumbbell|db).*(bench|press).*chest|dumbbell bench/, "dbBench"],
  [/bench|floor press/, "bench"],
  [/chest press/, "chestPress"],
  [/push.?up/, "pushUp"],
  [/dip/, "dip"],
  [/crossover|cable fly/, "crossover"],
  [/pec deck|machine fly/, "pecDeck"],
  [/rear delt|reverse fly/, "rearFly"],
  [/fly/, "fly"],
  [/pull.?up|chin.?up/, "pullUp"],
  [/pulldown|pull.?down/, "pulldown"],
  [/cable row|seated row/, "cableRow"],
  [/t.?bar/, "tbarRow"],
  [/(dumbbell|db|one.?arm).*row/, "dbRow"],
  [/row/, "row"],
  [/face pull/, "facePull"],
  [/lateral raise|side raise/, "lateralRaise"],
  [/front raise/, "frontRaise"],
  [/shoulder press|overhead press|military|ohp|push press/, "ohp"],
  [/pushdown|push.?down/, "pushdown"],
  [/overhead.*ext|french press/, "overheadExt"],
  [/skull|lying tri/, "skullCrusher"],
  [/leg raise|knee raise/, "legRaise"],
  [/crunch|sit.?up/, "cableCrunch"],
  [/rollout|ab wheel/, "abWheel"],
  [/twist|woodchop/, "twist"],
  [/plank|hollow|dead bug/, "plank"],
];

const BY_MUSCLE: Record<string, PatternKey> = {
  chest: "dbBench",
  back: "row",
  shoulders: "seatedPress",
  biceps: "curl",
  triceps: "pushdown",
  quads: "squat",
  hamstrings: "rdl",
  glutes: "hipThrust",
  calves: "calfRaise",
  core: "plank",
};

/** The guide for an exercise, or null for things we can't show (cardio, etc). */
export function guideFor(name: string, muscleGroup?: string | null): (Guide & { exact: boolean }) | null {
  const n = name.trim().toLowerCase();
  let pattern: PatternKey | undefined = BY_NAME[n];
  let exact = !!pattern;
  if (!pattern) pattern = KEYWORDS.find(([re]) => re.test(n))?.[1];
  if (!pattern && muscleGroup) {
    pattern = BY_MUSCLE[muscleGroup.toLowerCase()];
    exact = false;
  }
  if (!pattern) return null;
  return { pattern, ...G[pattern], note: NOTES[n], exact };
}
