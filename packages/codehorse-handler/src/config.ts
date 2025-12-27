import Conf from "conf";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { Config } from "./types.js";

const config = new Conf<Config>({
  projectName: "codehorse-handler",
  defaults: {
    repoMappings: {},
  },
});

// Google credentials file location
const CONFIG_DIR = join(homedir(), ".config", "codehorse-handler");
const GOOGLE_CREDENTIALS_FILE = join(CONFIG_DIR, "google-credentials.json");

/**
 * Get the local path for a repository
 */
export function getRepoPath(fullName: string): string | null {
  const mappings = config.get("repoMappings");
  return mappings[fullName] || null;
}

/**
 * Set the local path for a repository
 */
export function setRepoPath(fullName: string, localPath: string): void {
  const mappings = config.get("repoMappings");
  mappings[fullName] = localPath;
  config.set("repoMappings", mappings);
}

/**
 * Get all repository mappings
 */
export function getAllRepoMappings(): Record<string, string> {
  return config.get("repoMappings");
}

/**
 * Remove a repository mapping
 */
export function removeRepoPath(fullName: string): void {
  const mappings = config.get("repoMappings");
  delete mappings[fullName];
  config.set("repoMappings", mappings);
}

/**
 * Set Google credentials by copying the file to config directory
 */
export function setGoogleCredentials(sourcePath: string): void {
  // Ensure config directory exists
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }

  // Read and parse to validate JSON
  const content = readFileSync(sourcePath, "utf-8");
  const credentials = JSON.parse(content);

  // Basic validation
  if (!credentials.client_email || !credentials.private_key) {
    throw new Error("Invalid credentials file: missing client_email or private_key");
  }

  // Copy to config directory
  writeFileSync(GOOGLE_CREDENTIALS_FILE, content, { mode: 0o600 });

  console.log(`Service account email: ${credentials.client_email}`);
}

/**
 * Get Google credentials file path
 */
export function getGoogleCredentialsPath(): string {
  return GOOGLE_CREDENTIALS_FILE;
}

export { config };
