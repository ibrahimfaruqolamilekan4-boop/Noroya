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

/**
 * Shared Canonical Service Code Normalizer
 * Maps raw provider service names ('SME', 'Corporate', 'Gifting', 'SME2', 'Coupon', 'sme', etc.)
 * and network ('MTN', 'GLO', 'AIRTEL', '9MOBILE') into standardized storefront tab codes:
 *   - MTN: mtn_sme, mtn_cg, mtn_gifting, mtn_datashare, mtn_awoof, mtn_awoof2, mtn_coupon
 *   - GLO: glo_sme, glo_sme2, glo_cg, glo_gifting, glo_data
 *   - Airtel: airtel_sme, airtel_sme2, airtel_cg, airtel_gifting
 *   - 9mobile: etisalat_sme, etisalat_data
 */
export function normalizeCanonicalServiceCode(rawService?: string, rawNetwork?: string, planName?: string): string {
  const svc = String(rawService || '').toLowerCase().trim();
  const net = String(rawNetwork || '').toUpperCase().trim();
  const name = String(planName || '').toLowerCase().trim();

  // If already standard prefixed, keep it
  const knownPrefixed = [
    'mtn_sme', 'mtn_cg', 'mtn_gifting', 'mtn_datashare', 'mtn_awoof', 'mtn_awoof2', 'mtn_coupon',
    'glo_sme', 'glo_sme2', 'glo_cg', 'glo_gifting', 'glo_data',
    'airtel_sme', 'airtel_sme2', 'airtel_cg', 'airtel_gifting',
    'etisalat_sme', 'etisalat_data'
  ];
  if (knownPrefixed.includes(svc)) {
    return svc;
  }

  const combined = `${svc} ${name}`;

  if (net.includes('MTN') || net === '1') {
    if (combined.includes('sme2') || combined.includes('awoof 2') || combined.includes('awoof2')) return 'mtn_awoof2';
    if (combined.includes('sme')) return 'mtn_sme';
    if (combined.includes('cg') || combined.includes('corporate')) return 'mtn_cg';
    if (combined.includes('gifting') || combined.includes('gift')) return 'mtn_gifting';
    if (combined.includes('share') || combined.includes('datashare')) return 'mtn_datashare';
    if (combined.includes('coupon')) return 'mtn_coupon';
    if (combined.includes('awoof')) return 'mtn_awoof';
    return 'mtn_sme';
  }

  if (net.includes('GLO') || net === '2') {
    if (combined.includes('sme2')) return 'glo_sme2';
    if (combined.includes('sme')) return 'glo_sme';
    if (combined.includes('cg') || combined.includes('corporate')) return 'glo_cg';
    if (combined.includes('gifting') || combined.includes('gift')) return 'glo_gifting';
    return 'glo_data';
  }

  if (net.includes('AIRTEL') || net === '3') {
    if (combined.includes('sme2')) return 'airtel_sme2';
    if (combined.includes('sme')) return 'airtel_sme';
    if (combined.includes('cg') || combined.includes('corporate')) return 'airtel_cg';
    if (combined.includes('gifting') || combined.includes('gift') || combined.includes('data')) return 'airtel_gifting';
    return 'airtel_sme';
  }

  if (net.includes('9MOBILE') || net.includes('ETISALAT') || net === '4') {
    if (combined.includes('sme')) return 'etisalat_sme';
    return 'etisalat_data';
  }

  return svc || 'data';
}

