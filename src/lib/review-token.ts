import { randomBytes, createHash } from "crypto";
import { prisma } from "@/lib/prisma";

// Token expiry time (5 minutes)
const TOKEN_EXPIRY_MS = 5 * 60 * 1000;

/**
 * Generate a one-time token for review export
 * Stores the token in the database for persistence
 */
export async function generateReviewToken(
  reviewId: string,
  userId: string
): Promise<string> {
  // Generate random token
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MS);

  // Store token in database
  await prisma.reviewExportToken.create({
    data: {
      token,
      reviewId,
      userId,
      expiresAt,
    },
  });

  // Clean up expired tokens (fire and forget)
  cleanupExpiredTokens().catch(console.error);

  return token;
}

/**
 * Verify and consume a token (one-time use)
 * Returns the reviewId if valid, null otherwise
 */
export async function verifyAndConsumeToken(
  token: string
): Promise<{ reviewId: string; userId: string } | null> {
  try {
    // Find the token
    const tokenRecord = await prisma.reviewExportToken.findUnique({
      where: { token },
    });

    if (!tokenRecord) {
      console.log(`[Token] Token not found: ${hashToken(token)}`);
      return null;
    }

    // Check if expired
    if (tokenRecord.expiresAt < new Date()) {
      console.log(`[Token] Token expired: ${hashToken(token)}`);
      await prisma.reviewExportToken.delete({
        where: { id: tokenRecord.id },
      });
      return null;
    }

    // Check if already consumed
    if (tokenRecord.consumed) {
      console.log(`[Token] Token already consumed: ${hashToken(token)}`);
      return null;
    }

    // Mark as consumed
    await prisma.reviewExportToken.update({
      where: { id: tokenRecord.id },
      data: { consumed: true },
    });

    console.log(`[Token] Token consumed successfully: ${hashToken(token)}`);

    return {
      reviewId: tokenRecord.reviewId,
      userId: tokenRecord.userId,
    };
  } catch (error) {
    console.error("[Token] Error verifying token:", error);
    return null;
  }
}

/**
 * Clean up expired tokens from the database
 */
async function cleanupExpiredTokens(): Promise<void> {
  try {
    const result = await prisma.reviewExportToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { consumed: true, createdAt: { lt: new Date(Date.now() - 60000) } },
        ],
      },
    });
    if (result.count > 0) {
      console.log(`[Token] Cleaned up ${result.count} expired/consumed tokens`);
    }
  } catch (error) {
    console.error("[Token] Error cleaning up tokens:", error);
  }
}

/**
 * Hash a token for logging (don't log full token)
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex").substring(0, 8);
}
