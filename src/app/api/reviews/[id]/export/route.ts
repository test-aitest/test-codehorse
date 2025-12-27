import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAndConsumeToken, hashToken } from "@/lib/review-token";
import { getPullRequest } from "@/lib/github/client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/reviews/[id]/export?token=xxx
 *
 * Export review data for the local handler.
 * Requires a one-time token for authentication.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const token = request.nextUrl.searchParams.get("token");

    // Validate token
    if (!token) {
      return NextResponse.json(
        { success: false, error: "Missing token parameter" },
        { status: 401 }
      );
    }

    // Verify and consume token (now async with database storage)
    const tokenData = await verifyAndConsumeToken(token);
    if (!tokenData) {
      console.warn(
        `[Review Export] Invalid or expired token: ${hashToken(token)}`
      );
      return NextResponse.json(
        { success: false, error: "Invalid or expired token" },
        { status: 401 }
      );
    }

    // Verify token is for this review
    if (tokenData.reviewId !== id) {
      console.warn(
        `[Review Export] Token/review mismatch: token for ${tokenData.reviewId}, requested ${id}`
      );
      return NextResponse.json(
        { success: false, error: "Token does not match review" },
        { status: 403 }
      );
    }

    // Fetch review with related data
    const review = await prisma.review.findUnique({
      where: { id },
      include: {
        pullRequest: {
          include: {
            repository: {
              select: {
                id: true,
                fullName: true,
                owner: true,
                name: true,
                htmlUrl: true,
                installationId: true,
              },
            },
          },
        },
        comments: {
          orderBy: [{ severity: "asc" }, { lineNumber: "asc" }],
        },
      },
    });

    if (!review) {
      return NextResponse.json(
        { success: false, error: "Review not found" },
        { status: 404 }
      );
    }

    // Fetch PR description from GitHub
    let prDescription: string | null = null;
    try {
      const prData = await getPullRequest(
        review.pullRequest.repository.installationId,
        review.pullRequest.repository.owner,
        review.pullRequest.repository.name,
        review.pullRequest.number
      );
      prDescription = prData.body || null;
    } catch (error) {
      console.warn(
        `[Review Export] Could not fetch PR description: ${(error as Error).message}`
      );
    }

    // Format response
    const response = {
      success: true,
      data: {
        review: {
          id: review.id,
          prNumber: review.pullRequest.number,
          prTitle: review.pullRequest.title,
          prDescription,
          commitSha: review.commitSha,
          summary: review.summary,
          walkthrough: review.walkthrough
            ? JSON.parse(review.walkthrough)
            : null,
          diagram: review.diagram,
          repository: {
            fullName: review.pullRequest.repository.fullName,
            owner: review.pullRequest.repository.owner,
            name: review.pullRequest.repository.name,
            htmlUrl: review.pullRequest.repository.htmlUrl,
          },
        },
        comments: review.comments.map((comment) => ({
          id: comment.id,
          filePath: comment.filePath,
          lineNumber: comment.lineNumber,
          body: comment.body,
          severity: comment.severity,
          suggestion: comment.suggestion,
          category: comment.category,
        })),
      },
    };

    console.log(
      `[Review Export] Exported review ${id} with ${review.comments.length} comments`
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error("[Review Export] Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
