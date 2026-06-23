"use client";

import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState, useTransition } from "react";
import { signUp } from "@/app/login/actions";
import { GoogleIcon } from "@/components/icons";
import { Button, Card, Field, inputClass } from "@/components/ui";

export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      if (mode === "signup") {
        const res = await signUp({ email, password });
        if (res.error) {
          setError(res.error);
          return;
        }
      }
      const res = await signIn("password", {
        email,
        password,
        redirect: false,
      });
      if (res?.error) {
        setError(
          mode === "signup"
            ? "Account created — please sign in."
            : "Invalid email or password.",
        );
        if (mode === "signup") setMode("signin");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-6 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
          LeGYMdary
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {mode === "signin" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {mode === "signin"
            ? "Sign in to your gym diary."
            : "Start tracking your workouts."}
        </p>
      </div>

      <Card className="space-y-4">
        {googleEnabled && (
          <>
            <Button
              type="button"
              size="lg"
              className="w-full"
              onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
            >
              <GoogleIcon className="h-5 w-5" />
              Continue with Google
            </Button>
            <div className="flex items-center gap-3 text-[11px] uppercase tracking-wide text-zinc-600">
              <span className="h-px flex-1 bg-zinc-800" />
              or
              <span className="h-px flex-1 bg-zinc-800" />
            </div>
          </>
        )}

        <form onSubmit={submit} className="space-y-3">
          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className={inputClass}
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "signup" ? "At least 8 characters" : "••••••••"}
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
              className={inputClass}
            />
          </Field>
          {error && <p className="text-sm text-zinc-300">{error}</p>}
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={pending || !email || !password}
          >
            {pending
              ? "Please wait…"
              : mode === "signin"
                ? "Sign in"
                : "Create account"}
          </Button>
        </form>

        <p className="text-center text-sm text-zinc-500">
          {mode === "signin"
            ? "Don't have an account? "
            : "Already have an account? "}
          <button
            type="button"
            onClick={() => {
              setMode((m) => (m === "signin" ? "signup" : "signin"));
              setError(null);
            }}
            className="font-medium text-zinc-200 underline-offset-2 hover:underline"
          >
            {mode === "signin" ? "Create one" : "Sign in"}
          </button>
        </p>
      </Card>
    </div>
  );
}
