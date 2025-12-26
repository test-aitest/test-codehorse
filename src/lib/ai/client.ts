import { createGoogleGenerativeAI } from "@ai-sdk/google";

// Google AI (Gemini) クライアント
const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

// Gemini 2.0 Flash (高速・低コスト)
export const geminiFlash = google("gemini-2.0-flash-exp");

// Gemini 1.5 Pro (高精度)
export const geminiPro = google("gemini-1.5-pro-latest");

// デフォルトモデル
export const defaultModel = geminiFlash;

// モデル設定
export const MODEL_CONFIG = {
  // レビュー生成用（精度重視）
  review: {
    model: geminiFlash,
    temperature: 0.3,
    maxTokens: 8000,
  },
  // チャット応答用（バランス）
  chat: {
    model: geminiFlash,
    temperature: 0.7,
    maxTokens: 4000,
  },
  // サマリー生成用（簡潔さ重視）
  summary: {
    model: geminiFlash,
    temperature: 0.2,
    maxTokens: 2000,
  },
};
