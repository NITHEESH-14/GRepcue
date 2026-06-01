<p align="center">
  <img src="logo.svg" alt="GRepcue Logo" width="650"/>
</p>


# 🚀 GRepcue — Smart assistant to get GitHub repositories

**Find, compare, summarize, and bookmark GitHub repositories** right from your terminal or AI editors.

---

### 💡 Why GRepcue?

Every great software project starts with a spark of inspiration—a new app, a library, or a tool idea. But in the vast global developer community, **someone might have already built and open-sourced something similar or highly related.** 

Reinventing the wheel from scratch is slow. **GRepcue** is built to solve this exact problem:
*   **Discover Existing Solutions**: Instantly search for existing projects that align with your new ideas.
*   **Learn and Build Faster**: Find highly relevant codebases, study their architectural decisions, reuse their open-source libraries, and launch your idea 10x faster.
*   **Bridge Standalone & AI Workflow**: Runs as an interactive terminal **CLI** for fast developer exploration, and as an **MCP Server** to act as the direct search eyes for your AI assistants (like Claude, Cursor, or ChatGPT), allowing them to pull real-world codebase references into your active coding context.

---

## ✨ Features

*   🔎 **Parallel Concept Search** — Splits multi-word natural queries into key terms, queries GitHub in parallel, and **interleaves** results to give a diverse, balanced repository selection.
*   ⚔️ **Side-by-Side Comparison** — Full metrics comparison (stars, forks, open issues, license, recency, developer activity) with interactive highlights.
*   📖 **Instant README Summarization** — Fetches metadata and details of any repository or GitHub URL and displays its README elegantly with automatic truncation protection.
*   🔌 **Curated AI Connections** — Connect Gemini, Claude, GPT, or local Ollama models. Displays a curated, arrow-key selection list for popular models (e.g. Gemini 2.5, Claude 3.7) with a future-proof custom input fallback.
*   🔖 **Offline Bookmarks System** — Keep a persistent registry of your favorite repositories (`bookmark add`, `bookmark remove`, `bookmarks`).
*   📜 **Search History & Re-runs** — Auto-saves search queries to history. Instantly re-run a previous search using index numbers (`grepcue find 3`).
*   🎨 **Premium Terminal Aesthetics** — Designed with Harmony colors, customized high-tech state tags (`[SUCCESS]`, `[ERROR]`, `[WARNING]`, `[?]`, `[OK]`), and smooth sky-blue **large braille dots loading wheels** that render beautifully on Windows, macOS, and Linux.

---

## 📦 Local Installation & Setup

Since this repository is fully open-source, you can set it up and run it globally on your machine using standard npm scripts:

```bash
# 1. Clone the repository
git clone https://github.com/yourusername/GRepcue.git
cd GRepcue

# 2. Install dependencies & build
npm install
npm run build

# 3. Link the package globally
npm link
```

Once linked, the global `grepcue` executable is registered on your machine. You can run it from any folder!

---

## 🖥️ CLI Subcommands

GRepcue uses a modern, clean, spaced subcommand architecture.

### 🔎 Search Repositories
Search using natural language project descriptions. GRepcue uses smart parallel concept queries and interleaves results to ensure you get high-quality matches for all parts of your query:
```bash
# Search using standard keywords
grepcue find "i want to build a portfolio with modern components"

# Re-run a past search using its history index number
grepcue find 2

# Filter search results by programming language
grepcue find "web scraper" --language python

# Limit maximum results (1 to 10)
grepcue find "OCR parser" --max 3

# Output raw JSON representation for script piping
grepcue find "data science dashboard" --json
```

### 🔖 Bookmarks System
Save your favorite repositories to a local persistent registry:
```bash
# Add a repository (Format: owner/repo)
grepcue bookmark add facebook/react

# List all bookmarks with stars, language, license, description, and links
grepcue bookmarks
# OR
grepcue bookmark list

# Remove a bookmark
grepcue bookmark remove facebook/react

# Clear all bookmarked repositories
grepcue bookmark clear
```

