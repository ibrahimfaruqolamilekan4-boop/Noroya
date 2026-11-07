/**
 * Shared funding fee calculator for NORODATA.
 *
 * Definitions:
 * - AMOUNT = the amount the user wants credited to their wallet.
 * - MARGIN = NORODATA's fee:
 *   - AMOUNT from ₦100 to ₦4,999.99 → MARGIN = ₦30
 *   - AMOUNT ₦5,000 and above → MARGIN = ₦50
 * - RATE = the gateway rate as a decimal (for 1.5%, RATE = 0.015).
 *
 * Formula:
 * - TOTAL_CHARGED = ceil((AMOUNT + MARGIN) ÷ (1 − RATE)), rounded UP to the next whole naira.
 * - GATEWAY_FEE = TOTAL_CHARGED − AMOUNT − MARGIN.
 * - WALLET_CREDIT = AMOUNT. Only this goes to the user's wallet.
 * - NORODATA keeps MARGIN. The gateway settles (TOTAL_CHARGED − GATEWAY_FEE) to NORODATA, which equals AMOUNT + MARGIN.
 */

export interface FundingFeeBreakdown {
  amount: number;
  margin: number;
  norodataFee: number;
  gatewayFee: number;
  totalCharged: number;
  settlement: number;
  rate: number;
}

export const BACHS_GATEWAY_RATE = 0.015; // 1.5%

export function calculateFundingFee(amount: number, rate: number = BACHS_GATEWAY_RATE): FundingFeeBreakdown {
  const numericAmount = Math.max(0, Math.round(Number(amount) || 0));
  const margin = numericAmount >= 5000 ? 50 : 30;
  const totalCharged = Math.ceil((numericAmount + margin) / (1 - rate));
  const gatewayFee = totalCharged - numericAmount - margin;
  const settlement = totalCharged - gatewayFee; // Exactly equals numericAmount + margin

  return {
    amount: numericAmount,
    margin,
    norodataFee: margin,
    gatewayFee,
    totalCharged,
    settlement,
    rate,
  };
}
