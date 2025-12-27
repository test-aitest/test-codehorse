/**
 * Invoke Claude Code CLI with the given prompt
 * Uses expect to start Claude interactively, send the prompt, and hand over control
 */
export declare function invokeClaudeCode(prompt: string, repoPath: string): Promise<void>;
/**
 * Check if Claude Code CLI is installed
 */
export declare function isClaudeCodeInstalled(): Promise<boolean>;
//# sourceMappingURL=claude-invoker.d.ts.map