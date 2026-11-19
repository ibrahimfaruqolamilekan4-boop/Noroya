-- Migration 011: VTU Plans Single Source of Truth & Admin Price Overrides
-- Description: Unifies plan storage into vtu_plans, introduces manual price overrides,
--              hardens admin RLS policies, and registers automated 30-minute cron synchronization.

-- 1. Ensure vtu_plans columns exist
ALTER TABLE public.vtu_plans ADD COLUMN IF NOT EXISTS manual_price_override numeric DEFAULT NULL;
ALTER TABLE public.vtu_plans ADD COLUMN IF NOT EXISTS margin_percent numeric NOT NULL DEFAULT 10;
ALTER TABLE public.vtu_plans ADD COLUMN IF NOT EXISTS last_synced_at timestamptz NOT NULL DEFAULT now();

-- 2. Indexes for high-performance querying & deduplication
CREATE INDEX IF NOT EXISTS idx_vtu_plans_active_network ON public.vtu_plans(is_active, network);
CREATE INDEX IF NOT EXISTS idx_vtu_plans_service ON public.vtu_plans(service);
CREATE UNIQUE INDEX IF NOT EXISTS vtu_plans_provider_plan_id_idx ON public.vtu_plans(provider_plan_id);

-- 3. Row Level Security policies
ALTER TABLE public.vtu_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view active VTU plans" ON public.vtu_plans;
CREATE POLICY "Public can view active VTU plans" ON public.vtu_plans
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Admins can manage all VTU plans" ON public.vtu_plans;
CREATE POLICY "Admins can manage all VTU plans" ON public.vtu_plans
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Service role can manage VTU plans" ON public.vtu_plans;
CREATE POLICY "Service role can manage VTU plans" ON public.vtu_plans
  FOR ALL USING (auth.role() = 'service_role');

-- 4. Shared Price Calculation Helper Function
CREATE OR REPLACE FUNCTION public.calculate_customer_plan_price(
  p_provider_price numeric,
  p_manual_override numeric DEFAULT NULL,
  p_margin_percent numeric DEFAULT 10
) RETURNS numeric AS $$
BEGIN
  IF p_manual_override IS NOT NULL AND p_manual_override > 0 THEN
    RETURN p_manual_override;
  END IF;
  
  IF p_provider_price IS NULL OR p_provider_price <= 0 THEN
    RETURN 0;
  END IF;

  -- Default margin: provider_price * (1 + margin_pct / 100), rounded up to nearest Naira
  RETURN CEIL(p_provider_price * (1.0 + (COALESCE(p_margin_percent, 10) / 100.0)));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 5. pg_cron & pg_net Automated 30-Minute Sync
-- Note: Requires pg_cron & pg_net extensions in Supabase.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Unschedule existing job if present
    PERFORM cron.unschedule('sync-vtu-plans-every-30min')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-vtu-plans-every-30min');

    -- Schedule edge function execution every 30 minutes
    PERFORM cron.schedule(
      'sync-vtu-plans-every-30min',
      '*/30 * * * *',
      $cron$
      SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1) || '/functions/v1/sync-vtu-plans',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
        ),
        body := '{}'::jsonb
      );
      $cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron scheduling skipped: %', SQLERRM;
END $$;
