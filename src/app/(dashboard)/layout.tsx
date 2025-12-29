import { ReactNode } from "react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { PushPermissionBanner } from "@/components/notifications/push-permission-banner";

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto">{children}</main>
      <PushPermissionBanner />
    </div>
  );
}
