import { useCallback, useState } from "react";
import { Alert } from "react-native";
import { errorMessage } from "./useApi";

/**
 * Runs a write with a busy flag and an error alert. `busy` holds the key of the latest running call (calls may overlap),
 * so one screen can show a spinner on the button that was pressed. Resolves to undefined on failure.
 */
export function useMutation() {
  const [busy, setBusy] = useState<string[]>([]);
  const run = useCallback(async <T,>(key: string, fn: () => Promise<T>, errorTitle = "Couldn't do that"): Promise<T | undefined> => {
    setBusy((b) => [...b, key]);
    try {
      return await fn();
    } catch (e) {
      Alert.alert(errorTitle, errorMessage(e));
      return undefined;
    } finally {
      setBusy((b) => { const i = b.indexOf(key); return i < 0 ? b : [...b.slice(0, i), ...b.slice(i + 1)]; });
    }
  }, []);
  // `busy` is the key of the latest running call (null when idle), as before; `isBusy(key)` checks any running call.
  return { run, busy: busy.length ? busy[busy.length - 1] : null, isBusy: (key: string) => busy.includes(key) };
}
