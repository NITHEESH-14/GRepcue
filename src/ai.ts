// ============================================================================
// GRepcue — Optional AI Model Integration
// Connects to any OpenAI-compatible API for smarter keyword extraction.
// Used only when the user has run `grepcue connect-ai`.
// ============================================================================

import { getAIConfig, isAIConfigured } from "./config.js";
import type { IntentResult, AIConfig } from "./types.js";

// ---------------------------------------------------------------------------
// AI-powered keyword extraction
// ---------------------------------------------------------------------------

const EXTRACTION_PROMPT = `You are a GitHub repository search assistant. Given a project description, extract the following as valid JSON:

1. "keywords": Array of up to 6 search terms for GitHub. Follow this logic:
   STEP 1 — Identify every distinct feature or product the user wants to build.
   Each one becomes a keyword candidate regardless of how simple it sounds.
   (e.g. "calculator", "chatbot", "plant disease detection" are all distinct features — keep all of them)
   
   STEP 2 — For any ML/AI feature, append one specific technical term alongside it.
   (e.g. "plant-disease-detection" → also add "image-classification" or "CNN")
   
   STEP 3 — Drop anything that is purely aesthetic or non-searchable on GitHub.
   (e.g. "glassmorphism", "modern", "beautiful", "precise", "accurate")

2. "language": Primary programming language if mentioned or strongly implied. 
   If multiple are mentioned, pick the backend/core one. Return null if unclear.

3. "category": One of:
   - "web" — websites, frontend, browser apps
   - "mobile" — iOS/Android/cross-platform apps
   - "cli" — terminal tools, command-line utilities
   - "api" — backend services, REST/GraphQL servers
   - "database" — storage engines, ORMs, query tools
   - "ml" — machine learning, AI models, training pipelines
   - "devops" — CI/CD, containers, infrastructure, deployment
   - "automation" — bots, scrapers, scheduled scripts
   - "data" — analytics, visualization, ETL pipelines
   - "game" — game engines, simulations
   - "security" — auth, encryption, pen-testing tools
   Return null if none fit.

Respond ONLY with valid JSON. No explanation, no markdown.

Examples:
Input: "real-time chat app using websockets in Python"
Output: {"keywords": ["chatbot", "websocket", "real-time"], "language": "Python", "category": "web"}

Input: "web page with a chatbot, calculator, and a plant disease detection model from photo"
Output: {"keywords": ["chatbot", "calculator", "plant-disease-detection", "image-classification", "CNN"], "language": null, "category": "web"}`;


/**
 * Extracts keywords from a project description using the connected AI model.
 * Falls back to null if the AI call fails (caller should use local extraction).
 */
export async function extractKeywordsWithAI(
  description: string
): Promise<IntentResult | null> {
  if (!isAIConfigured()) return null;

  const aiConfig = getAIConfig()!;

  try {
    const response = await callAI(aiConfig, [
      { role: "system", content: EXTRACTION_PROMPT },
      { role: "user", content: description },
    ]);

    const parsed = JSON.parse(response);
    return {
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
      language: parsed.language || undefined,
      category: parsed.category || undefined,
      originalQuery: description,
    };
  } catch {
    // AI call failed — return null so caller can fall back to local extraction
    return null;
  }
}

// ---------------------------------------------------------------------------
// "Why this fits" explanation generation
// ---------------------------------------------------------------------------

const FIT_PROMPT = `You are a developer assistant. Given a project description and a GitHub repository, write a concise 1-sentence explanation of why this repository is useful for the project. Be specific and practical. Max 120 characters.`;

/**
 * Generates a short "why this fits" explanation for a repo.
 * Returns undefined if AI is not configured or fails.
 */
export async function generateFitExplanation(
  description: string,
  repoName: string,
  repoDescription: string
): Promise<string | undefined> {
  if (!isAIConfigured()) return undefined;

  const aiConfig = getAIConfig()!;

  try {
    const response = await callAI(aiConfig, [
      { role: "system", content: FIT_PROMPT },
      {
        role: "user",
        content: `Project: ${description}\nRepo: ${repoName} — ${repoDescription}`,
      },
    ]);
    return response.trim();
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Generic AI API call (OpenAI-compatible format)
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Makes a chat completion request to any OpenAI-compatible API.
 * Works with: OpenAI, Google Gemini, Anthropic (via proxy), Ollama, etc.
 */
async function callAI(
  config: AIConfig,
  messages: ChatMessage[]
): Promise<string> {
  const url = `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  const body = {
    model: config.model,
    messages,
    temperature: 0.3,
    max_tokens: 300,
  };

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let cleanMessage = errorText;
    try {
      const parsed = JSON.parse(errorText);
      const errObj = Array.isArray(parsed) ? parsed[0]?.error : parsed?.error;
      if (errObj && errObj.message) {
        cleanMessage = errObj.message;
      }
    } catch {
      // Fallback to raw text if not JSON
    }
    throw new Error(`AI API error (${response.status}): ${cleanMessage}`);
  }

  const data = (await response.json()) as {
    choices: { message: { content: string } }[];
  };

  return data.choices[0]?.message?.content || "";
}

/**
 * Tests the AI connection by sending a simple request.
 * Returns true if the connection is successful.
 */
export async function testAIConnection(config: AIConfig): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await callAI(config, [
      { role: "user", content: 'Reply with just the word "connected"' },
    ]);
    return { success: result.length > 0 };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

/**
 * Re-export for convenience.
 */
export { isAIConfigured };
