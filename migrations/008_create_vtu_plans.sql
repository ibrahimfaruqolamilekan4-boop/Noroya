-- Migration 008: Create VTU Plans table, Failure Log table, and Indexes
-- Step 2: Fix Data Source & Step 4: Prevent Failure

CREATE TABLE IF NOT EXISTS public.vtu_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network text NOT NULL,
  plan_name text NOT NULL,
  provider_plan_id text NOT NULL UNIQUE,
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

-- Index for active plans lookup (Step 2.4 & Step 3.2 fast querying)
CREATE INDEX IF NOT EXISTS idx_vtu_plans_active ON public.vtu_plans(is_active);
CREATE INDEX IF NOT EXISTS idx_vtu_plans_network ON public.vtu_plans(network);
CREATE INDEX IF NOT EXISTS idx_vtu_plans_provider_id ON public.vtu_plans(provider_plan_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.vtu_plans ENABLE ROW LEVEL SECURITY;

-- Allow public read access to active plans
DROP POLICY IF EXISTS "Public can view active VTU plans" ON public.vtu_plans;
CREATE POLICY "Public can view active VTU plans" ON public.vtu_plans
  FOR SELECT USING (is_active = true);

-- Allow service_role full control
DROP POLICY IF EXISTS "Service role can manage VTU plans" ON public.vtu_plans;
CREATE POLICY "Service role can manage VTU plans" ON public.vtu_plans
  FOR ALL USING (auth.role() = 'service_role');

-- Create VTU Purchase Failure Log Table (Step 4)
CREATE TABLE IF NOT EXISTS public.vtu_failure_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  network text,
  provider_plan_id text,
  plan_name text,
  amount numeric,
  error_message text,
  provider text,
  provider_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vtu_failure_log_created_at ON public.vtu_failure_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vtu_failure_log_plan_id ON public.vtu_failure_log(provider_plan_id);

ALTER TABLE public.vtu_failure_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full control on failure log" ON public.vtu_failure_log;
CREATE POLICY "Service role full control on failure log" ON public.vtu_failure_log
  FOR ALL USING (auth.role() = 'service_role');

-- Enable pg_cron schedule every 30 minutes (if pg_cron extension exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'sync-vtu-plans-every-30-mins',
      '*/30 * * * *',
      $$
      SELECT
        net.http_post(
          url := coalesce(current_setting('app.settings.supabase_url', true), 'https://your-project.supabase.co') || '/functions/v1/sync-vtu-plans',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || coalesce(current_setting('app.settings.service_role_key', true), '')
          ),
          body := '{}'::jsonb
        );
      $$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Fallback notice if pg_cron is not configured in this environment
  RAISE NOTICE 'pg_cron extension not active; schedule function via Supabase dashboard';
END;
$$;
