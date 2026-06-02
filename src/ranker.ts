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

  let totalScore = 0;

  for (const keyword of keywords) {
    const kw = keyword.toLowerCase();
    const name = repo.full_name.toLowerCase();
    const description = (repo.description || "").toLowerCase();
    const topics = (repo.topics || []).map((t) => t.toLowerCase());

    let keywordScore = 0;

    if (name.includes(kw)) {
      // Highest priority: Match in actual name
      keywordScore = 1.0;
    } else if (description.includes(kw)) {
      // Medium priority: Match in description
      keywordScore = 0.6;
    } else if (topics.includes(kw) || topics.some((t) => t.includes(kw))) {
      // Low priority: Match in topics/tags
      keywordScore = 0.4;
    }

    totalScore += keywordScore;
  }

  // Normalize by number of keywords
  return Math.min(totalScore / keywords.length, 1);
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

// ---------------------------------------------------------------------------
// Grouping logic (shared between CLI and MCP)
// ---------------------------------------------------------------------------

export interface GroupedRepos {
  letter: string;
  name: string;
  items: RankedRepo[];
}

/**
 * Groups ranked repositories by keywords, fallback to query if not enough keywords.
 */
export function groupRepos(
  repos: RankedRepo[],
  query: string,
  keywords: string[] = [],
  maxPerGroup: number = 5
): GroupedRepos[] {
  const grouped: GroupedRepos[] = [];
  let nextLetterCode = 65; // ASCII 'A'

  const getNextLetter = () => {
    const letter = String.fromCharCode(nextLetterCode);
    nextLetterCode++;
    return letter;
  };

  if (keywords.length > 1) {
    const groups = new Map<string, RankedRepo[]>();
    const uncategorized: RankedRepo[] = [];

    // Initialize groups for each keyword in lowercase
    for (const kw of keywords) {
      groups.set(kw.toLowerCase(), []);
    }

    // Distribute repos into groups using matchedKeyword
    for (const item of repos) {
      const repo = item.repo;
      const coreText = [
        repo.full_name,
        repo.description || "",
        ...(repo.topics || [])
      ].join(" ").toLowerCase();

      let placed = false;

      if (item.matchedKeyword) {
        const sourceKey = item.matchedKeyword.toLowerCase();
        if (groups.has(sourceKey)) {
          groups.get(sourceKey)!.push(item);
          placed = true;
        }
      }

      if (!placed) {
        // Fallback: text-based matching
        let matched = false;
        for (const kw of keywords) {
          const kwLower = kw.toLowerCase();
          const kwParts = kwLower.split("-").filter(w => w.length > 2);
          const isMatch = kwParts.some(w => coreText.includes(w));
          if (isMatch) {
            groups.get(kwLower)!.push(item);
            matched = true;
            break;
          }
        }
        if (!matched) {
          uncategorized.push(item);
        }
      }
    }

    // Create groups for keywords
    for (const kw of keywords) {
      const groupRepos = (groups.get(kw.toLowerCase()) || []).slice(0, maxPerGroup);
      if (groupRepos.length > 0) {
        // Capitalize first letter of keyword for display
        const name = kw.charAt(0).toUpperCase() + kw.slice(1);
        grouped.push({
          letter: getNextLetter(),
          name,
          items: groupRepos
        });
      }
    }

    // Create group for uncategorized
    if (uncategorized.length > 0) {
      const cappedUncategorized = uncategorized.slice(0, maxPerGroup);
      grouped.push({
        letter: getNextLetter(),
        name: "General / Related Matches",
        items: cappedUncategorized
      });
    }
  } else {
    // Single group with original query or single keyword
    // Capitalize first letter of query
    const name = query.charAt(0).toUpperCase() + query.slice(1);
    grouped.push({
      letter: getNextLetter(),
      name,
      items: repos.slice(0, maxPerGroup)
    });
  }

  return grouped;
}
