import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import authConfig from "./auth.config";
import { db } from "./db";
import { accounts, sessions, users, verificationTokens } from "./db/schema";
import { verifyPassword } from "./lib/password";
import { clientIp, rateLimit } from "./lib/rate-limit";

/** Surfaced to the login form as `code: "rate_limited"`. */
class RateLimited extends CredentialsSignin {
  code = "rate_limited";
}

const FIFTEEN_MIN = 15 * 60 * 1000;

/** Email + password sign-in. Sign-up is handled by the signUp server action. */
const passwordProvider = Credentials({
  id: "password",
  name: "Email & password",
  credentials: {
    email: { label: "Email", type: "email" },
    password: { label: "Password", type: "password" },
  },
  async authorize(creds, request) {
    const email = String(creds?.email ?? "")
      .trim()
      .toLowerCase();
    const password = String(creds?.password ?? "");
    // Length caps stop huge inputs from being hashed (cheap DoS).
    if (!email || !password || email.length > 254 || password.length > 256) return null;

    // Brute-force protection: per account and per IP.
    const ip = await clientIp(request?.headers);
    const [byEmail, byIp] = await Promise.all([
      rateLimit(`login:email:${email}`, 10, FIFTEEN_MIN),
      rateLimit(`login:ip:${ip}`, 30, FIFTEEN_MIN),
    ]);
    if (!byEmail.ok || !byIp.ok) throw new RateLimited();

    const rows = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    const u = rows[0];
    if (!u?.passwordHash) return null; // no account, or a Google-only account
    if (!(await verifyPassword(password, u.passwordHash))) return null;

    return { id: u.id, email: u.email, name: u.name ?? email };
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
