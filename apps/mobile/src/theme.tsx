import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/** Palette from the web theme tokens in app/globals.css (Carbon / Citron / Paper). */
export type Palette = {
  page: string;
  card: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  onAccent: string;
  danger: string;
  dark: boolean;
};

export const DARK: Palette = {
  page: "#191919",
  card: "#222221",
  border: "#2d2d2b",
  text: "#f5f5f0",
  muted: "#a5a5a1",
  accent: "#ded97a",
  onAccent: "#191919",
  danger: "#f87171",
  dark: true,
};

export const LIGHT: Palette = {
  page: "#f5f5f0",
  card: "#ffffff",
  border: "#e4e4de",
  text: "#191919",
  muted: "#6b6b66",
  accent: "#ded97a",
  onAccent: "#191919",
  danger: "#b91c1c",
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
