import { z } from "zod";
import type { AppConfig } from "./config";
import { calculateRoi, roundMoney } from "./roi";
import type { Opportunity, RawListing } from "./types";

const appraisalSchema = z.array(
  z.object({
    sourceId: z.string(),
    estimatedMarketValue: z.number().positive(),
    feesEstimate: z.number().nonnegative(),
    shippingEstimate: z.number().nonnegative(),
    confidence: z.number().min(0).max(1),
    riskLevel: z.enum(["low", "medium", "high"]),
    reasoningSummary: z.string(),
    detectedIssues: z.array(z.string()).default([]),
    recommendedAction: z.string()
  })
);

export type AppraisalResult = z.infer<typeof appraisalSchema>[number];

export class AppraisalService {
  constructor(private readonly config: AppConfig) {}

  async appraise(listings: RawListing[], options?: { provider?: string }): Promise<AppraisalResult[]> {
    if (listings.length === 0) return [];

    const provider = options?.provider ?? this.config.APPRAISAL_PROVIDER;
    const batchSize = 5;
    const batches: RawListing[][] = [];
    for (let i = 0; i < listings.length; i += batchSize) {
      batches.push(listings.slice(i, i + batchSize));
    }

    console.log(`📦 [APPRAISER] Split ${listings.length} listings into ${batches.length} batches of size ${batchSize} using provider "${provider}"`);

    const results = await Promise.all(
      batches.map(async (batch, index) => {
        return this.appraiseBatchWithFallback(batch, index + 1, batches.length, provider);
      })
    );

    return results.flat();
  }

  private async appraiseBatchWithFallback(
    batch: RawListing[],
    batchIndex: number,
    totalBatches: number,
    preferredProvider: string
  ): Promise<AppraisalResult[]> {
    const providersToTry = [preferredProvider, "gemini", "openrouter", "nvidia"].filter(
      (p, i, arr) => arr.indexOf(p) === i
    );

    let lastError: Error | undefined;
    for (const provider of providersToTry) {
      if (provider === "nvidia" && !this.config.NVIDIA_NIM_API_KEY) continue;
      if (provider === "gemini" && !this.config.GEMINI_API_KEY) continue;
      if (provider === "openrouter" && !this.config.OPENROUTER_API_KEY) continue;

      try {
        if (provider === "nvidia") {
          console.log(`🤖 [DEEPSEEK] Dispatching batch ${batchIndex}/${totalBatches} to Nvidia NIM`);
          return await this.appraiseWithNim(batch);
        } else if (provider === "gemini") {
          console.log(`♊ [GEMINI] Dispatching batch ${batchIndex}/${totalBatches} to Google AI Studio`);
          return await this.appraiseWithGemini(batch, this.config.GEMINI_API_KEY!);
        } else if (provider === "openrouter") {
          console.log(`🌐 [OPENROUTER] Dispatching batch ${batchIndex}/${totalBatches} to OpenRouter`);
          return await this.appraiseWithOpenRouter(batch, this.config.OPENROUTER_API_KEY!);
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`⚠️ [APPRAISAL] Provider "${provider}" failed for batch ${batchIndex}/${totalBatches}: ${lastError.message}`);
      }
    }

    const errorMsg = lastError ? lastError.message : "No configured providers succeeded";
    console.error(`❌ [APPRAISAL] All providers failed for batch ${batchIndex}/${totalBatches}: ${errorMsg}`);
    throw new Error(`Appraisal failed for batch ${batchIndex}: ${errorMsg}`);
  }

