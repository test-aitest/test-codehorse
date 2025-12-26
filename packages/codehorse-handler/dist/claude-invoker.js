"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.invokeClaudeCode = invokeClaudeCode;
exports.isClaudeCodeInstalled = isClaudeCodeInstalled;
const child_process_1 = require("child_process");
const fs_1 = require("fs");
/**
 * Invoke Claude Code CLI with the given prompt
 */
async function invokeClaudeCode(prompt, repoPath) {
    // Verify repo path exists
    if (!(0, fs_1.existsSync)(repoPath)) {
        throw new Error(`Repository path does not exist: ${repoPath}`);
    }
    return new Promise((resolve, reject) => {
        // Spawn claude CLI with --print flag
        // --print makes it output response without interactive mode
        const claude = (0, child_process_1.spawn)("claude", ["--print"], {
            cwd: repoPath,
            stdio: ["pipe", "inherit", "inherit"],
            shell: true,
        });
        // Write prompt to stdin
        claude.stdin.write(prompt);
        claude.stdin.end();
        claude.on("error", (error) => {
            if (error.code === "ENOENT") {
                reject(new Error("Claude Code CLI not found. Please install it first: npm install -g @anthropic-ai/claude-code"));
            }
            else {
                reject(error);
            }
        });
        claude.on("close", (code) => {
            if (code === 0) {
                resolve();
            }
            else {
                reject(new Error(`Claude Code exited with code ${code}`));
            }
        });
    });
}
/**
 * Check if Claude Code CLI is installed
 */
async function isClaudeCodeInstalled() {
    return new Promise((resolve) => {
        const claude = (0, child_process_1.spawn)("claude", ["--version"], {
            stdio: ["ignore", "pipe", "pipe"],
            shell: true,
        });
        claude.on("error", () => {
            resolve(false);
        });
        claude.on("close", (code) => {
            resolve(code === 0);
        });
    });
}
//# sourceMappingURL=claude-invoker.js.map