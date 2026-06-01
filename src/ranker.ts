// ============================================================================
// GRepcue — Scoring & Ranking Logic
// Ranks GitHub repos by relevance, popularity, recency, and license.
// ============================================================================

import type { GitHubRepo, RankedRepo, ScoreBreakdown } from "./types.js";

// ---------------------------------------------------------------------------
// Weights (from PRD)
// ---------------------------------------------------------------------------

const WEIGHTS = {
  relevance: 0.4,
  popularity: 0.3,
  recency: 0.2,
  license: 0.1,
};

// ---------------------------------------------------------------------------
// License scoring
// ---------------------------------------------------------------------------

const LICENSE_SCORES: Record<string, number> = {
  MIT: 1.0,
  "Apache-2.0": 1.0,
  "BSD-2-Clause": 1.0,
  "BSD-3-Clause": 1.0,
  ISC: 1.0,
  "0BSD": 1.0,
  Unlicense: 0.9,
  "MPL-2.0": 0.7,
  "LGPL-2.1": 0.6,
  "LGPL-3.0": 0.6,
  "GPL-2.0": 0.5,
  "GPL-3.0": 0.5,
  "AGPL-3.0": 0.4,
  NOASSERTION: 0.2,
};

// ---------------------------------------------------------------------------
// Scoring functions
// ---------------------------------------------------------------------------

/**
 * Calculates the relevance score (0-1) based on keyword matches
 * in the repo's name, description, and topics.
 */
function scoreRelevance(repo: GitHubRepo, keywords: string[]): number {
  if (keywords.length === 0) return 0.5;

  const searchText = [
    repo.full_name,
    repo.description || "",
  ]
    .join(" ")
    .toLowerCase();

  let matches = 0;
  for (const keyword of keywords) {
    if (searchText.includes(keyword.toLowerCase())) {
      matches++;
    }
  }

  return Math.min(matches / keywords.length, 1);
}

/**
 * Calculates the popularity score (0-1) using log-scaled star count.
 * Log scaling prevents huge repos from dominating.
 */
function scorePopularity(repo: GitHubRepo): number {
  const stars = repo.stargazers_count;
  if (stars <= 0) return 0;

  // log10(100000) ≈ 5, so we normalize against 5
  // A repo with 100k+ stars gets close to 1.0
  return Math.min(Math.log10(stars + 1) / 5, 1);
}

/**
 * Calculates the recency score (0-1) based on last push date.
 * - Within 6 months: 1.0
 * - Within 1 year: 0.6
 * - Within 2 years: 0.3
 * - Older: 0.1
 */
function scoreRecency(repo: GitHubRepo): number {
  const lastPush = new Date(repo.pushed_at).getTime();
  const now = Date.now();
  const monthsAgo = (now - lastPush) / (1000 * 60 * 60 * 24 * 30);

  if (monthsAgo <= 6) return 1.0;
  if (monthsAgo <= 12) return 0.6;
  if (monthsAgo <= 24) return 0.3;
  return 0.1;
}

/**
 * Calculates the license score (0-1).
 * Permissive licenses (MIT, Apache) are preferred.
 */
function scoreLicense(repo: GitHubRepo): number {
  if (!repo.license) return 0.2;
  return LICENSE_SCORES[repo.license.spdx_id] ?? 0.3;
}

// ---------------------------------------------------------------------------
// Main ranking function
// ---------------------------------------------------------------------------

/**
 * Calculates the full score breakdown for a repository.
 */
export function calculateScore(
  repo: GitHubRepo,
  keywords: string[]
): ScoreBreakdown {
  const relevance = scoreRelevance(repo, keywords);
  const popularity = scorePopularity(repo);
  const recency = scoreRecency(repo);
  const license = scoreLicense(repo);

  const total =
    relevance * WEIGHTS.relevance +
    popularity * WEIGHTS.popularity +
    recency * WEIGHTS.recency +
    license * WEIGHTS.license;

  return { relevance, popularity, recency, license, total };
}

/**
 * Ranks a list of GitHub repos by calculated score.
 * Returns the top N results, sorted by total score (descending).
 *
 * @param repos — Raw repos from GitHub API
 * @param keywords — Keywords to match against repo data
 * @param maxResults — How many results to return (default 5)
 */
export function rankRepos(
  repos: GitHubRepo[],
  keywords: string[],
  maxResults: number = 5
): RankedRepo[] {
  // Filter out archived repos
  const active = repos.filter((r) => !r.archived);

  // Score each repo
  const scored: RankedRepo[] = active.map((repo) => ({
    repo,
    score: calculateScore(repo, keywords),
    rank: 0,
  }));

  // Sort by total score descending
  scored.sort((a, b) => b.score.total - a.score.total);

  // Assign ranks and trim to maxResults
  return scored.slice(0, maxResults).map((item, index) => ({
    ...item,
    rank: index + 1,
  }));
}
