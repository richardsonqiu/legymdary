"use server";

import { cookies } from "next/headers";
import { AUTH_COOKIE, authToken } from "@/lib/auth";

export async function login(password: string): Promise<{ error?: string }> {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return {}; // gate disabled — nothing to do
  if (password !== expected) return { error: "Incorrect password." };

  const token = await authToken(expected);
  const store = await cookies();
  store.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return {};
}
