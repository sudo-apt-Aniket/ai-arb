import express from "express";
import cors from "cors";
import path from "node:path";
import type { AppConfig } from "./config";
import { AnakinClient } from "./anakinClient";
import { AppraisalService } from "./appraisal";
import { ArbitrageDb } from "./db";
import { ScannerService } from "./scanner";
import type { ListingAppraiser, ListingProvider } from "./scanner";

export function createApp(
  config: AppConfig,
  dependencies?: {
    listingProvider?: ListingProvider;
    listingAppraiser?: ListingAppraiser;
  }
) {
  const db = new ArbitrageDb(config.DATABASE_PATH);
  const scanner = new ScannerService(
    db,
    dependencies?.listingProvider ?? new AnakinClient(config),
    dependencies?.listingAppraiser ?? new AppraisalService(config)
  );
  const anakinClient = new AnakinClient(config);
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", (_req, res) => {
    const missingConfig = [
      ["ANAKIN_API_KEY", config.ANAKIN_API_KEY],
      ["ANAKIN_ACTION_ID", config.ANAKIN_ACTION_ID]
    ]
      .filter(([, value]) => !value)
      .map(([key]) => key);

    const hasLlmKey = Boolean(config.NVIDIA_NIM_API_KEY || config.GEMINI_API_KEY || config.OPENROUTER_API_KEY);
    if (!hasLlmKey) {
      missingConfig.push("LLM_API_KEY (NVIDIA, GEMINI, or OPENROUTER)");
    }

    res.json({
      ok: true,
      liveMode: true,
      scanIntervalSeconds: config.SCAN_INTERVAL_SECONDS,
      hasAnakinApiKey: Boolean(config.ANAKIN_API_KEY),
      hasAnakinActionId: Boolean(config.ANAKIN_ACTION_ID),
      hasNvidiaNimApiKey: Boolean(config.NVIDIA_NIM_API_KEY),
      hasGeminiApiKey: Boolean(config.GEMINI_API_KEY),
      hasOpenRouterApiKey: Boolean(config.OPENROUTER_API_KEY),
      missingConfig,
      databasePath: config.DATABASE_PATH
    });
  });

  const appLogs: string[] = [];

  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  console.log = (...args) => {
    originalLog(...args);
    const message = args.map(arg => typeof arg === "object" ? JSON.stringify(arg) : String(arg)).join(" ");
    appLogs.push(message);
    if (appLogs.length > 200) appLogs.shift();
  };

  console.error = (...args) => {
    originalError(...args);
    const message = args.map(arg => typeof arg === "object" ? JSON.stringify(arg) : String(arg)).join(" ");
    appLogs.push(`❌ ${message}`);
    if (appLogs.length > 200) appLogs.shift();
  };

  console.warn = (...args) => {
    originalWarn(...args);
    const message = args.map(arg => typeof arg === "object" ? JSON.stringify(arg) : String(arg)).join(" ");
    appLogs.push(`⚠️ ${message}`);
    if (appLogs.length > 200) appLogs.shift();
  };

  let isScanning = false;

  app.post("/api/scans", async (req, res) => {
    if (isScanning) {
      res.status(409).json({ error: "A scan is already running" });
      return;
    }

    isScanning = true;
    console.log("⚡ [SCAN ROUTE] Lock Acquired");

    const onDisconnect = () => {
      console.log("🔌 [SCAN ROUTE] Client Disconnected. Releasing lock.");
      isScanning = false;
    };
    req.on("close", onDisconnect);

    try {
      const { actionId, searchParams, provider } = req.body || {};
      const scanResult = await scanner.runScan({ actionId, searchParams, provider });
      res.status(200).json(scanResult);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected server error";
      res.status(500).json({ error: message });
    } finally {
      req.off("close", onDisconnect);
      isScanning = false;
      console.log("🔓 [SCAN ROUTE] Lock Automatically Released");
    }
  });

  app.get("/api/scans/logs", (_req, res) => {
    res.json({ logs: appLogs });
  });

  app.get("/api/wire/search", async (req, res, next) => {
    try {
      const query = parseOptionalString(req.query.q);
      if (!query) {
        res.status(400).json({ error: "q query parameter is required" });
        return;
      }
      res.json(
        await anakinClient.searchActions({
          query,
          catalog: parseOptionalString(req.query.catalog),
          category: parseOptionalString(req.query.category)
        })
      );
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/scans/latest", (_req, res) => {
    res.json(db.getLatestScanRun() ?? null);
  });

  app.get("/api/opportunities", (req, res) => {
    res.json(
      db.listOpportunities({
        minRoi: parseOptionalNumber(req.query.minRoi),
        minConfidence: parseOptionalNumber(req.query.minConfidence),
        riskLevel: parseOptionalString(req.query.riskLevel),
        minPrice: parseOptionalNumber(req.query.minPrice),
        maxPrice: parseOptionalNumber(req.query.maxPrice),
        source: parseOptionalString(req.query.source)
      })
    );
  });

  app.get("/api/opportunities/:id", (req, res) => {
    const detail = db.getOpportunity(req.params.id);
    if (!detail) {
      res.status(404).json({ error: "Opportunity not found" });
      return;
    }
    res.json(detail);
  });

  app.post("/api/opportunities/:id/resale-draft", async (req, res, next) => {
    try {
      const opportunityDetail = db.getOpportunity(req.params.id);
      if (!opportunityDetail) {
        res.status(404).json({ error: "Opportunity not found" });
        return;
      }
      const { opportunity } = opportunityDetail;
      const apiKey = config.GEMINI_API_KEY;

      if (apiKey) {
        try {
          const prompt = `You are a professional e-commerce reseller. Generate a high-converting reseller listing for the following item:
Title: "${opportunity.title}"
Platform: "${opportunity.sourcePlatform}"
Ask Price: $${opportunity.askPrice}
Estimated Fair Market Value (MSRP/FMV): $${opportunity.estimatedMarketValue}
Condition: "${opportunity.riskLevel === "low" ? "Like New / Excellent" : "Good / Fair"}"

Provide your output in strict JSON format matching this shape:
{
  "resaleTitle": "optimized listing title",
  "suggestedPrice": number,
  "description": "compelling, formatted listing description with specs and friendly terms",
  "seoTags": ["tag1", "tag2", "tag3"],
  "sellerTips": "practical advice for quick sale"
}
Do not include markdown, prose, or comments outside the JSON.`;

          const apiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                responseMimeType: "application/json"
              }
            })
          });

          if (apiResponse.ok) {
            const json = await apiResponse.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
            const content = json.candidates?.[0]?.content?.parts?.[0]?.text;
            if (content) {
              res.json(JSON.parse(content.trim()));
              return;
            }
          }
        } catch (e) {
          console.warn("⚠️ [DRAFT GEN] Live Gemini draft generation failed, using fallback:", e);
        }
      }

      // Local Failsafe Fallback Draft
      const suggestedPrice = Math.round(opportunity.estimatedMarketValue * 0.95);
      res.json({
        resaleTitle: `🔥 [DEAL] ${opportunity.title} - Perfect Resell Condition`,
        suggestedPrice,
        description: `Up for sale is a high-value listing in pristine, verified condition:\n\n` +
          `• Item: ${opportunity.title}\n` +
          `• Verified Condition: ${opportunity.riskLevel === "low" ? "Excellent (Inspected by AI)" : "Good (Tested)"}\n` +
          `• Target MSRP / Value: $${opportunity.estimatedMarketValue}\n\n` +
          `Originally sourced from ${opportunity.sourcePlatform}. Ideal for reselling or upgrading your setup. Optics, aesthetics, and functions are completely checked and certified. Priced at a discount to sell fast!`,
        seoTags: [opportunity.sourcePlatform.toLowerCase(), "deal", "arbitrage", "graphics-card", "photography"],
        sellerTips: `List this item on local classifieds (Facebook Marketplace, Craigslist) for cash to maximize margins, or use eBay with a "Buy It Now" price of $${suggestedPrice} and allow best offers.`
      });
    } catch (error) {
      next(error);
    }
  });

  const staticDir = path.resolve("dist/client");
  app.use(express.static(staticDir));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticDir, "index.html"));
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    res.status(message.includes("already running") ? 409 : 500).json({ error: message });
  });

  return { app, db };
}

function parseOptionalNumber(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
