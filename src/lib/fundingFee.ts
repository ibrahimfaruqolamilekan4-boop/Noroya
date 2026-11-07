// src/lib/fundingFee.ts
/**
 * Calculate the fee breakdown for a wallet‑funding request.
 *
 * @param amount   Amount the user wants credited (₦)
 * @returns        { margin, totalCharged, gatewayFee }
 *
 * Formula (RATE = 0.015):
 *   TOTAL_CHARGED = ceil((amount + margin) / (1 - RATE))
 *   GATEWAY_FEE   = TOTAL_CHARGED - amount - margin
 */
export const calculateFundingFee = (amount: number) => {
  // ---- margin rules -----------------------------------------------------
  const margin = amount >= 5_000 ? 50 : 30;

  // ---- gateway rate (Bachs.io) ------------------------------------------
  const RATE = 0.015; // 1.5 %

  // ---- total charged (rounded up to the next whole naira) ---------------
  const totalCharged = Math.ceil((amount + margin) / (1 - RATE));

  // ---- gateway fee -------------------------------------------------------
  const gatewayFee = totalCharged - amount - margin;

  return { margin, totalCharged, gatewayFee };
};
