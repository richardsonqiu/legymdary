import type { NutrientKey } from "@/lib/meal-quality";

/** Short explainers for the nutrient pages. Plain words, a few lines each. */
export type NutrientInfo = {
  title: string;
  image: string;
  what: string;
  sources: string[];
  why: { title: string; body: string }[];
  levels: { low: string; moderate: string; high: string };
  /** How the level is judged for one meal. */
  rule: string;
};

export const NUTRIENT_INFO: Record<NutrientKey, NutrientInfo> = {
  protein: {
    title: "Protein",
    image: "salmon",
    what: "Builds and repairs muscle, skin and organs, and keeps you full for longer.",
    sources: ["Eggs, chicken, fish, lean beef", "Tofu, tempeh, edamame", "Greek yogurt, milk, cheese", "Beans, lentils, chickpeas"],
    why: [
      { title: "Muscle and recovery", body: "Training breaks muscle down; protein is what rebuilds it stronger." },
      { title: "Fullness", body: "It keeps you satisfied longer, which makes a calorie target easier." },
      { title: "Steady energy", body: "It slows how fast carbs reach your blood, so energy stays even." },
      { title: "Keeping muscle while losing fat", body: "Enough protein means the weight you lose is mostly fat." },
    ],
    levels: {
      low: "Pair it with eggs, tofu, fish or meat next time.",
      moderate: "A fair amount. Fine for a snack or light meal.",
      high: "Great for muscle repair and staying full.",
    },
    rule: "From the share of calories that come from protein (15% and 25%). 30 g or more in one meal always counts as high.",
  },
  fiber: {
    title: "Fiber",
    image: "blueberry",
    what: "The part of plants you don't digest. It feeds your gut and slows digestion.",
    sources: ["Vegetables and leafy greens", "Berries, apples, pears", "Oats, brown rice, wholemeal bread", "Beans, lentils, nuts and seeds"],
    why: [
      { title: "Fullness", body: "Fiber adds bulk, so meals keep you full on fewer calories." },
      { title: "Gut health", body: "It feeds the good bacteria in your gut." },
      { title: "Steady blood sugar", body: "It slows sugar from carbs, avoiding spikes and crashes." },
    ],
    levels: {
      low: "Add greens, fruit or beans for more.",
      moderate: "A decent amount. About 30 g a day is the aim.",
      high: "Plenty of fiber. Good for fullness and your gut.",
    },
    rule: "Grams of fiber per 500 kcal of food (3 g and 7 g), so snacks and big meals compare fairly.",
  },
  processing: {
    title: "Processing level",
    image: "oats",
    what: "How far a food is from how it grows. Ultra-processed foods are made in factories from refined ingredients.",
    sources: ["Whole: fruit, eggs, fresh meat, plain rice", "Simply prepared: home or hawker cooking", "Processed: cheese, cured meat, white bread", "Ultra-processed: soda, chips, instant noodles, sweets"],
    why: [
      { title: "Easy to overeat", body: "Ultra-processed foods are built to taste great and digest fast, so they don't fill you up." },
      { title: "More of the good stuff", body: "Whole foods keep their fiber, vitamins and minerals." },
    ],
    levels: {
      low: "Mostly whole or simply cooked foods. Great.",
      moderate: "Some processed foods. Fine in a balanced day.",
      high: "Mostly ultra-processed. Swap in fresh foods when you can.",
    },
    rule: "Each item is rated whole, simply prepared, processed or ultra-processed (the NOVA groups), weighted by calories.",
  },
  sugar: {
    title: "Added sugars",
    image: "coffee",
    what: "Sugar added to food and drinks: syrups, honey, sweetened sauces. Natural sugar in whole fruit and milk doesn't count.",
    sources: ["Sweet drinks: kopi, teh, bubble tea, soda", "Desserts and pastries", "Sauces: ketchup, sweet chili, teriyaki", "Flavored yogurt and cereals"],
    why: [
      { title: "Empty calories", body: "Added sugar brings energy with nothing else, and doesn't fill you up." },
      { title: "Energy crashes", body: "A quick spike in blood sugar is often followed by a dip and cravings." },
    ],
    levels: {
      low: "Little or no added sugar. Nice.",
      moderate: "Some added sugar. Keep an eye on drinks.",
      high: "Lots of added sugar. Try less sweet next time.",
    },
    rule: "Share of the meal's calories from added sugar (5% and 10%, from WHO guidance).",
  },
  fat: {
    title: "Total fats",
    image: "bowl",
    what: "A dense energy source that helps you absorb vitamins A, D, E and K and make hormones.",
    sources: ["Olive oil, avocado", "Nuts and seeds", "Oily fish like salmon", "Eggs and dairy"],
    why: [
      { title: "Hormones and vitamins", body: "You need some fat to make hormones and absorb vitamins." },
      { title: "Calorie dense", body: "Fat has 9 kcal per gram, over twice carbs or protein, so it adds up fast." },
    ],
    levels: {
      low: "A lean meal.",
      moderate: "A balanced amount of fat.",
      high: "Rich in fat. Watch oil and fried foods if you're cutting.",
    },
    rule: "Share of the meal's calories from fat (25% and 40%).",
  },
  carbs: {
    title: "Total carbs",
    image: "oats",
    what: "Your body's main fuel, especially for hard training. Includes starch, sugar and fiber.",
    sources: ["Rice, noodles, bread, potatoes", "Oats and other grains", "Fruit", "Beans and lentils"],
    why: [
      { title: "Training fuel", body: "Carbs refill the energy stored in your muscles for hard sessions." },
      { title: "Quality matters", body: "Carbs with fiber (whole grains, fruit, beans) give steadier energy than sugar." },
    ],
    levels: {
      low: "Light on carbs.",
      moderate: "A balanced amount of carbs.",
      high: "Carb heavy. Great before training; pair with protein and fiber.",
    },
    rule: "Share of the meal's calories from carbs (35% and 55%).",
  },
};
