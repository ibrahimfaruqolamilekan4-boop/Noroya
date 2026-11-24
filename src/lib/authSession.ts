import { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export const SESSION_EXPIRED_MESSAGE = 'Your session has ended. Please log in again to save your changes.';

/**
 * Executes an action with a guaranteed fresh, unexpired Supabase session.
 * 1. Proactively calls supabase.auth.getSession().
 * 2. If the session is missing, expired, or close to expiry (<60s), calls supabase.auth.refreshSession().
 * 3. If refresh fails or user is unauthenticated, throws a clean user-friendly message:
 *    "Your session has ended. Please log in again to save your changes."
 * 4. Never displays raw "Failed to update: JWT expired" to the user.
 */
export async function withFreshSession<T>(action: (session: Session) => Promise<T>): Promise<T> {
  let activeSession: Session | null = null;

  try {
    const { data, error } = await supabase.auth.getSession();
    const session = data?.session;

    const isExpiringSoon = session?.expires_at
      ? (session.expires_at * 1000 - Date.now() < 60_000)
      : false;

    if (!session || isExpiringSoon || error) {
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError || !refreshData.session) {
        throw new Error(SESSION_EXPIRED_MESSAGE);
      }
      activeSession = refreshData.session;
    } else {
      activeSession = session;
    }
  } catch (err: any) {
    if (err.message === SESSION_EXPIRED_MESSAGE) throw err;
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }

  if (!activeSession) {
    throw new Error(SESSION_EXPIRED_MESSAGE);
  }

  try {
    return await action(activeSession);
  } catch (actionErr: any) {
    const msg = String(actionErr?.message || '');
    if (/jwt expired|token expired|invalid claim|session ended/i.test(msg)) {
      // Attempt an emergency single retry with forced session refresh
      try {
        const { data: retryData, error: retryErr } = await supabase.auth.refreshSession();
        if (!retryErr && retryData.session) {
          return await action(retryData.session);
        }
      } catch (_) {}
      throw new Error(SESSION_EXPIRED_MESSAGE);
    }
    throw actionErr;
  }
}
