import { afterEach, describe, expect, it, vi } from "vitest";
import { AppraisalService, buildNimRequestBody, buildOpportunities, parseStrictAppraisalJson } from "../server/src/appraisal";
import { appConfig } from "../server/src/config";
import type { RawListing } from "../server/src/types";

const listing: RawListing & { rawListingId: string } = {
  rawListingId: "raw-1",
  sourcePlatform: "TestMarket",
  sourceId: "item-1",
  title: "Undervalued Camera",
  listingUrl: "https://example.com/item-1",
  imageUrl: "",
  askPrice: 100,
  currency: "USD",
  metadata: {}
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("appraisal parsing", () => {
  it("accepts a strict JSON array", () => {
    const parsed = parseStrictAppraisalJson(
      JSON.stringify([
        {
          sourceId: "item-1",
          estimatedMarketValue: 180,
          feesEstimate: 12,
          shippingEstimate: 8,
          confidence: 0.86,
          riskLevel: "low",
          reasoningSummary: "Below market.",
          detectedIssues: [],
          recommendedAction: "Buy"
        }
      ])
    );

    expect(parsed).toHaveLength(1);
  });

  it("accepts and sanitizes markdown-wrapped JSON", () => {
    const parsed = parseStrictAppraisalJson("```json\n[]\n```");
    expect(parsed).toEqual([]);
  });

  it("filters low-confidence or unprofitable appraisals", () => {
    const opportunities = buildOpportunities({
      scanRunId: "scan-1",
      listings: [listing],
      appraisals: [
        {
          sourceId: "item-1",
          estimatedMarketValue: 180,
          feesEstimate: 12,
          shippingEstimate: 8,
          confidence: 0.2,
          riskLevel: "high",
          reasoningSummary: "Too uncertain.",
          detectedIssues: ["Low confidence"],
          recommendedAction: "Skip"
        }
      ]
    });

    expect(opportunities).toHaveLength(0);
  });

  it("builds the NVIDIA NIM request body expected by DeepSeek v4 Pro", () => {
    const body = buildNimRequestBody("deepseek-ai/deepseek-v4-pro", [listing]);

    expect(body).toMatchObject({
      model: "deepseek-ai/deepseek-v4-pro",
      temperature: 1,
      top_p: 0.95,
      max_tokens: 16384,
      extra_body: { chat_template_kwargs: { thinking: false } }
    });
    expect(body.messages[1].content).toContain("item-1");
  });

  it("calls NVIDIA NIM and parses the strict JSON appraisal response", async () => {
    const content = JSON.stringify([
      {
        sourceId: "item-1",
        estimatedMarketValue: 190,
        feesEstimate: 14,
        shippingEstimate: 8,
        confidence: 0.91,
        riskLevel: "low",
        reasoningSummary: "Strong comparable spread.",
        detectedIssues: [],
        recommendedAction: "Buy after seller verification."
      }
    ]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content } }] }),
      text: () => Promise.resolve("")
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = new AppraisalService({
      ...appConfig,
      NVIDIA_NIM_API_KEY: "nim-key",
      NVIDIA_NIM_BASE_URL: "https://integrate.api.nvidia.com/v1",
      DEEPSEEK_MODEL: "deepseek-ai/deepseek-v4-pro"
    });

    const result = await service.appraise([listing]);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://integrate.api.nvidia.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer nim-key"
        }
      })
    );
    expect(result[0]).toMatchObject({
      sourceId: "item-1",
      estimatedMarketValue: 190,
      confidence: 0.91
    });
  });
});
