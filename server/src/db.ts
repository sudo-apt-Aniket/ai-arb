import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { Opportunity, RawListing, ScanRun } from "./types";

type DbParam = string | number | null;
type Statement = {
  run: (...params: DbParam[]) => { changes: number; lastInsertRowid: number | bigint };
  get: (...params: DbParam[]) => Record<string, unknown> | undefined;
  all: (...params: DbParam[]) => Array<Record<string, unknown>>;
};
type SQLiteDatabase = {
  exec: (sql: string) => void;
  prepare: (sql: string) => Statement;
  close: () => void;
};

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:" + "sqlite") as {
  DatabaseSync: new (path: string) => SQLiteDatabase;
};

export class ArbitrageDb {
  private db: SQLiteDatabase;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.migrate();
  }

  close() {
    this.db.close();
  }

  createScanRun(id: string) {
    const startedAt = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO scan_runs (id, status, started_at, listing_count, opportunity_count) VALUES (?, 'running', ?, 0, 0)"
      )
      .run(id, startedAt);
    return this.getScanRun(id)!;
  }

  completeScanRun(id: string, listingCount: number, opportunityCount: number) {
    this.db
      .prepare(
        "UPDATE scan_runs SET status = 'completed', completed_at = ?, listing_count = ?, opportunity_count = ? WHERE id = ?"
      )
      .run(new Date().toISOString(), listingCount, opportunityCount, id);
  }

  failScanRun(id: string, errorMessage: string) {
    this.db
      .prepare("UPDATE scan_runs SET status = 'failed', completed_at = ?, error_message = ? WHERE id = ?")
      .run(new Date().toISOString(), errorMessage, id);
  }

  insertRawListing(scanRunId: string, listing: RawListing) {
    const id = `${scanRunId}:${listing.sourcePlatform}:${listing.sourceId}`;
    this.db
      .prepare(
        `INSERT INTO raw_listings
        (id, scan_run_id, source_platform, source_id, title, listing_url, image_url, ask_price, currency, location, condition, metadata_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        scanRunId,
        listing.sourcePlatform,
        listing.sourceId,
        listing.title,
        listing.listingUrl,
        listing.imageUrl,
        listing.askPrice,
        listing.currency,
        listing.location ?? "",
        listing.condition ?? "",
        JSON.stringify(listing.metadata),
        new Date().toISOString()
      );
    return id;
  }

  insertOpportunity(opportunity: Opportunity) {
    this.db
      .prepare(
        `INSERT INTO opportunities
        (id, scan_run_id, raw_listing_id, source_platform, title, listing_url, image_url, ask_price,
         estimated_market_value, fees_estimate, shipping_estimate, net_profit, roi_percent,
         confidence, risk_level, reasoning_summary, detected_issues_json, recommended_action, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        opportunity.id,
        opportunity.scanRunId,
        opportunity.rawListingId,
        opportunity.sourcePlatform,
        opportunity.title,
        opportunity.listingUrl,
        opportunity.imageUrl,
        opportunity.askPrice,
        opportunity.estimatedMarketValue,
        opportunity.feesEstimate,
        opportunity.shippingEstimate,
        opportunity.netProfit,
        opportunity.roiPercent,
        opportunity.confidence,
        opportunity.riskLevel,
        opportunity.reasoningSummary,
        JSON.stringify(opportunity.detectedIssues),
        opportunity.recommendedAction,
        opportunity.createdAt
      );
  }

  listOpportunities(filters: {
    minRoi?: number;
    minConfidence?: number;
    riskLevel?: string;
    minPrice?: number;
    maxPrice?: number;
    source?: string;
  }) {
    const where: string[] = [];
    const params: DbParam[] = [];

    if (filters.minRoi !== undefined) {
      where.push("roi_percent >= ?");
      params.push(filters.minRoi);
    }
    if (filters.minConfidence !== undefined) {
      where.push("confidence >= ?");
      params.push(filters.minConfidence);
    }
    if (filters.riskLevel) {
      where.push("risk_level = ?");
      params.push(filters.riskLevel);
    }
    if (filters.minPrice !== undefined) {
      where.push("ask_price >= ?");
      params.push(filters.minPrice);
    }
    if (filters.maxPrice !== undefined) {
      where.push("ask_price <= ?");
      params.push(filters.maxPrice);
    }
    if (filters.source) {
      where.push("source_platform = ?");
      params.push(filters.source);
    }

    const sql = `SELECT * FROM opportunities ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY roi_percent DESC, net_profit DESC`;
    return this.db.prepare(sql).all(...params).map(rowToOpportunity);
  }

  getOpportunity(id: string) {
    const opportunityRow = this.db.prepare("SELECT * FROM opportunities WHERE id = ?").get(id);
    if (!opportunityRow) return undefined;
    const rawRow = this.db.prepare("SELECT * FROM raw_listings WHERE id = ?").get(String(opportunityRow.raw_listing_id));
    return {
      opportunity: rowToOpportunity(opportunityRow),
      rawListing: rawRow ? rowToRawListing(rawRow) : undefined
    };
  }

  getLatestScanRun() {
    const row = this.db.prepare("SELECT * FROM scan_runs ORDER BY started_at DESC LIMIT 1").get();
    return row ? rowToScanRun(row) : undefined;
  }

  getScanRun(id: string) {
    const row = this.db.prepare("SELECT * FROM scan_runs WHERE id = ?").get(id);
    return row ? rowToScanRun(row) : undefined;
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scan_runs (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        listing_count INTEGER NOT NULL DEFAULT 0,
        opportunity_count INTEGER NOT NULL DEFAULT 0,
        error_message TEXT
      );

      CREATE TABLE IF NOT EXISTS raw_listings (
        id TEXT PRIMARY KEY,
        scan_run_id TEXT NOT NULL REFERENCES scan_runs(id),
        source_platform TEXT NOT NULL,
        source_id TEXT NOT NULL,
        title TEXT NOT NULL,
        listing_url TEXT NOT NULL,
        image_url TEXT NOT NULL,
        ask_price REAL NOT NULL,
        currency TEXT NOT NULL,
        location TEXT,
        condition TEXT,
        metadata_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS opportunities (
        id TEXT PRIMARY KEY,
        scan_run_id TEXT NOT NULL REFERENCES scan_runs(id),
        raw_listing_id TEXT NOT NULL REFERENCES raw_listings(id),
        source_platform TEXT NOT NULL,
        title TEXT NOT NULL,
        listing_url TEXT NOT NULL,
        image_url TEXT NOT NULL,
        ask_price REAL NOT NULL,
        estimated_market_value REAL NOT NULL,
        fees_estimate REAL NOT NULL,
        shipping_estimate REAL NOT NULL,
        net_profit REAL NOT NULL,
        roi_percent REAL NOT NULL,
        confidence REAL NOT NULL,
        risk_level TEXT NOT NULL,
        reasoning_summary TEXT NOT NULL,
        detected_issues_json TEXT NOT NULL,
        recommended_action TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    try {
      const countRow = this.db.prepare("SELECT COUNT(*) as count FROM opportunities").get() as { count: number };
      if (!countRow || countRow.count === 0) {
        this.seedOpportunities();
      }
    } catch (e) {
      console.warn("⚠️ [DATABASE] Seeding check failed:", e);
    }
  }

  private seedOpportunities() {
    console.log("🌱 [DATABASE] Seeding initial catalog of high-value arbitrage opportunities...");
    
    const scanRunId = "seed-scan-run";
    const startedAt = new Date().toISOString();
    
    this.db.prepare(
      "INSERT OR IGNORE INTO scan_runs (id, status, started_at, completed_at, listing_count, opportunity_count) VALUES (?, 'completed', ?, ?, 5, 3)"
    ).run(scanRunId, startedAt, startedAt);

    const seedListings = [
      {
        id: "seed-1",
        platform: "eBay",
        title: "NVIDIA GeForce RTX 4070 Founders Edition 12GB - Used Like New",
        url: "https://www.ebay.com/itm/rtx-4070-fe",
        image: "https://images.unsplash.com/photo-1591488320449-011701bb6704?auto=format&fit=crop&w=300&q=80",
        price: 420,
        fmv: 560,
        fees: 42,
        shipping: 12,
        netProfit: 86,
        roi: 20.5,
        confidence: 0.92,
        risk: "low",
        reason: "Excellent condition Founders Edition. Comparable recent eBay sales average $550-$580. Solid buyer rating.",
        issues: ["Out of original box"],
        action: "Purchase immediately; FE models hold value well."
      },
      {
        id: "seed-2",
        platform: "Craigslist",
        title: "Sony Alpha a7 III Mirrorless Camera Body - Great Condition",
        url: "https://newyork.craigslist.org/sony-a7iii",
        image: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=300&q=80",
        price: 850,
        fmv: 1150,
        fees: 0,
        shipping: 15,
        netProfit: 285,
        roi: 33.5,
        confidence: 0.88,
        risk: "medium",
        reason: "Well under market. Craigslist local cash deal, shutter count is low (12k). Comps sell for $1100+ on swappa.",
        issues: ["Minor scratch on lower bezel", "No battery charger included"],
        action: "Meet locally at a public bank to verify shutter count and cash purchase."
      },
      {
        id: "seed-3",
        platform: "Facebook Marketplace",
        title: "Canon RF 50mm f/1.2 L USM Lens - Pristine",
        url: "https://www.facebook.com/marketplace/rf-50",
        image: "https://images.unsplash.com/photo-1617005082133-548c4dd27f35?auto=format&fit=crop&w=300&q=80",
        price: 1350,
        fmv: 1750,
        fees: 40,
        shipping: 0,
        netProfit: 360,
        roi: 26.6,
        confidence: 0.95,
        risk: "low",
        reason: "L-series professional prime lens. Extremely clean optics, seller has multiple high ratings. Est market price is $1700-$1800.",
        issues: [],
        action: "Highly recommended buy. Optics are clean and market demand for Canon L RF glass is extremely high."
      }
    ];

    for (const item of seedListings) {
      const rawListingId = `${scanRunId}:${item.platform}:${item.id}`;
      this.db.prepare(`
        INSERT OR IGNORE INTO raw_listings 
        (id, scan_run_id, source_platform, source_id, title, listing_url, image_url, ask_price, currency, location, condition, metadata_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'USD', 'USA', 'Used', '{}', ?)
      `).run(rawListingId, scanRunId, item.platform, item.id, item.title, item.url, item.image, item.price, startedAt);

      this.db.prepare(`
        INSERT OR IGNORE INTO opportunities
        (id, scan_run_id, raw_listing_id, source_platform, title, listing_url, image_url, ask_price,
         estimated_market_value, fees_estimate, shipping_estimate, net_profit, roi_percent,
         confidence, risk_level, reasoning_summary, detected_issues_json, recommended_action, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `${scanRunId}:${item.id}:opportunity`,
        scanRunId,
        rawListingId,
        item.platform,
        item.title,
        item.url,
        item.image,
        item.price,
        item.fmv,
        item.fees,
        item.shipping,
        item.netProfit,
        item.roi,
        item.confidence,
        item.risk,
        item.reason,
        JSON.stringify(item.issues),
        item.action,
        startedAt
      );
    }
  }
}

function rowToOpportunity(row: Record<string, unknown>): Opportunity {
  return {
    id: String(row.id),
    sourcePlatform: String(row.source_platform),
    title: String(row.title),
    listingUrl: String(row.listing_url),
    imageUrl: String(row.image_url),
    askPrice: Number(row.ask_price),
    estimatedMarketValue: Number(row.estimated_market_value),
    feesEstimate: Number(row.fees_estimate),
    shippingEstimate: Number(row.shipping_estimate),
    netProfit: Number(row.net_profit),
    roiPercent: Number(row.roi_percent),
    confidence: Number(row.confidence),
    riskLevel: row.risk_level as Opportunity["riskLevel"],
    reasoningSummary: String(row.reasoning_summary),
    detectedIssues: JSON.parse(String(row.detected_issues_json)) as string[],
    recommendedAction: String(row.recommended_action),
    createdAt: String(row.created_at),
    scanRunId: String(row.scan_run_id),
    rawListingId: String(row.raw_listing_id)
  };
}

function rowToRawListing(row: Record<string, unknown>): RawListing {
  return {
    sourcePlatform: String(row.source_platform),
    sourceId: String(row.source_id),
    title: String(row.title),
    listingUrl: String(row.listing_url),
    imageUrl: String(row.image_url),
    askPrice: Number(row.ask_price),
    currency: String(row.currency),
    location: String(row.location || ""),
    condition: String(row.condition || ""),
    metadata: JSON.parse(String(row.metadata_json))
  };
}

function rowToScanRun(row: Record<string, unknown>): ScanRun {
  return {
    id: String(row.id),
    status: row.status as ScanRun["status"],
    startedAt: String(row.started_at),
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
    listingCount: Number(row.listing_count),
    opportunityCount: Number(row.opportunity_count),
    errorMessage: row.error_message ? String(row.error_message) : undefined
  };
}
