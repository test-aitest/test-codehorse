import Conf from "conf";
import type { Config } from "./types.js";
declare const config: Conf<Config>;
/**
 * Get the local path for a repository
 */
export declare function getRepoPath(fullName: string): string | null;
/**
 * Set the local path for a repository
 */
export declare function setRepoPath(fullName: string, localPath: string): void;
/**
 * Get all repository mappings
 */
export declare function getAllRepoMappings(): Record<string, string>;
/**
 * Remove a repository mapping
 */
export declare function removeRepoPath(fullName: string): void;
/**
 * Set Google credentials by copying the file to config directory
 */
export declare function setGoogleCredentials(sourcePath: string): void;
/**
 * Get Google credentials file path
 */
export declare function getGoogleCredentialsPath(): string;
export { config };
//# sourceMappingURL=config.d.ts.map