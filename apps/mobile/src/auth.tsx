import { createApiClient, type ApiUser } from "@legymdary/shared";
import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

const TOKEN_KEY = "legymdary.token";
const DEFAULT_API_URL = "https://legymdary.vercel.app";

export const API_URL = process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_URL;
export const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

type AuthState = {
  /** false until the stored token has been read. */
  ready: boolean;
  user: ApiUser | null;
  api: ReturnType<typeof createApiClient>;
  signIn: (email: string, password: string) => Promise<void>;
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
        onUnauthorized: () => void clear(),
      }),
    [clear],
  );

  // Restore the session: read the stored token, then confirm it with /me.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        token.current = await SecureStore.getItemAsync(TOKEN_KEY);
        if (token.current) {
          const { user: me } = await api.me();
          if (alive) setUser(me);
        }
      } catch {
        // 401 already cleared the token; a network error keeps the token but shows the login screen.
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [api]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const res = await api.login({ email, password, deviceName: "LeGYMdary app" });
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
    await clear();
  }, [api, clear]);

  const value = useMemo(() => ({ ready, user, api, signIn, signOut }), [ready, user, api, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
