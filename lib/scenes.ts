/**
 * Background scenes for Home and Insights. One is picked per day, so the
 * app looks a little different each day but stays the same while you move
 * between tabs. Add more by dropping two webp files in /public and a row here.
 */
export type Scene = { id: string; full: string; hero: string; position: string };

export const SCENES: Scene[] = [
  { id: "dawn", full: "/bg-dawn.webp", hero: "/bg-dawn-hero.webp", position: "center 22%" },
  { id: "lake", full: "/bg-lake.webp", hero: "/bg-lake-hero.webp", position: "center 30%" },
];

/** Scene for a YYYY-MM-DD date (rotates daily). */
export function sceneFor(date: string): Scene {
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
  return SCENES[((day % SCENES.length) + SCENES.length) % SCENES.length];
}

/** Inline CSS variables consumed by .home-backdrop / .hero-photo. */
export function sceneStyle(s: Scene): React.CSSProperties {
  return {
    ["--scene" as string]: `url("${s.full}")`,
    ["--scene-hero" as string]: `url("${s.hero}")`,
    ["--scene-pos" as string]: s.position,
  };
}
