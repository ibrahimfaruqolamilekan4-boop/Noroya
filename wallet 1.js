import { supabase } from './supabaseClient';

/**
 * Look up a recipient by their UID before transferring.
 * Used to show a confirmation screen so the sender can verify
 * they're sending money to the right person.
 */
export async function lookupRecipient(uid) {
  const { data, error } = await supabase.rpc('lookup_recipient', {
    target_uid: uid,
  });
  if (error) throw new Error(error.message);
  return data; // { email, uid }
}

/**
 * Transfer funds from the logged-in user to another user by UID.
 * A random reference is generated as an idempotency key so a
 * double-tap or network retry can't cause a double-charge.
 */
export async function transferFunds(recipientUid, amount) {
  const reference = crypto.randomUUID();

  const { data, error } = await supabase.rpc('transfer_funds', {
    recipient_uid: recipientUid,
    amount: amount,
    reference: reference,
  });

  if (error) throw new Error(error.message);
  return data; // { success, recipient_email, amount }
}
