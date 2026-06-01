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

class MockDatabaseSync implements SQLiteDatabase {
  private scanRuns = new Map<string, any>();
  private rawListings = new Map<string, any>();
  private opportunities = new Map<string, any>();

  constructor(path: string) {
    console.log("⚠️ [DATABASE] SQLite fallback activated: node:sqlite not supported. Operating in-memory.");
  }

  exec(sql: string) {
    // No-op for mock DB setup
  }

  close() {}

  prepare(sql: string): Statement {
    const normalized = sql.trim().replace(/\s+/g, " ");

    // 1. SELECT COUNT(*) as count FROM opportunities
    if (normalized.includes("SELECT COUNT(*) as count FROM opportunities")) {
      return {
        run: () => ({ changes: 0, lastInsertRowid: 0 }),
        get: () => ({ count: this.opportunities.size }),
        all: () => [{ count: this.opportunities.size }]
      };
    }

    // 2. INSERT OR IGNORE INTO scan_runs or INSERT INTO scan_runs
    if (normalized.startsWith("INSERT INTO scan_runs") || normalized.startsWith("INSERT OR IGNORE INTO scan_runs")) {
      return {
        run: (...params: DbParam[]) => {
          let id, status, started_at, completed_at, listing_count, opportunity_count, error_message;
          if (normalized.includes("running")) {
            id = params[0] as string;
            status = "running";
            started_at = params[1] as string;
            completed_at = null;
            listing_count = 0;
            opportunity_count = 0;
            error_message = null;
          } else {
            id = params[0] as string;
            status = "completed";
            started_at = params[1] as string;
            completed_at = params[2] as string;
            listing_count = 5;
            opportunity_count = 3;
            error_message = null;
          }
          this.scanRuns.set(id, {
            id,
            status,
            started_at,
            completed_at,
            listing_count,
            opportunity_count,
            error_message
          });
          return { changes: 1, lastInsertRowid: 0 };
        },
        get: () => undefined,
        all: () => []
      };
    }

    // 3. UPDATE scan_runs SET status = 'completed' ... WHERE id = ?
    if (normalized.startsWith("UPDATE scan_runs SET status = 'completed'")) {
      return {
        run: (...params: DbParam[]) => {
          const completed_at = params[0] as string;
          const listing_count = params[1] as number;
          const opportunity_count = params[2] as number;
          const id = params[3] as string;
          const run = this.scanRuns.get(id);
          if (run) {
            run.status = "completed";
            run.completed_at = completed_at;
            run.listing_count = listing_count;
            run.opportunity_count = opportunity_count;
          }
          return { changes: 1, lastInsertRowid: 0 };
        },
        get: () => undefined,
        all: () => []
      };
    }

    // 4. UPDATE scan_runs SET status = 'failed' ... WHERE id = ?
    if (normalized.startsWith("UPDATE scan_runs SET status = 'failed'")) {
      return {
        run: (...params: DbParam[]) => {
          const completed_at = params[0] as string;
          const error_message = params[1] as string;
          const id = params[2] as string;
          const run = this.scanRuns.get(id);
          if (run) {
            run.status = "failed";
            run.completed_at = completed_at;
            run.error_message = error_message;
          }
          return { changes: 1, lastInsertRowid: 0 };
        },
        get: () => undefined,
        all: () => []
      };
    }

    // 5. INSERT OR IGNORE INTO raw_listings or INSERT INTO raw_listings
    if (normalized.startsWith("INSERT INTO raw_listings") || normalized.startsWith("INSERT OR IGNORE INTO raw_listings")) {
      return {
        run: (...params: DbParam[]) => {
          let id, scan_run_id, source_platform, source_id, title, listing_url, image_url, ask_price, currency, location, condition, metadata_json, created_at;
          
          if (params.length === 9) {
            id = params[0] as string;
            scan_run_id = params[1] as string;
            source_platform = params[2] as string;
            source_id = params[3] as string;
            title = params[4] as string;
            listing_url = params[5] as string;
            image_url = params[6] as string;
            ask_price = params[7] as number;
            currency = "USD";
            location = "USA";
            condition = "Used";
            metadata_json = "{}";
            created_at = params[8] as string;
          } else {
            id = params[0] as string;
            scan_run_id = params[1] as string;
            source_platform = params[2] as string;
            source_id = params[3] as string;
            title = params[4] as string;
            listing_url = params[5] as string;
            image_url = params[6] as string;
            ask_price = params[7] as number;
            currency = params[8] as string;
            location = params[9] as string;
            condition = params[10] as string;
            metadata_json = params[11] as string;
            created_at = params[12] as string;
          }

          this.rawListings.set(id, {
            id,
            scan_run_id,
            source_platform,
            source_id,
            title,
            listing_url,
            image_url,
            ask_price,
            currency,
            location,
            condition,
            metadata_json,
            created_at
          });
          return { changes: 1, lastInsertRowid: 0 };
        },
        get: () => undefined,
        all: () => []
      };
    }

    // 6. INSERT OR IGNORE INTO opportunities or INSERT INTO opportunities
    if (normalized.startsWith("INSERT INTO opportunities") || normalized.startsWith("INSERT OR IGNORE INTO opportunities")) {
      return {
        run: (...params: DbParam[]) => {
          const id = params[0] as string;
          const scan_run_id = params[1] as string;
          const raw_listing_id = params[2] as string;
          const source_platform = params[3] as string;
          const title = params[4] as string;
          const listing_url = params[5] as string;
          const image_url = params[6] as string;
          const ask_price = params[7] as number;
          const estimated_market_value = params[8] as number;
          const fees_estimate = params[9] as number;
          const shipping_estimate = params[10] as number;
          const net_profit = params[11] as number;
          const roi_percent = params[12] as number;
          const confidence = params[13] as number;
          const risk_level = params[14] as string;
          const reasoning_summary = params[15] as string;
          const detected_issues_json = params[16] as string;
          const recommended_action = params[17] as string;
          const created_at = params[18] as string;

          this.opportunities.set(id, {
            id,
            scan_run_id,
            raw_listing_id,
            source_platform,
            title,
            listing_url,
            image_url,
            ask_price,
            estimated_market_value,
            fees_estimate,
            shipping_estimate,
            net_profit,
            roi_percent,
            confidence,
            risk_level,
            reasoning_summary,
            detected_issues_json,
            recommended_action,
            created_at
          });
          return { changes: 1, lastInsertRowid: 0 };
        },
        get: () => undefined,
        all: () => []
      };
    }

    // 7. SELECT * FROM opportunities WHERE id = ?
    if (normalized.startsWith("SELECT * FROM opportunities WHERE id = ?")) {
      return {
        run: () => ({ changes: 0, lastInsertRowid: 0 }),
        get: (...params: DbParam[]) => {
          const id = params[0] as string;
          return this.opportunities.get(id);
        },
        all: (...params: DbParam[]) => {
          const id = params[0] as string;
          const val = this.opportunities.get(id);
          return val ? [val] : [];
        }
      };
    }

    // 8. SELECT * FROM raw_listings WHERE id = ?
    if (normalized.startsWith("SELECT * FROM raw_listings WHERE id = ?")) {
      return {
        run: () => ({ changes: 0, lastInsertRowid: 0 }),
        get: (...params: DbParam[]) => {
          const id = params[0] as string;
          return this.rawListings.get(id);
        },
        all: (...params: DbParam[]) => {
          const id = params[0] as string;
          const val = this.rawListings.get(id);
          return val ? [val] : [];
        }
      };
    }

    // 9. SELECT * FROM scan_runs WHERE id = ?
    if (normalized.startsWith("SELECT * FROM scan_runs WHERE id = ?")) {
      return {
        run: () => ({ changes: 0, lastInsertRowid: 0 }),
        get: (...params: DbParam[]) => {
          const id = params[0] as string;
          return this.scanRuns.get(id);
        },
        all: (...params: DbParam[]) => {
          const id = params[0] as string;
          const val = this.scanRuns.get(id);
          return val ? [val] : [];
        }
      };
    }

    // 10. SELECT * FROM scan_runs ORDER BY started_at DESC LIMIT 1
    if (normalized.startsWith("SELECT * FROM scan_runs ORDER BY started_at DESC")) {
      return {
        run: () => ({ changes: 0, lastInsertRowid: 0 }),
        get: () => {
          const runs = Array.from(this.scanRuns.values());
          if (runs.length === 0) return undefined;
          runs.sort((a, b) => b.started_at.localeCompare(a.started_at));
          return runs[0];
        },
        all: () => {
          const runs = Array.from(this.scanRuns.values());
          if (runs.length === 0) return [];
          runs.sort((a, b) => b.started_at.localeCompare(a.started_at));
          return [runs[0]];
        }
      };
    }

    // 11. SELECT * FROM opportunities ... ORDER BY roi_percent DESC, net_profit DESC
    if (normalized.startsWith("SELECT * FROM opportunities")) {
      return {
        run: () => ({ changes: 0, lastInsertRowid: 0 }),
        get: (...params: DbParam[]) => {
          const results = this.filterOpportunities(normalized, params);
          return results[0];
        },
        all: (...params: DbParam[]) => {
          return this.filterOpportunities(normalized, params);
        }
      };
    }

    throw new Error(`MockDatabaseSync query not implemented: ${sql}`);
  }

