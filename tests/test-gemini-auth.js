import { testAIConnection } from "../dist/ai.js";

const key = process.env.GEMINI_API_KEY || "AIzaSyFakeKeyForTestingHeaders";
console.log("Testing with key:", key ? key.substring(0, 10) + "..." : "none");

const config = {
  provider: "gemini",
  apiKey: key,
  baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
  model: "gemini-2.0-flash",
};

testAIConnection(config).then(res => {
  console.log("Result:", JSON.stringify(res, null, 2));
}).catch(err => {
  console.error("Fatal Error:", err);
});
