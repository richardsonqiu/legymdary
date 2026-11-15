import NextAuth from "next-auth";
import authConfig from "./auth.config";

// Edge-safe auth instance (no DB adapter) used purely to gate routes via the
// `authorized` callback in auth.config.
const { auth } = NextAuth(authConfig);

export const proxy = auth;

export const config = {
  // Public assets (manifest, icons) must load without a session.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|icon-192.png|icon-512.png|icon-maskable-512.png|apple-touch-icon.png).*)",
  ],
};
