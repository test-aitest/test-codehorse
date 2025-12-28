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
import { getRepoPath, setRepoPath, getAllRepoMappings, setGoogleCredentials } from "./config.js";
import { parseGoogleSheetsUrl, extractSheetsUrlFromPRDescription } from "./sheets-parser.js";
import { fetchTestCases, applyTestCaseUpdates } from "./sheets-client.js";
import { hasGoogleCredentials, getCredentialsFilePath } from "./google-auth.js";
import { parseTestUpdatesFromClaudeOutput } from "./test-case-parser.js";
import type { ApplyParams } from "./types.js";
import type { TestCase } from "./sheets-client.js";

// テストケースシートの名前
const TEST_CASE_SHEET_NAME = "テストケース";

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

    // Extract Google Sheets URL from PR description
    let sheetsInfo = null;
    let testCases: TestCase[] = [];

    if (reviewData.review.prDescription) {
      const sheetsUrl = extractSheetsUrlFromPRDescription(reviewData.review.prDescription);
      if (sheetsUrl) {
        sheetsInfo = parseGoogleSheetsUrl(sheetsUrl);
        if (sheetsInfo) {
          spinner.text = "Found Google Sheets URL in PR description";

          // Check if Google credentials are configured
          if (hasGoogleCredentials()) {
            try {
              spinner.text = "Fetching test cases from Google Sheets...";
              testCases = await fetchTestCases(sheetsInfo, TEST_CASE_SHEET_NAME);
              spinner.text = `Found ${testCases.length} existing test cases`;
            } catch (error) {
              console.log(chalk.yellow(`\nWarning: Could not fetch test cases: ${(error as Error).message}`));
              console.log(chalk.yellow("Continuing without test case integration.\n"));
            }
          } else {
            console.log(chalk.yellow("\nGoogle credentials not configured."));
            console.log(chalk.yellow("Run: codehorse-handler config set-google-auth <path/to/credentials.json>"));
            console.log(chalk.yellow("Continuing without test case integration.\n"));
          }
        }
      }
    }

    // Build prompt (with test cases if available)
    spinner.text = "Building prompt for Claude Code...";
    const prompt = buildPrompt(reviewData, testCases.length > 0 ? testCases : undefined);

    // Invoke Claude Code
    spinner.succeed("Invoking Claude Code to apply fixes...\n");
    console.log(chalk.cyan("━".repeat(60)));
    console.log(chalk.cyan("Claude Code Output:"));
    console.log(chalk.cyan("━".repeat(60)) + "\n");

    const claudeOutput = await invokeClaudeCode(prompt, repoPath);

    console.log("\n" + chalk.cyan("━".repeat(60)));

    // デバッグ出力
    console.log(chalk.yellow(`\n[Debug] sheetsInfo: ${sheetsInfo ? 'found' : 'not found'}`));
    console.log(chalk.yellow(`[Debug] hasGoogleCredentials: ${hasGoogleCredentials()}`));
    console.log(chalk.yellow(`[Debug] claudeOutput length: ${claudeOutput ? claudeOutput.length : 0} chars`));

    // Parse and apply test case updates if Google Sheets is configured
    if (sheetsInfo && hasGoogleCredentials() && claudeOutput) {
      // デバッグ: パターン検索
      const hasPattern = /\[\s*\{\s*"action"\s*:\s*"(?:add|update|delete)"/.test(claudeOutput);
      console.log(chalk.yellow(`[Debug] Contains test-updates pattern: ${hasPattern}`));

      const spinner2 = ora("Checking for test case updates...").start();
      try {
        const testUpdates = parseTestUpdatesFromClaudeOutput(claudeOutput);
        console.log(chalk.yellow(`[Debug] Parsed updates count: ${testUpdates.length}`));
        if (testUpdates.length > 0) {
          spinner2.text = `Applying ${testUpdates.length} test case updates to Google Sheets...`;
          const result = await applyTestCaseUpdates(sheetsInfo, TEST_CASE_SHEET_NAME, testUpdates);
          spinner2.succeed(
            `Test cases updated: ${result.added} added, ${result.updated} updated, ${result.deleted} deleted`
          );
        } else {
          spinner2.succeed("No test case updates needed.");
        }
      } catch (error) {
        spinner2.fail(`Failed to update test cases: ${(error as Error).message}`);
      }
    }

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

configCmd
  .command("set-google-auth <credentialsPath>")
  .description("Set Google Service Account credentials for Sheets API access")
  .action((credentialsPath: string) => {
    const absolutePath = resolve(credentialsPath);
    if (!existsSync(absolutePath)) {
      console.error(chalk.red(`Credentials file not found: ${absolutePath}`));
      process.exit(1);
    }

    try {
      setGoogleCredentials(absolutePath);
      console.log(chalk.green(`Google credentials configured successfully.`));
      console.log(chalk.gray(`Credentials copied to: ${getCredentialsFilePath()}`));
      console.log(chalk.yellow("\nRemember to share your Google Sheets with the service account email."));
    } catch (error) {
      console.error(chalk.red(`Failed to set credentials: ${(error as Error).message}`));
      process.exit(1);
    }
  });

configCmd
  .command("google-auth-status")
  .description("Check Google authentication status")
  .action(() => {
    if (hasGoogleCredentials()) {
      console.log(chalk.green("✅ Google credentials are configured."));
      console.log(chalk.gray(`Credentials file: ${getCredentialsFilePath()}`));
    } else {
      console.log(chalk.yellow("❌ Google credentials are not configured."));
      console.log(chalk.gray("\nTo configure, run:"));
      console.log(chalk.cyan("  codehorse-handler config set-google-auth <path/to/credentials.json>"));
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
