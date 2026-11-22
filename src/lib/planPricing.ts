/**
 * Shared Customer Pricing Calculator for NORODATA
 * Formula:
 *  - If manual_price_override is set and > 0, respect it.
 *  - Otherwise: provider_price * (1 + marginPercent / 100), rounded up to nearest Naira.
 */

export function calculateCustomerPlanPrice(
  providerPrice: number,
  manualOverride?: number | null,
  marginPercent: number = 10
): number {
  if (manualOverride !== undefined && manualOverride !== null && Number(manualOverride) > 0) {
    return Math.ceil(Number(manualOverride));
  }
  const cost = Number(providerPrice) || 0;
  if (cost <= 0) return 0;
  return Math.ceil(cost * (1.0 + marginPercent / 100.0));
}
