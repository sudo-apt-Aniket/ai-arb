import { config } from "dotenv";
config();

async function listModels() {
  try {
    const res = await fetch("https://integrate.api.nvidia.com/v1/models", {
      headers: {
        Authorization: `Bearer ${process.env.NVIDIA_NIM_API_KEY}`
      }
    });
    console.log("Status:", res.status);
    const data = await res.json();
    console.log("Models:", data.data.map(m => m.id));
  } catch (err) {
    console.error("Error:", err);
  }
}

listModels();
