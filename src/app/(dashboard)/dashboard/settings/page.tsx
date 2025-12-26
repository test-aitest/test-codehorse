import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Header } from "@/components/dashboard/header";
import { SettingsForm } from "@/components/dashboard/settings-form";

export default async function SettingsPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/sign-in");
  }

  return (
    <div className="flex flex-col">
      <Header title="Settings" description="Manage your account settings" />
      <div className="p-6">
        <SettingsForm user={session.user} />
      </div>
    </div>
  );
}
