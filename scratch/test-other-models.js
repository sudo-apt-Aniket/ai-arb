import { config } from "dotenv";
config();

async function testModel(model) {
  try {
    const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.NVIDIA_NIM_API_KEY}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "hello" }],
        max_tokens: 10
      })
    });
    console.log(`Model: ${model} | Status: ${res.status}`);
    const text = await res.text();
    console.log(`Response: ${text.slice(0, 200)}`);
  } catch (err) {
    console.error(`Error for ${model}:`, err);
  }
}

async function run() {
  await testModel("deepseek-ai/deepseek-v4-flash");
  await testModel("meta/llama-3.1-8b-instruct");
}

run();
