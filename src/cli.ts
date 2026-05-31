// ============================================================================
// GRepcue — CLI Entry Point
// Commands: find, compare, summarize, connect-github, connect-ai, disconnect, config
// ============================================================================

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import readline from "node:readline";
import { select, input, password } from "@inquirer/prompts";
import { searchRepositories, compareRepos, summarizeRepo, hasGitHubToken } from "./github.js";
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
} from "./formatter.js";
import { AI_PROVIDER_PRESETS } from "./types.js";
import type { AIProvider, AIConfig, RankedRepo } from "./types.js";

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
  if (process.stdout.columns) {
    renderInteractiveHelp();
  } else {
    console.log(formatHelp());
    process.exit(0);
  }
});

program
  .name("grepcue")
  .version("1.0.0")
  .description(
    chalk.hex("#A78BFA").bold("GRepcue") +
      chalk.dim(" — Smart assistant for GitHub repositories")
  );

// ---------------------------------------------------------------------------
// Command: find
// ---------------------------------------------------------------------------

program
  .command("find")
  .argument("<query>", "Project idea or keyword to search for")
  .option("-l, --language <lang>", "Filter by programming language")
  .option("-m, --max <number>", "Maximum results (1-10)", "5")
  .option("--no-cache", "Skip cached results")
  .option("--json", "Output raw JSON")
  .description("Search for relevant GitHub repositories")
  .action(async (query: string, opts: { language?: string; max: string; cache: boolean; json: boolean }) => {
    const maxResults = Math.min(Math.max(parseInt(opts.max) || 5, 1), 10);
    const spinner = ora({ text: "Searching GitHub...", color: "magenta" }).start();

    try {
      // Step 1: Extract keywords (AI-powered if connected, else local)
      let intent;
      if (isAIConfigured()) {
        spinner.text = "Analyzing with AI...";
        const aiResult = await extractKeywordsWithAI(query);
        intent = aiResult || extractKeywords(query);
      } else {
        intent = extractKeywords(query);
      }

      // Step 2: Build search query and fetch from GitHub
      const searchQuery = buildSearchQuery(intent, opts.language);
      spinner.text = `Searching GitHub for "${searchQuery}"...`;

      const repos = await searchRepositories(
        searchQuery,
        maxResults * 3,
        "stars",
        !opts.cache
      );

      // Step 3: Rank results
      spinner.text = "Ranking results...";
      const ranked = rankRepos(repos, intent.keywords, maxResults);

      // Step 4: Generate fit explanations (if AI connected)
      if (isAIConfigured() && ranked.length > 0) {
        spinner.text = "Generating explanations...";
        const explanations = await Promise.allSettled(
          ranked.map((item) =>
            generateFitExplanation(
              query,
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

      // Step 5: Output results
      if (opts.json) {
        console.log(JSON.stringify(ranked, null, 2));
      } else {
        if (!hasGitHubToken()) {
          console.log(
            formatWarning(
              'No GitHub token set. Rate limited to 10 req/min. Run "grepcue connect-github" for better limits.'
            )
          );
        }
        console.log(formatRepoList(ranked, query));
        if (!isAIConfigured()) {
          console.log(
            chalk.dim(
              '  💡 Tip: Run "grepcue connect-ai" to enable AI-powered search with smarter results.\n'
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
    const spinner = ora({ text: "Fetching repository data...", color: "magenta" }).start();

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
    const spinner = ora({ text: "Fetching repository summary...", color: "magenta" }).start();

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

// ---------------------------------------------------------------------------
// Command: connect-github
// ---------------------------------------------------------------------------

program
  .command("connect-github")
  .description("Save your GitHub Personal Access Token for higher API rate limits")
  .action(async () => {
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
      });

      saveGitHubToken(token.trim());
      console.log(formatSuccess("GitHub token saved to ~/.grepcue/config.json"));
      console.log(
        chalk.dim("  You now have 30 requests/min (up from 10). 🚀\n")
      );
    } catch {
      console.log(chalk.dim("\n  Cancelled.\n"));
    }
  });

// ---------------------------------------------------------------------------
// Command: connect-ai
// ---------------------------------------------------------------------------

program
  .command("connect-ai")
  .description("Connect an AI model for smarter searches (OpenAI, Gemini, Ollama, etc.)")
  .action(async () => {
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
        });
        baseUrl = baseUrl.trim();
      }

      // Step 4: Model name
      if (provider === "ollama") {
        model = await input({
          message: "Enter model name (available on your Ollama instance):",
          default: preset.defaultModel,
        });
      } else {
        model = await input({
          message: "Enter model name:",
          default: preset.defaultModel,
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

      const testSpinner = ora({ text: "Testing connection...", color: "magenta" }).start();
      const connected = await testAIConnection(aiConfig);

      if (connected) {
        testSpinner.succeed(chalk.hex("#34D399")(" Connection successful!"));
        saveAIConfig(aiConfig);
        console.log(formatSuccess(`Connected to ${preset.name} (${model}). Config saved to ~/.grepcue/config.json`));
      } else {
        testSpinner.fail(chalk.hex("#F87171")(" Connection failed."));
        console.log(
          formatError(
            "Could not connect to the AI model. Check your API key, URL, and model name."
          )
        );

        const saveAnyway = await select({
          message: "Save the configuration anyway?",
          choices: [
            { value: true, name: "Yes — save it (I'll fix the connection later)" },
            { value: false, name: "No — discard" },
          ],
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
  });

// ---------------------------------------------------------------------------
// Command: disconnect
// ---------------------------------------------------------------------------

program
  .command("disconnect")
  .description("Remove saved GitHub token and/or AI model configuration")
  .action(async () => {
    console.log("");
    try {
      const what = await select({
        message: "What do you want to disconnect?",
        choices: [
          { value: "github", name: "GitHub Token" },
          { value: "ai", name: "AI Model" },
          { value: "all", name: "Everything (GitHub + AI)" },
        ],
      });

      if (what === "github" || what === "all") {
        removeGitHubToken();
        console.log(formatSuccess("GitHub token removed."));
      }
      if (what === "ai" || what === "all") {
        removeAIConfig();
        console.log(formatSuccess("AI model configuration removed."));
      }
    } catch {
      console.log(chalk.dim("\n  Cancelled.\n"));
    }
  });

function renderInteractiveConfig(config: any, hasToken: boolean) {
  // Hide cursor to keep output clean
  process.stdout.write("\x1b[?25l");

  function draw() {
    // Clear screen, clear scrollback, and move cursor to top-left (0,0)
    process.stdout.write("\x1b[2J\x1b[3J\x1b[H");
    
    // Print config dynamically based on current process.stdout.columns
    const output = formatConfig(config, hasToken);
    process.stdout.write(output);
    process.stdout.write(chalk.dim(`  Config file: ${getConfigPath()}\n\n`));
    process.stdout.write(chalk.hex("#A78BFA").bold("  [Press 'q', 'Enter', or 'Esc' to exit]\n"));
  }

  // Initial draw
  draw();

  // Handle window resizing dynamically
  const onResize = () => {
    draw();
  };
  process.stdout.on("resize", onResize);

  // Set up keypress listening
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();

  const onKeypress = (chunk: any, key: any) => {
    if (
      key &&
      (key.name === "q" ||
        key.name === "enter" ||
        key.name === "return" ||
        key.name === "escape" ||
        (key.ctrl && key.name === "c"))
    ) {
      // Cleanup events
      process.stdout.off("resize", onResize);
      process.stdin.off("keypress", onKeypress);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
      
      // Restore cursor
      process.stdout.write("\x1b[?25h");
      
      // Clear one last time and leave a pristine final output
      process.stdout.write("\x1b[2J\x1b[3J\x1b[H");
      process.stdout.write(formatConfig(config, hasToken));
      process.stdout.write(chalk.dim(`  Config file: ${getConfigPath()}\n\n`));
      
      process.exit(0);
    }
  };

  process.stdin.on("keypress", onKeypress);
}

function renderInteractiveHelp() {
  // Hide cursor to keep output clean
  process.stdout.write("\x1b[?25l");

  function draw() {
    // Clear screen, clear scrollback, and move cursor to top-left (0,0)
    process.stdout.write("\x1b[2J\x1b[3J\x1b[H");

    // Print help dynamically based on current process.stdout.columns
    const output = formatHelp();
    process.stdout.write(output);
  }

  // Initial draw
  draw();

  // Handle window resizing dynamically
  const onResize = () => {
    draw();
  };
  process.stdout.on("resize", onResize);

  // Set up keypress listening
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();

  const onKeypress = (chunk: any, key: any) => {
    // Cleanup events
    process.stdout.off("resize", onResize);
    process.stdin.off("keypress", onKeypress);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdin.pause();

    // Restore cursor
    process.stdout.write("\x1b[?25h");

    // Clear one last time and leave a pristine final output
    process.stdout.write("\x1b[2J\x1b[3J\x1b[H");
    process.stdout.write(formatHelp());

    process.exit(0);
  };

  process.stdin.on("keypress", onKeypress);
}

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

    if (process.stdout.columns && !opts.max && !opts.ttl && opts.tagline === undefined) {
      // Run the interactive responsive config dashboard
      renderInteractiveConfig(config, hasGitHubToken());
    } else {
      // Standard static output (if scripting/piping/redirecting or updating config)
      console.log(formatConfig(config, hasGitHubToken()));
      console.log(chalk.dim(`  Config file: ${getConfigPath()}\n`));
    }
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

    // Main help — use the same interactive pattern as config
    if (process.stdout.columns) {
      renderInteractiveHelp();
    } else {
      console.log(formatHelp());
    }
  });

// ---------------------------------------------------------------------------
// Banner & Parse
// ---------------------------------------------------------------------------

// Show banner when no arguments provided
if (process.argv.length <= 2) {
  const isNarrow = isNarrowLayout();
  if (isNarrow) {
    console.log("");
    console.log(chalk.dim("  Smart assistant for GitHub repositories.\n"));
    console.log(chalk.bold("  Commands:"));
    console.log(`    ${chalk.hex("#60A5FA")("find")} <query>         Search repos`);
    console.log(`    ${chalk.hex("#60A5FA")("compare")} <a> <b>      Compare repos`);
    console.log(`    ${chalk.hex("#60A5FA")("summarize")} <repo>    Summarize repo`);
    console.log(`    ${chalk.hex("#60A5FA")("connect-github")}      Save GitHub token (raise rate limits)`);
    console.log(`    ${chalk.hex("#60A5FA")("connect-ai")}          Connect AI model`);
    console.log(`    ${chalk.hex("#60A5FA")("disconnect")}          Remove saved configs`);
    console.log(`    ${chalk.hex("#60A5FA")("config")} [options]     Show/update config`);
    console.log(`    ${chalk.hex("#60A5FA")("help")}                Show help\n`);
    console.log(chalk.bold("  Examples:"));
    console.log(chalk.dim("    grepcue find scraper"));
    console.log(chalk.dim("    grepcue summarize vercel/next.js\n"));
  } else {
    console.log("");
    console.log(
      chalk.hex("#A78BFA").bold("  ╔═══════════════════════════════════════════╗")
    );
    console.log(
      chalk.hex("#A78BFA").bold("  ║") +
        chalk.bold("  🚀 GRepcue — GitHub CLI Assistant       ") +
        chalk.hex("#A78BFA").bold("║")
    );
    console.log(
      chalk.hex("#A78BFA").bold("  ╚═══════════════════════════════════════════╝")
    );
    console.log("");
    console.log(chalk.dim("  Smart assistant for GitHub repositories.\n"));
    console.log(chalk.bold("  Commands:"));
    console.log(`    ${chalk.hex("#60A5FA")("find")} <query>             Search for repos`);
    console.log(`    ${chalk.hex("#60A5FA")("compare")} <repo_a> <repo_b>  Compare two repos`);
    console.log(`    ${chalk.hex("#60A5FA")("summarize")} <repo>          Summarize a repo's README`);
    console.log(`    ${chalk.hex("#60A5FA")("connect-github")}            Save GitHub token to increase API limits`);
    console.log(`    ${chalk.hex("#60A5FA")("connect-ai")}                Connect an AI model`);
    console.log(`    ${chalk.hex("#60A5FA")("disconnect")}                Remove saved configs`);
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
