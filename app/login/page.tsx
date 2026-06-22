import { LoginForm } from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const googleEnabled = !!process.env.AUTH_GOOGLE_ID;
  const devLogin = process.env.NODE_ENV !== "production";

  return (
    <div className="flex min-h-[75vh] items-center justify-center">
      <LoginForm googleEnabled={googleEnabled} devLogin={devLogin} />
    </div>
  );
}
