export function calculateRoi(input: {
  askPrice: number;
  estimatedMarketValue: number;
  feesEstimate: number;
  shippingEstimate: number;
}) {
  const totalCost = input.askPrice + input.feesEstimate + input.shippingEstimate;
  const netProfit = roundMoney(input.estimatedMarketValue - totalCost);
  const roiPercent = totalCost > 0 ? roundPercent((netProfit / totalCost) * 100) : 0;

  return { netProfit, roiPercent };
}

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function roundPercent(value: number) {
  return Math.round(value * 10) / 10;
}
