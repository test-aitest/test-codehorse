"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.getRepoPath = getRepoPath;
exports.setRepoPath = setRepoPath;
exports.getAllRepoMappings = getAllRepoMappings;
exports.removeRepoPath = removeRepoPath;
const conf_1 = __importDefault(require("conf"));
const config = new conf_1.default({
    projectName: "codehorse-handler",
    defaults: {
        repoMappings: {},
    },
});
exports.config = config;
/**
 * Get the local path for a repository
 */
function getRepoPath(fullName) {
    const mappings = config.get("repoMappings");
    return mappings[fullName] || null;
}
/**
 * Set the local path for a repository
 */
function setRepoPath(fullName, localPath) {
    const mappings = config.get("repoMappings");
    mappings[fullName] = localPath;
    config.set("repoMappings", mappings);
}
/**
 * Get all repository mappings
 */
function getAllRepoMappings() {
    return config.get("repoMappings");
}
/**
 * Remove a repository mapping
 */
function removeRepoPath(fullName) {
    const mappings = config.get("repoMappings");
    delete mappings[fullName];
    config.set("repoMappings", mappings);
}
//# sourceMappingURL=config.js.map