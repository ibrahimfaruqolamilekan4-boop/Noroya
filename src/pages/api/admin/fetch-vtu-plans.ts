import { supabase } from '../../../../src/lib/supabase.js';

/**
 * GET /api/admin/fetch-vtu-plans
 * Returns all active VTU plans from the vtu_plans table with no-cache headers.
 */
export default async function handler(req: any, res: any) {
  // Enforce fresh data (Step 2.4 - no cache)
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const { data, error } = await supabase
    .from('vtu_plans')
    .select('*')
    .eq('is_active', true)
    .order('network', { ascending: true })
    .order('price_to_user', { ascending: true });

  if (error) {
    console.error('[fetch-vtu-plans] Supabase error:', error.message);
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({ plans: data || [] });
}
