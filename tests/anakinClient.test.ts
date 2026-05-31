import { afterEach, describe, expect, it, vi } from "vitest";
import { AnakinClient, buildAnakinTaskRequestBody, normalizeWirePayload } from "../server/src/anakinClient";
import { appConfig } from "../server/src/config";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("normalizeWirePayload", () => {
  it("normalizes nested Anakin listing arrays", () => {
    const listings = normalizeWirePayload({
      status: "completed",
      result: {
        listings: [
          {
            id: "abc",
            platform: "Shop",
            title: "Camera",
            url: "https://example.com",
            image: "https://example.com/img.jpg",
            price: "$120.00",
            currency: "USD"
          }
        ]
      }
    });

    expect(listings[0]).toMatchObject({
      sourceId: "abc",
      sourcePlatform: "Shop",
      title: "Camera",
      askPrice: 120
    });
  });
});

describe("buildAnakinTaskRequestBody", () => {
  it("includes the API key, action id, and search params expected by Wire", () => {
    expect(
      buildAnakinTaskRequestBody({
        actionId: "catalog.action",
        params: { query: "used camera", limit: 20 }
      })
    ).toEqual({
      action_id: "catalog.action",
      params: { query: "used camera", limit: 20 }
    });
  });
});

describe("AnakinClient", () => {
  it("creates a live Wire task, polls the job, and normalizes the final payload", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ job_id: "job-1" }))
      .mockResolvedValueOnce(
        jsonResponse({
          status: "completed",
          result: {
            listings: [
              {
                id: "wire-1",
                platform: "WireShop",
                title: "Underpriced Lens",
                url: "https://example.com/lens",
                price: 250,
                currency: "USD"
              }
            ]
          }
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const client = new AnakinClient({
      ...appConfig,
      ANAKIN_WIRE_BASE_URL: "https://api.anakin.io/v1/wire",
      ANAKIN_API_KEY: "wire-key",
      ANAKIN_ACTION_ID: "ecommerce.search",
      ANAKIN_SEARCH_PARAMS: { query: "lens", limit: 10 }
    });

    const listings = await client.fetchListings();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.anakin.io/v1/wire/task",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-API-Key": "wire-key" }),
        body: JSON.stringify({
          action_id: "ecommerce.search",
          params: { query: "lens", limit: 10 }
        })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.anakin.io/v1/wire/jobs/job-1",
      expect.objectContaining({
        headers: { "X-API-Key": "wire-key", Authorization: "Bearer wire-key" }
      })
    );
    expect(listings[0]).toMatchObject({
      sourceId: "wire-1",
      sourcePlatform: "WireShop",
      title: "Underpriced Lens",
      askPrice: 250
    });
  });

  it("searches Wire actions for action_id discovery", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ data: [{ action_id: "amazon.product" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new AnakinClient({
      ...appConfig,
      ANAKIN_WIRE_BASE_URL: "https://api.anakin.io/v1/wire",
      ANAKIN_API_KEY: "wire-key"
    });

    await expect(client.searchActions({ query: "amazon", category: "e-commerce" })).resolves.toEqual({
      data: [{ action_id: "amazon.product" }]
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.anakin.io/v1/wire/search?q=amazon&category=e-commerce",
      expect.objectContaining({
        headers: { "X-API-Key": "wire-key", Authorization: "Bearer wire-key" }
      })
    );
  });
});

function jsonResponse(body: unknown) {
  return {
    ok: true,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body))
  };
}
