import type { ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";
import { useTheme } from "../theme";
import { Button } from "./Button";
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

/** Spinner on first load, error with retry, else children. For data that has no cached copy yet. */
export function QueryBoundary({ loading, error, onRetry, children }: { loading: boolean; error: string | null; onRetry: () => void; children: ReactNode }) {
  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  return <>{children}</>;
}
