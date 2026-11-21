-- Migration 012: Provider-sourced catalogue state for vtu_plans
-- ============================================================
-- WHY: Noroya's storefront was showing every plan the provider ever returned,
-- including (a) plans the admin never priced and (b) plans Mozosubz has since
-- removed from its API. Mozosubz itself solves this by joining the live provider
-- list against `api_pricing_rules` and dropping any plan without a rule
-- (`if (!rule) return null // plan has no API price configured — hide it`).
--
-- This migration gives vtu_plans the same two dimensions so the storefront can
-- be filtered the same way:
--
--   is_priced        — the admin has deliberately priced this plan for customers.
--                      Plans synced from the provider start as FALSE and stay
--                      hidden until an admin sets a price.
--   provider_status  — 'live' when the provider still returns the plan,
--                      'removed' when a sync found it gone upstream.
--   last_seen_at     — when the provider last returned the plan (distinct from
--                      last_synced_at, which is "when we last ran a sync").
--
-- Safe to re-run: every statement is idempotent.

-- 1. Columns
ALTER TABLE public.vtu_plans ADD COLUMN IF NOT EXISTS is_priced boolean NOT NULL DEFAULT false;
ALTER TABLE public.vtu_plans ADD COLUMN IF NOT EXISTS provider_status text NOT NULL DEFAULT 'live';
ALTER TABLE public.vtu_plans ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

-- 2. Constrain provider_status to known values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vtu_plans_provider_status_check'
  ) THEN
    ALTER TABLE public.vtu_plans
      ADD CONSTRAINT vtu_plans_provider_status_check
      CHECK (provider_status IN ('live', 'removed'));
  END IF;
END
$$;

-- 3. GRANDFATHERING (important, do not skip)
--    Every plan that is currently visible in the store is marked as priced, so
--    this migration cannot take the live catalogue offline. From here on, plans
--    created by a provider sync start unpriced and must be priced by an admin.
UPDATE public.vtu_plans
SET is_priced = true
WHERE is_priced = false
  AND is_active = true
  AND (manual_price_override IS NOT NULL AND manual_price_override > 0
       OR price_to_user IS NOT NULL AND price_to_user > 0);

-- 4. Treat anything already synced as seen, so `last_seen_at` is not null for
--    rows that predate this column.
UPDATE public.vtu_plans
SET last_seen_at = COALESCE(last_synced_at, updated_at, now())
WHERE last_seen_at IS NULL;

-- 5. Index for the storefront's exact filter
--    (is_active AND is_priced AND provider_status='live')
CREATE INDEX IF NOT EXISTS idx_vtu_plans_storefront
  ON public.vtu_plans (is_active, is_priced, provider_status, network);

-- 6. Keep the public read policy honest: only genuinely sellable plans are
--    readable by anonymous users. Admins still see everything via the
--    "Admins can manage all VTU plans" policy.
DROP POLICY IF EXISTS "Public can view active VTU plans" ON public.vtu_plans;
CREATE POLICY "Public can view active VTU plans" ON public.vtu_plans
  FOR SELECT USING (
    is_active = true
    AND is_priced = true
    AND provider_status = 'live'
  );
