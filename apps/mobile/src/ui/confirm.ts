import { Alert } from "react-native";

/** Native yes/no dialog. Resolves true only when the confirm button is pressed. */
export function confirm({ title, message, confirmText = "OK", destructive = false }: { title: string; message?: string; confirmText?: string; destructive?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: confirmText, style: destructive ? "destructive" : "default", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
