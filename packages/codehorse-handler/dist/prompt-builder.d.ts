import type { ReviewData } from "./types.js";
import type { TestCase } from "./sheets-client.js";
/**
 * Build a prompt for Claude Code from review data
 * @param data Review data with comments
 * @param testCases Optional test cases from Google Sheets
 */
export declare function buildPrompt(data: ReviewData, testCases?: TestCase[]): string;
//# sourceMappingURL=prompt-builder.d.ts.map