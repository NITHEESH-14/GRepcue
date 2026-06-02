// ============================================================================
// GRepcue — Configuration & Persistent Settings
// Stores config at ~/.grepcue/config.json (shared by CLI and MCP server)
// ============================================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AIConfig, RepcueConfig } from "./types.js";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const CONFIG_DIR = join(homedir(), ".grepcue");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const LAST_SEARCH_FILE = join(CONFIG_DIR, "last_search.json");

/**
 * Returns the path to the config file.
 */
export function getConfigPath(): string {
  return CONFIG_FILE;
}

/**
 * Saves the last search key-to-repo mapping.
 */
export function saveLastSearch(mapping: Record<string, string>): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(LAST_SEARCH_FILE, JSON.stringify(mapping, null, 2), "utf-8");
}

/**
 * Loads the last search key-to-repo mapping.
 */
export function loadLastSearch(): Record<string, string> {
  try {
    if (existsSync(LAST_SEARCH_FILE)) {
      const raw = readFileSync(LAST_SEARCH_FILE, "utf-8");
      return JSON.parse(raw);
    }
  } catch {}
  return {};
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: RepcueConfig = {
  maxResults: 5,
  cacheTTL: 3600000, // 1 hour in ms
};

// ---------------------------------------------------------------------------
// Read / Write Config
// ---------------------------------------------------------------------------

/**
 * Loads the full config from disk, merged with defaults.
 */
export function loadConfig(): RepcueConfig {
  try {
    if (existsSync(CONFIG_FILE)) {
      const raw = readFileSync(CONFIG_FILE, "utf-8");
      const parsed = JSON.parse(raw) as Partial<RepcueConfig>;
      return { ...DEFAULT_CONFIG, ...parsed };
    }
  } catch {
    // If file is corrupted, return defaults
  }
  return { ...DEFAULT_CONFIG };
}

/**
 * Saves the full config to disk, creating the directory if needed.
 */
export function saveConfig(config: RepcueConfig): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

/**
 * Deletes the config file entirely.
 */
export function clearConfig(): void {
  if (existsSync(CONFIG_FILE)) {
    unlinkSync(CONFIG_FILE);
  }
}

// ---------------------------------------------------------------------------
// GitHub Token
// ---------------------------------------------------------------------------

/**
 * Gets the GitHub token. Priority:
 * 1. GITHUB_TOKEN environment variable
 * 2. Saved config file
 * Returns undefined if neither is set.
 */
export function getGitHubToken(): string | undefined {
  return process.env.GITHUB_TOKEN || loadConfig().githubToken;
}

/**
 * Saves a GitHub token to the persistent config.
 */
export function saveGitHubToken(token: string): void {
  const config = loadConfig();
  config.githubToken = token;
  saveConfig(config);
}

/**
 * Removes the GitHub token from the persistent config.
 */
export function removeGitHubToken(): void {
  const config = loadConfig();
  delete config.githubToken;
  saveConfig(config);
}

// ---------------------------------------------------------------------------
// AI Model Configuration
// ---------------------------------------------------------------------------

/**
 * Gets the saved AI model configuration, if any.
 */
export function getAIConfig(): AIConfig | undefined {
  return loadConfig().ai;
}

/**
 * Checks if an AI model is configured.
 */
export function isAIConfigured(): boolean {
  return !!loadConfig().ai;
}

/**
 * Saves AI model connection details.
 */
export function saveAIConfig(aiConfig: AIConfig): void {
  const config = loadConfig();
  config.ai = aiConfig;
  saveConfig(config);
}

/**
 * Removes the AI model configuration.
 */
export function removeAIConfig(): void {
  const config = loadConfig();
  delete config.ai;
  saveConfig(config);
}
