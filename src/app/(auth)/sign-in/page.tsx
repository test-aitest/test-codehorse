import { SignInForm } from "@/components/auth/sign-in-form";

export default function SignInPage() {
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