  private async appraiseWithNim(listings: RawListing[]) {
    if (!this.config.NVIDIA_NIM_API_KEY) {
      throw new Error("NVIDIA_NIM_API_KEY is required for live appraisal");
    }

    const response = await fetch(`${this.config.NVIDIA_NIM_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.NVIDIA_NIM_API_KEY}`
      },
      body: JSON.stringify(buildNimRequestBody(this.config.DEEPSEEK_MODEL, listings))
    });

    if (!response.ok) {
      throw new Error(`NVIDIA NIM appraisal failed: ${response.status} ${await response.text()}`);
    }

    const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error("NVIDIA NIM response did not include message content");
    return parseStrictAppraisalJson(content);
  }

  private async appraiseWithGemini(listings: RawListing[], apiKey: string): Promise<AppraisalResult[]> {
    const prompt = `You are a market appraisal engine. Return only a strict JSON array. Do not include markdown, prose, or comments.
For each listing, estimate fair-market value, fees, shipping, confidence, risk level, issues, and action. Include sourceId from the listing.

Output shape:
[
  {
    "sourceId": "string",
    "estimatedMarketValue": number,
    "feesEstimate": number,
    "shippingEstimate": number,
    "confidence": number (0..1),
    "riskLevel": "low" | "medium" | "high",
    "reasoningSummary": "string",
    "detectedIssues": ["string"],
    "recommendedAction": "string"
  }
]

Listings:
${JSON.stringify(listings, null, 2)}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json"
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Google AI Studio appraisal failed: ${response.status} ${await response.text()}`);
    }

    const json = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const content = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) throw new Error("Google AI Studio response did not include content");
    return parseStrictAppraisalJson(content);
  }

  private async appraiseWithOpenRouter(listings: RawListing[], apiKey: string): Promise<AppraisalResult[]> {
    const prompt = `You are a market appraisal engine. Return only a strict JSON array. Do not include markdown, prose, or comments.
For each listing, estimate fair-market value, fees, shipping, confidence, risk level, issues, and action. Include sourceId from the listing.

Output shape:
[
  {
    "sourceId": "string",
    "estimatedMarketValue": number,
    "feesEstimate": number,
    "shippingEstimate": number,
    "confidence": number (0..1),
    "riskLevel": "low" | "medium" | "high",
    "reasoningSummary": "string",
    "detectedIssues": ["string"],
    "recommendedAction": "string"
  }
]

Listings:
${JSON.stringify(listings, null, 2)}`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter appraisal failed: ${response.status} ${await response.text()}`);
    }

    const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenRouter response did not include message content");
    return parseStrictAppraisalJson(content);
  }
}

export function buildNimRequestBody(model: string, listings: RawListing[]) {
  return {
    model,
    temperature: 1,
    top_p: 0.95,
    max_tokens: 16384,
    extra_body: {
      chat_template_kwargs: {
        thinking: false
      }
    },
    messages: [
      {
        role: "system",
        content:
          "You are a market appraisal engine. Return only a strict JSON array. Do not include markdown, prose, or comments."
      },
      {
        role: "user",
        content: JSON.stringify({
          task:
            "For each listing, estimate fair-market value, fees, shipping, confidence, risk level, issues, and action. Include sourceId from the listing.",
          outputShape: [
            {
              sourceId: "string",
              estimatedMarketValue: "number",
              feesEstimate: "number",
              shippingEstimate: "number",
              confidence: "number 0..1",
              riskLevel: "low|medium|high",
              reasoningSummary: "string",
              detectedIssues: ["string"],
              recommendedAction: "string"
            }
          ],
          listings
        })
      }
    ]
  };
}

export function parseStrictAppraisalJson(content: string): AppraisalResult[] {
  const sanitized = content
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  if (!sanitized.startsWith("[") || !sanitized.endsWith("]")) {
    throw new Error("Appraisal response must be a strict JSON array");
  }

  const rawArray = JSON.parse(sanitized);
  if (!Array.isArray(rawArray)) {
    throw new Error("Appraisal response must be a JSON array");
  }

  const normalized = rawArray.map((item: any) => {
    if (item && typeof item === "object") {
      // Resilient riskLevel normalizer
      let risk = String(item.riskLevel || "medium").toLowerCase();
      if (risk.includes("low")) {
        item.riskLevel = "low";
      } else if (risk.includes("high")) {
        item.riskLevel = "high";
      } else {
        item.riskLevel = "medium";
      }

      // Safe number conversion fallbacks
      item.estimatedMarketValue = Math.max(0.01, Number(item.estimatedMarketValue) || 0.01);
      item.feesEstimate = Math.max(0, Number(item.feesEstimate) || 0);
      item.shippingEstimate = Math.max(0, Number(item.shippingEstimate) || 0);
      item.confidence = Math.min(1, Math.max(0, Number(item.confidence) || 0.5));
      item.detectedIssues = Array.isArray(item.detectedIssues) ? item.detectedIssues : [];
    }
    return item;
  });

  return appraisalSchema.parse(normalized);
}

export function buildOpportunities(input: {
  scanRunId: string;
  listings: Array<RawListing & { rawListingId: string }>;
  appraisals: AppraisalResult[];
}): Opportunity[] {
  const appraisalBySourceId = new Map(input.appraisals.map((appraisal) => [appraisal.sourceId, appraisal]));
  const createdAt = new Date().toISOString();

  return input.listings
    .map((listing) => {
      const appraisal = appraisalBySourceId.get(listing.sourceId);
      if (!appraisal || appraisal.confidence < 0.55) return undefined;
      const { netProfit, roiPercent } = calculateRoi({
        askPrice: listing.askPrice,
        estimatedMarketValue: appraisal.estimatedMarketValue,
        feesEstimate: appraisal.feesEstimate,
        shippingEstimate: appraisal.shippingEstimate
      });
      if (netProfit <= 0 || roiPercent <= 0) return undefined;

      return {
        id: `${input.scanRunId}:${listing.sourceId}:opportunity`,
        sourcePlatform: listing.sourcePlatform,
        title: listing.title,
        listingUrl: listing.listingUrl,
        imageUrl: listing.imageUrl,
        askPrice: roundMoney(listing.askPrice),
        estimatedMarketValue: roundMoney(appraisal.estimatedMarketValue),
        feesEstimate: roundMoney(appraisal.feesEstimate),
        shippingEstimate: roundMoney(appraisal.shippingEstimate),
        netProfit,
        roiPercent,
        confidence: appraisal.confidence,
        riskLevel: appraisal.riskLevel,
        reasoningSummary: appraisal.reasoningSummary,
        detectedIssues: appraisal.detectedIssues,
        recommendedAction: appraisal.recommendedAction,
        createdAt,
        scanRunId: input.scanRunId,
        rawListingId: listing.rawListingId
      } satisfies Opportunity;
    })
    .filter((opportunity): opportunity is Opportunity => Boolean(opportunity))
    .sort((a, b) => b.roiPercent - a.roiPercent || b.netProfit - a.netProfit);
}
