const key = process.env.GEMINI_API_KEY || "AIzaSyFakeKeyForTestingHeaders";
console.log("Testing with key:", key ? key.substring(0, 10) + "..." : "none");

const url = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

const headers = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${key}`
};

const body = {
  model: "gemini-2.0-flash",
  messages: [
    { role: "user", content: 'Reply with just the word "connected"' }
  ],
  temperature: 0.3,
  max_tokens: 300,
};

fetch(url, {
  method: "POST",
  headers,
  body: JSON.stringify(body)
})
.then(async response => {
  console.log("Response Status:", response.status);
  console.log("Response Headers:", JSON.stringify([...response.headers.entries()]));
  const text = await response.text();
  console.log("Response Text:", text);
})
.catch(err => {
  console.error("Fetch Error:", err);
});
