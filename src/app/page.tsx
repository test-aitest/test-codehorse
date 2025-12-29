import { HeroButtons } from "@/components/home/hero-buttons";

// E2E Production Test - Phase 1-10 implementation verification
// このファイルはE2EのProduction環境テストで使用されます。
export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background">
      <main className="flex flex-col items-center gap-8 text-center">
        <div className="space-y-4">
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
            CodeHorse
          </h1>
          <p className="text-xl text-muted-foreground">
            AI-Powered Code Review Platform
          </p>
        </div>

        <HeroButtons />
      </main>
    </div>
  );
}
