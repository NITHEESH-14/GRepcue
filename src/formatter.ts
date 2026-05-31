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
} from "./types.js";
import { AI_PROVIDER_PRESETS } from "./types.js";
import { loadConfig } from "./config.js";

// ---------------------------------------------------------------------------
// Color palette
// ---------------------------------------------------------------------------

const c = {
  brand: chalk.hex("#A78BFA"),       // Purple — Repcue brand
  star: chalk.hex("#FBBF24"),        // Amber — stars
  success: chalk.hex("#34D399"),     // Emerald — success
  warn: chalk.hex("#FB923C"),        // Orange — warnings
  error: chalk.hex("#F87171"),       // Red — errors
  info: chalk.hex("#60A5FA"),        // Blue — info
  dim: chalk.dim,                    // Dim text
  bold: chalk.bold,
  link: chalk.hex("#818CF8").underline, // Link style
  label: chalk.hex("#94A3B8"),       // Slate — labels
  num: chalk.hex("#F9A8D4"),         // Pink — numbers
};

export function getTerminalColumns(): number | undefined {
  let cols = process.env.COLUMNS ? parseInt(process.env.COLUMNS) : process.stdout.columns;
  if (!cols && process.stdout.getWindowSize) {
    try {
      cols = process.stdout.getWindowSize()[0];
    } catch {}
  }
  return cols && cols > 0 ? cols : undefined;
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
    cols < 75
  );
}

export function getLogo(isNarrow = isNarrowLayout()): string {
  if (isNarrow) {
    return [
      "",
      c.brand("  GRepcue") + c.dim(" — GitHub Repo Recommender"),
      ""
    ].join("\n");
  }
  
  const logoLines = [
    "",
    c.brand("   ██████╗ ██████╗ ███████╗██████╗  ██████╗██╗   ██╗███████╗"),
    c.brand("  ██╔════╝ ██╔══██╗██╔════╝██╔══██╗██╔════╝██║   ██║██╔════╝"),
    c.brand("  ██║  ███╗██████╔╝█████╗  ██████╔╝██║     ██║   ██║█████╗  "),
    c.brand("  ██║   ██║██╔══██╗██╔══╝  ██╔═══╝ ██║     ██║   ██║██╔══╝  "),
    c.brand("  ╚██████╔╝██║  ██║███████╗██║     ╚██████╗╚██████╔╝███████╗"),
    c.brand("   ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝      ╚═════╝ ╚═════╝ ╚══════╝"),
    ""
  ].join("\n");

  // \x1b[?7l disables auto-wrap; \x1b[?7h re-enables it.
  // This keeps the ASCII logo pristine if the terminal is resized after printing.
  return `\x1b[?7l${logoLines}\x1b[?7h`;
}

// ---------------------------------------------------------------------------
// Format repo list (find_repos results)
// ---------------------------------------------------------------------------

/**
 * Formats a list of ranked repos for terminal display.
 */
