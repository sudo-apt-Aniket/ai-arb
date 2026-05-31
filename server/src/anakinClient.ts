import type { AppConfig } from "./config";
import type { RawListing } from "./types";

interface AnakinTaskResponse {
  job_id?: string;
  id?: string;
}

export class AnakinClient {
  constructor(private readonly config: AppConfig) {}

  async fetchListings(options?: { actionId?: string; searchParams?: Record<string, unknown> }): Promise<RawListing[]> {
    const payload = await this.fetchLivePayload(options);
    return normalizeWirePayload(payload);
  }

  private async fetchLivePayload(options?: { actionId?: string; searchParams?: Record<string, unknown> }) {
    const actionId = options?.actionId ?? this.config.ANAKIN_ACTION_ID;
    const searchParams = options?.searchParams ?? this.config.ANAKIN_SEARCH_PARAMS;

    if (!this.config.ANAKIN_API_KEY || !actionId) {
      throw new Error("ANAKIN_API_KEY and actionId are required");
    }

    const taskResponse = await fetch(`${this.wireBaseUrl}/task`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": this.config.ANAKIN_API_KEY!,
        Authorization: `Bearer ${this.config.ANAKIN_API_KEY!}`
      },
      body: JSON.stringify(
        buildAnakinTaskRequestBody({
          actionId,
          params: searchParams
        })
      )
    });

    if (!taskResponse.ok) {
      throw new Error(`Anakin task request failed: ${taskResponse.status} ${await taskResponse.text()}`);
    }

    const taskJson = (await taskResponse.json()) as AnakinTaskResponse;
    const jobId = taskJson.job_id ?? taskJson.id;
    if (!jobId) throw new Error("Anakin task response did not include a job id");

    console.log(`📡 [WIRE SERVICE] Task Dispatched -> Job ID Registered: ${jobId}`);
    return this.pollJob(jobId);
  }

  private async pollJob(jobId: string) {
    const maxAttempts = 30;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const response = await fetch(`${this.wireBaseUrl}/jobs/${jobId}`, {
        headers: {
          "X-API-Key": this.config.ANAKIN_API_KEY!,
          Authorization: `Bearer ${this.config.ANAKIN_API_KEY!}`
        }
      });

      if (!response.ok) {
        throw new Error(`Anakin job request failed: ${response.status} ${await response.text()}`);
      }

      const json = await response.json();
      const status = getString(json, ["status", "state"]);
      if (status) {
        const lowerStatus = status.toLowerCase();
        const upperStatus = status.toUpperCase();
        if (
          lowerStatus === "completed" ||
          upperStatus === "SUCCESS" ||
          ["succeeded", "success", "done", "completed"].includes(lowerStatus)
        ) {
          return json;
        }
        if (["failed", "error", "cancelled"].includes(lowerStatus)) {
          throw new Error(`Anakin job ${jobId} failed with status ${status}`);
        }
      }

      await sleep(2000);
    }

    throw new Error(`Anakin job ${jobId} did not complete before timeout`);
  }

  async searchActions(input: { query: string; catalog?: string; category?: string }) {
    if (!this.config.ANAKIN_API_KEY) {
      throw new Error("ANAKIN_API_KEY is required");
    }
    const params = new URLSearchParams({ q: input.query });
    if (input.catalog) params.set("catalog", input.catalog);
    if (input.category) params.set("category", input.category);

    const response = await fetch(`${this.wireBaseUrl}/search?${params.toString()}`, {
      headers: {
        "X-API-Key": this.config.ANAKIN_API_KEY!,
        Authorization: `Bearer ${this.config.ANAKIN_API_KEY!}`
      }
    });

    if (!response.ok) {
      throw new Error(`Anakin action search failed: ${response.status} ${await response.text()}`);
    }

    return response.json();
  }

  private get wireBaseUrl() {
    return this.config.ANAKIN_WIRE_BASE_URL.replace(/\/$/, "");
  }
}

export function buildAnakinTaskRequestBody(input: {
  actionId: string;
  params: Record<string, unknown>;
}) {
  return {
    action_id: input.actionId,
    params: input.params
  };
}

export function normalizeWirePayload(payload: unknown): RawListing[] {
  const candidates = findListingArray(payload);
  return candidates.map((item, index) => normalizeListing(item, index)).filter((item): item is RawListing => Boolean(item));
}

function findListingArray(payload: unknown): Record<string, unknown>[] {
  const visited = new Set<unknown>();

  function findArray(val: unknown): Record<string, unknown>[] | null {
    if (!val || typeof val !== "object" || visited.has(val)) return null;
    visited.add(val);

    if (Array.isArray(val)) {
      const records = val.filter(isRecord);
      if (records.length > 0) {
        const hasListingKeys = records.some((item) =>
          ("title" in item || "name" in item || "productName" in item) &&
          ("price" in item || "askPrice" in item || "amount" in item || "current_price" in item)
        );
        if (hasListingKeys) {
          return records;
        }
      }
      for (const item of val) {
        const res = findArray(item);
        if (res) return res;
      }
    } else {
      for (const key of Object.keys(val as Record<string, unknown>)) {
        const res = findArray((val as Record<string, unknown>)[key]);
        if (res) return res;
      }
    }
    return null;
  }

  return findArray(payload) || [];
}

function normalizeListing(item: Record<string, unknown>, index: number): RawListing | undefined {
  const askPrice = getNumber(item, ["askPrice", "price", "current_price", "amount"]);
  const title = getString(item, ["title", "name", "productName"]);
  if (!title || !askPrice || askPrice <= 0) return undefined;

  return {
    sourcePlatform: getString(item, ["sourcePlatform", "platform", "marketplace", "source"]) || "Anakin Wire",
    sourceId: getString(item, ["id", "listingId", "productId", "sku"]) || `listing-${index + 1}`,
    title,
    listingUrl: getString(item, ["listingUrl", "url", "productUrl", "link"]) || "",
    imageUrl: getString(item, ["imageUrl", "image", "thumbnail", "thumbnailUrl"]) || "",
    askPrice,
    currency: getString(item, ["currency"]) || "USD",
    location: getString(item, ["location", "sellerLocation"]),
    condition: getString(item, ["condition", "itemCondition"]),
    metadata: item
  };
}

function getString(source: unknown, keys: string[]) {
  const record = asRecord(source);
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return undefined;
}

function getNumber(source: unknown, keys: string[]) {
  const record = asRecord(source);
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const parsed = Number(value.replace(/[^0-9.]/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function asRecord(value: unknown) {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
