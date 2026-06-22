"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { GoogleIcon } from "@/components/icons";
import { Button, Card, Field, inputClass } from "@/components/ui";

export function LoginForm({
  googleEnabled,
  devLogin,
}: {
  googleEnabled: boolean;
  devLogin: boolean;
}) {
  const [email, setEmail] = useState("");

  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
          LeGYMdary
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          The Legendary Gym Diary
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Sign in to track your workouts.
        </p>
      </div>

      <Card className="space-y-3">
        {googleEnabled ? (
          <Button
            size="lg"
            className="w-full"
            onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
          >
            <GoogleIcon className="h-5 w-5" />
            Continue with Google
          </Button>
        ) : (
          !devLogin && (
            <p className="text-center text-sm text-zinc-400">
              Sign-in isn&apos;t configured yet. Set{" "}
              <code className="text-zinc-300">AUTH_GOOGLE_ID</code> and{" "}
              <code className="text-zinc-300">AUTH_GOOGLE_SECRET</code>.
            </p>
          )
        )}

        {devLogin && (
          <div className="space-y-2">
            {googleEnabled && (
              <div className="flex items-center gap-3 py-1 text-[11px] uppercase tracking-wide text-zinc-600">
                <span className="h-px flex-1 bg-zinc-800" />
                or
                <span className="h-px flex-1 bg-zinc-800" />
              </div>
            )}
            <Field label="Dev email login">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={inputClass}
              />
            </Field>
            <Button
              variant="secondary"
              size="lg"
              className="w-full"
              disabled={!email.includes("@")}
              onClick={() => signIn("dev", { email, callbackUrl: "/dashboard" })}
            >
              Dev sign in
            </Button>
            <p className="text-center text-[11px] text-zinc-600">
              Development only — disabled in production.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
