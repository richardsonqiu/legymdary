import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import authConfig from "./auth.config";
import { db } from "./db";
import { accounts, sessions, users, verificationTokens } from "./db/schema";

/**
 * Local-only email login (no Google credentials needed) so the multi-user flow
 * can be tested in development. Never registered in production.
 */
const devProviders =
  process.env.NODE_ENV !== "production"
    ? [
        Credentials({
          id: "dev",
          name: "Dev email login",
          credentials: { email: { label: "Email", type: "email" } },
          async authorize(creds) {
            const email = String(creds?.email ?? "")
              .trim()
              .toLowerCase();
            if (!email.includes("@")) return null;

            const found = await db
              .select()
              .from(users)
              .where(eq(users.email, email))
              .limit(1);
            if (found[0]) {
              return { id: found[0].id, email, name: found[0].name ?? email };
            }
            const id = crypto.randomUUID();
            const name = email.split("@")[0];
            await db.insert(users).values({ id, email, name });
            return { id, email, name };
          },
        }),
      ]
    : [];

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "jwt" },
  providers: [...authConfig.providers, ...devProviders],
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
