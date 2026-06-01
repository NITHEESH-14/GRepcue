// ============================================================================
// GRepcue — Local Keyword Extraction (Default mode, no AI needed)
// Parses natural language project descriptions into GitHub search queries.
// ============================================================================

import type { IntentResult } from "./types.js";

// ---------------------------------------------------------------------------
// Stop words — common words to remove from search queries
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  // Articles & pronouns
  "i", "a", "an", "the", "my", "me", "we", "our", "it", "its",
  // Verbs (intent words)
  "want", "need", "looking", "trying", "build", "built", "building", "create", "creates", "make", "makes", "making", "develop", "developed", "developing",
  "write", "implement", "design", "designed", "designing", "find", "search", "get", "use", "using", "add", "added", "adding",
  "am", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "can", "may", "might", "needs", "needed",
  // Prepositions & conjunctions
  "to", "for", "with", "in", "on", "at", "from", "of", "by",
  "and", "or", "but", "that", "this", "which", "who", "what", "how",
  "like", "about", "into", "through", "between",
  // Filler
  "very", "really", "just", "also", "some", "any", "all", "more", "most", "least", "less",
  "something", "thing", "things", "stuff", "project", "app", "application",
  "tool", "program", "software", "system", "solution", "platform", "page", "pages",
  // Generic Adjectives & Descriptors
  "modern", "beautiful", "pretty", "gorgeous", "stunning",
  "awesome", "cool", "fun", "amazing", "incredible",
  "easy", "simple", "hard", "difficult", "lightweight",
  "smart", "intelligent", "clever",
  "best", "great", "good", "nice", "excellent", "awesome",
  "latest", "new", "recent", "old",
  "fast", "quick", "speedy", "slow", "high-performance",
  "popular", "famous", "trending", "gilded",
  "precise", "accurate", "correct", "exact",
  "detect", "detects", "detecting",
  "some", "many", "few", "several", "lot", "lots",
  "each", "every", "all", "both", "either", "neither",
  "one", "two", "three", "four", "five", "first", "second", "third", "number", "numbers",
]);

// ---------------------------------------------------------------------------
// Programming language detection
// ---------------------------------------------------------------------------

const LANGUAGE_MAP: Record<string, string> = {
  // Language name → GitHub language filter value
  python: "Python",
  py: "Python",
  javascript: "JavaScript",
  js: "JavaScript",
  typescript: "TypeScript",
  ts: "TypeScript",
  rust: "Rust",
  go: "Go",
  golang: "Go",
  java: "Java",
  kotlin: "Kotlin",
  swift: "Swift",
  "c++": "C++",
  cpp: "C++",
  "c#": "C#",
  csharp: "C#",
  ruby: "Ruby",
  php: "PHP",
  dart: "Dart",
  scala: "Scala",
  elixir: "Elixir",
  haskell: "Haskell",
  lua: "Lua",
  perl: "Perl",
  r: "R",
  julia: "Julia",
  shell: "Shell",
  bash: "Shell",
  html: "HTML",
  css: "CSS",
};

// ---------------------------------------------------------------------------
// Tech category detection
// ---------------------------------------------------------------------------

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  web: ["web", "website", "frontend", "backend", "fullstack", "webapp", "http", "rest", "graphql"],
  mobile: ["mobile", "android", "ios", "react-native", "flutter", "app"],
  cli: ["cli", "command-line", "terminal", "console", "shell"],
  api: ["api", "rest", "graphql", "grpc", "microservice", "endpoint"],
  database: ["database", "db", "sql", "nosql", "mongodb", "postgres", "mysql", "redis", "sqlite"],
  ml: ["machine-learning", "ml", "ai", "deep-learning", "neural", "nlp", "computer-vision", "model", "training"],
  devops: ["devops", "docker", "kubernetes", "ci", "cd", "deployment", "infrastructure", "terraform"],
  security: ["security", "auth", "authentication", "encryption", "crypto", "vulnerability"],
  data: ["data", "analytics", "visualization", "pipeline", "etl", "scraping", "scraper", "crawler"],
  game: ["game", "gaming", "3d", "2d", "engine", "rendering", "unity", "godot"],
  automation: ["automation", "bot", "workflow", "scheduler", "cron", "script"],
};

// ---------------------------------------------------------------------------
// Main extraction function
// ---------------------------------------------------------------------------

/**
 * Extracts search keywords, programming language, and tech category
 * from a natural language project description.
 *
 * Works locally — no external AI needed.
 *
 * @example
 * extractKeywords("I want to build a web scraper in Python")
 * // → { keywords: ["web", "scraper"], language: "Python", category: "data" }
 *
 * @example
 * extractKeywords("scrapper")
 * // → { keywords: ["scrapper"], language: undefined, category: undefined }
 */
export function extractKeywords(description: string): IntentResult {
  const original = description.trim();

  // Normalize: lowercase, remove punctuation except hyphens
  const normalized = original
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const words = normalized.split(" ");

  // Detect programming language
  let detectedLanguage: string | undefined;
  for (const word of words) {
    if (LANGUAGE_MAP[word]) {
      detectedLanguage = LANGUAGE_MAP[word];
      break;
    }
  }

  // Detect tech category
  let detectedCategory: string | undefined;
  for (const [category, categoryWords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const word of words) {
      if (categoryWords.includes(word)) {
        detectedCategory = category;
        break;
      }
    }
    if (detectedCategory) break;
  }

  // Filter out stop words and language names to get meaningful keywords
  const languageWords = new Set(Object.keys(LANGUAGE_MAP));
  const keywords = words.filter(
    (word) =>
      word.length > 1 &&
      !STOP_WORDS.has(word) &&
      !languageWords.has(word)
  );

  // If no keywords survived filtering, use the original words (minus just stop words)
  const finalKeywords =
    keywords.length > 0
      ? keywords
      : words.filter((w) => w.length > 1 && !STOP_WORDS.has(w));

  // If still nothing (e.g., user just typed "build"), use the whole input
  const result =
    finalKeywords.length > 0 ? finalKeywords : [normalized];

  return {
    keywords: [...new Set(result)], // deduplicate
    language: detectedLanguage,
    category: detectedCategory,
    originalQuery: original,
  };
}

/**
 * Builds a GitHub search query string from an IntentResult.
 *
 * @example
 * buildSearchQuery({ keywords: ["web", "scraper"], language: "Python", ... })
 * // → "web scraper language:Python"
 */
export function buildSearchQuery(intent: IntentResult, overrideLanguage?: string): string {
  const parts = [intent.keywords.join(" ")];
  const lang = overrideLanguage || intent.language;
  if (lang) {
    parts.push(`language:${lang}`);
  }
  return parts.join(" ");
}
