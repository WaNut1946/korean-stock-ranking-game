export const BUY_FEE_RATE = 0.00015;
export const SELL_FEE_RATE = 0.00015;
export const SELL_TAX_RATE = 0.0018;

export function calculateTradeCost({ price, quantity, type }) {
  const grossAmount = Number(price) * Number(quantity);
  const feeRate = type === 'SELL' ? SELL_FEE_RATE : BUY_FEE_RATE;
  const fee = Math.round(grossAmount * feeRate);
  const tax = type === 'SELL' ? Math.round(grossAmount * SELL_TAX_RATE) : 0;
  const settlementAmount = type === 'SELL' ? grossAmount - fee - tax : grossAmount + fee;

  return {
    grossAmount,
    fee,
    tax,
    settlementAmount,
  };
}
