import Svg, { Path } from "react-native-svg";

/** The web app's line icons (components/icons.tsx), same 24×24 paths and 1.75 stroke. */
const PATHS = {
  home: ["M3 10.5 12 3l9 7.5", "M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5"],
  train: ["M6.5 6.5v11M3.5 9v6M17.5 6.5v11M20.5 9v6M6.5 12h11"],
  food: ["M7 3v7a2 2 0 0 0 2 2v9M11 3v7a2 2 0 0 1-2 2M9 3v6M17 21V3c-2 1.5-3 4-3 7v3h3"],
  progress: ["M5 20V11M12 20V4M19 20v-6"],
  insights: ["M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"],
  play: ["M8 5.5v13a.6.6 0 0 0 .9.5l10.2-6.5a.6.6 0 0 0 0-1L8.9 5a.6.6 0 0 0-.9.5Z"],
  chevronRight: ["M9 6l6 6-6 6"],
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22, color, fill }: { name: IconName; size?: number; color: string; fill?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {PATHS[name].map((d) => (
        <Path key={d} d={d} stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" fill={fill ? color : "none"} />
      ))}
    </Svg>
  );
}
