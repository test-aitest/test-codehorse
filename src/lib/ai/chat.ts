import { generateText } from "ai";
import { MODEL_CONFIG } from "./client";
import { countTokens } from "../tokenizer";

// チャット応答用のシステムプロンプト
const CHAT_SYSTEM_PROMPT = `あなたはCodeHorseのAIアシスタントです。
プログラマーからのコードに関する質問に答えます。

## 役割

1. コードの説明や解説
2. バグの原因分析と修正提案
3. ベストプラクティスのアドバイス
4. リファクタリングの提案

## ガイドライン

- 簡潔で実用的な回答を心がける
- コード例を含める場合は適切な言語タグを使用
- 不明な点は正直に伝える
- 日本語で回答`;

export interface ChatContext {
  // PR情報
  prTitle?: string;
  prNumber?: number;

  // スレッドコンテキスト
  previousMessages?: Array<{
    author: string;
    body: string;
    isBot: boolean;
  }>;

  // コードコンテキスト
  codeContext?: string;
  ragContext?: string;
}

export interface ChatResponse {
  response: string;
  tokenCount: number;
}

/**
 * チャットメッセージに応答を生成
 */
export async function generateChatResponse(
  userMessage: string,
  context: ChatContext
): Promise<ChatResponse> {
  const { prTitle, prNumber, previousMessages, codeContext, ragContext } = context;

  // プロンプトを構築
  let prompt = "";

  // PR情報
  if (prTitle && prNumber) {
    prompt += `## Pull Request\n#${prNumber}: ${prTitle}\n\n`;
  }

  // スレッドコンテキスト
  if (previousMessages && previousMessages.length > 0) {
    prompt += "## 会話履歴\n";
    for (const msg of previousMessages) {
      const role = msg.isBot ? "CodeHorse" : msg.author;
      prompt += `**${role}:** ${msg.body}\n\n`;
    }
    prompt += "---\n\n";
  }

  // コードコンテキスト
  if (codeContext) {
    prompt += `## 関連コード\n\`\`\`\n${codeContext}\n\`\`\`\n\n`;
  }

  // RAGコンテキスト
  if (ragContext) {
    prompt += `## リポジトリからの関連情報\n${ragContext}\n\n`;
  }

  // ユーザーメッセージ
  prompt += `## 質問\n${userMessage}\n\n## 回答\n`;

  const totalTokens = countTokens(CHAT_SYSTEM_PROMPT + prompt);
  console.log(`[Chat] Input tokens: ${totalTokens}`);

  // AI生成
  const { text } = await generateText({
    model: MODEL_CONFIG.chat.model,
    system: CHAT_SYSTEM_PROMPT,
    prompt,
    temperature: MODEL_CONFIG.chat.temperature,
  });

  return {
    response: text,
    tokenCount: totalTokens,
  };
}

/**
 * メンション検出
 */
export function detectMention(body: string, botName: string = "codehorse"): boolean {
  const mentionPatterns = [
    new RegExp(`@${botName}\\b`, "i"),
    new RegExp(`@${botName}-bot\\b`, "i"),
    new RegExp(`@${botName}app\\b`, "i"),
  ];

  return mentionPatterns.some((pattern) => pattern.test(body));
}

/**
 * メンションを除去してメッセージ本文を取得
 */
export function extractMessageContent(body: string, botName: string = "codehorse"): string {
  return body
    .replace(new RegExp(`@${botName}(-bot|app)?\\s*`, "gi"), "")
    .trim();
}
