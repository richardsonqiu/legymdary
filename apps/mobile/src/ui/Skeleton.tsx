import { useEffect, useRef } from "react";
import { Animated, View, type DimensionValue } from "react-native";
import { useTones } from "./tones";

/** A pulsing placeholder block. Hidden from screen readers. */
export function Skeleton({ width = "100%", height = 16, radius = 8 }: { width?: DimensionValue; height?: number; radius?: number }) {
  const tones = useTones();
  const o = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([Animated.timing(o, { toValue: 1, duration: 700, useNativeDriver: true }), Animated.timing(o, { toValue: 0.5, duration: 700, useNativeDriver: true })]),
    );
    loop.start();
    return () => loop.stop();
  }, [o]);
  return <Animated.View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ width, height, borderRadius: radius, backgroundColor: tones.track, opacity: o }} />;
}

/** Placeholder list rows for the first load. */
export function SkeletonRows({ count = 3, height = 56 }: { count?: number; height?: number }) {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Loading" style={{ gap: 10 }}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} height={height} radius={14} />
      ))}
    </View>
  );
}
