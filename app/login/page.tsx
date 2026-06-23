import { LoginForm } from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const googleEnabled = !!process.env.AUTH_GOOGLE_ID;

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4 py-10">
      <LoginForm googleEnabled={googleEnabled} />
    </div>
  );
}
