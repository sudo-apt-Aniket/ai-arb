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
  riskLevel: "low" | "medium" | "high";
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

export interface Health {
  ok: boolean;
  liveMode: boolean;
  scanIntervalSeconds: number;
  hasAnakinApiKey: boolean;
  hasAnakinActionId: boolean;
  hasNvidiaNimApiKey: boolean;
  hasGeminiApiKey: boolean;
  hasOpenRouterApiKey: boolean;
  missingConfig: string[];
}

export async function getHealth(): Promise<Health> {
  return request("/api/health");
}

export interface DiscoveredAction {
  action_id: string;
  name: string;
  description?: string;
  catalog_slug?: string;
}

export async function triggerScan(
  actionId?: string,
  searchParams?: Record<string, unknown>,
  provider?: string
): Promise<ScanRun> {
  return request("/api/scans", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actionId, searchParams, provider })
  });
}

export async function getLogs(): Promise<{ logs: string[] }> {
  return request("/api/scans/logs");
}

export async function searchWireActions(query: string): Promise<{ data: DiscoveredAction[] }> {
  return request(`/api/wire/search?q=${encodeURIComponent(query)}`);
}

export async function getLatestScan(): Promise<ScanRun | null> {
  return request("/api/scans/latest");
}

export async function getOpportunities(filters: Record<string, string | number | undefined>): Promise<Opportunity[]> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return request(`/api/opportunities?${params.toString()}`);
}

export async function getOpportunityDetail(id: string): Promise<{ opportunity: Opportunity; rawListing: unknown }> {
  return request(`/api/opportunities/${encodeURIComponent(id)}`);
}

export interface ResaleDraft {
  resaleTitle: string;
  suggestedPrice: number;
  description: string;
  seoTags: string[];
  sellerTips: string;
}

export async function getResaleDraft(id: string): Promise<ResaleDraft> {
  return request(`/api/opportunities/${encodeURIComponent(id)}/resale-draft`, {
    method: "POST"
  });
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || `Request failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}
