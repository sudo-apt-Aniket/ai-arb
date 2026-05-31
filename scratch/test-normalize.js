import fs from "node:fs";

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findListingArray(payload) {
  const visited = new Set();
  
  function findArray(val) {
    if (!val || typeof val !== "object" || visited.has(val)) return null;
    visited.add(val);
    
    if (Array.isArray(val)) {
      const records = val.filter(isRecord);
      if (records.length > 0) {
        const hasListingKeys = records.some(item => 
          ("title" in item || "name" in item || "productName" in item) &&
          ("price" in item || "askPrice" in item || "amount" in item || "current_price" in item)
        );
        if (hasListingKeys) {
          return records;
        }
      }
      for (const item of val) {
        const res = findArray(item);
        if (res) return res;
      }
    } else {
      for (const key of Object.keys(val)) {
        const res = findArray(val[key]);
        if (res) return res;
      }
    }
    return null;
  }
  
  return findArray(payload) || [];
}

const fileContent = fs.readFileSync("scratch/wire-job-output.json", "utf-8");
const payload = JSON.parse(fileContent);
const arr = findListingArray(payload);
console.log("Found array length:", arr.length);
if (arr.length > 0) {
  console.log("First item keys:", Object.keys(arr[0]));
  console.log("First item title:", arr[0].title);
  console.log("First item price:", arr[0].price);
}
