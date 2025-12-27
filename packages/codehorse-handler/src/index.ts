#!/usr/bin/env node

import { program } from "commander";
import chalk from "chalk";
import ora from "ora";
import { simpleGit } from "simple-git";
import { resolve, join } from "path";
import { existsSync } from "fs";
import { homedir } from "os";

import { fetchReview } from "./api-client.js";
import { buildPrompt } from "./prompt-builder.js";
import { invokeClaudeCode, isClaudeCodeInstalled } from "./claude-invoker.js";
import { getRepoPath, setRepoPath, getAllRepoMappings } from "./config.js";
import type { ApplyParams } from "./types.js";

/**
 * Parse URL scheme parameters
 * URL format: codehorse://apply?reviewId=xxx&token=yyy&apiUrl=zzz&folderPath=...
 */
function parseUrlScheme(url: string): ApplyParams | null {
  try {
    // Handle both codehorse:// and codehorse:/ formats
    const urlObj = new URL(url.replace("codehorse:/", "codehorse://"));

    const reviewId = urlObj.searchParams.get("reviewId");
    const token = urlObj.searchParams.get("token");
    const apiUrl = urlObj.searchParams.get("apiUrl");
    const folderPath = urlObj.searchParams.get("folderPath");

    if (!reviewId || !token || !apiUrl) {
      return null;
    }

    return { reviewId, token, apiUrl, folderPath: folderPath || undefined };
  } catch {
    return null;
  }
}

/**
 * Find local repository path
 * Priority: 1) Current working directory, 2) Config, 3) Common locations
 */
async function findRepoPath(fullName: string): Promise<string | null> {
  // First, check if current working directory is a valid git repo
  const cwd = process.cwd();
  try {
    const git = simpleGit(cwd);
    const isRepo = await git.checkIsRepo();
    if (isRepo) {
      // Current directory is a git repo, use it
      return cwd;
    }
  } catch {
    // Not a git repo, continue checking other paths
  }

  // Check config
  const configPath = getRepoPath(fullName);
  if (configPath && existsSync(configPath)) {
    return configPath;
  }

  // Try common locations
  const [, name] = fullName.split("/");
  const commonPaths = [
    join(homedir(), "Projects", name),
    join(homedir(), "projects", name),
    join(homedir(), "GitHub", name),
    join(homedir(), "github", name),
    join(homedir(), "repos", name),
    join(homedir(), "Developer", name),
    join(homedir(), "dev", name),
    join(homedir(), name),
  ];

  for (const path of commonPaths) {
    if (existsSync(path)) {
      // Verify it's the right repo
      try {
        const git = simpleGit(path);
        const remotes = await git.getRemotes(true);
        const isMatch = remotes.some(
          (r) =>
            r.refs.fetch?.includes(fullName) || r.refs.push?.includes(fullName)
        );
        if (isMatch) {
          // Save to config for future use
          setRepoPath(fullName, path);
          return path;
        }
      } catch {
        // Not a git repo, skip
      }
    }
  }

  return null;
}

/**
 * Main apply command
 */
