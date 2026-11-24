import { supabase } from './supabase';
import { withFreshSession } from './authSession';

export interface PinVerifyResult {
  success: boolean;
  verified?: boolean;
  locked?: boolean;
  remainingAttempts?: number;
  error?: string;
  lockedUntil?: string;
}

/**
 * Checks whether the current authenticated user has configured a transaction PIN.
 * Mediated strictly through server-side RPC has_transaction_pin.
 * Returns boolean only (never returns PIN or hash).
 */
export async function hasTransactionPin(): Promise<boolean> {
  try {
    return await withFreshSession(async () => {
      const { data, error } = await supabase.rpc('has_transaction_pin');
      if (error) {
        console.warn('[hasTransactionPin error]:', error.message);
        return false;
      }
      return Boolean(data);
    });
  } catch (_err) {
    return false;
  }
}

/**
 * Sets or updates the transaction PIN for the authenticated user.
 * Rejects non-4-digit inputs.
 * The server hashes the PIN using bcrypt in PostgreSQL pgcrypto.
 * Never stores or transmits PIN in plaintext or local storage.
 */
export async function setTransactionPin(newPin: string): Promise<{ success: boolean; message: string }> {
  const cleanPin = String(newPin || '').trim();
  if (!/^\d{4}$/.test(cleanPin)) {
    throw new Error('Transaction PIN must be exactly 4 digits.');
  }

  return withFreshSession(async () => {
    const { data, error } = await supabase.rpc('set_transaction_pin', {
      new_pin: cleanPin,
    });

    if (error) {
      console.error('[setTransactionPin error]:', error.message);
      throw new Error(error.message || 'Failed to set transaction PIN.');
    }

    if (data && data.status === 'error') {
      throw new Error(data.error || 'Failed to set transaction PIN.');
    }

    return {
      success: true,
      message: data?.message || 'Transaction PIN updated successfully.',
    };
  });
}

/**
 * Verifies the transaction PIN against the server-side bcrypt hash.
 * Enforces account lockout for 15 minutes after 5 consecutive failed attempts.
 */
export async function verifyTransactionPin(pin: string): Promise<PinVerifyResult> {
  const cleanPin = String(pin || '').trim();
  if (!/^\d{4}$/.test(cleanPin)) {
    return { success: false, error: 'Transaction PIN must be 4 digits.' };
  }

  return withFreshSession(async () => {
    const { data, error } = await supabase.rpc('verify_transaction_pin', {
      pin: cleanPin,
    });

    if (error) {
      console.error('[verifyTransactionPin error]:', error.message);
      return { success: false, error: error.message || 'Failed to verify transaction PIN.' };
    }

    if (!data) {
      return { success: false, error: 'PIN verification failed.' };
    }

    if (data.status === 'success' && data.verified) {
      return { success: true, verified: true };
    }

    if (data.status === 'locked') {
      return {
        success: false,
        locked: true,
        remainingAttempts: 0,
        error: data.error || 'Account is locked for 15 minutes due to too many failed attempts.',
        lockedUntil: data.locked_until,
      };
    }

    return {
      success: false,
      remainingAttempts: data.remaining_attempts,
      error: data.error || 'Incorrect transaction PIN.',
    };
  });
}
