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
exports.setGoogleCredentials = setGoogleCredentials;
exports.getGoogleCredentialsPath = getGoogleCredentialsPath;
const conf_1 = __importDefault(require("conf"));
const fs_1 = require("fs");
const path_1 = require("path");
const os_1 = require("os");
const config = new conf_1.default({
    projectName: "codehorse-handler",
    defaults: {
        repoMappings: {},
    },
});
exports.config = config;
// Google credentials file location
const CONFIG_DIR = (0, path_1.join)((0, os_1.homedir)(), ".config", "codehorse-handler");
const GOOGLE_CREDENTIALS_FILE = (0, path_1.join)(CONFIG_DIR, "google-credentials.json");
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
/**
 * Set Google credentials by copying the file to config directory
 */
function setGoogleCredentials(sourcePath) {
    // Ensure config directory exists
    if (!(0, fs_1.existsSync)(CONFIG_DIR)) {
        (0, fs_1.mkdirSync)(CONFIG_DIR, { recursive: true });
    }
    // Read and parse to validate JSON
    const content = (0, fs_1.readFileSync)(sourcePath, "utf-8");
    const credentials = JSON.parse(content);
    // Basic validation
    if (!credentials.client_email || !credentials.private_key) {
        throw new Error("Invalid credentials file: missing client_email or private_key");
    }
    // Copy to config directory
    (0, fs_1.writeFileSync)(GOOGLE_CREDENTIALS_FILE, content, { mode: 0o600 });
    console.log(`Service account email: ${credentials.client_email}`);
}
/**
 * Get Google credentials file path
 */
function getGoogleCredentialsPath() {
    return GOOGLE_CREDENTIALS_FILE;
}
//# sourceMappingURL=config.js.map