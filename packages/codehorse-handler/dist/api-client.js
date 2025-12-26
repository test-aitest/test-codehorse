"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchReview = fetchReview;
/**
 * Fetch review data from CodeHorse API
 */
async function fetchReview(apiUrl, reviewId, token) {
    const url = `${apiUrl}/api/reviews/${reviewId}/export?token=${token}`;
    const response = await fetch(url, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
        },
    });
    if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({})));
        throw new Error(errorBody.error || `Failed to fetch review: ${response.status}`);
    }
    const result = (await response.json());
    if (!result.success || !result.data) {
        throw new Error(result.error || "Failed to fetch review");
    }
    return result.data;
}
//# sourceMappingURL=api-client.js.map