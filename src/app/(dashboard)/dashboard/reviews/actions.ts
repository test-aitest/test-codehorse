"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { generateReviewToken as generateToken } from "@/lib/review-token";

/**
 * Generate a one-time token for review export (used by "Apply with Claude Code" feature)
 */
export async function generateReviewExportToken(reviewId: string): Promise<{
  success: boolean;
  token?: string;
  error?: string;
}> {
  try {
    // Verify user is authenticated
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return { success: false, error: "Not authenticated" };
    }

    // Verify review exists
    const review = await prisma.review.findUnique({
      where: { id: reviewId },
      select: { id: true },
    });

    if (!review) {
      return { success: false, error: "Review not found" };
    }

    // Generate one-time token (now async with database storage)
    const token = await generateToken(reviewId, session.user.id);

    return { success: true, token };
  } catch (error) {
    console.error("[generateReviewExportToken] Error:", error);
    return { success: false, error: "Failed to generate token" };
  }
}
