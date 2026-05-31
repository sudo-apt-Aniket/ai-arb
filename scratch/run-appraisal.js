import { config } from "dotenv";
import { AnakinClient } from "../server/src/anakinClient.js";
import { AppraisalService } from "../server/src/appraisal.js";
import { appConfig } from "../server/src/config.js";

config();

async function run() {
  console.log("Fetching listings...");
  const client = new AnakinClient(appConfig);
  const listings = await client.fetchListings();
  console.log(`Fetched ${listings.length} listings.`);
  
  if (listings.length === 0) {
    console.log("No listings found.");
    return;
  }

  // Slice listings to test if a smaller batch works better (e.g. 5)
  const batch = listings.slice(0, 5);
  console.log(`Appraising a batch of ${batch.length} listings...`);

  const service = new AppraisalService(appConfig);
  const startTime = Date.now();
  try {
    const result = await service.appraise(batch);
    console.log("Appraisal successful!");
    console.log("Duration:", (Date.now() - startTime) / 1000, "seconds");
    console.log("Result sample:", JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("Appraisal failed after", (Date.now() - startTime) / 1000, "seconds");
    console.error(err);
  }
}

run();
