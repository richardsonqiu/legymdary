import { ApiClientError, createApiClient, type ApiUser } from "@legymdary/shared";
import * as SecureStore from "expo-secure-store";
import { googleSignIn } from "./googleSignIn";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

const TOKEN_KEY = "legymdary.token";
const DEFAULT_API_URL = "https://legymdary.vercel.app";

export const API_URL = process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_URL;
export const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

type AuthState = {
  /** false until the stored token has been read. */
  ready: boolean;
  user: ApiUser | null;
  /** true when the stored token could not be checked because the server was unreachable. */
  offline: boolean;
  retry: () => Promise<void>;
  api: ReturnType<typeof createApiClient>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: (idToken: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<ApiUser | null>(null);
  const [offline, setOffline] = useState(false);
  const token = useRef<string | null>(null);

  const clear = useCallback(async () => {
    token.current = null;
    setUser(null);
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
  }, []);

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: API_URL,
        getToken: () => token.current,
        timeZone: deviceTimeZone,
        // A late 401 for an old token must not log out a newer sign-in.
        onUnauthorized: (sent) => {
          if (token.current === sent) void clear();
        },
      }),
    [clear],
  );

  // Restore the session: read the stored token, then confirm it with /me.
  const restore = useCallback(async () => {
    setOffline(false);
    try {
      token.current ??= await SecureStore.getItemAsync(TOKEN_KEY);
      const sent = token.current;
      if (sent) {
        const { user: me } = await api.me();
        if (token.current === sent) setUser(me);
      }
    } catch (e) {
      // A 401 already cleared the token. No response (status 0): keep the token and offer Retry.
      if (e instanceof ApiClientError && e.status === 0 && token.current) setOffline(true);
    } finally {
      setReady(true);
    }
  }, [api]);

  useEffect(() => {
    void restore();
  }, [restore]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const res = await api.login({ email, password, deviceName: "One Up app" });
      await SecureStore.setItemAsync(TOKEN_KEY, res.token);
      token.current = res.token;
      setUser(res.user);
    },
    [api],
  );

  const signInWithGoogle = useCallback(
    async (idToken: string) => {
      const res = await api.googleLogin({ idToken, deviceName: "One Up app" });
      await SecureStore.setItemAsync(TOKEN_KEY, res.token);
      token.current = res.token;
      setUser(res.user);
    },
    [api],
  );

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Offline or already expired: still sign out on this device.
    }
    await googleSignIn?.signOut();
    await clear();
  }, [api, clear]);

  const value = useMemo(
    () => ({ ready, user, offline, retry: restore, api, signIn, signInWithGoogle, signOut }),
    [ready, user, offline, restore, api, signIn, signInWithGoogle, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
