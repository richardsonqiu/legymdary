import type { ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";
import { useTheme } from "../theme";
import { StaleBanner } from "./Banners";
import { Button } from "./Button";
import { SkeletonRows } from "./Skeleton";
import { Text } from "./Text";

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ borderWidth: 1, borderStyle: "dashed", borderColor: t.border, borderRadius: 16, padding: 20, alignItems: "center", gap: 6 }}>
      <Text variant="heading" style={{ textAlign: "center" }}>
        {title}
      </Text>
      {description ? (
        <Text variant="body" tone="muted" style={{ textAlign: "center" }}>
          {description}
        </Text>
      ) : null}
      {action ? <View style={{ marginTop: 8 }}>{action}</View> : null}
    </View>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  const t = useTheme();
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} style={{ paddingVertical: 32, alignItems: "center" }}>
      <ActivityIndicator color={t.muted} />
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={{ padding: 20, alignItems: "center", gap: 12 }}>
      <Text variant="body" tone="danger" style={{ textAlign: "center" }}>
        {message}
      </Text>
      {onRetry ? <Button title="Try again" variant="secondary" small onPress={onRetry} /> : null}
    </View>
  );
}

/** First load shows placeholder rows, a failure with nothing to show shows an error with retry, otherwise the children (with a StaleBanner when a refresh failed). */
export function QueryBoundary({ loading, error, hasData, onRetry, children }: { loading: boolean; error: string | null; hasData: boolean; onRetry: () => void; children: ReactNode }) {
  if (loading) return <SkeletonRows />;
  if (!hasData && error) return <ErrorState message={error} onRetry={onRetry} />;
  return (
    <>
      <StaleBanner error={hasData ? error : null} onRetry={onRetry} />
      {children}
    </>
  );
}