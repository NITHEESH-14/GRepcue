// ============================================================================
// GRepcue — Terminal Output Formatting (CLI only)
// Beautiful, colorful output for the terminal.
// ============================================================================

import chalk from "chalk";
import type {
  RankedRepo,
  RepoComparison,
  RepoSummary,
  RepcueConfig,
  AIConfig,
  GitHubRepo,
} from "./types.js";
import { AI_PROVIDER_PRESETS } from "./types.js";
import { loadConfig } from "./config.js";

// ---------------------------------------------------------------------------
// Color palette
// ---------------------------------------------------------------------------

const c = {
  brand: chalk.hex("#60A5FA"),       // Blue — Repcue brand
  brandGrey: chalk.hex("#94A3B8"),   // Slate Grey
  star: chalk.hex("#FBBF24"),        // Amber — stars
  success: chalk.hex("#34D399"),     // Emerald — success
  warn: chalk.hex("#FB923C"),        // Orange — warnings
  error: chalk.hex("#F87171"),       // Red — errors
  info: chalk.hex("#60A5FA"),        // Blue — info
  dim: chalk.dim,                    // Dim text
  bold: chalk.bold,
  link: chalk.hex("#60A5FA").underline, // Link style
  label: chalk.hex("#94A3B8"),       // Slate — labels
  num: chalk.hex("#F9A8D4"),         // Pink — numbers
};

