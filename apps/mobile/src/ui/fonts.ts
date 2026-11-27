import type { TextStyle } from "react-native";

/**
 * Geist, the web app's font (static cuts made from Next's bundled variable font,
 * SIL Open Font License). One file per weight: RN can't pick weights from a
 * single family on Android, so each weight is its own family name.
 */
export const GEIST_FONTS = {
  "Geist-Regular": require("../../assets/fonts/Geist-Regular.ttf"),
  "Geist-Medium": require("../../assets/fonts/Geist-Medium.ttf"),
  "Geist-SemiBold": require("../../assets/fonts/Geist-SemiBold.ttf"),
  "Geist-Bold": require("../../assets/fonts/Geist-Bold.ttf"),
};

/** The Geist family for a font weight (400 / 500 / 600 / 700+). */
export function geistFor(weight: TextStyle["fontWeight"]): string {
  const w = weight === "bold" ? 700 : weight === "normal" || weight == null ? 400 : Number(weight);
  if (w >= 700) return "Geist-Bold";
  if (w >= 600) return "Geist-SemiBold";
  if (w >= 500) return "Geist-Medium";
  return "Geist-Regular";
}
