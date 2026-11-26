import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import { errorMessage, invalidate, useMutation } from "../api/hooks";
import { useAuth } from "../auth";
import { Button, Card, StaleBanner, Text, confirm, useToast } from "../ui";
import { getPermissionState, healthName, requestPermissions, sync, type PermissionState } from "./health";
import { getLastSync } from "./sync";

const SOURCE = Platform.OS === "ios" ? "apple" : "health_connect";

const STATE_TEXT: Record<PermissionState, string> = {
  unavailable: "Not available on this device or build.",
  needed: "Not connected.",
  granted: "Connected.",
};

/** Connect, permission state, last sync time and "Sync now" for the phone's health store. Foreground only. */
export function HealthSection() {
  const { api, user } = useAuth();
  const { run, isBusy } = useMutation();
  const toast = useToast();
  const [state, setState] = useState<PermissionState | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const userId = user?.id != null ? String(user.id) : null;

  const refresh = useCallback(async () => {
    try {
      setState(await getPermissionState());
      if (userId) setLast(await getLastSync(userId, SOURCE));
    } catch (e) {
      setState("unavailable");
      setError(errorMessage(e));
    }
  }, [userId]);
  useEffect(() => void refresh(), [refresh]);

  const syncNow = () =>
    run("sync", async () => {
      if (!userId) return;
      setError(null);
      try {
        const r = await sync(api, userId);
        invalidate(); // Home, Progress and Food read what was just stored
        toast.show(`Synced ${r.days} days, ${r.sleep} nights, ${r.workouts} workouts`);
      } catch (e) {
        setError(errorMessage(e));
      }
      await refresh();
    });

  const connect = async () => {
    const ok = await confirm({
      title: `Connect ${healthName}?`,
      message: "LeGYMdary reads steps, calories, resting heart rate, sleep, weight, body fat and workouts, and sends them to your account. It never writes to your health data.",
      confirmText: "Continue",
    });
    if (!ok) return;
    await run("connect", async () => {
      setError(null);
      try {
        if (!(await requestPermissions())) setError("Permission was not given. You can allow it in the health app's settings.");
      } catch (e) {
        setError(errorMessage(e));
      }
      await refresh();
    });
    if ((await getPermissionState().catch(() => "needed")) === "granted") await syncNow();
  };

  return (
    <Card>
      {toast.node}
      <Text variant="heading">{healthName}</Text>
      <Text variant="body" tone="muted">
        {state == null ? "Checking..." : STATE_TEXT[state]}
        {state === "granted" ? ` Last sync: ${last ? new Date(last).toLocaleString() : "never"}.` : ""}
      </Text>
      <StaleBanner error={error} onRetry={state === "granted" ? () => void syncNow() : state === "needed" ? () => void connect() : undefined} />
      {state === "needed" ? <Button title={`Connect ${healthName}`} onPress={() => void connect()} loading={isBusy("connect")} /> : null}
      {state === "granted" ? <Button title="Sync now" variant="secondary" onPress={() => void syncNow()} loading={isBusy("sync")} /> : null}
    </Card>
  );
}