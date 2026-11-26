import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import authConfig from "./auth.config";
import { db } from "./db";
import { accounts, sessions, users, verificationTokens } from "./db/schema";
import { checkCredentials } from "./lib/credentials";

/** Surfaced to the login form as `code: "rate_limited"`. */
class RateLimited extends CredentialsSignin {
  code = "rate_limited";
}

/** Email + password sign-in. Sign-up is handled by the signUp server action. */
const passwordProvider = Credentials({
  id: "password",
  name: "Email & password",
  credentials: {
    email: { label: "Email", type: "email" },
    password: { label: "Password", type: "password" },
  },
  async authorize(creds, request) {
    const r = await checkCredentials(creds?.email, creds?.password, request?.headers);
    if (r.ok) return { id: r.user.id, email: r.user.email, name: r.user.name ?? r.user.email };
    if (r.reason === "rate_limited") throw new RateLimited();
    return null;
  },
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "jwt" },
  providers: [...authConfig.providers, passwordProvider],
  callbacks: {
    ...authConfig.callbacks,
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
