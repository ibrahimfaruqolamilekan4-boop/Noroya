-- Migration 008: Create VTU Plans table, Failure Log table, and Indexes
-- Step 2: Fix Data Source & Step 4: Prevent Failure

-- 1. Ensure vtu_plans table exists
CREATE TABLE IF NOT EXISTS public.vtu_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network text NOT NULL DEFAULT 'MTN',
  plan_name text NOT NULL DEFAULT '',
  provider_plan_id text,
  price_to_user numeric NOT NULL DEFAULT 0,
  provider_price numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  provider text NOT NULL DEFAULT 'mozosubz',
  service text,
  validity text DEFAULT '30 Days',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure all columns exist even if vtu_plans was previously created with an older schema
ALTER TABLE public.vtu_plans ADD COLUMN IF NOT EXISTS network text NOT NULL DEFAULT 'MTN';
ALTER TABLE public.vtu_plans ADD COLUMN IF NOT EXISTS plan_name text NOT NULL DEFAULT '';
ALTER TABLE public.vtu_plans ADD COLUMN IF NOT EXISTS provider_plan_id text;
ALTER TABLE public.vtu_plans ADD COLUMN IF NOT EXISTS price_to_user numeric NOT NULL DEFAULT 0;
ALTER TABLE public.vtu_plans ADD COLUMN IF NOT EXISTS provider_price numeric NOT NULL DEFAULT 0;
ALTER TABLE public.vtu_plans ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.vtu_plans ADD COLUMN IF NOT EXISTS last_synced_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.vtu_plans ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'mozosubz';
ALTER TABLE public.vtu_plans ADD COLUMN IF NOT EXISTS service text;
ALTER TABLE public.vtu_plans ADD COLUMN IF NOT EXISTS validity text DEFAULT '30 Days';
ALTER TABLE public.vtu_plans ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.vtu_plans ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Ensure provider_plan_id has a unique index for ON CONFLICT upsert
CREATE UNIQUE INDEX IF NOT EXISTS vtu_plans_provider_plan_id_idx ON public.vtu_plans(provider_plan_id);

-- 2. Create performance indexes
CREATE INDEX IF NOT EXISTS idx_vtu_plans_active ON public.vtu_plans(is_active);
CREATE INDEX IF NOT EXISTS idx_vtu_plans_network ON public.vtu_plans(network);
CREATE INDEX IF NOT EXISTS idx_vtu_plans_provider_id ON public.vtu_plans(provider_plan_id);

-- 3. Row Level Security for vtu_plans
ALTER TABLE public.vtu_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view active VTU plans" ON public.vtu_plans;
CREATE POLICY "Public can view active VTU plans" ON public.vtu_plans
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Service role can manage VTU plans" ON public.vtu_plans;
CREATE POLICY "Service role can manage VTU plans" ON public.vtu_plans
  FOR ALL USING (auth.role() = 'service_role');

-- 4. Ensure vtu_failure_log table exists and has all required columns
CREATE TABLE IF NOT EXISTS public.vtu_failure_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vtu_failure_log ADD COLUMN IF NOT EXISTS user_id text;
ALTER TABLE public.vtu_failure_log ADD COLUMN IF NOT EXISTS network text;
ALTER TABLE public.vtu_failure_log ADD COLUMN IF NOT EXISTS provider_plan_id text;
ALTER TABLE public.vtu_failure_log ADD COLUMN IF NOT EXISTS plan_name text;
ALTER TABLE public.vtu_failure_log ADD COLUMN IF NOT EXISTS amount numeric;
ALTER TABLE public.vtu_failure_log ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE public.vtu_failure_log ADD COLUMN IF NOT EXISTS provider text;
ALTER TABLE public.vtu_failure_log ADD COLUMN IF NOT EXISTS phone_last4 text;
ALTER TABLE public.vtu_failure_log ADD COLUMN IF NOT EXISTS raw_response text;
ALTER TABLE public.vtu_failure_log ADD COLUMN IF NOT EXISTS timestamp timestamptz DEFAULT now();
ALTER TABLE public.vtu_failure_log ADD COLUMN IF NOT EXISTS user_email text;
ALTER TABLE public.vtu_failure_log ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_vtu_failure_log_created_at ON public.vtu_failure_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vtu_failure_log_plan_id ON public.vtu_failure_log(provider_plan_id);

ALTER TABLE public.vtu_failure_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view failure log" ON public.vtu_failure_log;
CREATE POLICY "Public can view failure log" ON public.vtu_failure_log
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Service role full control on failure log" ON public.vtu_failure_log;
CREATE POLICY "Service role full control on failure log" ON public.vtu_failure_log
  FOR ALL USING (auth.role() = 'service_role');

-- 5. Ensure transactions table has metadata column
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';

-- 6. Backfill vtu_plans from services_config
INSERT INTO public.vtu_plans (
  network, plan_name, provider_plan_id, price_to_user, provider_price,
  is_active, provider, service, validity, last_synced_at
)
SELECT
  COALESCE(network_type, network, provider_or_network, 'MTN') AS network,
  COALESCE(plan_name, name, item_name, 'Unknown Plan') AS plan_name,
  COALESCE(mozosubz_plan_id, bigisub_identifier_id, id::text) AS provider_plan_id,
  COALESCE(selling_price, retail_price, 0) AS price_to_user,
  COALESCE(cost_price, 0) AS provider_price,
  COALESCE(is_active, true),
  COALESCE(provider, 'mozosubz'),
  COALESCE(mozosubz_service, 'mtn_sme'),
  COALESCE(validity_days, '30 Days'),
  now()
FROM public.services_config
WHERE service_type = 'data'
  AND COALESCE(mozosubz_plan_id, bigisub_identifier_id) IS NOT NULL
  AND COALESCE(mozosubz_plan_id, bigisub_identifier_id) != ''
ON CONFLICT (provider_plan_id) DO UPDATE SET
  plan_name = EXCLUDED.plan_name,
  price_to_user = EXCLUDED.price_to_user,
  provider_price = EXCLUDED.provider_price,
  is_active = EXCLUDED.is_active,
  service = EXCLUDED.service,
  validity = EXCLUDED.validity,
  last_synced_at = now();

-- 7. Configure 30-minute scheduled cron job (if pg_cron extension is active)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'sync-vtu-plans-every-30-mins',
      '*/30 * * * *',
      $cron_job$
      SELECT
        net.http_post(
          url := coalesce(current_setting('app.settings.supabase_url', true), 'https://your-project.supabase.co') || '/functions/v1/sync-vtu-plans',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || coalesce(current_setting('app.settings.service_role_key', true), '')
          ),
          body := '{}'::jsonb
        );
      $cron_job$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not enabled or configured; schedule via Supabase Edge Function crons.';
END;
$$;
