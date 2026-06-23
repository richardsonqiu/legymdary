"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/password";

export async function signUp(input: {
  email: string;
  password: string;
}): Promise<{ error?: string }> {
  const email = input.email?.trim().toLowerCase();
  const password = input.password ?? "";

  if (!email || !email.includes("@")) return { error: "Enter a valid email." };
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

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
