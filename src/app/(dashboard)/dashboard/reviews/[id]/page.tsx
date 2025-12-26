import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { Header } from "@/components/dashboard/header";
import { ReviewDetail } from "@/components/dashboard/review-detail";

interface ReviewDetailPageProps {
  params: Promise<{ id: string }>;
}

async function getReview(id: string) {
  const review = await prisma.review.findUnique({
    where: { id },
    include: {
      pullRequest: {
        include: {
          repository: true,
        },
      },
      comments: {
        orderBy: [
          { severity: "asc" },
          { lineNumber: "asc" },
        ],
      },
    },
  });

  return review;
}

export default async function ReviewDetailPage({ params }: ReviewDetailPageProps) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/sign-in");
  }

  const { id } = await params;
  const review = await getReview(id);

  if (!review) {
    notFound();
  }

  return (
    <div className="flex flex-col">
      <Header
        title="Review Details"
        description={`${review.pullRequest.repository.fullName} #${review.pullRequest.number}`}
      />
      <div className="p-6">
        <ReviewDetail review={review} />
      </div>
    </div>
  );
}
