"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/password";
import { clientIp, rateLimit, tooMany } from "@/lib/rate-limit";

export async function signUp(input: {
  email: string;
  password: string;
}): Promise<{ error?: string }> {
  const email = input.email?.trim().toLowerCase();
  const password = input.password ?? "";

  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Enter a valid email." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (password.length > 256) {
    return { error: "Password must be at most 256 characters." };
  }

  const limit = await rateLimit(`signup:ip:${await clientIp()}`, 5, 60 * 60 * 1000);
  if (!limit.ok) return { error: tooMany(limit.retryAfterSec) };

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing[0]) {
    return { error: "An account with that email already exists." };
  }

  const passwordHash = await hashPassword(password);
  await db.insert(users).values({ email, name: email.split("@")[0], passwordHash });
  return {};
}
