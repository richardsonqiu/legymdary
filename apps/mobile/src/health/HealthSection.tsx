import { useCallback, useEffect, useState } from "react";
import { AppState, Linking, Platform, View } from "react-native";
import { errorMessage, invalidate, useMutation } from "../api/hooks";
import { useAuth } from "../auth";
import { Button, Card, StaleBanner, Text, confirm, useToast } from "../ui";
import { getPermissionState, healthName, missingPermissions, requestPermissions, sync, type PermissionState } from "./health";
import { getLastSync } from "./sync";

const SOURCE = Platform.OS === "ios" ? "apple" : "health_connect";
const HEALTH_CONNECT_STORE = "market://details?id=com.google.android.apps.healthdata";
const HEALTH_CONNECT_WEB = "https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata";

const STATE_TEXT: Record<PermissionState, string> = {
  unavailable: "Not available on this device or build.",
  needs_install: "Health Connect is not installed or needs an update.",
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
  const [missing, setMissing] = useState<string[]>([]);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const userId = user?.id != null ? String(user.id) : null;
  const syncing = isBusy("sync") || isBusy("resync");

  const refresh = useCallback(async () => {
    try {
      const s = await getPermissionState();
      setState(s);
      setMissing(s === "granted" ? await missingPermissions() : []);
      if (userId) setLast(await getLastSync(userId, SOURCE));
    } catch (e) {
      setState("unavailable");
      setError(errorMessage(e));
    }
  }, [userId]);
  useEffect(() => void refresh(), [refresh]);
  // The user may have changed access in the system settings or in Health Connect and come back.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => s === "active" && void refresh());
    return () => sub.remove();
  }, [refresh]);

  const runSync = (key: "sync" | "resync") =>
    run(key, async () => {
      if (!userId) return;
      setError(null);
      try {
        const r = await sync(api, userId, { full: key === "resync" });
        if (r.empty) {
          // Denied HealthKit reads come back empty, so an empty read is shown as a likely denial.
          setDenied(true);
          setError(`No health data was found. If you did not allow access, turn it on in ${Platform.OS === "ios" ? "Settings > Health > Data Access" : "Health Connect"}, then tap "Resync last 30 days".`);
        } else {
          setDenied(false);
          invalidate(); // Home, Progress and Food read what was just stored
          toast.show(`Synced ${r.days} days, ${r.sleep} nights, ${r.workouts} workouts`);
        }
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
    let allowed = false;
    await run("connect", async () => {
      setError(null);
      try {
        allowed = await requestPermissions();
        setDenied(!allowed);
        if (!allowed) setError("Permission was not given. You can allow it in the health app's settings.");
      } catch (e) {
        setError(errorMessage(e));
      }
      await refresh();
    });
    if (allowed) await runSync("sync");
  };

  const install = () => Linking.openURL(HEALTH_CONNECT_STORE).catch(() => Linking.openURL(HEALTH_CONNECT_WEB));

  return (
    <View accessibilityState={{ busy: syncing }}>
      <Card>
        {toast.node}
        <Text variant="heading">{healthName}</Text>
        <Text variant="body" tone="muted">
          {state == null ? "Checking..." : STATE_TEXT[state]}
          {state === "granted" ? ` Last sync: ${last ? new Date(last).toLocaleString() : "never"}.` : ""}
        </Text>
        {syncing ? (
          <Text variant="label" tone="info" accessibilityLiveRegion="polite">
            Syncing...
          </Text>
        ) : null}
        {state === "granted" && missing.length > 0 ? (
          <Text variant="caption" tone="warn">
            Not allowed, so not synced: {missing.join(", ")}. Turn them on in Health Connect.
          </Text>
        ) : null}
        <StaleBanner error={error} onRetry={state === "granted" ? () => void runSync("sync") : state === "needed" ? () => void connect() : undefined} />
        {state === "needed" ? <Button title={denied ? "Try again" : `Connect ${healthName}`} onPress={() => void connect()} loading={isBusy("connect")} /> : null}
        {state === "needs_install" ? <Button title="Install or update Health Connect" onPress={() => void install()} /> : null}
        {denied || missing.length > 0 ? <Button title="Open settings" variant="ghost" onPress={() => void Linking.openSettings()} /> : null}
        {state === "granted" ? (
          <>
            <Button title={syncing ? "Syncing..." : "Sync now"} variant="secondary" onPress={() => void runSync("sync")} loading={isBusy("sync")} disabled={syncing} accessibilityLabel={syncing ? "Syncing" : "Sync now"} />
            <Button title="Resync last 30 days" variant="ghost" onPress={() => void runSync("resync")} loading={isBusy("resync")} disabled={syncing} />
          </>
        ) : null}
      </Card>
    </View>
  );
}
