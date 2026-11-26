import { z } from "zod";

/** Request and response shapes for /api/v1/auth/* and /api/v1/me. Used by the server routes and the apps. */

/** Length caps match the web login (they stop huge inputs from being hashed). */
export const loginRequestSchema = z.object({
  email: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(256),
  /** Shown in a future "signed-in devices" list, e.g. "Richard's iPhone". */
  deviceName: z.string().trim().max(80).optional(),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const googleLoginRequestSchema = z.object({
  /** The Google ID token (a JWT) from native Google sign-in. */
  idToken: z.string().min(1).max(8192),
  deviceName: z.string().trim().max(80).optional(),
});
export type GoogleLoginRequest = z.infer<typeof googleLoginRequestSchema>;

export const apiUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
});
export type ApiUser = z.infer<typeof apiUserSchema>;

export const authResponseSchema = z.object({
  token: z.string(),
  /** ISO 8601 time after which the token stops working. */
  expiresAt: z.string(),
  user: apiUserSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

export const meResponseSchema = z.object({ user: apiUserSchema });
export type MeResponse = z.infer<typeof meResponseSchema>;

export const logoutResponseSchema = z.object({ ok: z.literal(true) });
export type LogoutResponse = z.infer<typeof logoutResponseSchema>;

export const apiErrorSchema = z.object({ error: z.string() });
export type ApiError = z.infer<typeof apiErrorSchema>;
