import { describe, expect, it } from "vitest";
import { calculateRoi } from "../server/src/roi";

describe("calculateRoi", () => {
  it("calculates net profit and ROI after costs", () => {
    expect(
      calculateRoi({
        askPrice: 100,
        estimatedMarketValue: 160,
        feesEstimate: 10,
        shippingEstimate: 5
      })
    ).toEqual({ netProfit: 45, roiPercent: 39.1 });
  });
});
