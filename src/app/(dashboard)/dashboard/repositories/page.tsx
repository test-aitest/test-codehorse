import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Header } from "@/components/dashboard/header";
import { RepositoryList } from "@/components/dashboard/repository-list";
import { AddRepositoryDialog } from "@/components/dashboard/add-repository-dialog";

async function getRepositories() {
  const repositories = await prisma.repository.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: {
          pullRequests: true,
        },
      },
    },
  });

  return repositories;
}

export default async function RepositoriesPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/sign-in");
  }

  const repositories = await getRepositories();

  return (
    <div className="flex h-full flex-col">
      <Header
        title="Repositories"
        description="Manage your connected repositories"
      />
      <div className="flex-1 overflow-auto p-6">
        <div className="flex justify-end mb-4">
          <AddRepositoryDialog />
        </div>
        <RepositoryList repositories={repositories} />
      </div>
    </div>
  );
}
