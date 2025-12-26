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
export { config };
//# sourceMappingURL=config.d.ts.map