import Conf from "conf";
import type { Config } from "./types.js";

const config = new Conf<Config>({
  projectName: "codehorse-handler",
  defaults: {
    repoMappings: {},
  },
});

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

export { config };
