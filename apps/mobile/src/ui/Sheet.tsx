import type { ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme";
import { Text } from "./Text";
import { useTones } from "./tones";

/** Bottom sheet. Tap outside or the system back gesture closes it. */
export function Sheet({ visible, title, onClose, children }: { visible: boolean; title?: string; onClose: () => void; children: ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const tones = useTones();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable accessible={false} onPress={onClose} style={{ flex: 1, backgroundColor: tones.scrim }} />
        <View
          style={{
            backgroundColor: t.card,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            borderColor: t.border,
            borderWidth: 1,
            maxHeight: "88%",
            paddingBottom: insets.bottom + 12,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, paddingBottom: 8 }}>
            <Text variant="heading" accessibilityRole="header">
              {title ?? ""}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}>
              <Text variant="label" tone="muted">
                Close
              </Text>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 12 }}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
