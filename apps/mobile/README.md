# LeGYMdary mobile (Expo)

One Expo (React Native, TypeScript strict) app for iOS and Android. Bundle id / package: `com.richardsonqiu.legymdary`.

## Run

From the repo root, `npm ci` once. Then in `apps/mobile`:

- `npm run typecheck`, `npm run doctor`, `npm run export:ios`, `npm run export:android` (JS bundle checks, no native toolchain needed).
- A dev build is required (`expo-dev-client`); Expo Go will not work once HealthKit / Health Connect land. Build with EAS or `expo run:ios` / `expo run:android` (needs Xcode / Android SDK).
- `EXPO_PUBLIC_API_URL` sets the API origin. Default: `https://legymdary.vercel.app`. For a local web server use your LAN address, not `localhost`.

## What is here

- `app/login.tsx`: email + password via `POST /api/v1/auth/login`. The Google button is disabled until the owner creates iOS/Android OAuth client IDs.
- Token in `expo-secure-store`; sign-out calls `/api/v1/auth/logout`; a 401 clears the token.
- `src/auth.tsx` builds the shared client (`createApiClient` in `packages/shared/src/api/client.ts`), which sends `Authorization: Bearer` and `X-Timezone` on every request and parses responses with the zod schemas from `@legymdary/shared`.
- Tabs come from the shared `NAV` (moved from `lib/nav.ts` to `packages/shared/src/nav.ts`; web imports it from there). Only Today is built; the rest are placeholders.
- Theme: Carbon / Citron / Paper from `app/globals.css`, dark 7 PM to 6 AM like the web Auto rule.

## React version

Expo SDK 58 pins `react` 19.3.0 exactly (React Native 0.88.1). Next 16 accepts `^19` and its App Router runs on a bundled React 19.3 canary, so the root `react` / `react-dom` moved from 19.2.4 to 19.3.0 and root `overrides` force that one version everywhere. `npm ls react` shows a single deduped 19.3.0. Metro uses Expo's automatic monorepo config; no `metro.config.js`.

## Not verified here

No Xcode or Android SDK on the build machine, so the app was not run on a device or simulator. Only `tsc`, `expo-doctor` and `expo export` ran.
