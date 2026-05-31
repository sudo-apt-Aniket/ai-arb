import { config } from "dotenv";
config();

async function test() {
  console.log("Key:", process.env.NVIDIA_NIM_API_KEY);
  console.log("Base URL:", process.env.NVIDIA_NIM_BASE_URL);
  console.log("Model:", process.env.DEEPSEEK_MODEL);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

  try {
    const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.NVIDIA_NIM_API_KEY}`
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || "deepseek-ai/deepseek-v4-pro",
        messages: [{ role: "user", content: "hello" }],
        max_tokens: 10
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    console.log("Status:", res.status);
    console.log("Response:", await res.text());
  } catch (err) {
    console.error("Error:", err);
  }
}

test();
