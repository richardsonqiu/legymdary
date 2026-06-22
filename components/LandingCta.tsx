"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { GoogleIcon } from "@/components/icons";
import { buttonClass } from "@/components/ui";

export function LandingCta({
  googleEnabled,
  label = "Continue with Google",
  variant = "primary",
  size = "lg",
  className,
}: {
  googleEnabled: boolean;
  label?: string;
  variant?: "primary" | "secondary";
  size?: "md" | "lg";
  className?: string;
}) {
  if (googleEnabled) {
    return (
      <button
        onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
        className={buttonClass(variant, size, className)}
      >
        <GoogleIcon className="h-5 w-5" />
        {label}
      </button>
    );
  }
  return (
    <Link href="/login" className={buttonClass(variant, size, className)}>
      {label}
    </Link>
  );
}
