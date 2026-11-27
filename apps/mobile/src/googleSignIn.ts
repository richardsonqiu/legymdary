import Constants from "expo-constants";

/**
 * Native Google sign-in. The module is loaded lazily so Expo Go and web (no native code) still open;
 * there `googleSignIn` is null and the button is hidden. Client IDs live in app.json -> extra.google.
 * The Android client is matched by Google from package name + SHA-1, so it is not passed here.
 */
type Mod = typeof import("@react-native-google-signin/google-signin");

function load(): Mod | null {
  try {
    return require("@react-native-google-signin/google-signin") as Mod;
  } catch {
    return null;
  }
}

const ids = (Constants.expoConfig?.extra?.google ?? {}) as { webClientId?: string; iosClientId?: string };
const mod = ids.webClientId ? load() : null;
let configured = false;

/** Thrown with a message that is safe to show as is. */
export class GoogleSignInError extends Error {}

function configure(m: Mod) {
  if (configured) return;
  // webClientId makes Android return an ID token; the server accepts it as the web audience.
  m.GoogleSignin.configure({ webClientId: ids.webClientId, iosClientId: ids.iosClientId });
  configured = true;
}

/** Returns the ID token, or null when the user cancelled. */
async function getIdToken(): Promise<string | null> {
  if (!mod) throw new GoogleSignInError("Google sign-in is not available in this build.");
  try {
    configure(mod);
    await mod.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const res = await mod.GoogleSignin.signIn();
    if (res.type !== "success") return null;
    if (!res.data.idToken) throw new GoogleSignInError("Google did not return a sign-in token. Try again.");
    return res.data.idToken;
  } catch (e) {
    if (e instanceof GoogleSignInError) throw e;
    const code = (e as { code?: string } | null)?.code;
    if (code === mod.statusCodes.SIGN_IN_CANCELLED) return null;
    if (code === mod.statusCodes.IN_PROGRESS) return null;
    if (code === mod.statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      throw new GoogleSignInError("Google Play services is missing or out of date on this phone.");
    }
    throw new GoogleSignInError(
      /network/i.test(String((e as Error | null)?.message)) ? "Can't reach Google. Check your connection." : "Google sign-in failed. Try again.",
    );
  }
}

async function signOut(): Promise<void> {
  if (!mod) return;
  try {
    configure(mod);
    await mod.GoogleSignin.signOut();
  } catch {
    // Not signed in with Google, or offline: nothing to clear.
  }
}

export const googleSignIn = mod ? { getIdToken, signOut } : null;
