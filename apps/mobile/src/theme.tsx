import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/** Palette from the web theme tokens in app/globals.css (Carbon / Citron / Paper). */
export type Palette = {
  page: string;
  card: string;
  border: string;
  text: string;
  muted: string;
  /** Dimmer text (web zinc-500): section titles, field labels, inactive tabs. */
  muted2: string;
  /** Border for buttons and inputs (web zinc-700). */
  controlBorder: string;
  accent: string;
  onAccent: string;
  /** Errors use the web amber (warn) tone, not red. */
  danger: string;
  dark: boolean;
};

export const DARK: Palette = {
  page: "#191919",
  card: "#222221",
  border: "#2d2d2b",
  text: "#f5f5f0",
  muted: "#a5a5a1",
  muted2: "#8b8b87",
  controlBorder: "#3e3e3c",
  accent: "#ded97a",
  onAccent: "#191919",
  danger: "#fbbf24",
  dark: true,
};

export const LIGHT: Palette = {
  page: "#f5f5f0",
  card: "#ffffff",
  border: "#e4e4de",
  text: "#191919",
  muted: "#585854",
  muted2: "#6b6b66",
  controlBorder: "#d2d2cb",
  accent: "#ded97a",
  onAccent: "#191919",
  danger: "#b45309",
  dark: false,
};

/** Same Auto rule as the web THEME_SCRIPT in app/layout.tsx: dark from 7 PM to 6 AM. */
export const isNight = (d: Date = new Date()) => d.getHours() >= 19 || d.getHours() < 6;

const ThemeContext = createContext<Palette>(DARK);
export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [night, setNight] = useState(isNight);
  useEffect(() => {
    const id = setInterval(() => setNight(isNight()), 60_000);
    return () => clearInterval(id);
  }, []);
  return <ThemeContext.Provider value={night ? DARK : LIGHT}>{children}</ThemeContext.Provider>;
}
