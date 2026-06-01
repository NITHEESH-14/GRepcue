// Force Unicode support on Windows so modern dot spinners and custom prompt prefixes render correctly
if (process.platform === "win32") {
  process.env.WT_SESSION = process.env.WT_SESSION || "1";
  process.env.TERM_PROGRAM = process.env.TERM_PROGRAM || "vscode";
}

// ============================================================================
// GRepcue — CLI Entry Point
// Commands: find, compare, summarize, connect-github, connect-ai, disconnect, config
// ============================================================================

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import readline from "node:readline";
import { select, input, password } from "@inquirer/prompts";
import { searchRepositories, compareRepos, summarizeRepo, hasGitHubToken, getRepoDetails } from "./github.js";
import { extractKeywords, buildSearchQuery } from "./intent.js";
import { extractKeywordsWithAI, generateFitExplanation, isAIConfigured, testAIConnection } from "./ai.js";
import { rankRepos } from "./ranker.js";
import {
  loadConfig,
  saveConfig,
  saveGitHubToken,
  removeGitHubToken,
  saveAIConfig,
  removeAIConfig,
  getConfigPath,
} from "./config.js";
import {
  formatRepoList,
  formatComparison,
  formatSummary,
  formatConfig,
  formatHelp,
  formatError,
  formatSuccess,
  formatWarning,
  getLogo,
  isNarrowLayout,
  getTerminalColumns,
  formatTagline,
  formatBookmarks,
} from "./formatter.js";
import { AI_PROVIDER_PRESETS } from "./types.js";
import type { AIProvider, AIConfig, RankedRepo, GitHubRepo } from "./types.js";

// ---------------------------------------------------------------------------
// CLI Setup
// ---------------------------------------------------------------------------

const program = new Command();

program.configureHelp({
  get helpWidth() {
    const cols = getTerminalColumns();
    return cols ? Math.min(cols, 80) : 80;
  }
});

// Disable Commander's built-in help command — we add our own below
program.helpCommand(false);

// Override the -h/--help flag to use our custom help renderer
program.helpOption(false);
program.option('-h, --help', 'display help for command');
program.on('option:help', () => {
  console.log(formatHelp());
  process.exit(0);
});

program
  .name("grepcue")
  .version("1.0.0")
  .description(
    chalk.hex("#A78BFA").bold("GRepcue") +
      chalk.dim(" — Smart assistant to get GitHub repositories")
  );

// ---------------------------------------------------------------------------
// Command: find
// ---------------------------------------------------------------------------

const GENERIC_SEARCH_TERMS = new Set([
  "web",
  "model",
  "photo",
  "logics",
  "logic",
  "page",
  "project",
  "app",
  "tool",
  "software",
  "design",
  "component",
  "components",
  "template",
  "templates",
  "system",
  "solution",
  "interface"
]);

