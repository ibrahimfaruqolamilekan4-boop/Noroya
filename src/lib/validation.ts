/**
 * Nigerian phone number normalization and validation utilities for NORODATA.
 */

export function normalizeNigerianPhone(phone: string): string {
  if (!phone) return '';
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('234') && cleaned.length === 13) {
    return cleaned;
  }
  if (cleaned.startsWith('0') && cleaned.length === 11) {
    return '234' + cleaned.substring(1);
  }
  if (cleaned.length === 10) {
    return '234' + cleaned;
  }
  return cleaned;
}

export function isValidNigerianPhone(phone: string): boolean {
  const norm = normalizeNigerianPhone(phone);
  return /^234\d{10}$/.test(norm);
}
