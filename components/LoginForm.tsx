"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { login } from "@/app/login/actions";
import { Button, Card, Field, inputClass } from "@/components/ui";

export function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await login(password);
      if (res?.error) setError(res.error);
      else router.replace("/");
    });
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm">
      <div className="mb-6 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
          LeGYMdary
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          The Legendary Gym Diary
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Enter your password to continue.
        </p>
      </div>
      <Card className="space-y-4">
        <Field label="Password">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            autoFocus
          />
        </Field>
        {error && <p className="text-sm text-zinc-300">{error}</p>}
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={pending || !password}
        >
          {pending ? "Checking…" : "Unlock"}
        </Button>
      </Card>
    </form>
  );
}
