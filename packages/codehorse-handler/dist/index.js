#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
const simple_git_1 = require("simple-git");
const path_1 = require("path");
const fs_1 = require("fs");
const os_1 = require("os");
const api_client_js_1 = require("./api-client.js");
const prompt_builder_js_1 = require("./prompt-builder.js");
const claude_invoker_js_1 = require("./claude-invoker.js");
const config_js_1 = require("./config.js");
const sheets_parser_js_1 = require("./sheets-parser.js");
const sheets_client_js_1 = require("./sheets-client.js");
const google_auth_js_1 = require("./google-auth.js");
const test_case_parser_js_1 = require("./test-case-parser.js");
// テストケースシートの名前
const TEST_CASE_SHEET_NAME = "テストケース";
/**
 * Parse URL scheme parameters
 * URL format: codehorse://apply?reviewId=xxx&token=yyy&apiUrl=zzz&folderPath=...
 */
function parseUrlScheme(url) {
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
    }
    catch {
        return null;
    }
}
/**
 * Find local repository path
 * Priority: 1) Current working directory, 2) Config, 3) Common locations
 */
async function findRepoPath(fullName) {
    // First, check if current working directory is a valid git repo
    const cwd = process.cwd();
    try {
        const git = (0, simple_git_1.simpleGit)(cwd);
        const isRepo = await git.checkIsRepo();
        if (isRepo) {
            // Current directory is a git repo, use it
            return cwd;
        }
    }
    catch {
        // Not a git repo, continue checking other paths
    }
    // Check config
    const configPath = (0, config_js_1.getRepoPath)(fullName);
    if (configPath && (0, fs_1.existsSync)(configPath)) {
        return configPath;
    }
    // Try common locations
    const [, name] = fullName.split("/");
    const commonPaths = [
        (0, path_1.join)((0, os_1.homedir)(), "Projects", name),
        (0, path_1.join)((0, os_1.homedir)(), "projects", name),
        (0, path_1.join)((0, os_1.homedir)(), "GitHub", name),
        (0, path_1.join)((0, os_1.homedir)(), "github", name),
        (0, path_1.join)((0, os_1.homedir)(), "repos", name),
        (0, path_1.join)((0, os_1.homedir)(), "Developer", name),
        (0, path_1.join)((0, os_1.homedir)(), "dev", name),
        (0, path_1.join)((0, os_1.homedir)(), name),
    ];
    for (const path of commonPaths) {
        if ((0, fs_1.existsSync)(path)) {
            // Verify it's the right repo
            try {
                const git = (0, simple_git_1.simpleGit)(path);
                const remotes = await git.getRemotes(true);
                const isMatch = remotes.some((r) => r.refs.fetch?.includes(fullName) || r.refs.push?.includes(fullName));
                if (isMatch) {
                    // Save to config for future use
                    (0, config_js_1.setRepoPath)(fullName, path);
                    return path;
                }
            }
            catch {
                // Not a git repo, skip
            }
        }
    }
    return null;
}
/**
 * Main apply command
 */
