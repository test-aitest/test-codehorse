import type { ReviewData } from "./types.js";

interface ApiResponse {
  success: boolean;
  data?: ReviewData;
  error?: string;
}

interface ErrorResponse {
  error?: string;
}

/**
 * Fetch review data from CodeHorse API
 */
export async function fetchReview(
  apiUrl: string,
  reviewId: string,
  token: string
): Promise<ReviewData> {
  const url = `${apiUrl}/api/reviews/${reviewId}/export?token=${token}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as ErrorResponse;
    throw new Error(
      errorBody.error || `Failed to fetch review: ${response.status}`
    );
  }

  const result = (await response.json()) as ApiResponse;

  if (!result.success || !result.data) {
    throw new Error(result.error || "Failed to fetch review");
  }

  return result.data;
}
