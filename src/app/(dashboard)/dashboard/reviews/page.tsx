import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Header } from "@/components/dashboard/header";
import { ReviewsTable } from "@/components/dashboard/reviews-table";

// Gemini 1.5 Flash の料金
const COST_PER_MILLION_TOKENS = 0.15;

async function getReviews() {
  const reviews = await prisma.review.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      pullRequest: {
        include: {
          repository: true,
        },
      },
      comments: true,
    },
  });

  return reviews.map((review) => ({
    ...review,
    cost: review.tokenCount
      ? (review.tokenCount / 1_000_000) * COST_PER_MILLION_TOKENS
      : 0,
  }));
}

export default async function ReviewsPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/sign-in");
  }

  const reviews = await getReviews();

  return (
    <div className="flex flex-col">
      <Header
        title="Review History"
        description="View all AI code reviews and their costs"
      />
      <div className="p-6">
        <ReviewsTable reviews={reviews} />
      </div>
    </div>
  );
}
