import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

/**
 * Fetches the current logged-in user's Noroya UID (from profiles.uid)
 * so it can be displayed on the dashboard for sharing/transfers.
 */
export function useUserUid() {
  const [uid, setUid] = useState(null);

  useEffect(() => {
    async function fetchUid() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('uid')
        .eq('id', user.id)
        .single();

      if (!error && data) setUid(data.uid);
    }
    fetchUid();
  }, []);

  return uid;
}