async function applyReview(params) {
    const spinner = (0, ora_1.default)("Starting review apply...").start();
    try {
        // Check if Claude Code is installed
        spinner.text = "Checking Claude Code installation...";
        const claudeInstalled = await (0, claude_invoker_js_1.isClaudeCodeInstalled)();
        if (!claudeInstalled) {
            spinner.fail("Claude Code CLI not found. Please install it first: npm install -g @anthropic-ai/claude-code");
            process.exit(1);
        }
        // Fetch review from API
        spinner.text = "Fetching review data...";
        const reviewData = await (0, api_client_js_1.fetchReview)(params.apiUrl, params.reviewId, params.token);
        spinner.text = `Found ${reviewData.comments.length} comments to apply`;
        if (reviewData.comments.length === 0) {
            spinner.succeed("No comments to apply.");
            return;
        }
        // Find local repository - use folderPath from URL if provided
        let repoPath = null;
        if (params.folderPath && (0, fs_1.existsSync)(params.folderPath)) {
            repoPath = params.folderPath;
            spinner.text = `Using specified folder: ${repoPath}`;
        }
        else {
            spinner.text = `Looking for local repository: ${reviewData.review.repository.fullName}`;
            repoPath = await findRepoPath(reviewData.review.repository.fullName);
        }
        if (!repoPath) {
            spinner.fail(`Could not find local repository for ${reviewData.review.repository.fullName}`);
            console.log(chalk_1.default.yellow("\nPlease specify the repository path using:\n" +
                `  codehorse-handler config set-repo "${reviewData.review.repository.fullName}" "/path/to/repo"`));
            process.exit(1);
        }
        spinner.text = `Using repository at: ${repoPath}`;
        // Extract Google Sheets URL from PR description
        let sheetsInfo = null;
        let testCases = [];
        if (reviewData.review.prDescription) {
            const sheetsUrl = (0, sheets_parser_js_1.extractSheetsUrlFromPRDescription)(reviewData.review.prDescription);
            if (sheetsUrl) {
                sheetsInfo = (0, sheets_parser_js_1.parseGoogleSheetsUrl)(sheetsUrl);
                if (sheetsInfo) {
                    spinner.text = "Found Google Sheets URL in PR description";
                    // Check if Google credentials are configured
                    if ((0, google_auth_js_1.hasGoogleCredentials)()) {
                        try {
                            spinner.text = "Fetching test cases from Google Sheets...";
                            testCases = await (0, sheets_client_js_1.fetchTestCases)(sheetsInfo, TEST_CASE_SHEET_NAME);
                            spinner.text = `Found ${testCases.length} existing test cases`;
                        }
                        catch (error) {
                            console.log(chalk_1.default.yellow(`\nWarning: Could not fetch test cases: ${error.message}`));
                            console.log(chalk_1.default.yellow("Continuing without test case integration.\n"));
                        }
                    }
                    else {
                        console.log(chalk_1.default.yellow("\nGoogle credentials not configured."));
                        console.log(chalk_1.default.yellow("Run: codehorse-handler config set-google-auth <path/to/credentials.json>"));
                        console.log(chalk_1.default.yellow("Continuing without test case integration.\n"));
                    }
                }
            }
        }
        // Build prompt (with test cases if available)
        spinner.text = "Building prompt for Claude Code...";
        const prompt = (0, prompt_builder_js_1.buildPrompt)(reviewData, testCases.length > 0 ? testCases : undefined);
        // Invoke Claude Code
        spinner.succeed("Invoking Claude Code to apply fixes...\n");
        console.log(chalk_1.default.cyan("━".repeat(60)));
        console.log(chalk_1.default.cyan("Claude Code Output:"));
        console.log(chalk_1.default.cyan("━".repeat(60)) + "\n");
        const claudeOutput = await (0, claude_invoker_js_1.invokeClaudeCode)(prompt, repoPath);
        console.log("\n" + chalk_1.default.cyan("━".repeat(60)));
        // Parse and apply test case updates if Google Sheets is configured
        if (sheetsInfo && (0, google_auth_js_1.hasGoogleCredentials)() && claudeOutput) {
            const spinner2 = (0, ora_1.default)("Checking for test case updates...").start();
            try {
                const testUpdates = (0, test_case_parser_js_1.parseTestUpdatesFromClaudeOutput)(claudeOutput);
                if (testUpdates.length > 0) {
                    spinner2.text = `Applying ${testUpdates.length} test case updates to Google Sheets...`;
                    const result = await (0, sheets_client_js_1.applyTestCaseUpdates)(sheetsInfo, TEST_CASE_SHEET_NAME, testUpdates);
                    spinner2.succeed(`Test cases updated: ${result.added} added, ${result.updated} updated, ${result.deleted} deleted`);
                }
                else {
                    spinner2.succeed("No test case updates needed.");
                }
            }
            catch (error) {
                spinner2.fail(`Failed to update test cases: ${error.message}`);
            }
        }
        console.log(chalk_1.default.green("\n✅ Review apply completed!"));
    }
    catch (error) {
        spinner.fail(`Error: ${error.message}`);
        process.exit(1);
    }
}
// CLI Commands
commander_1.program
    .name("codehorse-handler")
    .description("CodeHorse local handler - Apply AI code review suggestions with Claude Code")
    .version("0.1.0");