export function formatRepoList(
  repos: RankedRepo[],
  query: string
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
    c.brand("  ──────────────────────────────────────────────────────────"),
    c.bold("  🔍 GRepcue — Search Results") + c.dim(`  (${repos.length} repos)`),
    c.brand("  ──────────────────────────────────────────────────────────"),
    "",
    c.dim(`  Query: "${query}"`),
    "",
  ];

  for (const item of repos) {
    const { repo, score, rank } = item;
    const stars = formatNumber(repo.stargazers_count);
    const lang = repo.language || "N/A";
    const license = repo.license?.spdx_id || "No License";

    // Header line: rank + name
    lines.push(
      `  ${c.brand(`${rank}.`)} ${c.bold(repo.full_name)}`
    );

    // Stats line
    lines.push(
      `     ${c.star("⭐")} ${c.num(stars)}  ` +
        `${c.info("🔤")} ${lang}  ` +
        `${c.dim("📜")} ${license}  ` +
        `${c.dim("Score:")} ${c.num((score.total * 100).toFixed(0) + "%")}`
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

    // Fit explanation (if AI-generated)
    if (item.fitExplanation) {
      lines.push(`     ${c.success("→")} ${c.success(item.fitExplanation)}`);
    }

    lines.push("");
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
    c.brand("  ──────────────────────────────────────────────────────────"),
    c.bold("  ⚔️  GRepcue — Repository Comparison"),
    c.brand("  ──────────────────────────────────────────────────────────"),
    "",
  ];

  // Header row
  const header =
    `  ${c.label(pad("Field", col1Width))} ` +
    `${c.info(pad(nameA, col2Width))} ` +
    `${c.info(pad(nameB, col3Width))}`;
  lines.push(header);
  lines.push(c.dim(`  ${"─".repeat(col1Width + col2Width + col3Width + 4)}`));

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
    c.brand("  ──────────────────────────────────────────────────────────"),
    c.bold("  📖 GRepcue — Repository Summary"),
    c.brand("  ──────────────────────────────────────────────────────────"),
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

  lines.push(c.dim("  ─── README ───────────────────────────────────────────"));
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
  const isNarrow = isNarrowLayout(config);
  const lines: string[] = [getLogo(isNarrow)];

  if (!isNarrow) {
    lines.push(
      c.brand("  ──────────────────────────────────────────────────────────"),
      c.bold("  GRepcue — Configuration"),
      c.brand("  ──────────────────────────────────────────────────────────"),
      ""
    );
  }

  lines.push(
    `  ${c.label("GitHub Token:")}  ${hasToken ? c.success("✓ Connected") : c.error("Not set (using unauthenticated API — 10 req/min)")}`,
    `  ${c.label("AI Model:    ")}  ${config.ai ? c.success(`✓ Connected (${getProviderDisplayName(config.ai)})`) : c.error("Not connected")}`,
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

  // Display available config options at the bottom of the config screen
  lines.push(
    `  ${c.brand("💡 To update configuration, run:")}`,
    `    ${c.info("grepcue config -m <1-10>")}      ${c.dim("Set default max results")}`,
    `    ${c.info("grepcue config -t <minutes>")}   ${c.dim("Set cache TTL in minutes")}`,
    `    ${c.info("grepcue config --simple")}       ${c.dim("Force minimalist tagline layout")}`,
    `    ${c.info("grepcue config --no-simple")}    ${c.dim("Display full layout with ASCII art logo")}`,
    ""
  );

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
  const isNarrow = isNarrowLayout();
  const lines: string[] = [getLogo(isNarrow)];

  if (!isNarrow) {
    lines.push(
      c.brand("  ──────────────────────────────────────────────────────────"),
      c.bold("  GRepcue — Help"),
      c.brand("  ──────────────────────────────────────────────────────────"),
      ""
    );
  }

  lines.push(
    `  ${c.brand.bold("GRepcue")}${c.dim(" — Find, compare & summarize GitHub repos")}`,
    c.dim("  from your terminal. Also an MCP server for AI editors."),
    ""
  );

  lines.push(c.bold("  Commands:"));

  if (isNarrow) {
    lines.push(
      `    ${c.info("find")} <query>         Search repos`,
      `    ${c.info("compare")} <a> <b>      Compare repos`,
      `    ${c.info("summarize")} <repo>    Summarize repo`,
      `    ${c.info("connect-github")}      Save GitHub token`,
      `    ${c.info("connect-ai")}          Connect AI model`,
      `    ${c.info("disconnect")}          Remove configs`,
      `    ${c.info("config")} [options]     Show/update config`,
      `    ${c.info("help")} [command]       Show help`,
    );
  } else {
    lines.push(
      `    ${c.info("find")} <query>              Search for GitHub repositories`,
      `    ${c.info("compare")} <repo_a> <repo_b>  Compare two repos side by side`,
      `    ${c.info("summarize")} <repo>           Summarize a repo and its README`,
      `    ${c.info("connect-github")}              Save your GitHub Personal Access Token`,
      `    ${c.info("connect-ai")}                  Connect an AI model for smarter searches`,
      `    ${c.info("disconnect")}                  Remove saved token and/or AI config`,
      `    ${c.info("config")} [options]            Show or update GRepcue configuration`,
      `    ${c.info("help")} [command]               Display help for a command`,
    );
  }

  lines.push(
    "",
    c.bold("  Options:"),
    `    ${c.info("-V, --version")}  Show version`,
    `    ${c.info("-h, --help")}     Show help`
  );

  if (isNarrow) {
    lines.push(
      "",
      c.bold("  Config Options:"),
      `    ${c.info("config -m <number>")}    Set max results (1-10)`,
      `    ${c.info("config -t <minutes>")}   Set cache TTL in min`,
      `    ${c.info("config --simple")}       Force tagline layout`,
      `    ${c.info("config --no-simple")}    Display full layout`,
      ""
    );
  } else {
    lines.push(
      "",
      c.bold("  Config Options:"),
      `    ${c.info("config -m, --max <number>")}    Set default max results (1-10)`,
      `    ${c.info("config -t, --ttl <minutes>")}   Set cache TTL in minutes (1+)`,
      `    ${c.info("config --simple")}              Force tagline layout (hide ASCII logo)`,
      `    ${c.info("config --no-simple")}           Display full layout with ASCII logo`,
      ""
    );
  }

  if (isNarrow) {
    lines.push(
      c.dim("  Examples:"),
      c.dim("    grepcue find scraper"),
      c.dim("    grepcue summarize vercel/next.js"),
      ""
    );
  } else {
    lines.push(
      c.dim("  Examples:"),
      c.dim("    grepcue find scraper"),
      c.dim('    grepcue find "web scraper" --language python --max 3'),
      c.dim("    grepcue compare facebook/react vuejs/core"),
      c.dim("    grepcue summarize vercel/next.js"),
      ""
    );
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Format errors
// ---------------------------------------------------------------------------

/**
 * Formats an error message for terminal display.
 */
export function formatError(error: Error | string): string {
  const message = error instanceof Error ? error.message : error;
  return [
    "",
    c.error("  ✗ Error: ") + message,
    "",
  ].join("\n");
}

/**
 * Formats a success message.
 */
export function formatSuccess(message: string): string {
  return c.success(`\n  ✓ ${message}\n`);
}

/**
 * Formats a warning message.
 */
export function formatWarning(message: string): string {
  return c.warn(`\n  ⚠ ${message}\n`);
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