### ⚔️ Compare Repositories
Compare two repositories side-by-side inside a colored table showing winners:
```bash
grepcue compare facebook/react vuejs/core
grepcue compare https://github.com/pallets/flask expressjs/express
```

### 📖 Summarize a Repository
Get a clean summary showing stars, license, issues, forks, topics, and the first 40 lines of the README:
```bash
grepcue summarize vercel/next.js
grepcue summarize https://github.com/unclecode/crawl4ai
```

### 📜 Search History
View or clear your past search query history:
```bash
# Display history with indices (use 'grepcue find <index>' to re-run)
grepcue history

# Clear search query history
grepcue history clear
```

### 🔌 Connect AI Integration
Connect an AI model to enable automated query keyword extraction and AI-powered **"Why this fits"** explanations in search results:
```bash
# Open the interactive AI connection wizard
grepcue connect ai
# Supports:
#   • Google Gemini (Curated selection of Gemini 2.5 Flash/Pro, 2.0 Flash, 1.5 Flash/Pro)
#   • OpenAI (GPT-4o, GPT-4o-mini, o1-mini, o3-mini)
#   • Anthropic (Claude 3.7 Sonnet, 3.5 Sonnet, 3.5 Haiku, 3 Opus)
#   • Ollama (Local models — Llama 3.2, Llama 3.3, Mistral, Phi-3)
#   • Custom (Any OpenAI-compatible endpoint)

# Remove saved AI model configuration
grepcue disconnect ai
```

### 🔑 Connect GitHub Token
Increase GitHub API rate limits from 10 requests/minute to 30 requests/minute:
```bash
# Connect your GitHub Personal Access Token (classic PAT, no special scopes needed)
grepcue connect github

# Remove saved GitHub token
grepcue disconnect github
```

### ⚙️ View/Update Configuration
All configurations are stored persistently in `~/.grepcue/config.json`.
```bash
# Show current configuration status (tokens, active AI configurations, layout)
grepcue config

# Limit default search count (1-10)
grepcue config --max 3

# Adjust cache TTL (in minutes)
grepcue config --ttl 60

# Toggle simplified layout mode (disables ASCII art logo on wide terminals)
grepcue config --tagline on
```

---

## 🔌 MCP Server Integration

GRepcue acts as a **Model Context Protocol (MCP)** server, making its repository assistant tools directly available to AI coding assistants.

### Claude Desktop Setup
Open your Claude Desktop configuration file (located at `%APPDATA%\Claude\claude_desktop_config.json` on Windows or `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS) and add the server:

```json
{
  "mcpServers": {
    "grepcue": {
      "command": "node",
      "args": ["C:/absolute/path/to/GRepcue/dist/mcp.js"]
    }
  }
}
```

### Cursor Setup
1. Open Cursor Settings.
2. Navigate to **Features** -> **MCP**.
3. Click **+ Add New MCP Server**.
4. Configure as follows:
   - **Name**: `grepcue`
   - **Type**: `command`
   - **Command**: `node C:/absolute/path/to/GRepcue/dist/mcp.js`

### MCP Tools Available
When activated, AI assistants have direct access to these tools:
*   `find_repos` — Find relevant repositories for a project idea or tech stack description.
*   `compare_repos` — Perform side-by-side metric comparisons of two repositories.
*   `summarize_repo` — Retrieve a metadata overview and parsed README summary.

---

## 📊 Scoring & Ranking Algorithm

Search queries are evaluated and scored out of **100%** based on four weighted indicators:

| Factor | Weight | Signal |
| :--- | :---: | :--- |
| **Relevance** | **40%** | Exact keyword density matches in repository names, descriptions, and tag topics. |
| **Popularity** | **30%** | Logarithmically-scaled GitHub stargazer counts. |
| **Recency** | **20%** | Last active pushed commit date (commits within 6 months avoid stale warnings). |
| **License** | **10%** | Permissive licenses (MIT/Apache 2.0) are preferred; copyleft (GPL) is flagged. |

---

## 📄 License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.