// Handle URL scheme (main entry point when opened via codehorse://)
commander_1.program
    .argument("[url]", "URL scheme to handle (codehorse://apply?...)")
    .action(async (url) => {
    if (!url) {
        commander_1.program.help();
        // program.help() calls process.exit() internally
    }
    else {
        const params = parseUrlScheme(url);
        if (!params) {
            console.error(chalk_1.default.red("Invalid URL format"));
            console.log("Expected: codehorse://apply?reviewId=xxx&token=yyy&apiUrl=zzz");
            process.exit(1);
        }
        await applyReview(params);
    }
});
// Config command
const configCmd = commander_1.program.command("config").description("Manage configuration");
configCmd
    .command("set-repo <fullName> <localPath>")
    .description("Set local path for a repository")
    .action((fullName, localPath) => {
    const absolutePath = (0, path_1.resolve)(localPath);
    if (!(0, fs_1.existsSync)(absolutePath)) {
        console.error(chalk_1.default.red(`Path does not exist: ${absolutePath}`));
        process.exit(1);
    }
    (0, config_js_1.setRepoPath)(fullName, absolutePath);
    console.log(chalk_1.default.green(`Set ${fullName} -> ${absolutePath}`));
});
configCmd
    .command("list")
    .description("List all repository mappings")
    .action(() => {
    const mappings = (0, config_js_1.getAllRepoMappings)();
    if (Object.keys(mappings).length === 0) {
        console.log(chalk_1.default.yellow("No repository mappings configured."));
        return;
    }
    console.log(chalk_1.default.bold("Repository Mappings:"));
    for (const [fullName, localPath] of Object.entries(mappings)) {
        console.log(`  ${fullName} -> ${localPath}`);
    }
});
configCmd
    .command("set-google-auth <credentialsPath>")
    .description("Set Google Service Account credentials for Sheets API access")
    .action((credentialsPath) => {
    const absolutePath = (0, path_1.resolve)(credentialsPath);
    if (!(0, fs_1.existsSync)(absolutePath)) {
        console.error(chalk_1.default.red(`Credentials file not found: ${absolutePath}`));
        process.exit(1);
    }
    try {
        (0, config_js_1.setGoogleCredentials)(absolutePath);
        console.log(chalk_1.default.green(`Google credentials configured successfully.`));
        console.log(chalk_1.default.gray(`Credentials copied to: ${(0, google_auth_js_1.getCredentialsFilePath)()}`));
        console.log(chalk_1.default.yellow("\nRemember to share your Google Sheets with the service account email."));
    }
    catch (error) {
        console.error(chalk_1.default.red(`Failed to set credentials: ${error.message}`));
        process.exit(1);
    }
});
configCmd
    .command("google-auth-status")
    .description("Check Google authentication status")
    .action(() => {
    if ((0, google_auth_js_1.hasGoogleCredentials)()) {
        console.log(chalk_1.default.green("✅ Google credentials are configured."));
        console.log(chalk_1.default.gray(`Credentials file: ${(0, google_auth_js_1.getCredentialsFilePath)()}`));
    }
    else {
        console.log(chalk_1.default.yellow("❌ Google credentials are not configured."));
        console.log(chalk_1.default.gray("\nTo configure, run:"));
        console.log(chalk_1.default.cyan("  codehorse-handler config set-google-auth <path/to/credentials.json>"));
    }
});
// Register command (for URL scheme registration)
commander_1.program
    .command("register")
    .description("Register codehorse:// URL scheme handler")
    .action(() => {
    console.log(chalk_1.default.yellow("URL scheme registration is platform-specific."));
    console.log("\nFor macOS, run:");
    console.log(chalk_1.default.cyan("  ./scripts/register-macos.sh"));
    console.log("\nFor Windows, run:");
    console.log(chalk_1.default.cyan("  ./scripts/register-windows.ps1"));
    console.log("\nFor Linux, run:");
    console.log(chalk_1.default.cyan("  ./scripts/register-linux.sh"));
});
commander_1.program.parse();
//# sourceMappingURL=index.js.map