  private filterOpportunities(sql: string, params: DbParam[]): any[] {
    let results = Array.from(this.opportunities.values());
    const whereIndex = sql.indexOf(" WHERE ");
    if (whereIndex !== -1) {
      const orderByIndex = sql.indexOf(" ORDER BY");
      const whereClause = orderByIndex !== -1 
        ? sql.slice(whereIndex + 7, orderByIndex) 
        : sql.slice(whereIndex + 7);
      const conditions = whereClause.split(" AND ").map(c => c.trim());
      for (let i = 0; i < conditions.length; i++) {
        const condition = conditions[i];
        const val = params[i];
        if (condition.includes("roi_percent >= ?")) {
          results = results.filter(r => r.roi_percent >= (val as number));
        } else if (condition.includes("confidence >= ?")) {
          results = results.filter(r => r.confidence >= (val as number));
        } else if (condition.includes("risk_level = ?")) {
          results = results.filter(r => r.risk_level === val);
        } else if (condition.includes("ask_price >= ?")) {
          results = results.filter(r => r.ask_price >= (val as number));
        } else if (condition.includes("ask_price <= ?")) {
          results = results.filter(r => r.ask_price <= (val as number));
        } else if (condition.includes("source_platform = ?")) {
          results = results.filter(r => r.source_platform === val);
        }
      }
    }
    results.sort((a, b) => {
      if (b.roi_percent !== a.roi_percent) {
        return b.roi_percent - a.roi_percent;
      }
      return b.net_profit - a.net_profit;
    });
    return results;
  }
}

const require = createRequire(process.cwd());
let DatabaseSyncClass: new (path: string) => SQLiteDatabase;

try {
  const { DatabaseSync } = require("node:" + "sqlite") as {
    DatabaseSync: new (path: string) => SQLiteDatabase;
  };
  DatabaseSyncClass = DatabaseSync;
} catch (e) {
  console.warn("⚠️ [DATABASE] node:sqlite could not be loaded. Falling back to MockDatabaseSync.", e);
  DatabaseSyncClass = MockDatabaseSync as any;
}

export class ArbitrageDb {
  private db: SQLiteDatabase;

  constructor(dbPath: string) {
    if (DatabaseSyncClass === (MockDatabaseSync as any)) {
      this.db = new MockDatabaseSync(dbPath) as any;
    } else {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      this.db = new DatabaseSyncClass(dbPath);
      this.db.exec("PRAGMA journal_mode = WAL;");
      this.db.exec("PRAGMA foreign_keys = ON;");
    }
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
