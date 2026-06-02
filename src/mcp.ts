// ============================================================================
// GRepcue — MCP Server Entry Point
// Exposes find_repos, compare_repos, summarize_repo as MCP tools.
// ============================================================================

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { searchRepositories, compareRepos, summarizeRepo } from "./github.js";
import { extractKeywords, buildSearchQuery } from "./intent.js";
import { rankRepos, groupRepos } from "./ranker.js";
import { saveLastSearch, loadLastSearch } from "./config.js";

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

      // Group results
      const grouped = groupRepos(ranked, description, intent.keywords, max_results);
      const mapping: Record<string, string> = {};

      if (grouped.length === 0) {
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
      const formattedGroups = grouped.map((group) => {
        const groupLines = [`### ${group.letter}. ${group.name}`];
        
        const itemLines = group.items.map((item, index) => {
          const r = item.repo;
          const key = `${group.letter}${index + 1}`;
          mapping[key] = r.full_name;

          return [
            `**${key}** - **${r.full_name}** ⭐ ${r.stargazers_count.toLocaleString()}`,
            `   URL: ${r.html_url}`,
            `   Language: ${r.language || "N/A"} | License: ${r.license?.spdx_id || "None"} | Last push: ${new Date(r.pushed_at).toLocaleDateString()}`,
            `   ${r.description || "No description"}`,
            `   Score: ${(item.score.total * 100).toFixed(0)}% (relevance: ${(item.score.relevance * 100).toFixed(0)}%, popularity: ${(item.score.popularity * 100).toFixed(0)}%, recency: ${(item.score.recency * 100).toFixed(0)}%, license: ${(item.score.license * 100).toFixed(0)}%)`,
            r.topics?.length ? `   Topics: ${r.topics.join(", ")}` : null,
          ]
            .filter(Boolean)
            .join("\n");
        });

        return groupLines.concat(itemLines).join("\n\n");
      });

      // Save mapping to file
      saveLastSearch(mapping);

      return {
        content: [
          {
            type: "text" as const,
            text: `Found relevant repositories for "${description}":\n\n${formattedGroups.join("\n\n")}`,
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
// Tool 4: clone_repos
// ---------------------------------------------------------------------------

server.tool(
  "clone_repos",
  "Clone one or more GitHub repositories by their keys (e.g., A1, A2, B5) from the last search, or by their repository names (e.g., owner/repo) or GitHub URLs. To prevent cluttering, you must provide a destination directory.",
  {
    repos: z
      .string()
      .describe("Comma-separated list of keys, repository names, or URLs to clone"),
    destination: z
      .string()
      .describe("Absolute path where the repositories should be cloned"),
  },
  async ({ repos, destination }) => {
    try {
      const keys = repos.split(",").map((k) => k.trim()).filter(Boolean);
      const cwd = destination;
      const mapping = loadLastSearch();

      const cloneTargets: { name: string; url: string }[] = [];
      const logs: string[] = [];

      for (const key of keys) {
        if (/^[a-zA-Z]\d+$/.test(key)) {
          const repoName = mapping[key.toUpperCase()];
          if (repoName) {
            cloneTargets.push({
              name: repoName,
              url: `https://github.com/${repoName}.git`,
            });
          } else {
            logs.push(`Warning: Key "${key}" was not found in the last search results.`);
          }
        } else {
          let url = key;
          let name = key;

          if (!key.startsWith("http") && !key.startsWith("git@")) {
            if (/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(key)) {
              url = `https://github.com/${key}.git`;
            } else {
              logs.push(`Warning: "${key}" is not a valid repository name (owner/repo) or URL.`);
              continue;
            }
          } else {
            const match = key.match(/\/([a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+)(?:\.git)?$/);
            if (match) {
              name = match[1];
            }
          }
          cloneTargets.push({ name, url });
        }
      }

      if (cloneTargets.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No valid clone targets identified.\nLogs:\n${logs.join("\n")}`,
            },
          ],
          isError: true,
        };
      }

      const { existsSync, mkdirSync } = await import("node:fs");
      if (!existsSync(cwd)) {
        mkdirSync(cwd, { recursive: true });
      }

      const { exec } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execAsync = promisify(exec);

      for (const target of cloneTargets) {
        try {
          logs.push(`Cloning ${target.name} from ${target.url}...`);
          await execAsync(`git clone ${target.url}`, { cwd });
          logs.push(`Successfully cloned ${target.name}.`);
        } catch (err: any) {
          logs.push(`Failed to clone ${target.name}: ${err.message}`);
        }
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `Cloning completed.\n\nLogs:\n${logs.join("\n")}`,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error cloning repositories: ${error.message}`,
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
