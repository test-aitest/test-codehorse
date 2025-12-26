import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Header } from "@/components/dashboard/header";
import { RepositoryList } from "@/components/dashboard/repository-list";

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
    <div className="flex flex-col">
      <Header
        title="Repositories"
        description="Manage your connected repositories"
      />
      <div className="p-6">
        <RepositoryList repositories={repositories} />
      </div>
    </div>
  );
}
