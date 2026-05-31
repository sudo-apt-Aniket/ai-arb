import { config } from "dotenv";
config();

async function checkJob(jobId) {
  const url = `https://api.anakin.io/v1/wire/jobs/${jobId}`;
  try {
    const res = await fetch(url, {
      headers: {
        "X-API-Key": process.env.ANAKIN_API_KEY,
        Authorization: `Bearer ${process.env.ANAKIN_API_KEY}`
      }
    });
    console.log("Status:", res.status);
    const json = await res.json();
    console.log("JSON Output keys:", Object.keys(json));
    console.log("JSON Result keys:", json.result ? Object.keys(json.result) : "no result");
    console.log("Full JSON:", JSON.stringify(json, null, 2));
  } catch (err) {
    console.error(err);
  }
}

const jobId = process.argv[2] || "18a7f958-d692-4565-9de1-e059d8cd90d4";
checkJob(jobId);
