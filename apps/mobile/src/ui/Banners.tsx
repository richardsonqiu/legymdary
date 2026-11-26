import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "./Text";
import { useTones } from "./tones";

/** Shown when a refresh failed but older data is still on screen. Tap to retry. */
export function StaleBanner({ error, onRetry }: { error: string | null; onRetry?: () => void }) {
  const tones = useTones();
  if (!error) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Couldn't refresh. Showing saved data. ${error} Tap to retry.`}
      onPress={onRetry}
      style={{ borderRadius: 12, borderWidth: 1, borderColor: tones.warn, paddingVertical: 10, paddingHorizontal: 12, minHeight: 44, justifyContent: "center" }}
    >
      <Text variant="caption" tone="warn">
        Couldn&apos;t refresh. Showing saved data. {error}
        {onRetry ? " Tap to retry." : ""}
      </Text>
    </Pressable>
  );
}

/**
 * Inline success message. Render `node` once near the top of the screen and call `show("Saved")`.
 * shortcut: one message at a time, shown in the page flow, not floating over the screen.
 */
export function useToast(ms = 2500) {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const show = useCallback(
    (m: string) => {
      setMsg(m);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setMsg(null), ms);
    },
    [ms],
  );
  const node = msg ? (
    <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={{ borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: "transparent" }}>
      <ToastText text={msg} />
    </View>
  ) : null;
  return { show, node };
}

function ToastText({ text }: { text: string }) {
  return (
    <Text variant="label" tone="good">
      ✓ {text}
    </Text>
  );
}
