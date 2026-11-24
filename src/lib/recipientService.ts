import { supabase } from './supabase';
import { withFreshSession } from './authSession';
import { SavedRecipient } from '../types';

/**
 * Normalises a Nigerian phone number to canonical international format without plus sign:
 * 234XXXXXXXXXX (13 digits).
 */
export function normalizeRecipientPhone(phone: string): string {
  let clean = phone.replace(/\D/g, '');
  if (clean.startsWith('234')) {
    if (clean.length === 13) return clean;
    if (clean.length > 13) return clean.slice(0, 13);
    return clean;
  }
  if (clean.startsWith('0')) {
    clean = clean.substring(1);
  }
  return `234${clean}`;
}

/**
 * Checks if a phone number matches standard Nigerian mobile formats.
 */
export function isValidRecipientPhone(phone: string): boolean {
  const norm = normalizeRecipientPhone(phone);
  return /^234[789][01]\d{8}$/.test(norm);
}

/**
 * Formats a 234XXXXXXXXXX phone number into a local reading format: 0801 234 5678.
 */
export function formatLocalPhone(phone: string): string {
  const norm = normalizeRecipientPhone(phone);
  if (norm.startsWith('234') && norm.length === 13) {
    const local = '0' + norm.substring(3);
    return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
  }
  return phone;
}

/**
 * Loads all saved recipients for the current authenticated user from `saved_recipients`.
 * Uses withFreshSession to guarantee active session and prevents JWT expiration.
 */
export async function getSavedRecipients(): Promise<SavedRecipient[]> {
  return withFreshSession(async (session) => {
    const { data, error } = await supabase
      .from('saved_recipients')
      .select('*')
      .eq('owner_id', session.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[getSavedRecipients error]:', error.message);
      throw error;
    }
    return (data || []) as SavedRecipient[];
  });
}

/**
 * Saves a recipient phone number for wallet-to-wallet transfer.
 * Looks up the registered account name through the existing /api/wallet/lookup-recipient endpoint
 * so the saved name is authoritative and correct.
 */
export async function addSavedRecipient(phone: string, preferredName?: string): Promise<SavedRecipient> {
  const normalizedPhone = normalizeRecipientPhone(phone);

  return withFreshSession(async (session) => {
    let resolvedName = (preferredName || '').trim();

    // If no preferred name provided, look up account name via existing wallet lookup endpoint
    if (!resolvedName) {
      try {
        const token = session.access_token;
        const res = await fetch('/api/wallet/lookup-recipient', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ phone: normalizedPhone })
        });
        const lookupData = await res.json().catch(() => ({}));
        if (res.ok && lookupData?.recipient?.display_name) {
          resolvedName = lookupData.recipient.display_name;
        }
      } catch (lookupErr) {
        console.warn('[addSavedRecipient lookup warning]:', lookupErr);
      }
    }

    if (!resolvedName) {
      resolvedName = `User ${normalizedPhone.slice(-4)}`;
    }

    const { data, error } = await supabase
      .from('saved_recipients')
      .insert({
        owner_id: session.user.id,
        phone: normalizedPhone,
        display_name: resolvedName,
      })
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505' || error.message.includes('unique') || error.message.includes('saved_recipients_owner_phone_key')) {
        throw new Error('This phone number is already in your saved recipients list.');
      }
      throw error;
    }

    return data as SavedRecipient;
  });
}

/**
 * Removes a recipient from the user's saved list by ID.
 */
export async function removeSavedRecipient(id: string): Promise<void> {
  return withFreshSession(async (session) => {
    const { error } = await supabase
      .from('saved_recipients')
      .delete()
      .eq('id', id)
      .eq('owner_id', session.user.id);

    if (error) {
      console.error('[removeSavedRecipient error]:', error.message);
      throw error;
    }
  });
}
