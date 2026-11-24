-- Migration 013: Saved Recipients and User Security (Transaction PIN)
-- Hardens saved recipients persistence and secures transaction PIN hashing

-- Enable pgcrypto in extensions schema (or public) for bcrypt hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ============================================================================
-- 1. SAVED RECIPIENTS TABLE & RLS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.saved_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT saved_recipients_owner_phone_key UNIQUE (owner_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_saved_recipients_owner_id ON public.saved_recipients(owner_id);

ALTER TABLE public.saved_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own saved recipients" ON public.saved_recipients;
CREATE POLICY "Users can read own saved recipients"
  ON public.saved_recipients
  FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can insert own saved recipients" ON public.saved_recipients;
CREATE POLICY "Users can insert own saved recipients"
  ON public.saved_recipients
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can delete own saved recipients" ON public.saved_recipients;
CREATE POLICY "Users can delete own saved recipients"
  ON public.saved_recipients
  FOR DELETE
  TO authenticated
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Service role full access on saved_recipients" ON public.saved_recipients;
CREATE POLICY "Service role full access on saved_recipients"
  ON public.saved_recipients
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 2. USER SECURITY TABLE & RLS (TRANSACTION PIN)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_security (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pin_hash TEXT NOT NULL,
  pin_set_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_security_locked ON public.user_security(user_id, locked_until);

ALTER TABLE public.user_security ENABLE ROW LEVEL SECURITY;

-- No SELECT policy for authenticated users: never return the hash to the browser.
-- Access is strictly mediated via SECURITY DEFINER functions.
DROP POLICY IF EXISTS "Service role full access on user_security" ON public.user_security;
CREATE POLICY "Service role full access on user_security"
  ON public.user_security
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 3. SECURITY DEFINER RPC FUNCTIONS
-- ============================================================================

-- Function 1: Check if user has transaction PIN set (Returns boolean)
CREATE OR REPLACE FUNCTION public.has_transaction_pin(
  p_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_target_user_id UUID;
  v_has_pin BOOLEAN;
BEGIN
  IF auth.role() = 'service_role' AND p_user_id IS NOT NULL THEN
    v_target_user_id := p_user_id;
  ELSE
    v_target_user_id := auth.uid();
  END IF;

  IF v_target_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT (pin_hash IS NOT NULL AND length(pin_hash) > 0) INTO v_has_pin
  FROM public.user_security
  WHERE user_id = v_target_user_id;

  RETURN COALESCE(v_has_pin, FALSE);
END;
$$;

-- Function 2: Set transaction PIN (Server-side bcrypt hash, enforces 4 digits)
CREATE OR REPLACE FUNCTION public.set_transaction_pin(
  new_pin TEXT,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_target_user_id UUID;
BEGIN
  IF auth.role() = 'service_role' AND p_user_id IS NOT NULL THEN
    v_target_user_id := p_user_id;
  ELSE
    v_target_user_id := auth.uid();
  END IF;

  IF v_target_user_id IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'error', 'Unauthorized.');
  END IF;

  IF new_pin IS NULL OR new_pin !~ '^[0-9]{4}$' THEN
    RETURN jsonb_build_object('status', 'error', 'error', 'Transaction PIN must be exactly 4 numeric digits.');
  END IF;

  INSERT INTO public.user_security (user_id, pin_hash, pin_set_at, failed_attempts, locked_until)
  VALUES (
    v_target_user_id,
    extensions.crypt(new_pin, extensions.gen_salt('bf', 10)),
    now(),
    0,
    NULL
  )
  ON CONFLICT (user_id) DO UPDATE SET
    pin_hash = EXCLUDED.pin_hash,
    pin_set_at = now(),
    failed_attempts = 0,
    locked_until = NULL;

  -- Clear any legacy plain text PIN from profiles
  UPDATE public.profiles
  SET transaction_pin = NULL
  WHERE id = v_target_user_id;

  RETURN jsonb_build_object('status', 'success', 'message', 'Transaction PIN updated successfully.');
END;
$$;

-- Function 3: Verify transaction PIN (Verifies hash, enforces 5-attempt limit and 15-min lockout)
CREATE OR REPLACE FUNCTION public.verify_transaction_pin(
  pin TEXT,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_target_user_id UUID;
  v_sec RECORD;
  v_matched BOOLEAN;
  v_failed INT;
BEGIN
  IF auth.role() = 'service_role' AND p_user_id IS NOT NULL THEN
    v_target_user_id := p_user_id;
  ELSE
    v_target_user_id := auth.uid();
  END IF;

  IF v_target_user_id IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'error', 'Unauthorized.');
  END IF;

  IF pin IS NULL OR pin !~ '^[0-9]{4}$' THEN
    RETURN jsonb_build_object('status', 'failed', 'error', 'Invalid PIN format. Must be 4 digits.');
  END IF;

  SELECT * INTO v_sec
  FROM public.user_security
  WHERE user_id = v_target_user_id;

  IF v_sec.user_id IS NULL OR v_sec.pin_hash IS NULL THEN
    RETURN jsonb_build_object('status', 'no_pin', 'error', 'No transaction PIN is configured.');
  END IF;

  -- Check if account is locked
  IF v_sec.locked_until IS NOT NULL AND v_sec.locked_until > now() THEN
    RETURN jsonb_build_object(
      'status', 'locked',
      'error', 'Account is locked for 15 minutes due to too many failed attempts.',
      'locked_until', v_sec.locked_until
    );
  END IF;

  -- Verify PIN against bcrypt hash
  v_matched := (v_sec.pin_hash = extensions.crypt(pin, v_sec.pin_hash));

  IF v_matched THEN
    -- Reset failed attempts on success
    UPDATE public.user_security
    SET failed_attempts = 0,
        locked_until = NULL
    WHERE user_id = v_target_user_id;

    RETURN jsonb_build_object('status', 'success', 'verified', true);
  ELSE
    v_failed := COALESCE(v_sec.failed_attempts, 0) + 1;
    IF v_failed >= 5 THEN
      UPDATE public.user_security
      SET failed_attempts = v_failed,
          locked_until = now() + INTERVAL '15 minutes'
      WHERE user_id = v_target_user_id;

      RETURN jsonb_build_object(
        'status', 'locked',
        'error', 'Incorrect PIN. Account locked for 15 minutes after 5 failed attempts.',
        'remaining_attempts', 0,
        'locked_until', now() + INTERVAL '15 minutes'
      );
    ELSE
      UPDATE public.user_security
      SET failed_attempts = v_failed
      WHERE user_id = v_target_user_id;

      RETURN jsonb_build_object(
        'status', 'failed',
        'error', 'Incorrect PIN. ' || (5 - v_failed) || ' attempt(s) remaining.',
        'remaining_attempts', 5 - v_failed
      );
    END IF;
  END IF;
END;
$$;

-- Grant permissions to authenticated and service_role
GRANT EXECUTE ON FUNCTION public.has_transaction_pin(UUID) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.set_transaction_pin(TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_transaction_pin(TEXT, UUID) TO authenticated, service_role;

-- ============================================================================
-- 4. DATA MIGRATION: MIGRATE EXISTING PLAIN-TEXT PINS TO USER_SECURITY
-- ============================================================================

-- Safely migrate any existing 4-digit plaintext transaction_pin from profiles into user_security as bcrypt hashes
INSERT INTO public.user_security (user_id, pin_hash, pin_set_at, failed_attempts, locked_until)
SELECT 
  p.id, 
  extensions.crypt(p.transaction_pin, extensions.gen_salt('bf', 10)), 
  now(), 
  0, 
  NULL
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.transaction_pin IS NOT NULL 
  AND p.transaction_pin ~ '^[0-9]{4}$'
ON CONFLICT (user_id) DO NOTHING;

-- Clear plaintext transaction_pin from profiles so plain text PIN is never retained
UPDATE public.profiles
SET transaction_pin = NULL
WHERE transaction_pin IS NOT NULL;