function getGradientCharColor(index: number, total: number): string {
  const rStart = 255, gStart = 255, bStart = 255; // #FFFFFF (White)
  const rEnd = 96, gEnd = 165, bEnd = 250;       // #60A5FA (Blue)
  
  const factor = index / (total - 1 || 1);
  const r = Math.round(rStart + factor * (rEnd - rStart));
  const g = Math.round(gStart + factor * (gEnd - gStart));
  const b = Math.round(bStart + factor * (bEnd - bStart));
  
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export function formatTagline(): string {
  const text = "  GRepcue -- Smart assistant to get GitHub repositories";
  let result = "";
  for (let i = 0; i < text.length; i++) {
    if (text[i] === " ") {
      result += " ";
      continue;
    }
    const colorHex = getGradientCharColor(i, text.length);
    const char = text[i];
    // Bold the word "GRepcue" (indices 2 to 8)
    if (i >= 2 && i <= 8) {
      result += chalk.hex(colorHex).bold(char);
    } else {
      result += chalk.hex(colorHex)(char);
    }
  }
  return result;
}

export function getTerminalColumns(): number | undefined {
  if (process.stdout.getWindowSize) {
    try {
      const windowCols = process.stdout.getWindowSize()[0];
      if (windowCols > 0) return windowCols;
    } catch {}
  }
  if (process.stdout.columns && process.stdout.columns > 0) {
    return process.stdout.columns;
  }
  if (process.env.COLUMNS) {
    const envCols = parseInt(process.env.COLUMNS);
    if (envCols > 0) return envCols;
  }
  return undefined;
}

export function isNarrowLayout(config?: RepcueConfig): boolean {
  const cols = getTerminalColumns();
  const activeConfig = config || loadConfig();
  return (
    activeConfig.simple === true ||
    process.env.GREPCUE_NARROW === "true" ||
    process.env.GREPCUE_NARROW === "1" ||
    process.env.NARROW === "true" ||
    process.env.NARROW === "1" ||
    cols === undefined || 
    cols < 95
  );
}

export function getLogo(): string {
  const activeConfig = loadConfig();
  if (
    activeConfig.simple === true ||
    process.env.GREPCUE_NARROW === "true" ||
    process.env.GREPCUE_NARROW === "1" ||
    process.env.NARROW === "true" ||
    process.env.NARROW === "1"
  ) {
    return "";
  }

  const cols = getTerminalColumns();
  // 60 columns is the minimum width for the ASCII art to fit without wrapping.
  if (cols !== undefined && cols < 60) {
    return "";
  }
  
  const logoLines = [
    "",
    chalk.hex("#94A3B8")("   ██████┐ ██████┐ ███████┐██████┐  ██████┐██┐   ██┐███████┐"),
    chalk.hex("#78909C")("  ██┌────┘ ██┌──██┐██┌────┘██┌──██┐██┌────┘██│   ██│██┌────┘"),
    chalk.hex("#60A5FA")("  ██│  ███┐██████┌┘█████┐  ██████┌┘██│     ██│   ██│█████┐  "),
    chalk.hex("#38BDF8")("  ██│   ██│██┌──██┐██┌──┘  ██┌───┘ ██│     ██│   ██│██┌──┘  "),
    chalk.hex("#0EA5E9")("  └██████┌┘██│  ██│███████┐██│     └██████┐└██████┌┘███████┐"),
    chalk.hex("#0284C7")("   └─────┘ └─┘  └─┘└──────┘└─┘      └─────┘ └─────┘ └──────┘"),
    ""
  ].join("\n");

  return logoLines;
}

// ---------------------------------------------------------------------------
// Format repo list (find_repos results)
// ---------------------------------------------------------------------------

/**
 * Formats a list of ranked repos for terminal display.
 */
export function formatRepoList(
  repos: RankedRepo[],
  query: string,
  keywords: string[] = [],
  maxPerGroup: number = 5
): string {
  if (repos.length === 0) {
    return [
      "",
      c.warn("  ⚠  No repositories found for: ") + c.bold(query),
      c.dim("     Try different keywords or broaden your search."),
      "",
    ].join("\n");
  }

  const lines: string[] = [
    "",
    c.bold("  🔍 GRepcue — Search Results") + c.dim(`  (${repos.length} repos)`),
    "",
    c.dim(`  Query: "${query}"`),
    "",
  ];

  const renderItem = (item: RankedRepo, sectionIndex?: number) => {
    const { repo, score, rank } = item;
    const stars = formatNumber(repo.stargazers_count);
    const lang = repo.language || "N/A";
    const license = repo.license?.spdx_id || "No License";

    const displayRank = sectionIndex !== undefined ? sectionIndex : rank;

    const itemLines: string[] = [];
    itemLines.push(`  ${c.brand(`${displayRank}.`)} ${c.bold(repo.full_name)}`);
    itemLines.push(
      `     ${c.star("⭐")} ${c.num(stars)}  ` +
        `${c.info("🔤")} ${lang}  ` +
        `${c.dim("📜")} ${license}  ` +
        `${c.dim("Score:")} ${c.num((score.total * 100).toFixed(0) + "%")}`
    );

    if (repo.description) {
      const desc =
        repo.description.length > 80
          ? repo.description.substring(0, 77) + "..."
          : repo.description;
      itemLines.push(`     ${c.dim(desc)}`);
    }

    itemLines.push(`     ${c.link(repo.html_url)}`);

    if (item.fitExplanation) {
      itemLines.push(`     ${c.success("→")} ${c.success(item.fitExplanation)}`);
    }
    itemLines.push("");
    return itemLines.join("\n");
  };

  // If we have keywords, group the repositories!
  if (keywords.length > 1) {
    const groups = new Map<string, RankedRepo[]>();
    const uncategorized: RankedRepo[] = [];

    // Initialize groups for each keyword in lowercase
    for (const kw of keywords) {
      groups.set(kw.toLowerCase(), []);
    }

    // Distribute repos into groups using matchedKeyword (set by cli.ts parallel search tracking)
    for (const item of repos) {
      const repo = item.repo;
      // Core text: name + description + topics for rich relevance validation
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

      if (placed) continue;
      // Fallback: text-based matching using name + description + topics
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

    // Render grouped items (capped at maxPerGroup per section)
    for (const kw of keywords) {
      const groupRepos = (groups.get(kw.toLowerCase()) || []).slice(0, maxPerGroup);
      if (groupRepos.length > 0) {
        lines.push(c.brand.bold(`  📌 Matches for "${kw}":`));
        lines.push("");
        groupRepos.forEach((item, index) => {
          lines.push(renderItem(item, index + 1));
        });
      }
    }

    // Render uncategorized items (also capped)
    if (uncategorized.length > 0) {
      const cappedUncategorized = uncategorized.slice(0, maxPerGroup);
      lines.push(c.brand.bold("  🔍 General / Related Matches:"));
      lines.push("");
      cappedUncategorized.forEach((item, index) => {
        lines.push(renderItem(item, index + 1));
      });
    }
  } else {
    // Standard flat list if 1 or 0 keywords
    for (const item of repos) {
      lines.push(renderItem(item));
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Format comparison (compare_repos results)
// ---------------------------------------------------------------------------

/**
 * Formats a repo comparison for terminal display.
 */
export function formatComparison(data: RepoComparison): string {
  const { repoA, repoB, comparison } = data;

  const nameA = repoA.full_name;
  const nameB = repoB.full_name;

  // Calculate column widths
  const col1Width = 14;
  const col2Width = Math.max(nameA.length, 20);
  const col3Width = Math.max(nameB.length, 20);

  const lines: string[] = [
    "",
    c.bold("  ⚔️  GRepcue — Repository Comparison"),
    "",
  ];

  // Header row
  const header =
    `  ${c.label(pad("Field", col1Width))} ` +
    `${c.info(pad(nameA, col2Width))} ` +
    `${c.info(pad(nameB, col3Width))}`;
  lines.push(header);
  lines.push(c.dim(`  ${"-".repeat(col1Width + col2Width + col3Width + 4)}`));

  // Data rows
  for (const row of comparison) {
    const valA = String(row.valueA);
    const valB = String(row.valueB);

    let formattedA = pad(valA, col2Width);
    let formattedB = pad(valB, col3Width);

    if (row.winner === "A") {
      formattedA = c.success(pad(valA + " ✓", col2Width));
      formattedB = c.dim(pad(valB, col3Width));
    } else if (row.winner === "B") {
      formattedA = c.dim(pad(valA, col2Width));
      formattedB = c.success(pad(valB + " ✓", col3Width));
    }

    lines.push(
      `  ${c.label(pad(row.field, col1Width))} ${formattedA} ${formattedB}`
    );
  }

  lines.push("");

  // Descriptions
  lines.push(c.dim("  Descriptions:"));
  lines.push(`  ${c.info("A:")} ${repoA.description || "N/A"}`);
  lines.push(`  ${c.info("B:")} ${repoB.description || "N/A"}`);
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Format summary (summarize_repo results)
// ---------------------------------------------------------------------------

/**
 * Formats a repo summary for terminal display.
 */
export function formatSummary(data: RepoSummary): string {
  const { repo, readmeContent, truncated } = data;
  const stars = formatNumber(repo.stargazers_count);

  const lines: string[] = [
    "",
    c.bold("  📖 GRepcue — Repository Summary"),
    "",
    `  ${c.bold(repo.full_name)}`,
    `  ${c.link(repo.html_url)}`,
    "",
    `  ${c.star("⭐")} ${c.num(stars)} stars  ` +
      `${c.info("🔤")} ${repo.language || "N/A"}  ` +
      `${c.dim("📜")} ${repo.license?.spdx_id || "No License"}  ` +
      `${c.dim("🍴")} ${formatNumber(repo.forks_count)} forks`,
    "",
  ];

  if (repo.description) {
    lines.push(`  ${c.dim("Description:")} ${repo.description}`);
    lines.push("");
  }

  if (repo.topics && repo.topics.length > 0) {
    lines.push(
      `  ${c.dim("Topics:")} ${repo.topics.map((t) => c.info(`[${t}]`)).join(" ")}`
    );
    lines.push("");
  }

  lines.push(c.bold("  README:"));
  lines.push("");

  // Show README content (first ~40 lines)
  const readmeLines = readmeContent.split("\n").slice(0, 40);
  for (const line of readmeLines) {
    lines.push(`  ${c.dim("│")} ${line}`);
  }

  if (truncated || readmeLines.length >= 40) {
    lines.push("");
    lines.push(
      c.dim("  ... (README truncated — visit the repo URL for full content)")
    );
  }

  lines.push("");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Format config status
// ---------------------------------------------------------------------------

/**
 * Formats the current Repcue configuration for display.
 */
export function formatConfig(
  config: RepcueConfig,
  hasToken: boolean
): string {
  const lines: string[] = [getLogo()];

  lines.push(
    formatTagline(),
    ""
  );

  lines.push(
    c.brand.bold("  GRepcue -- Configuration"),
    ""
  );

  lines.push(
    `  ${c.label("GitHub Token:")}  ${hasToken ? c.success("[OK] Connected") : c.error("Not set (using unauthenticated API - 10 req/min)")}`,
    `  ${c.label("AI Model:    ")}  ${config.ai ? c.success(`[OK] Connected (${getProviderDisplayName(config.ai)})`) : c.error("Not connected")}`,
    `  ${c.label("Max Results: ")}  ${c.num(String(config.maxResults))}`,
    `  ${c.label("Cache TTL:   ")}  ${c.num(String(config.cacheTTL / 60000))} minutes`,
    `  ${c.label("Simple Layout:")} ${config.simple === true ? c.success("Enabled (ASCII art disabled)") : c.dim("Disabled")}`,
    `  ${c.label("Config Path: ")}  ${c.dim("~/.grepcue/config.json")}`,
    ""
  );

  if (config.ai) {
    lines.push(c.dim("  AI Model Details:"));
    lines.push(`    ${c.label("Provider:")} ${config.ai.provider}`);
    lines.push(`    ${c.label("Base URL:")} ${config.ai.baseUrl}`);
    lines.push(`    ${c.label("Model:   ")} ${config.ai.model}`);
    lines.push(`    ${c.label("API Key: ")} ${config.ai.apiKey ? "****" + config.ai.apiKey.slice(-4) : "N/A"}`);
    lines.push("");
  }



  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Format help (grepcue help — interactive, resize-aware)
// ---------------------------------------------------------------------------

/**
 * Formats the main help screen for terminal display.
 * Mirrors formatConfig: re-checks isNarrowLayout() on every call so the
 * interactive renderer can redraw correctly when the terminal is resized.
 */
export function formatHelp(): string {
  const lines: string[] = [getLogo()];

  lines.push(
    formatTagline(),
    ""
  );

  lines.push(
    c.brand.bold("  GRepcue -- Help"),
    ""
  );

  lines.push(c.bold("  Commands:"));
  lines.push(
    `    ${c.info("find")} <query>              Search for GitHub repositories`,
    `    ${c.info("compare")} <repo_a> <repo_b>  Compare two repos side by side`,
    `    ${c.info("summarize")} <repo>           Summarize a repo and its README`,
    `    ${c.info("connect github")}             Save GitHub token to increase API rate limits`,
    `    ${c.info("connect ai")}                 Connect an AI model for smarter searches`,
    `    ${c.info("disconnect github")}           Remove your saved GitHub token`,
    `    ${c.info("disconnect ai")}               Remove your saved AI configuration`,
    `    ${c.info("history")}                    Show past search query history`,
    `    ${c.info("history clear")}              Clear all search query history`,
    `    ${c.info("bookmark add <repo>")}        Bookmark a GitHub repository`,
    `    ${c.info("bookmark remove <repo>")}     Remove a bookmarked repository`,
    `    ${c.info("bookmarks")}                  List all bookmarked repositories`,
    `    ${c.info("config")} [options]            Show or update GRepcue configuration`,
    `    ${c.info("help")} [command]               Display help for a command`,
  );

  lines.push(
    "",
    c.bold("  Options:"),
    `    ${c.info("-V, --version")}  Show version`,
    `    ${c.info("-h, --help")}     Show help`
  );

  lines.push(
    "",
    c.bold("  Config Options:"),
    `    ${c.info("config -m, --max <number>")}      Set default max results (1-10)`,
    `    ${c.info("config -t, --ttl <minutes>")}     Set cache TTL in minutes (1+)`,
    `    ${c.info("config --tagline <on|off>")}      Toggle tagline-only layout mode (on/off)`,
    ""
  );

  lines.push(
    c.dim("  Examples:"),
    c.dim("    grepcue find scraper"),
    c.dim('    grepcue find "web scraper" --language python --max 3'),
    c.dim("    grepcue compare facebook/react vuejs/core"),
    c.dim("    grepcue summarize vercel/next.js"),
    ""
  );

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Format errors
// ---------------------------------------------------------------------------

export function formatError(error: Error | string): string {
  const message = error instanceof Error ? error.message : error;
  return [
    "",
    c.error("  [ERROR] ") + message,
    "",
  ].join("\n");
}

export function formatSuccess(message: string): string {
  return `\n${c.success("  [SUCCESS]")} ${message}\n`;
}

export function formatWarning(message: string): string {
  return `\n${c.warn("  [WARNING]")} ${message}\n`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "k";
  return String(num);
}

function pad(str: string, width: number): string {
  return str.length >= width ? str : str + " ".repeat(width - str.length);
}

function getProviderDisplayName(ai: AIConfig): string {
  const preset = AI_PROVIDER_PRESETS[ai.provider];
  return `${preset?.name || ai.provider} / ${ai.model}`;
}

/**
 * Formats the bookmarks list for terminal display.
 */
export function formatBookmarks(bookmarks: GitHubRepo[]): string {
  const lines: string[] = [getLogo()];

  lines.push(
    formatTagline(),
    ""
  );

  lines.push(
    c.brand.bold("  GRepcue — Bookmarked Repositories"),
    ""
  );

  if (bookmarks.length === 0) {
    lines.push(
      c.dim("  No bookmarked repositories found."),
      `  ${c.dim("Bookmark any repo with:")} ${c.info("grepcue bookmark add <owner/repo>")}`,
      ""
    );
    return lines.join("\n");
  }

  bookmarks.forEach((repo, index) => {
    const stars = formatNumber(repo.stargazers_count);
    const lang = repo.language || "N/A";
    const license = repo.license?.spdx_id || "No License";

    // Header line: index + name
    lines.push(
      `  ${c.brand(`${index + 1}.`)} ${c.bold(repo.full_name)}`
    );

    // Stats line
    lines.push(
      `     ${c.star("⭐")} ${c.num(stars)}  ` +
        `${c.info("🔤")} ${lang}  ` +
        `${c.dim("📜")} ${license}`
    );

    // Description
    if (repo.description) {
      const desc =
        repo.description.length > 80
          ? repo.description.substring(0, 77) + "..."
          : repo.description;
      lines.push(`     ${c.dim(desc)}`);
    }

    // Link
    lines.push(`     ${c.link(repo.html_url)}`);
    lines.push("");
  });

  return lines.join("\n");
}
