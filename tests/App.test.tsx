import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "../client/src/App";

describe("App", () => {
  it("renders dashboard opportunities from the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.startsWith("/api/health")) {
          return json({ ok: true, liveMode: true, scanIntervalSeconds: 120, missingConfig: [] });
        }
        if (url.startsWith("/api/scans/latest")) {
          return json({ id: "scan-1", status: "completed", listingCount: 2, opportunityCount: 1, startedAt: "now" });
        }
        if (url.startsWith("/api/opportunities")) {
          return json([
            {
              id: "opp-1",
              sourcePlatform: "TestMarket",
              title: "Sony Alpha a6400",
              listingUrl: "https://example.com",
              imageUrl: "",
              askPrice: 489,
              estimatedMarketValue: 695,
              feesEstimate: 55.6,
              shippingEstimate: 12.99,
              netProfit: 137.41,
              roiPercent: 24.6,
              confidence: 0.86,
              riskLevel: "low",
              reasoningSummary: "Below market.",
              detectedIssues: [],
              recommendedAction: "Buy",
              createdAt: "now",
              scanRunId: "scan-1",
              rawListingId: "raw-1"
            }
          ]);
        }
        return json({});
      })
    );

    render(<App />);

    await waitFor(() => expect(screen.getByText("Sony Alpha a6400")).toBeInTheDocument());
    expect(screen.getAllByText("24.6%")).toHaveLength(2);
    expect(screen.getByText("COMPLETED")).toBeInTheDocument();
  });
});

function json(body: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(body)
  } as Response);
}
