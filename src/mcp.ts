// ============================================================================
// GRepcue — MCP Server Entry Point
// Exposes find_repos, compare_repos, summarize_repo as MCP tools.
// ============================================================================

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { searchRepositories, compareRepos, summarizeRepo } from "./github.js";
import { extractKeywords, buildSearchQuery } from "./intent.js";
import { rankRepos } from "./ranker.js";

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "grepcue",
  version: "1.0.0",
});

// ---------------------------------------------------------------------------
// Tool 1: find_repos
// ---------------------------------------------------------------------------

server.tool(
  "find_repos",
  "Find relevant GitHub repositories for a project idea. Pass a plain English description of what you want to build, and get back ranked repositories with relevance scores.",
  {
    description: z
      .string()
      .describe("Project idea or search query in plain English"),
    language: z
      .string()
      .optional()
      .describe("Filter by programming language (e.g., Python, JavaScript)"),
    max_results: z
      .number()
      .min(1)
      .max(10)
      .optional()
      .default(5)
      .describe("Maximum number of repositories to return (1-10)"),
  },
  async ({ description, language, max_results }) => {
    try {
      // Extract keywords locally (the host LLM already understands intent)
      const intent = extractKeywords(description);
      const query = buildSearchQuery(intent, language) + " in:name,description";

      // Search GitHub
      const repos = await searchRepositories(query, max_results * 3);

      // Rank results
      const ranked = rankRepos(repos, intent.keywords, max_results);

      if (ranked.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No repositories found for: "${description}". Try different keywords or broaden your search.`,
            },
          ],
        };
      }

      // Format as structured text for the LLM
      const results = ranked.map((item) => {
        const r = item.repo;
        return [
          `${item.rank}. **${r.full_name}** ⭐ ${r.stargazers_count.toLocaleString()}`,
          `   URL: ${r.html_url}`,
          `   Language: ${r.language || "N/A"} | License: ${r.license?.spdx_id || "None"} | Last push: ${new Date(r.pushed_at).toLocaleDateString()}`,
          `   ${r.description || "No description"}`,
          `   Score: ${(item.score.total * 100).toFixed(0)}% (relevance: ${(item.score.relevance * 100).toFixed(0)}%, popularity: ${(item.score.popularity * 100).toFixed(0)}%, recency: ${(item.score.recency * 100).toFixed(0)}%, license: ${(item.score.license * 100).toFixed(0)}%)`,
          r.topics?.length ? `   Topics: ${r.topics.join(", ")}` : null,
        ]
          .filter(Boolean)
          .join("\n");
      });

      return {
        content: [
          {
            type: "text" as const,
            text: `Found ${ranked.length} relevant repositories for "${description}":\n\n${results.join("\n\n")}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error searching repositories: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 2: compare_repos
// ---------------------------------------------------------------------------

server.tool(
  "compare_repos",
  "Compare two GitHub repositories side by side. Provide two repo names (owner/repo format or GitHub URLs) to see a detailed comparison of stars, forks, activity, language, license, and more.",
  {
    repo_a: z
      .string()
      .describe('First repository — "owner/repo" or GitHub URL'),
    repo_b: z
      .string()
      .describe('Second repository — "owner/repo" or GitHub URL'),
  },
  async ({ repo_a, repo_b }) => {
    try {
      const comparison = await compareRepos(repo_a, repo_b);

      const lines = comparison.comparison.map((row) => {
        const winner =
          row.winner === "A"
            ? " ✓ A"
            : row.winner === "B"
              ? " ✓ B"
              : row.winner === "tie"
                ? " (tie)"
                : "";
        return `| ${row.field} | ${row.valueA} | ${row.valueB} |${winner}`;
      });

      const table = [
        `| Field | ${comparison.repoA.full_name} | ${comparison.repoB.full_name} |`,
        `|-------|------|------|`,
        ...lines,
      ].join("\n");

      const text = [
        `## Repository Comparison\n`,
        table,
        `\n### Descriptions`,
        `**A:** ${comparison.repoA.description || "N/A"}`,
        `**B:** ${comparison.repoB.description || "N/A"}`,
        `\n### Links`,
        `- A: ${comparison.repoA.html_url}`,
        `- B: ${comparison.repoB.html_url}`,
      ].join("\n");

      return {
        content: [{ type: "text" as const, text }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error comparing repositories: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 3: summarize_repo
// ---------------------------------------------------------------------------

server.tool(
  "summarize_repo",
  "Get a summary of a GitHub repository including its metadata and README content. Provide a repo name (owner/repo) or GitHub URL.",
  {
    repo: z
      .string()
      .describe('Repository — "owner/repo" or GitHub URL'),
  },
  async ({ repo }) => {
    try {
      const summary = await summarizeRepo(repo);
      const r = summary.repo;

      const text = [
        `## ${r.full_name}`,
        ``,
        `**URL:** ${r.html_url}`,
        `**Stars:** ${r.stargazers_count.toLocaleString()} | **Forks:** ${r.forks_count.toLocaleString()} | **Open Issues:** ${r.open_issues_count}`,
        `**Language:** ${r.language || "N/A"} | **License:** ${r.license?.spdx_id || "None"}`,
        `**Last Push:** ${new Date(r.pushed_at).toLocaleDateString()} | **Created:** ${new Date(r.created_at).toLocaleDateString()}`,
        r.topics?.length ? `**Topics:** ${r.topics.join(", ")}` : null,
        r.description ? `\n> ${r.description}` : null,
        `\n---\n### README${summary.truncated ? " (truncated)" : ""}\n`,
        summary.readmeContent,
      ]
        .filter(Boolean)
        .join("\n");

      return {
        content: [{ type: "text" as const, text }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error summarizing repository: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr only (never stdout — it's reserved for MCP JSON-RPC)
  console.error("GRepcue MCP server started.");
}

main().catch((error) => {
  console.error("Failed to start GRepcue MCP server:", error);
  process.exit(1);
});
