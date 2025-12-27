"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.invokeClaudeCode = invokeClaudeCode;
exports.isClaudeCodeInstalled = isClaudeCodeInstalled;
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const os_1 = require("os");
const path_1 = require("path");
const crypto_1 = require("crypto");
/**
 * Invoke Claude Code CLI with the given prompt
 * Uses expect to start Claude interactively, send the prompt, and hand over control
 *
 * @returns Claude Code output captured via log file for test case parsing
 */
async function invokeClaudeCode(prompt, repoPath) {
    // Verify repo path exists
    if (!(0, fs_1.existsSync)(repoPath)) {
        throw new Error(`Repository path does not exist: ${repoPath}`);
    }
    // Create temp files
    const fileId = (0, crypto_1.randomBytes)(8).toString("hex");
    const promptFile = (0, path_1.join)((0, os_1.tmpdir)(), `codehorse-prompt-${fileId}.txt`);
    const logFile = (0, path_1.join)((0, os_1.tmpdir)(), `codehorse-output-${fileId}.log`);
    const expectFile = (0, path_1.join)((0, os_1.tmpdir)(), `codehorse-expect-${fileId}.exp`);
    // Write prompt to a temp file (to avoid escaping issues in expect script)
    (0, fs_1.writeFileSync)(promptFile, prompt, "utf-8");
    // Create an expect script that:
    // 1. Starts Claude Code with logging enabled
    // 2. Waits for the prompt input
    // 3. Sends the prompt from the file
    // 4. Logs all output to a file for later parsing
    // 5. Hands over control to the user for interactive permissions
    const expectContent = `#!/usr/bin/expect -f
set timeout -1
set prompt_file "${promptFile}"
set log_file_path "${logFile}"

# Read prompt from file
set fp [open $prompt_file r]
set prompt [read $fp]
close $fp

# Enable logging to capture Claude Code output
log_file -noappend $log_file_path

# Start Claude Code
spawn claude

# Wait for Claude to be ready (looking for the input prompt)
expect {
    ">" {
        # Send the prompt
        send -- "$prompt\\r"
    }
    timeout {
        # If no prompt, just send anyway
        send -- "$prompt\\r"
    }
}

# Hand over control to the user
interact
`;
    (0, fs_1.writeFileSync)(expectFile, expectContent, "utf-8");
    (0, fs_1.chmodSync)(expectFile, 0o755);
    return new Promise((resolve, reject) => {
        const expectProcess = (0, child_process_1.spawn)("expect", [expectFile], {
            cwd: repoPath,
            stdio: "inherit",
        });
        expectProcess.on("error", (error) => {
            try {
                (0, fs_1.unlinkSync)(promptFile);
            }
            catch { }
            try {
                (0, fs_1.unlinkSync)(expectFile);
            }
            catch { }
            try {
                (0, fs_1.unlinkSync)(logFile);
            }
            catch { }
            reject(error);
        });
        expectProcess.on("close", (code) => {
            // Read captured output from log file
            let output = "";
            try {
                if ((0, fs_1.existsSync)(logFile)) {
                    output = (0, fs_1.readFileSync)(logFile, "utf-8");
                }
            }
            catch (err) {
                console.warn(`[Claude Invoker] Could not read log file: ${err.message}`);
            }
            // Clean up temp files
            try {
                (0, fs_1.unlinkSync)(promptFile);
            }
            catch { }
            try {
                (0, fs_1.unlinkSync)(expectFile);
            }
            catch { }
            try {
                (0, fs_1.unlinkSync)(logFile);
            }
            catch { }
            if (code === 0) {
                resolve(output);
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