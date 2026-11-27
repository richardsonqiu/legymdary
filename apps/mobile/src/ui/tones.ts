import { useTheme } from "../theme";

/** Status and macro colors that read on both Carbon (dark) and Paper (light). "good" is the accent: Citron, olive on Paper. */
export type Tones = { good: string; warn: string; info: string; violet: string; rose: string; track: string; scrim: string };

export function useTones(): Tones {
  const t = useTheme();
  return t.dark
    ? { good: "#ded97a", warn: "#fbbf24", info: "#38bdf8", violet: "#a78bfa", rose: "#fb7185", track: "#2d2d2b", scrim: "rgba(0,0,0,0.6)" }
    : { good: "#6b6716", warn: "#b45309", info: "#0369a1", violet: "#7c3aed", rose: "#e11d48", track: "#e4e4de", scrim: "rgba(0,0,0,0.4)" };
}
