/**
 * Editorial background scenes for Home and Insights. One is picked per day,
 * so the app looks a little different each day but stays the same while you
 * move between tabs. Photos live in /public/editorial.
 */
export type Scene = { id: string; full: string; hero: string; position: string };

export const SCENES: Scene[] = [
  { id: "sunrise", full: "/editorial/sunrise.webp", hero: "/editorial/sunrise.webp", position: "center 45%" },
  { id: "mountains", full: "/editorial/mountains.webp", hero: "/editorial/mountains.webp", position: "center 40%" },
  { id: "ocean", full: "/editorial/ocean.webp", hero: "/editorial/ocean.webp", position: "center 50%" },
  { id: "evening", full: "/editorial/evening.webp", hero: "/editorial/evening.webp", position: "center 30%" },
];

/** Scene for a YYYY-MM-DD date (rotates daily). */
export function sceneFor(date: string): Scene {
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
  return SCENES[((day % SCENES.length) + SCENES.length) % SCENES.length];
}

/** Inline CSS variables consumed by .home-backdrop / .hero-photo. */
export function sceneStyle(s: Scene): Record<string, string> {
  return {
    ["--scene" as string]: `url("${s.full}")`,
    ["--scene-hero" as string]: `url("${s.hero}")`,
    ["--scene-pos" as string]: s.position,
  };
}