async function applyReview(params: ApplyParams): Promise<void> {
  const spinner = ora("Starting review apply...").start();

  try {
    // Check if Claude Code is installed
    spinner.text = "Checking Claude Code installation...";
    const claudeInstalled = await isClaudeCodeInstalled();
    if (!claudeInstalled) {
      spinner.fail(
        "Claude Code CLI not found. Please install it first: npm install -g @anthropic-ai/claude-code"
      );
      process.exit(1);
    }

    // Fetch review from API
    spinner.text = "Fetching review data...";
    const reviewData = await fetchReview(
      params.apiUrl,
      params.reviewId,
      params.token
    );

    spinner.text = `Found ${reviewData.comments.length} comments to apply`;

    if (reviewData.comments.length === 0) {
      spinner.succeed("No comments to apply.");
      return;
    }

    // Find local repository - use folderPath from URL if provided
    let repoPath: string | null = null;

    if (params.folderPath && existsSync(params.folderPath)) {
      repoPath = params.folderPath;
      spinner.text = `Using specified folder: ${repoPath}`;
    } else {
      spinner.text = `Looking for local repository: ${reviewData.review.repository.fullName}`;
      repoPath = await findRepoPath(reviewData.review.repository.fullName);
    }

    if (!repoPath) {
      spinner.fail(
        `Could not find local repository for ${reviewData.review.repository.fullName}`
      );
      console.log(
        chalk.yellow(
          "\nPlease specify the repository path using:\n" +
            `  codehorse-handler config set-repo "${reviewData.review.repository.fullName}" "/path/to/repo"`
        )
      );
      process.exit(1);
    }

    spinner.text = `Using repository at: ${repoPath}`;

    // Build prompt
    spinner.text = "Building prompt for Claude Code...";
    const prompt = buildPrompt(reviewData);

    // Invoke Claude Code
    spinner.succeed("Invoking Claude Code to apply fixes...\n");
    console.log(chalk.cyan("━".repeat(60)));
    console.log(chalk.cyan("Claude Code Output:"));
    console.log(chalk.cyan("━".repeat(60)) + "\n");

    await invokeClaudeCode(prompt, repoPath);

    console.log("\n" + chalk.cyan("━".repeat(60)));
    console.log(chalk.green("\n✅ Review apply completed!"));
  } catch (error) {
    spinner.fail(`Error: ${(error as Error).message}`);
    process.exit(1);
  }
}

// CLI Commands
program
  .name("codehorse-handler")
  .description("CodeHorse local handler - Apply AI code review suggestions with Claude Code")
  .version("0.1.0");

// Handle URL scheme (main entry point when opened via codehorse://)
program
  .argument("[url]", "URL scheme to handle (codehorse://apply?...)")
  .action(async (url?: string) => {
    if (!url) {
      program.help();
      // program.help() calls process.exit() internally
    } else {
      const params = parseUrlScheme(url);
      if (!params) {
        console.error(chalk.red("Invalid URL format"));
        console.log("Expected: codehorse://apply?reviewId=xxx&token=yyy&apiUrl=zzz");
        process.exit(1);
      }

      await applyReview(params);
    }
  });

// Config command
const configCmd = program.command("config").description("Manage configuration");

configCmd
  .command("set-repo <fullName> <localPath>")
  .description("Set local path for a repository")
  .action((fullName: string, localPath: string) => {
    const absolutePath = resolve(localPath);
    if (!existsSync(absolutePath)) {
      console.error(chalk.red(`Path does not exist: ${absolutePath}`));
      process.exit(1);
    }
    setRepoPath(fullName, absolutePath);
    console.log(chalk.green(`Set ${fullName} -> ${absolutePath}`));
  });

configCmd
  .command("list")
  .description("List all repository mappings")
  .action(() => {
    const mappings = getAllRepoMappings();
    if (Object.keys(mappings).length === 0) {
      console.log(chalk.yellow("No repository mappings configured."));
      return;
    }
    console.log(chalk.bold("Repository Mappings:"));
    for (const [fullName, localPath] of Object.entries(mappings)) {
      console.log(`  ${fullName} -> ${localPath}`);
    }
  });

// Register command (for URL scheme registration)
program
  .command("register")
  .description("Register codehorse:// URL scheme handler")
  .action(() => {
    console.log(chalk.yellow("URL scheme registration is platform-specific."));
    console.log("\nFor macOS, run:");
    console.log(chalk.cyan("  ./scripts/register-macos.sh"));
    console.log("\nFor Windows, run:");
    console.log(chalk.cyan("  ./scripts/register-windows.ps1"));
    console.log("\nFor Linux, run:");
    console.log(chalk.cyan("  ./scripts/register-linux.sh"));
  });

program.parse();
