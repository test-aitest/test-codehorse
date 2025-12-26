import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/auth/sign-in-form";

export default async function SignInPage() {
  // セッションを検証（クッキーの存在だけでなく、実際に有効かを確認）
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  // 有効なセッションがある場合のみダッシュボードにリダイレクト
  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background">
      <div className="mx-auto flex w-full max-w-sm flex-col items-center space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold">CodeHorse</h1>
          <p className="text-muted-foreground">
            Sign in to start reviewing your code with AI
          </p>
        </div>

        <SignInForm />
      </div>
    </div>
  );
}
