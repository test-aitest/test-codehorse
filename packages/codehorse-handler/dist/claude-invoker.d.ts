/**
 * Invoke Claude Code CLI with the given prompt
 * Uses expect to start Claude interactively, send the prompt, and hand over control
 *
 * @returns Claude Code output captured via log file for test case parsing
 */
export declare function invokeClaudeCode(prompt: string, repoPath: string): Promise<string>;
/**
 * Check if Claude Code CLI is installed
 */
export declare function isClaudeCodeInstalled(): Promise<boolean>;
//# sourceMappingURL=claude-invoker.d.ts.map