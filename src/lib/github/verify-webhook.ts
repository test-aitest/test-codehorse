import crypto from "crypto";

/**
 * GitHub Webhookの署名を検証
 * @param payload リクエストボディ（文字列）
 * @param signature X-Hub-Signature-256 ヘッダーの値
 * @param secret Webhook Secret
 * @returns 署名が有効な場合はtrue
 */
export async function verifyWebhookSignature(
  payload: string,
  signature: string | null,
  secret: string
): Promise<boolean> {
  if (!signature) {
    console.error("[Webhook] Missing signature header");
    return false;
  }

  const expectedSignature = `sha256=${crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex")}`;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    console.error("[Webhook] Signature verification error:", error);
    return false;
  }
}
