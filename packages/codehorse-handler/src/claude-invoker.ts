import { spawn } from "child_process";
import { existsSync } from "fs";

/**
 * Invoke Claude Code CLI with the given prompt
 */
export async function invokeClaudeCode(
  prompt: string,
  repoPath: string
): Promise<void> {
  // Verify repo path exists
  if (!existsSync(repoPath)) {
    throw new Error(`Repository path does not exist: ${repoPath}`);
  }

  return new Promise((resolve, reject) => {
    // Spawn claude CLI with --print flag
    // --print makes it output response without interactive mode
    const claude = spawn("claude", ["--print"], {
      cwd: repoPath,
      stdio: ["pipe", "inherit", "inherit"],
      shell: true,
    });

    // Write prompt to stdin
    claude.stdin.write(prompt);
    claude.stdin.end();

    claude.on("error", (error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new Error(
            "Claude Code CLI not found. Please install it first: npm install -g @anthropic-ai/claude-code"
          )
        );
      } else {
        reject(error);
      }
    });

    claude.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Claude Code exited with code ${code}`));
      }
    });
  });
}

/**
 * Check if Claude Code CLI is installed
 */
export async function isClaudeCodeInstalled(): Promise<boolean> {
  return new Promise((resolve) => {
    const claude = spawn("claude", ["--version"], {
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
