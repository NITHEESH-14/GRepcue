// ============================================================================
// GRepcue — Shared TypeScript Interfaces
// ============================================================================

/**
 * Raw GitHub repository from the Search API response.
 */
export interface GitHubRepo {
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  language: string | null;
  license: { spdx_id: string; name: string } | null;
  topics: string[];
  pushed_at: string;
  created_at: string;
  updated_at: string;
  owner: {
    login: string;
    avatar_url: string;
  };
  archived: boolean;
  default_branch: string;
}

/**
 * Score breakdown for a ranked repo.
 */
export interface ScoreBreakdown {
  relevance: number;
  popularity: number;
  recency: number;
  license: number;
  total: number;
}

/**
 * A repo after scoring and ranking.
 */
export interface RankedRepo {
  repo: GitHubRepo;
  score: ScoreBreakdown;
  rank: number;
  fitExplanation?: string;
  /** The search term that originally fetched this repo (set by parallel search) */
  matchedKeyword?: string;
}

/**
 * Side-by-side comparison of two repos.
 */
export interface RepoComparison {
  repoA: GitHubRepo;
  repoB: GitHubRepo;
  comparison: {
    field: string;
    valueA: string | number;
    valueB: string | number;
    winner?: "A" | "B" | "tie";
  }[];
}

/**
 * Summary of a repository's README.
 */
export interface RepoSummary {
  repo: GitHubRepo;
  readmeContent: string;
  truncated: boolean;
}

/**
 * Result of intent extraction from a project description.
 */
export interface IntentResult {
  keywords: string[];
  language?: string;
  category?: string;
  originalQuery: string;
}

/**
 * Options for searching repositories.
 */
export interface SearchOptions {
  language?: string;
  maxResults?: number;
  sort?: "stars" | "forks" | "updated";
  noCache?: boolean;
}

/**
 * Supported AI providers.
 */
export type AIProvider =
  | "openai"
  | "gemini"
  | "anthropic"
  | "ollama"
  | "custom";

/**
 * AI model connection configuration.
 */
export interface AIConfig {
  provider: AIProvider;
  apiKey?: string;
  baseUrl: string;
  model: string;
}

/**
 * Full Repcue configuration (persisted to ~/.repcue/config.json).
 */
export interface RepcueConfig {
  githubToken?: string;
  ai?: AIConfig;
  maxResults: number;
  cacheTTL: number;
  simple?: boolean;
  history?: string[];
  bookmarks?: GitHubRepo[];
}

/**
 * Provider presets for easy AI model connection setup.
 */
export const AI_PROVIDER_PRESETS: Record<
  AIProvider,
  { name: string; baseUrl: string; defaultModel: string; requiresKey: boolean }
> = {
  openai: {
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o",
    requiresKey: true,
  },
  gemini: {
    name: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.0-flash",
    requiresKey: true,
  },
  anthropic: {
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-4-20250514",
    requiresKey: true,
  },
  ollama: {
    name: "Ollama (Local)",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "llama3.2",
    requiresKey: false,
  },
  custom: {
    name: "Custom (OpenAI-compatible)",
    baseUrl: "",
    defaultModel: "",
    requiresKey: true,
  },
};
