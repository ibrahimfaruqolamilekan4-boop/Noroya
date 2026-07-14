-- ============================================================
-- Migration 003: Multi-provider VTU architecture
-- Run in Supabase SQL Editor → https://sdbfuuxdquzvtcwryimh.supabase.co
-- Or: supabase db push (if CLI is set up)
-- ============================================================

-- ── 1. Add `provider` column to services_config ──────────────
ALTER TABLE services_config
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'mozosubz';

COMMENT ON COLUMN services_config.provider IS
  'Which gateway fulfils purchases for this plan. Matches a slug in src/lib/vtu-providers.ts PROVIDERS map. e.g. mozosubz | bigisub';

-- ── 2. Add mozosubs_plan_id alias (some server.ts queries use it) ──
ALTER TABLE services_config
  ADD COLUMN IF NOT EXISTS mozosubs_plan_id TEXT;

COMMENT ON COLUMN services_config.mozosubs_plan_id IS
  'Mozosubz plan ID (alias for mozosubz_plan_id — kept for backwards compatibility).';

-- ── 3. Backfill existing rows → mozosubz provider ────────────
UPDATE services_config
  SET provider = 'mozosubz'
  WHERE provider IS NULL OR provider = '';

-- ── 4. Sync mozosubs_plan_id from mozosubz_plan_id ───────────
UPDATE services_config
  SET mozosubs_plan_id = mozosubz_plan_id
  WHERE mozosubs_plan_id IS NULL
    AND mozosubz_plan_id IS NOT NULL;

-- ── 5. Create vtu_failure_log table ──────────────────────────
CREATE TABLE IF NOT EXISTS vtu_failure_log (
  id            BIGSERIAL    PRIMARY KEY,
  provider      TEXT         NOT NULL,
  network       TEXT,
  phone_last4   TEXT,
  plan_id       TEXT,
  plan_name     TEXT,
  amount        NUMERIC(12,2),
  error_message TEXT,
  raw_response  TEXT,
  timestamp     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE vtu_failure_log IS
  'Every failed VTU purchase attempt — written by logVtuFailure() in server.ts. Never blocks the main purchase request.';

-- ── 6. RLS: only admins can read failure logs ─────────────────
ALTER TABLE vtu_failure_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read failure logs" ON vtu_failure_log;
CREATE POLICY "Admins can read failure logs"
  ON vtu_failure_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- ── 7. Indexes ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_vtu_failure_provider
  ON vtu_failure_log (provider, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vtu_failure_timestamp
  ON vtu_failure_log (created_at DESC);

-- ── Verification query ────────────────────────────────────────
SELECT
  'services_config'          AS tbl,
  COUNT(*)                   AS total,
  COUNT(provider)            AS with_provider,
  COUNT(DISTINCT provider)   AS distinct_providers
FROM services_config
UNION ALL
SELECT 'vtu_failure_log', COUNT(*), 0, 0
FROM vtu_failure_log;
