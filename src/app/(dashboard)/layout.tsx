import { ReactNode } from "react";

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="flex min-h-screen">
      {/* サイドバー (後のフェーズで実装) */}
      <aside className="hidden w-64 border-r bg-muted/40 lg:block">
        <div className="flex h-14 items-center border-b px-4">
          <span className="font-semibold">CodeHorse</span>
        </div>
        <nav className="flex-1 p-4">
          <p className="text-sm text-muted-foreground">
            Navigation (Phase 3.1)
          </p>
        </nav>
      </aside>

      {/* メインコンテンツ */}
      <main className="flex-1">
        <header className="flex h-14 items-center border-b px-4">
          <h1 className="text-lg font-semibold">Dashboard</h1>
        </header>
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
