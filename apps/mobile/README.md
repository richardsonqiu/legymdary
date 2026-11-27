# One Up mobile (Expo)

One Expo (React Native, TypeScript strict) app for iOS and Android. Bundle id / package: `com.richardsonqiu.legymdary`.

## Run

From the repo root, `npm ci` once. Then in `apps/mobile`:

- `npm run typecheck`, `npm run doctor`, `npm run export:ios`, `npm run export:android` (JS bundle checks, no native toolchain needed).
- A dev build is required (`expo-dev-client`); Expo Go will not work once HealthKit / Health Connect land. Build with EAS or `expo run:ios` / `expo run:android` (needs Xcode / Android SDK).
- `EXPO_PUBLIC_API_URL` sets the API origin. Default: `https://legymdary.vercel.app`. For a local web server use your LAN address, not `localhost`.

## What is here

- `app/login.tsx`: email + password via `POST /api/v1/auth/login`. Continue with Google uses @react-native-google-signin/google-signin (needs a dev build; hidden in Expo Go and web), sends the ID token to `POST /api/v1/auth/google`, and stores the returned token like email login. The Google account must have signed in on the web once (the server matches by Google `sub` only). Client IDs are in `app.json` under `extra.google`; the iOS URL scheme is in the plugin entry. The Android client is matched by Google from package name + SHA-1.
- Token in `expo-secure-store`; sign-out calls `/api/v1/auth/logout`; a 401 clears the token.
- `src/auth.tsx` builds the shared client (`createApiClient` in `packages/shared/src/api/client.ts`), which sends `Authorization: Bearer` and `X-Timezone` on every request and parses responses with the zod schemas from `@legymdary/shared`.
- Tabs come from the shared `NAV` (moved from `lib/nav.ts` to `packages/shared/src/nav.ts`; web imports it from there). Only Today is built; the rest are placeholders.
- Theme: Carbon / Citron / Paper from `app/globals.css`, dark 7 PM to 6 AM like the web Auto rule.

## Icon and splash

`assets/icon.png`, `adaptive-icon.png`, `splash-icon.png`, `splash-icon-dark.png` and `favicon.png` are generated with the web icons by `node scripts/gen-icons.mjs` (repo root) from the "one up." wordmark. The splash (`expo-splash-screen` plugin in `app.json`) shows the wordmark on Paper in light mode and Carbon in dark mode; `app/_layout.tsx` keeps it up until auth is ready. Native config changes need a new dev build.

## Google sign-in: signing keys

An Android OAuth client only works for builds signed with its SHA-1. Debug builds use the debug keystore SHA-1. For Play Store builds, add a second Android OAuth client (same package) with the **Play App Signing** SHA-1 from Play Console > App integrity > App signing key certificate. EAS builds need their own keystore SHA-1 (`eas credentials`) added the same way.

## React version

Expo SDK 58 pins `react` 19.3.0 exactly (React Native 0.88.1). Next 16 accepts `^19` and its App Router runs on a bundled React 19.3 canary, so the root `react` / `react-dom` moved from 19.2.4 to 19.3.0 and root `overrides` force that one version everywhere. `npm ls react` shows a single deduped 19.3.0. Metro uses Expo's automatic monorepo config; no `metro.config.js`.

## Not verified here

No Xcode or Android SDK on the build machine, so the app was not run on a device or simulator. Only `tsc`, `expo-doctor` and `expo export` ran.
