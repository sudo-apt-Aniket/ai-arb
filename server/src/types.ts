export type RiskLevel = "low" | "medium" | "high";

export interface RawListing {
  sourcePlatform: string;
  sourceId: string;
  title: string;
  listingUrl: string;
  imageUrl: string;
  askPrice: number;
  currency: string;
  location?: string;
  condition?: string;
  metadata: Record<string, unknown>;
}

export interface Opportunity {
  id: string;
  sourcePlatform: string;
  title: string;
  listingUrl: string;
  imageUrl: string;
  askPrice: number;
  estimatedMarketValue: number;
  feesEstimate: number;
  shippingEstimate: number;
  netProfit: number;
  roiPercent: number;
  confidence: number;
  riskLevel: RiskLevel;
  reasoningSummary: string;
  detectedIssues: string[];
  recommendedAction: string;
  createdAt: string;
  scanRunId: string;
  rawListingId: string;
}

export interface ScanRun {
  id: string;
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
  listingCount: number;
  opportunityCount: number;
  errorMessage?: string;
}
