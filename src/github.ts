// ============================================================================
// GRepcue — GitHub API Integration
// Searches, fetches details, and retrieves README content from GitHub.
// ============================================================================

import { getGitHubToken } from "./config.js";
import { CacheStore, makeCacheKey } from "./cache.js";
import type { GitHubRepo, RepoComparison, RepoSummary } from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GITHUB_API = "https://api.github.com";
const USER_AGENT = "grepcue/1.0.0";

// Caches
const searchCache = new CacheStore<GitHubRepo[]>();
const repoCache = new CacheStore<GitHubRepo>();
const readmeCache = new CacheStore<string>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build headers for GitHub API requests.
 */
function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": USER_AGENT,
  };
  const token = getGitHubToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Make a GitHub API request with error handling.
 */
async function githubFetch<T>(path: string): Promise<T> {
  const url = `${GITHUB_API}${path}`;
  const response = await fetch(url, { headers: getHeaders() });

  if (!response.ok) {
    if (response.status === 403) {
      const remaining = response.headers.get("x-ratelimit-remaining");
      if (remaining === "0") {
        const resetTime = response.headers.get("x-ratelimit-reset");
        const resetDate = resetTime
          ? new Date(parseInt(resetTime) * 1000).toLocaleTimeString()
          : "soon";
        throw new Error(
          `GitHub API rate limit exceeded. Resets at ${resetDate}. ` +
            `Set a GITHUB_TOKEN or run "grepcue connect-github" for higher limits.`
        );
      }
    }
    if (response.status === 404) {
      throw new Error(`Repository not found. Check the owner/repo format.`);
    }
    const body = await response.text();
    throw new Error(`GitHub API error (${response.status}): ${body}`);
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Search Repositories
// ---------------------------------------------------------------------------

interface SearchResponse {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubRepo[];
}

/**
 * Search GitHub repositories using the Search API.
 *
 * @param query — GitHub search query string (e.g., "web scraper language:Python")
 * @param maxResults — Maximum number of results to return (1-100, default 5)
 * @param sort — Sort field: "stars" | "forks" | "updated" | "" (default "" for relevance/best-match)
 * @param noCache — Skip the cache and make a fresh request
 */
export async function searchRepositories(
  query: string,
  maxResults: number = 5,
  sort: "stars" | "forks" | "updated" | "" = "",
  noCache: boolean = false
): Promise<GitHubRepo[]> {
  const cacheKey = makeCacheKey("search", query, maxResults, sort);

  if (!noCache) {
    const cached = searchCache.get(cacheKey);
    if (cached) return cached;
  }

  // Fetch more results than needed to allow for filtering/ranking
  const perPage = Math.min(Math.max(maxResults * 3, 15), 100);
  const encodedQuery = encodeURIComponent(query);
  
  let path = `/search/repositories?q=${encodedQuery}&per_page=${perPage}`;
  if (sort) {
    path += `&sort=${sort}&order=desc`;
  }

  const data = await githubFetch<SearchResponse>(path);
  const results = data.items || [];

  searchCache.set(cacheKey, results);
  return results;
}

// ---------------------------------------------------------------------------
// Get Repository Details
// ---------------------------------------------------------------------------

/**
 * Fetches full details of a single repository.
 *
 * @param ownerRepo — Format: "owner/repo" (e.g., "vercel/next.js")
 */
export async function getRepoDetails(ownerRepo: string): Promise<GitHubRepo> {
  const normalized = normalizeRepoInput(ownerRepo);
  const cacheKey = makeCacheKey("repo", normalized);

  const cached = repoCache.get(cacheKey);
  if (cached) return cached;

  const repo = await githubFetch<GitHubRepo>(`/repos/${normalized}`);
  repoCache.set(cacheKey, repo);
  return repo;
}

// ---------------------------------------------------------------------------
// Get README Content
// ---------------------------------------------------------------------------

interface ReadmeResponse {
  content: string;
  encoding: string;
  size: number;
}

/**
 * Fetches and decodes a repository's README content.
 *
 * @param ownerRepo — Format: "owner/repo"
 * @param maxLength — Maximum characters to return (default 3000)
 */
export async function getRepoReadme(
  ownerRepo: string,
  maxLength: number = 3000
): Promise<{ content: string; truncated: boolean }> {
  const normalized = normalizeRepoInput(ownerRepo);
  const cacheKey = makeCacheKey("readme", normalized);

  const cached = readmeCache.get(cacheKey);
  if (cached) {
    const truncated = cached.length > maxLength;
    return {
      content: truncated ? cached.substring(0, maxLength) : cached,
      truncated,
    };
  }

  try {
    const data = await githubFetch<ReadmeResponse>(
      `/repos/${normalized}/readme`
    );
    const decoded = Buffer.from(data.content, "base64").toString("utf-8");
    readmeCache.set(cacheKey, decoded);

    const truncated = decoded.length > maxLength;
    return {
      content: truncated ? decoded.substring(0, maxLength) : decoded,
      truncated,
    };
  } catch {
    return { content: "README not available.", truncated: false };
  }
}

// ---------------------------------------------------------------------------
// Compare Repositories
// ---------------------------------------------------------------------------

/**
 * Fetches two repos and builds a side-by-side comparison.
 */
export async function compareRepos(
  repoA: string,
  repoB: string
): Promise<RepoComparison> {
  const [a, b] = await Promise.all([
    getRepoDetails(repoA),
    getRepoDetails(repoB),
  ]);

  const comparison: RepoComparison["comparison"] = [
    {
      field: "Stars",
      valueA: a.stargazers_count,
      valueB: b.stargazers_count,
      winner:
        a.stargazers_count > b.stargazers_count
          ? "A"
          : a.stargazers_count < b.stargazers_count
            ? "B"
            : "tie",
    },
    {
      field: "Forks",
      valueA: a.forks_count,
      valueB: b.forks_count,
      winner:
        a.forks_count > b.forks_count
          ? "A"
          : a.forks_count < b.forks_count
            ? "B"
            : "tie",
    },
    {
      field: "Open Issues",
      valueA: a.open_issues_count,
      valueB: b.open_issues_count,
      winner:
        a.open_issues_count < b.open_issues_count
          ? "A"
          : a.open_issues_count > b.open_issues_count
            ? "B"
            : "tie",
    },
    {
      field: "Language",
      valueA: a.language || "N/A",
      valueB: b.language || "N/A",
    },
    {
      field: "License",
      valueA: a.license?.spdx_id || "None",
      valueB: b.license?.spdx_id || "None",
    },
    {
      field: "Last Push",
      valueA: new Date(a.pushed_at).toLocaleDateString(),
      valueB: new Date(b.pushed_at).toLocaleDateString(),
      winner: a.pushed_at > b.pushed_at ? "A" : a.pushed_at < b.pushed_at ? "B" : "tie",
    },
    {
      field: "Topics",
      valueA: a.topics?.length || 0,
      valueB: b.topics?.length || 0,
    },
    {
      field: "Archived",
      valueA: a.archived ? "Yes" : "No",
      valueB: b.archived ? "Yes" : "No",
    },
  ];

  return { repoA: a, repoB: b, comparison };
}

// ---------------------------------------------------------------------------
// Summarize Repository
// ---------------------------------------------------------------------------

/**
 * Fetches a repo's details and README to create a summary.
 */
export async function summarizeRepo(repoInput: string): Promise<RepoSummary> {
  const ownerRepo = normalizeRepoInput(repoInput);
  const [repo, readme] = await Promise.all([
    getRepoDetails(ownerRepo),
    getRepoReadme(ownerRepo),
  ]);

  return {
    repo,
    readmeContent: readme.content,
    truncated: readme.truncated,
  };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Normalizes various repo input formats to "owner/repo".
 *
 * Accepts:
 *   - "owner/repo"
 *   - "https://github.com/owner/repo"
 *   - "github.com/owner/repo"
 */
export function normalizeRepoInput(input: string): string {
  let cleaned = input.trim();

  // Remove trailing slashes
  cleaned = cleaned.replace(/\/+$/, "");

  // Handle full GitHub URLs
  const urlMatch = cleaned.match(
    /(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+\/[^/]+)/
  );
  if (urlMatch) {
    return urlMatch[1];
  }

  // Already in "owner/repo" format
  if (/^[^/]+\/[^/]+$/.test(cleaned)) {
    return cleaned;
  }

  throw new Error(
    `Invalid repo format: "${input}". Use "owner/repo" or a GitHub URL.`
  );
}

/**
 * Check if the GitHub token is configured.
 */
export function hasGitHubToken(): boolean {
  return !!getGitHubToken();
}
