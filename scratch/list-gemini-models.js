import { config } from "dotenv";
config();

async function listModels() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`;
  try {
    const res = await fetch(url);
    console.log("Status:", res.status);
    const json = await res.json();
    if (json.models) {
      console.log("Available Models:", json.models.map(m => m.name));
    } else {
      console.log("Response:", JSON.stringify(json, null, 2));
    }
  } catch (err) {
    console.error(err);
  }
}

listModels();
