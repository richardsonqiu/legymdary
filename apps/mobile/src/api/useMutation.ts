import { useCallback, useState } from "react";
import { Alert } from "react-native";
import { errorMessage } from "./useApi";

/**
 * Runs a write with a busy flag and an error alert. `busy` holds the key of the running call,
 * so one screen can show a spinner on the button that was pressed. Resolves to undefined on failure.
 */
export function useMutation() {
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(async <T,>(key: string, fn: () => Promise<T>, errorTitle = "Couldn't do that"): Promise<T | undefined> => {
    setBusy(key);
    try {
      return await fn();
    } catch (e) {
      Alert.alert(errorTitle, errorMessage(e));
      return undefined;
    } finally {
      setBusy(null);
    }
  }, []);
  return { run, busy };
}
