import { randomUUID } from "node:crypto";
import { buildOpportunities, type AppraisalResult } from "./appraisal";
import type { ArbitrageDb } from "./db";
import type { RawListing } from "./types";

export interface ListingProvider {
  fetchListings(options?: { actionId?: string; searchParams?: Record<string, unknown> }): Promise<RawListing[]>;
}

export interface ListingAppraiser {
  appraise(listings: RawListing[], options?: { provider?: string }): Promise<AppraisalResult[]>;
}

export interface ScanOptions {
  actionId?: string;
  searchParams?: Record<string, unknown>;
  provider?: string;
}

export class ScannerService {
  private runningScan: Promise<unknown> | undefined;

  constructor(
    private readonly db: ArbitrageDb,
    private readonly anakinClient: ListingProvider,
    private readonly appraisalService: ListingAppraiser
  ) {}

  async runScan(options?: ScanOptions) {
    if (this.runningScan) {
      throw new Error("A scan is already running");
    }

    const scanRunId = randomUUID();
    this.db.createScanRun(scanRunId);

    try {
      this.runningScan = this.executeScan(scanRunId, options);
      await this.runningScan;
      return this.db.getScanRun(scanRunId)!;
    } finally {
      this.runningScan = undefined;
    }
  }

  private async executeScan(scanRunId: string, options?: ScanOptions) {
    try {
      const listings = await this.anakinClient.fetchListings(options);
      const persistedListings = listings.map((listing) => ({
        ...listing,
        rawListingId: this.db.insertRawListing(scanRunId, listing)
      }));
      const appraisals = await this.appraisalService.appraise(listings, options);
      const opportunities = buildOpportunities({ scanRunId, listings: persistedListings, appraisals });
      for (const opportunity of opportunities) {
        this.db.insertOpportunity(opportunity);
      }
      this.db.completeScanRun(scanRunId, listings.length, opportunities.length);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown scan failure";
      this.db.failScanRun(scanRunId, message);
      throw error;
    }
  }
}
