import type { ReactNode } from "react";
import { ImageBackground, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { Text } from "./Text";

/** The web's editorial photos (public/editorial), bundled as JPEG. */
export const PHOTOS = {
  pullup: require("../../assets/editorial/pullup.jpg"),
  salmon: require("../../assets/editorial/salmon.jpg"),
  runner: require("../../assets/editorial/runner.jpg"),
  sleep: require("../../assets/editorial/sleep.jpg"),
  sunrise: require("../../assets/editorial/sunrise.jpg"),
  mountains: require("../../assets/editorial/mountains.jpg"),
  ocean: require("../../assets/editorial/ocean.jpg"),
  evening: require("../../assets/editorial/evening.jpg"),
} satisfies Record<string, ImageSourcePropType>;
export type PhotoName = keyof typeof PHOTOS;

const PAPER = "#f5f5f0";

/** A vertical gradient over its parent (react-native-svg, no extra package). */
export function Fade({ from, to, id, stops = [0, 1] }: { from: string; to: string; id: string; stops?: [number, number] }) {
  return (
    <Svg style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} width="100%" height="100%" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset={stops[0]} stopColor={from} stopOpacity={from === "transparent" ? 0 : 1} />
          <Stop offset={stops[1]} stopColor={to} stopOpacity={to === "transparent" ? 0 : 1} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

/** Page title over a photo, like the web PageHeader banner: Paper text, darker at the bottom. */
export function PhotoBanner({
  photo,
  eyebrow,
  title,
  subtitle,
  right,
  style,
}: {
  photo: PhotoName;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <ImageBackground
      source={PHOTOS[photo]}
      resizeMode="cover"
      accessibilityIgnoresInvertColors
      style={[{ minHeight: 148, borderRadius: 28, overflow: "hidden", justifyContent: "flex-end" }, style]}
    >
      <Fade id={`banner-${photo}`} from="transparent" to="rgba(25,25,25,0.78)" stops={[0.2, 1]} />
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12, paddingHorizontal: 20, paddingBottom: 16, paddingTop: 40 }}>
        <View style={{ flex: 1 }}>
          {eyebrow ? (
            <Text style={{ color: "rgba(245,245,240,0.75)", fontSize: 11, fontWeight: "600", letterSpacing: 2.2, textTransform: "uppercase" }}>{eyebrow}</Text>
          ) : null}
          <Text accessibilityRole="header" style={{ color: PAPER, fontSize: 28, fontWeight: "600", letterSpacing: -0.6, lineHeight: 32 }}>
            {title}
          </Text>
          {subtitle ? <Text style={{ color: "rgba(245,245,240,0.8)", fontSize: 14, marginTop: 2 }}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
    </ImageBackground>
  );
}