program
  .command("find")
  .argument("<query>", "Project idea or keyword to search for")
  .option("-l, --language <lang>", "Filter by programming language")
  .option("-m, --max <number>", "Maximum results (1-10)")
  .option("--no-cache", "Skip cached results")
  .option("--json", "Output raw JSON")
  .description("Search for relevant GitHub repositories")
  .action(async (query: string, opts: { language?: string; max?: string; cache: boolean; json: boolean }) => {
    const config = loadConfig();
    let finalQuery = query;
    const historyIndex = parseInt(query, 10);
    if (!isNaN(historyIndex) && historyIndex > 0) {
      if (config.history && config.history[historyIndex - 1]) {
        finalQuery = config.history[historyIndex - 1];
        console.log(chalk.hex("#60A5FA")(`  🔎 Re-running search from history #${historyIndex}: "${finalQuery}"`));
      }
    }

    const defaultMax = config.maxResults || 10;
    const maxResults = Math.min(Math.max(parseInt(opts.max || "") || defaultMax, 1), 10);
    const spinner = ora({ text: "Searching GitHub...", spinner: DOTS_SPINNER, color: "magenta" }).start();

    try {
      // Step 1: Extract keywords (AI-powered if connected, else local)
      let intent;
      if (isAIConfigured()) {
        spinner.text = "Analyzing with AI...";
        const aiResult = await extractKeywordsWithAI(finalQuery);
        intent = aiResult || extractKeywords(finalQuery);
      } else {
        intent = extractKeywords(finalQuery);
      }

      // Step 2: Fetch repositories (using parallel diverse searches if multiple keywords exist)
      let ranked: RankedRepo[] = [];
      let searchTerms: string[] = [];
      
      if (intent.keywords.length > 1) {
        // Search for specific technical concepts separately, up to 4 parallel searches, filtering out generic keywords
        const filteredTerms = intent.keywords.filter(term => !GENERIC_SEARCH_TERMS.has(term.toLowerCase()));
        searchTerms = filteredTerms.length > 0 ? filteredTerms.slice(0, 4) : intent.keywords.slice(0, 2);
        spinner.text = "Searching GitHub...";
        
        const queryPromises = searchTerms.map(term => {
          // Replace hyphens with spaces for better GitHub search results and restrict to name & description
          // (e.g. "plant-disease-detection" → "plant disease detection in:name,description")
          let q = `${term.replace(/-/g, " ")} in:name,description`;
          const lang = opts.language || intent.language;
          if (lang) {
            q += ` language:${lang}`;
          }
          // Fetch up to maxResults * 2 for each to allow rich ranking options
          return searchRepositories(q, maxResults * 2, "stars", !opts.cache).catch(() => []);
        });
        
        const resultsArray = await Promise.all(queryPromises);

        // Score and rank repositories per-concept to avoid popularity bias across disjoint concepts
        const rankedPerConcept: RankedRepo[][] = [];
        for (let i = 0; i < searchTerms.length; i++) {
          const term = searchTerms[i];
          const results = resultsArray[i];
          const conceptRanked = rankRepos(results, [term], maxResults);
          
          for (const item of conceptRanked) {
            item.matchedKeyword = term;
          }
          rankedPerConcept.push(conceptRanked);
        }

        // Interleave the ranked results to construct the final array for flat list outputs (like --json)
        const seen = new Set<string>();
        let index = 0;
        let hasMore = true;
        while (hasMore) {
          hasMore = false;
          for (const conceptRanked of rankedPerConcept) {
            if (index < conceptRanked.length) {
              const item = conceptRanked[index];
              if (!seen.has(item.repo.full_name.toLowerCase())) {
                seen.add(item.repo.full_name.toLowerCase());
                ranked.push(item);
              }
              hasMore = true;
            }
          }
          index++;
        }
      } else {
        searchTerms = intent.keywords.slice(0, 1);
        const searchQuery = buildSearchQuery(intent, opts.language) + " in:name,description";
        spinner.text = "Searching GitHub...";
        const repos = await searchRepositories(
          searchQuery,
          maxResults * 3,
          "stars",
          !opts.cache
        );
        ranked = rankRepos(repos, intent.keywords, maxResults);
      }

      // Step 4: Generate fit explanations (if AI connected)
      if (isAIConfigured() && ranked.length > 0) {
        spinner.text = "Generating explanations...";
        const explanations = await Promise.allSettled(
          ranked.map((item) =>
            generateFitExplanation(
              finalQuery,
              item.repo.full_name,
              item.repo.description || ""
            )
          )
        );
        explanations.forEach((result, i) => {
          if (result.status === "fulfilled" && result.value) {
            ranked[i].fitExplanation = result.value;
          }
        });
      }

      spinner.stop();
      if (process.stdout.isTTY) {
        readline.clearLine(process.stdout, 0);
        readline.cursorTo(process.stdout, 0);
      }

      // Save search query to history if it returned results
      if (ranked.length > 0) {
        const config = loadConfig();
        if (!config.history) {
          config.history = [];
        }
        config.history = config.history.filter((h) => h !== finalQuery);
        config.history.push(finalQuery);
        if (config.history.length > 10) {
          config.history.shift();
        }
        saveConfig(config);
      }

      // Step 5: Output results
      if (opts.json) {
        console.log(JSON.stringify(ranked, null, 2));
      } else {
        if (!hasGitHubToken()) {
          console.log(
            formatWarning(
              'No GitHub token set. Rate limited to 10 req/min. Run "grepcue connect github" for better limits.'
            )
          );
        }
        console.log(formatRepoList(ranked, finalQuery, searchTerms, maxResults));
        if (!isAIConfigured()) {
          console.log(
            chalk.dim(
              '  💡 Tip: Run "grepcue connect ai" to enable AI-powered search with smarter results.\n'
            )
          );
        }
      }
    } catch (error) {
      spinner.stop();
      if (process.stdout.isTTY) {
        readline.clearLine(process.stdout, 0);
        readline.cursorTo(process.stdout, 0);
      }
      console.error(formatError(error instanceof Error ? error : new Error(String(error))));
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// Command: compare
// ---------------------------------------------------------------------------

program
  .command("compare")
  .argument("<repo_a>", 'First repo — "owner/repo" or GitHub URL')
  .argument("<repo_b>", 'Second repo — "owner/repo" or GitHub URL')
  .option("--json", "Output raw JSON")
  .description("Compare two GitHub repositories side by side")
  .action(async (repoA: string, repoB: string, opts: { json: boolean }) => {
    const spinner = ora({ text: "Fetching repository data...", spinner: DOTS_SPINNER, color: "magenta" }).start();

    try {
      const comparison = await compareRepos(repoA, repoB);
      spinner.stop();
      if (process.stdout.isTTY) {
        readline.clearLine(process.stdout, 0);
        readline.cursorTo(process.stdout, 0);
      }

      if (opts.json) {
        console.log(JSON.stringify(comparison, null, 2));
      } else {
        console.log(formatComparison(comparison));
      }
    } catch (error) {
      spinner.stop();
      if (process.stdout.isTTY) {
        readline.clearLine(process.stdout, 0);
        readline.cursorTo(process.stdout, 0);
      }
      console.error(formatError(error instanceof Error ? error : new Error(String(error))));
      process.exit(1);
    }
  });

// ---------------------------------------------------------------------------
// Command: summarize
// ---------------------------------------------------------------------------

program
  .command("summarize")
  .argument("<repo>", 'Repository — "owner/repo" or GitHub URL')
  .option("--json", "Output raw JSON")
  .description("Get a summary of a GitHub repository and its README")
  .action(async (repo: string, opts: { json: boolean }) => {
    const spinner = ora({ text: "Fetching repository summary...", spinner: DOTS_SPINNER, color: "magenta" }).start();

    try {
      const summary = await summarizeRepo(repo);
      spinner.stop();
      if (process.stdout.isTTY) {
        readline.clearLine(process.stdout, 0);
        readline.cursorTo(process.stdout, 0);
      }

      if (opts.json) {
        console.log(JSON.stringify(summary, null, 2));
      } else {
        console.log(formatSummary(summary));
      }
    } catch (error) {
      spinner.stop();
      if (process.stdout.isTTY) {
        readline.clearLine(process.stdout, 0);
        readline.cursorTo(process.stdout, 0);
      }
      console.error(formatError(error instanceof Error ? error : new Error(String(error))));
      process.exit(1);
    }
  });

const PROMPT_THEME = {
  prefix: {
    idle: chalk.hex("#60A5FA").bold("  [?]"),
    done: chalk.hex("#34D399").bold("  [OK]"),
  }
};

const DOTS_SPINNER = {
  interval: 80,
  frames: ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"].map(f => chalk.hex("#38BDF8")(f))
};

// ---------------------------------------------------------------------------
// Command: connect helpers & actions
// ---------------------------------------------------------------------------

async function handleConnectGitHub() {
  console.log("");
  console.log(
    chalk.hex("#A78BFA").bold("  🔑 Connect GitHub Token")
  );
  console.log(
    chalk.dim("  Get a token at: https://github.com/settings/tokens")
  );
  console.log(
    chalk.dim("  No special permissions needed — just create a classic token.\n")
  );

  try {
    const token = await password({
      message: "Enter your GitHub Personal Access Token:",
      mask: "*",
      validate: (value) => {
        if (!value || value.trim().length === 0) return "Token cannot be empty.";
        if (!value.startsWith("ghp_") && !value.startsWith("github_pat_")) {
          return 'Token should start with "ghp_" or "github_pat_"';
        }
        return true;
      },
      theme: PROMPT_THEME,
    });

    saveGitHubToken(token.trim());
    console.log(formatSuccess("GitHub token saved to ~/.grepcue/config.json"));
    console.log(
      chalk.dim("  You now have 30 requests/min (up from 10). 🚀\n")
    );
  } catch {
    console.log(chalk.dim("\n  Cancelled.\n"));
  }
}

const PROVIDER_MODEL_CHOICES: Record<Exclude<AIProvider, "custom">, { name: string; value: string }[]> = {
  openai: [
    { name: "GPT-4o (Recommended)", value: "gpt-4o" },
    { name: "GPT-4o Mini (Fast & Cost-effective)", value: "gpt-4o-mini" },
    { name: "o1 Mini (Advanced reasoning)", value: "o1-mini" },
    { name: "o3 Mini (Fast reasoning)", value: "o3-mini" },
  ],
  gemini: [
    { name: "Gemini 2.5 Flash (Latest, Recommended)", value: "gemini-2.5-flash" },
    { name: "Gemini 2.5 Pro (Latest high-intelligence)", value: "gemini-2.5-pro" },
    { name: "Gemini 2.0 Flash (Fast & reliable)", value: "gemini-2.0-flash" },
    { name: "Gemini 2.0 Pro Experimental", value: "gemini-2.0-pro-exp" },
    { name: "Gemini 1.5 Flash (Legacy fast)", value: "gemini-1.5-flash" },
    { name: "Gemini 1.5 Pro (Legacy high-intelligence)", value: "gemini-1.5-pro" },
  ],
  anthropic: [
    { name: "Claude 3.7 Sonnet (Advanced & Reasoning)", value: "claude-3-7-sonnet-latest" },
    { name: "Claude 3.5 Sonnet (Highly Recommended)", value: "claude-3-5-sonnet-latest" },
    { name: "Claude 3.5 Haiku (Fast & cost-effective)", value: "claude-3-5-haiku-latest" },
    { name: "Claude 3 Opus (Deep reasoning legacy)", value: "claude-3-opus-latest" },
  ],
  ollama: [
    { name: "Llama 3.2 (Recommended local)", value: "llama3.2" },
    { name: "Llama 3.3 (High-intelligence local)", value: "llama3.3" },
    { name: "Mistral 7B", value: "mistral" },
    { name: "Phi-3", value: "phi3" },
  ],
};

async function handleConnectAI() {
  console.log("");
  console.log(
    chalk.hex("#A78BFA").bold("  🔌 Connect an AI Model")
  );
  console.log(
    chalk.dim("  This enables AI-powered keyword extraction and \"why this fits\" explanations.\n")
  );

  try {
    // Step 1: Select provider
    const provider = await select<AIProvider>({
      message: "Select AI provider:",
      choices: [
        { value: "openai" as const, name: "OpenAI (GPT-4o, GPT-4o-mini, etc.)" },
        { value: "gemini" as const, name: "Google Gemini (Gemini 2.0 Flash, etc.)" },
        { value: "anthropic" as const, name: "Anthropic (Claude Sonnet, etc.)" },
        { value: "ollama" as const, name: "Ollama (Local models — Llama, Mistral, etc.)" },
        { value: "custom" as const, name: "Custom (Any OpenAI-compatible endpoint)" },
      ],
      theme: PROMPT_THEME,
    });

    const preset = AI_PROVIDER_PRESETS[provider];
    let baseUrl = preset.baseUrl;
    let model = preset.defaultModel;
    let apiKey: string | undefined;

    // Step 2: API Key (if required)
    if (preset.requiresKey) {
      apiKey = await password({
        message: `Enter your ${preset.name} API key:`,
        mask: "*",
        validate: (value) => {
          if (!value || value.trim().length === 0) return "API key cannot be empty.";
          return true;
        },
        theme: PROMPT_THEME,
      });
      apiKey = apiKey.trim();
    }

    // Step 3: Base URL (for custom provider)
    if (provider === "custom") {
      baseUrl = await input({
        message: "Enter the API base URL (OpenAI-compatible):",
        validate: (value) => {
          if (!value.startsWith("http")) return "URL must start with http:// or https://";
          return true;
        },
        theme: PROMPT_THEME,
      });
      baseUrl = baseUrl.trim();
    }

    // Step 4: Model name
    if (provider !== "custom") {
      const modelChoices = [
        ...PROVIDER_MODEL_CHOICES[provider],
        { name: "Enter a custom model name...", value: "custom" }
      ];

      const modelChoice = await select({
        message: "Select AI model:",
        choices: modelChoices,
        theme: PROMPT_THEME,
      });

      if (modelChoice === "custom") {
        model = await input({
          message: "Enter custom model name:",
          default: preset.defaultModel,
          theme: PROMPT_THEME,
        });
      } else {
        model = modelChoice;
      }
    } else {
      model = await input({
        message: "Enter model name:",
        theme: PROMPT_THEME,
      });
    }
    model = model.trim();

    // Step 5: Test connection
    const aiConfig: AIConfig = {
      provider,
      apiKey,
      baseUrl,
      model,
    };

    const testSpinner = ora({ text: "Testing connection...", spinner: DOTS_SPINNER, color: "magenta" }).start();
    const result = await testAIConnection(aiConfig);

    if (result.success) {
      testSpinner.stop();
      console.log(formatSuccess("Connection successful!"));
      saveAIConfig(aiConfig);
      console.log(formatSuccess(`Connected to ${preset.name} (${model}). Config saved to ~/.grepcue/config.json`));
    } else {
      testSpinner.stop();
      console.log(formatError("Connection failed."));
      console.log(
        formatError(
          `Could not connect to the AI model.\n  Error details: ${result.error || "Check your API key, URL, and model name."}`
        )
      );

      const saveAnyway = await select({
        message: "Save the configuration anyway?",
        choices: [
          { value: true, name: "Yes — save it (I'll fix the connection later)" },
          { value: false, name: "No — discard" },
        ],
        theme: PROMPT_THEME,
      });

      if (saveAnyway) {
        saveAIConfig(aiConfig);
        console.log(formatSuccess("Config saved (but connection is not verified)."));
      } else {
        console.log(chalk.dim("\n  Discarded.\n"));
      }
    }
  } catch {
    console.log(chalk.dim("\n  Cancelled.\n"));
  }
}

// Legacy hyphenated commands for backwards compatibility
program
  .command("connect-github")
  .description("Save your GitHub Personal Access Token for higher API rate limits")
  .action(handleConnectGitHub);

program
  .command("connect-ai")
  .description("Connect an AI model for smarter searches (OpenAI, Gemini, Ollama, etc.)")
  .action(handleConnectAI);

// Main connect subcommand structure
const connectCmd = program
  .command("connect")
  .description("Connect a GitHub token or AI model configuration");

connectCmd
  .command("github")
  .description("Save your GitHub Personal Access Token for higher API rate limits")
  .action(handleConnectGitHub);

connectCmd
  .command("ai")
  .description("Connect an AI model for smarter searches (OpenAI, Gemini, Ollama, etc.)")
  .action(handleConnectAI);

// ---------------------------------------------------------------------------
// Command: disconnect
// ---------------------------------------------------------------------------

program
  .command("disconnect-github")
  .description("Remove your saved GitHub Personal Access Token")
  .action(() => {
    removeGitHubToken();
    console.log(formatSuccess("GitHub token removed successfully."));
  });

program
  .command("disconnect-ai")
  .description("Remove your saved AI model configuration")
  .action(() => {
    removeAIConfig();
    console.log(formatSuccess("AI model configuration removed successfully."));
  });

const disconnectCmd = program
  .command("disconnect")
  .description("Remove saved GitHub token or AI model configuration");

disconnectCmd
  .command("github")
  .description("Remove your saved GitHub Personal Access Token")
  .action(() => {
    removeGitHubToken();
    console.log(formatSuccess("GitHub token removed successfully."));
  });

disconnectCmd
  .command("ai")
  .description("Remove your saved AI model configuration")
  .action(() => {
    removeAIConfig();
    console.log(formatSuccess("AI model configuration removed successfully."));
  });

// ---------------------------------------------------------------------------
// Command: config
// ---------------------------------------------------------------------------

program
  .command("config")
  .option("-m, --max <number>", "Set default maximum results for search (1-10)")
  .option("-t, --ttl <minutes>", "Set cache TTL in minutes (1+)")
  .option("--tagline <on|off>", "Set tagline-only layout mode (on/off)")
  .description("Show or update GRepcue configuration")
  .action((opts: { max?: string; ttl?: string; tagline?: string }) => {
    const config = loadConfig();
    let updated = false;

    if (opts.max !== undefined) {
      const newMax = parseInt(opts.max);
      if (isNaN(newMax) || newMax < 1 || newMax > 10) {
        console.log(formatError("Max results must be a number between 1 and 10."));
        process.exit(1);
      }
      config.maxResults = newMax;
      updated = true;
    }

    if (opts.ttl !== undefined) {
      const newTtl = parseInt(opts.ttl);
      if (isNaN(newTtl) || newTtl < 1) {
        console.log(formatError("Cache TTL must be a positive number of minutes."));
        process.exit(1);
      }
      config.cacheTTL = newTtl * 60000;
      updated = true;
    }

    if (opts.tagline !== undefined) {
      const val = opts.tagline.toLowerCase();
      if (val !== "on" && val !== "off") {
        console.log(formatError("Tagline mode must be 'on' or 'off'."));
        process.exit(1);
      }
      config.simple = (val === "on");
      updated = true;
    }

    if (updated) {
      saveConfig(config);
      console.log(formatSuccess("Configuration updated successfully!"));
    }

    console.log(formatConfig(config, hasGitHubToken()));
    console.log(chalk.dim(`  Config file: ${getConfigPath()}\n`));
  });

// ---------------------------------------------------------------------------
// Command: history
// ---------------------------------------------------------------------------

const historyCmd = program
  .command("history")
  .description("Show search query history");

historyCmd
  .command("clear")
  .description("Clear search history")
  .action(() => {
    const config = loadConfig();
    config.history = [];
    saveConfig(config);
    console.log(formatSuccess("Search history cleared successfully."));
  });

historyCmd.action(() => {
  const config = loadConfig();
  const history = config.history || [];
  
  const logo = getLogo();
  if (logo) {
    console.log(logo);
  }
  console.log(formatTagline());
  console.log("");

  console.log(chalk.hex("#60A5FA").bold("  GRepcue — Search History"));
  console.log("");
  if (history.length === 0) {
    console.log(chalk.dim("  No search history found. Run \"grepcue find <query>\" first."));
    console.log("");
    return;
  }
  history.forEach((query, index) => {
    console.log(`    ${chalk.hex("#60A5FA")(String(index + 1) + ".")} "${query}"`);
  });
  console.log("");
  console.log(chalk.dim("  💡 Tip: Re-run any past search with: grepcue find <number>"));
  console.log("");
});

// ---------------------------------------------------------------------------
// Command: bookmark & bookmarks
// ---------------------------------------------------------------------------

const bookmarkCmd = program
  .command("bookmark")
  .description("Manage your bookmarked GitHub repositories");

bookmarkCmd
  .command("add <repo>")
  .description("Bookmark a GitHub repository (Format: owner/repo)")
  .action(async (repoInput: string) => {
    const spinner = ora({ text: "Fetching repository details from GitHub...", spinner: DOTS_SPINNER, color: "magenta" }).start();
    try {
      const repo = await getRepoDetails(repoInput);
      spinner.stop();
      if (process.stdout.isTTY) {
        readline.clearLine(process.stdout, 0);
        readline.cursorTo(process.stdout, 0);
      }

      const config = loadConfig();
      if (!config.bookmarks) {
        config.bookmarks = [];
      }

      const alreadyBookmarked = config.bookmarks.some((b) => b.full_name.toLowerCase() === repo.full_name.toLowerCase());
      if (alreadyBookmarked) {
        console.log(formatWarning(`"${repo.full_name}" is already bookmarked.`));
        return;
      }

      config.bookmarks.push(repo);
      saveConfig(config);
      console.log(formatSuccess(`Successfully bookmarked "${repo.full_name}"!`));
    } catch (error) {
      spinner.stop();
      if (process.stdout.isTTY) {
        readline.clearLine(process.stdout, 0);
        readline.cursorTo(process.stdout, 0);
      }
      console.error(formatError(error instanceof Error ? error : new Error(String(error))));
    }
  });

bookmarkCmd
  .command("remove <repo>")
  .description("Remove a bookmarked repository")
  .action((repoInput: string) => {
    const config = loadConfig();
    const bookmarks = config.bookmarks || [];
    
    // Normalize input to locate the bookmark cleanly (can accept owner/repo or just the repo name)
    const normalizedInput = repoInput.trim().toLowerCase();
    const initialLength = bookmarks.length;
    
    config.bookmarks = bookmarks.filter((b) => {
      const fullName = b.full_name.toLowerCase();
      return fullName !== normalizedInput && !fullName.endsWith("/" + normalizedInput);
    });

    if (config.bookmarks.length === initialLength) {
      console.log(formatWarning(`"${repoInput}" was not found in your bookmarks.`));
      return;
    }

    saveConfig(config);
    console.log(formatSuccess(`Successfully removed "${repoInput}" from bookmarks.`));
  });

bookmarkCmd
  .command("list")
  .description("List all bookmarked repositories")
  .action(() => {
    const config = loadConfig();
    const bookmarks = config.bookmarks || [];
    console.log(formatBookmarks(bookmarks));
  });

bookmarkCmd
  .command("clear")
  .description("Clear all bookmarked repositories")
  .action(() => {
    const config = loadConfig();
    config.bookmarks = [];
    saveConfig(config);
    console.log(formatSuccess("All bookmarked repositories cleared successfully."));
  });

// Setup default behavior for "grepcue bookmark" without subcommands to list bookmarks
bookmarkCmd.action(() => {
  const config = loadConfig();
  const bookmarks = config.bookmarks || [];
  console.log(formatBookmarks(bookmarks));
});

// Standalone "grepcue bookmarks" command
program
  .command("bookmarks")
  .description("List all bookmarked repositories")
  .action(() => {
    const config = loadConfig();
    const bookmarks = config.bookmarks || [];
    console.log(formatBookmarks(bookmarks));
  });

// ---------------------------------------------------------------------------
// Command: help
// ---------------------------------------------------------------------------

program
  .command("help")
  .argument("[command]", "Command to show help for")
  .description("display help for command")
  .action((cmd?: string) => {
    if (cmd) {
      // Show help for a specific sub-command using Commander's built-in
      const subCmd = program.commands.find((c) => c.name() === cmd);
      if (subCmd) {
        subCmd.outputHelp();
      } else {
        console.log(formatError(`Unknown command: ${cmd}`));
      }
      return;
    }

    console.log(formatHelp());
  });

// ---------------------------------------------------------------------------
// Banner & Parse
// ---------------------------------------------------------------------------

// Show banner when no arguments provided
if (process.argv.length <= 2) {
  const isNarrow = isNarrowLayout();
  if (isNarrow) {
    console.log("");
    console.log(formatTagline() + "\n");
    console.log(chalk.bold("  Commands:"));
    console.log(`    ${chalk.hex("#60A5FA")("find")} <query>         Search repos`);
    console.log(`    ${chalk.hex("#60A5FA")("compare")} <a> <b>      Compare repos`);
    console.log(`    ${chalk.hex("#60A5FA")("summarize")} <repo>    Summarize repo`);
    console.log(`    ${chalk.hex("#60A5FA")("connect github")}      Save GitHub token (raise rate limits)`);
    console.log(`    ${chalk.hex("#60A5FA")("connect ai")}          Connect AI model`);
    console.log(`    ${chalk.hex("#60A5FA")("disconnect github")}   Remove saved GitHub token`);
    console.log(`    ${chalk.hex("#60A5FA")("disconnect ai")}       Remove saved AI config`);
    console.log(`    ${chalk.hex("#60A5FA")("history")}             Show past search history`);
    console.log(`    ${chalk.hex("#60A5FA")("bookmarks")}           Show bookmarked repositories`);
    console.log(`    ${chalk.hex("#60A5FA")("config")} [options]     Show/update config`);
    console.log(`    ${chalk.hex("#60A5FA")("help")}                Show help\n`);
    console.log(chalk.bold("  Examples:"));
    console.log(chalk.dim("    grepcue find scraper"));
    console.log(chalk.dim("    grepcue summarize vercel/next.js\n"));
  } else {
    console.log(getLogo());
    console.log(
      chalk.bold("  🚀 GRepcue — GitHub CLI Assistant")
    );
    console.log("");
    console.log(formatTagline() + "\n");
    console.log(chalk.bold("  Commands:"));
    console.log(`    ${chalk.hex("#60A5FA")("find")} <query>             Search for repos`);
    console.log(`    ${chalk.hex("#60A5FA")("compare")} <repo_a> <repo_b>  Compare two repos`);
    console.log(`    ${chalk.hex("#60A5FA")("summarize")} <repo>          Summarize a repo's README`);
    console.log(`    ${chalk.hex("#60A5FA")("connect github")}            Save GitHub token to increase API limits`);
    console.log(`    ${chalk.hex("#60A5FA")("connect ai")}                Connect an AI model`);
    console.log(`    ${chalk.hex("#60A5FA")("disconnect github")}         Remove saved GitHub token`);
    console.log(`    ${chalk.hex("#60A5FA")("disconnect ai")}             Remove saved AI config`);
    console.log(`    ${chalk.hex("#60A5FA")("history")}                   Show past search history`);
    console.log(`    ${chalk.hex("#60A5FA")("bookmarks")}                 Show bookmarked repositories`);
    console.log(`    ${chalk.hex("#60A5FA")("config")} [options]          Show or update config`);
    console.log(`    ${chalk.hex("#60A5FA")("help")}                      Show help\n`);
    console.log(chalk.dim("  Examples:"));
    console.log(chalk.dim('    grepcue find scraper'));
    console.log(chalk.dim('    grepcue find "web scraper" --language python --max 3'));
    console.log(chalk.dim("    grepcue compare facebook/react vuejs/core"));
    console.log(chalk.dim("    grepcue summarize vercel/next.js\n"));
  }
  process.exit(0);
}

program.parse();
