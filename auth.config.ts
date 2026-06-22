import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Edge-safe Auth.js config (no database adapter). Imported by both the full
 * server instance (auth.ts) and the proxy/middleware. The Google provider is
 * only registered once its credentials are present, so the app still boots in
 * local dev before you've set them.
 */
export default {
  trustHost: true,
  pages: { signIn: "/login" },
  providers: process.env.AUTH_GOOGLE_ID ? [Google] : [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const onLogin = nextUrl.pathname === "/login";
      if (onLogin) {
        if (isLoggedIn) return Response.redirect(new URL("/", nextUrl));
        return true;
      }
      return isLoggedIn;
    },
  },
} satisfies NextAuthConfig;
