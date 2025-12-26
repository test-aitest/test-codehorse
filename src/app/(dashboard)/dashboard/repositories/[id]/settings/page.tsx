import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { Header } from "@/components/dashboard/header";
import { RepositorySettings } from "@/components/dashboard/repository-settings";

interface RepositorySettingsPageProps {
  params: Promise<{ id: string }>;
}

async function getRepository(id: string) {
  return prisma.repository.findUnique({
    where: { id },
  });
}

export default async function RepositorySettingsPage({
  params,
}: RepositorySettingsPageProps) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/sign-in");
  }

  const { id } = await params;
  const repository = await getRepository(id);

  if (!repository) {
    notFound();
  }

  return (
    <div className="flex flex-col">
      <Header
        title="Repository Settings"
        description={repository.fullName}
      />
      <div className="p-6">
        <RepositorySettings repository={repository} />
      </div>
    </div>
  );
}
