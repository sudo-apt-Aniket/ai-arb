import os from "node:os";
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../server/src/app";
import { appConfig } from "../server/src/config";

describe("API integration", () => {
  it("runs a scan with injected test services and returns opportunities sorted by ROI", async () => {
    const { app, db } = createApp({
      ...appConfig,
      DATABASE_PATH: path.join(os.tmpdir(), `ai-arb-test-${Date.now()}.sqlite`)
    }, {
      listingProvider: {
        async fetchListings() {
          return [
            {
              sourcePlatform: "TestMarket",
              sourceId: "item-1",
              title: "Camera Body",
              listingUrl: "https://example.com/item-1",
              imageUrl: "",
              askPrice: 100,
              currency: "USD",
              metadata: {}
            },
            {
              sourcePlatform: "TestMarket",
              sourceId: "item-2",
              title: "Lens",
              listingUrl: "https://example.com/item-2",
              imageUrl: "",
              askPrice: 200,
              currency: "USD",
              metadata: {}
            }
          ];
        }
      },
      listingAppraiser: {
        async appraise() {
          return [
            {
              sourceId: "item-1",
              estimatedMarketValue: 180,
              feesEstimate: 10,
              shippingEstimate: 5,
              confidence: 0.9,
              riskLevel: "low",
              reasoningSummary: "Strong spread.",
              detectedIssues: [],
              recommendedAction: "Buy"
            },
            {
              sourceId: "item-2",
              estimatedMarketValue: 260,
              feesEstimate: 20,
              shippingEstimate: 10,
              confidence: 0.8,
              riskLevel: "medium",
              reasoningSummary: "Moderate spread.",
              detectedIssues: [],
              recommendedAction: "Verify"
            }
          ];
        }
      }
    });

    const scan = await request(app).post("/api/scans").expect(200);
    expect(scan.body.status).toBe("completed");
    expect(scan.body.opportunityCount).toBeGreaterThan(0);

    const opportunities = await request(app).get("/api/opportunities").expect(200);
    expect(opportunities.body.length).toBeGreaterThan(0);
    expect(opportunities.body[0].roiPercent).toBeGreaterThanOrEqual(opportunities.body.at(-1).roiPercent);

    db.close();
  });
});
