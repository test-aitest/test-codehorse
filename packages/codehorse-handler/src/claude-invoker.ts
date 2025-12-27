import { spawn } from "child_process";
import { existsSync, writeFileSync, readFileSync, unlinkSync, chmodSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { randomBytes } from "crypto";

/**
 * Invoke Claude Code CLI with the given prompt
 * Uses expect to start Claude interactively, send the prompt, and hand over control
 *
 * @returns Claude Code output captured via log file for test case parsing
 */
export async function invokeClaudeCode(
  prompt: string,
  repoPath: string
): Promise<string> {
  // Verify repo path exists
  if (!existsSync(repoPath)) {
    throw new Error(`Repository path does not exist: ${repoPath}`);
  }

  // Create temp files
  const fileId = randomBytes(8).toString("hex");
  const promptFile = join(tmpdir(), `codehorse-prompt-${fileId}.txt`);
  const logFile = join(tmpdir(), `codehorse-output-${fileId}.log`);
  const expectFile = join(tmpdir(), `codehorse-expect-${fileId}.exp`);

  // Write prompt to a temp file (to avoid escaping issues in expect script)
  writeFileSync(promptFile, prompt, "utf-8");

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
  writeFileSync(expectFile, expectContent, "utf-8");
  chmodSync(expectFile, 0o755);

  return new Promise((resolve, reject) => {
    const expectProcess = spawn("expect", [expectFile], {
      cwd: repoPath,
      stdio: "inherit",
    });

    expectProcess.on("error", (error) => {
      try { unlinkSync(promptFile); } catch {}
      try { unlinkSync(expectFile); } catch {}
      try { unlinkSync(logFile); } catch {}
      reject(error);
    });

    expectProcess.on("close", (code) => {
      // Read captured output from log file
      let output = "";
      try {
        if (existsSync(logFile)) {
          output = readFileSync(logFile, "utf-8");
        }
      } catch (err) {
        console.warn(`[Claude Invoker] Could not read log file: ${(err as Error).message}`);
      }

      // Clean up temp files
      try { unlinkSync(promptFile); } catch {}
      try { unlinkSync(expectFile); } catch {}
      try { unlinkSync(logFile); } catch {}

      if (code === 0) {
        resolve(output);
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
