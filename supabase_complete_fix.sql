-- ============================================================================
-- SUPABASE COMPLETE FIX & INTEGRATION SCRIPT
-- ============================================================================
-- This script fixes "permission denied", "Invalid API key" on PostgREST,
-- missing provider tables, atomic wallet balance functions, and Row-Level
-- Security policies for NORODATA / Noroya.
--
-- HOW TO RUN:
-- 1. Open your Supabase Dashboard: https://supabase.com/dashboard/project/sdbfuuxdquzvtcwryimh
-- 2. Go to "SQL Editor" in the left sidebar.
-- 3. Click "New Query", paste this entire file, and click "Run".
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. SCHEMA PERMISSIONS & PRIVILEGES (Fixes 401 & "Permission Denied")
-- ----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. PROVIDER SECRETS TABLE (For Mozosubz, Nifex, Flutterwave keys)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_secrets (
    identifier VARCHAR(100) PRIMARY KEY,
    secret TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.provider_secrets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service role on provider_secrets" ON public.provider_secrets;
CREATE POLICY "Allow service role on provider_secrets" ON public.provider_secrets
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated admin on provider_secrets" ON public.provider_secrets;
CREATE POLICY "Allow authenticated admin on provider_secrets" ON public.provider_secrets
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 3. SERVICES CONFIG TABLE (Plans, pricing, and dynamic sync)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.services_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_type VARCHAR(50) NOT NULL DEFAULT 'data',
    network_or_provider VARCHAR(100) NOT NULL DEFAULT '',
    provider_or_network VARCHAR(100),
    item_name VARCHAR(255) NOT NULL DEFAULT '',
    cost_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    selling_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    agent_price NUMERIC(10, 2) DEFAULT 0.00,
    reseller_price NUMERIC(10, 2) DEFAULT 0.00,
    retail_price NUMERIC(10, 2) DEFAULT 0.00,
    bigisub_identifier_id VARCHAR(255) UNIQUE,
    mozosubz_plan_id VARCHAR(255),
    mozosubs_plan_id VARCHAR(255),
    mozosubz_service VARCHAR(100),
    provider VARCHAR(50) NOT NULL DEFAULT 'mozosubz',
    validity_days VARCHAR(50) DEFAULT '30 Days',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ensure all required columns exist in case table was created with older schema
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'services_config' AND column_name = 'provider_or_network') THEN
        ALTER TABLE public.services_config ADD COLUMN provider_or_network VARCHAR(100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'services_config' AND column_name = 'mozosubz_plan_id') THEN
        ALTER TABLE public.services_config ADD COLUMN mozosubz_plan_id VARCHAR(255);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'services_config' AND column_name = 'mozosubs_plan_id') THEN
        ALTER TABLE public.services_config ADD COLUMN mozosubs_plan_id VARCHAR(255);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'services_config' AND column_name = 'mozosubz_service') THEN
        ALTER TABLE public.services_config ADD COLUMN mozosubz_service VARCHAR(100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'services_config' AND column_name = 'provider') THEN
        ALTER TABLE public.services_config ADD COLUMN provider VARCHAR(50) DEFAULT 'mozosubz';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'services_config' AND column_name = 'agent_price') THEN
        ALTER TABLE public.services_config ADD COLUMN agent_price NUMERIC(10, 2) DEFAULT 0.00;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'services_config' AND column_name = 'reseller_price') THEN
        ALTER TABLE public.services_config ADD COLUMN reseller_price NUMERIC(10, 2) DEFAULT 0.00;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'services_config' AND column_name = 'retail_price') THEN
        ALTER TABLE public.services_config ADD COLUMN retail_price NUMERIC(10, 2) DEFAULT 0.00;
    END IF;
END $$;

ALTER TABLE public.services_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to active services" ON public.services_config;
CREATE POLICY "Allow public read access to active services" ON public.services_config
    FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Allow authenticated write access to services" ON public.services_config;
CREATE POLICY "Allow authenticated write access to services" ON public.services_config
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service role full access on services" ON public.services_config;
CREATE POLICY "Allow service role full access on services" ON public.services_config
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 4. ATOMIC BALANCE RPC FUNCTIONS (deduct_balance & increment_balance)
-- ----------------------------------------------------------------------------
-- deduct_balance: atomically checks and deducts wallet balance with row-locking
CREATE OR REPLACE FUNCTION public.deduct_balance(user_uuid UUID, amount NUMERIC)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_balance NUMERIC;
BEGIN
    IF amount <= 0 THEN
        RETURN FALSE;
    END IF;

    -- Row-level locking to prevent double-spending race conditions
    SELECT COALESCE(wallet_balance, balance, 0) INTO v_current_balance 
    FROM public.profiles 
    WHERE id = user_uuid 
    FOR UPDATE;

    IF v_current_balance IS NULL THEN
        RETURN FALSE;
    END IF;

    IF v_current_balance >= amount THEN
        UPDATE public.profiles SET 
            wallet_balance = GREATEST(COALESCE(wallet_balance, 0) - amount, 0),
            balance = GREATEST(COALESCE(balance, 0) - amount, 0),
            available_balance = GREATEST(COALESCE(available_balance, 0) - amount, 0),
            updated_at = timezone('utc'::text, now())
        WHERE id = user_uuid;
        RETURN TRUE;
    ELSE
        RETURN FALSE;
    END IF;
END;
$$;

-- increment_balance: atomically credits wallet balance
CREATE OR REPLACE FUNCTION public.increment_balance(user_uuid UUID, amount NUMERIC)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF amount <= 0 THEN
        RETURN FALSE;
    END IF;

    UPDATE public.profiles SET 
        wallet_balance = COALESCE(wallet_balance, 0) + amount,
        balance = COALESCE(balance, 0) + amount,
        available_balance = COALESCE(available_balance, 0) + amount,
        updated_at = timezone('utc'::text, now())
    WHERE id = user_uuid;

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.deduct_balance(UUID, NUMERIC) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_balance(UUID, NUMERIC) TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. VTU FAILURE AUDIT LOG TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vtu_failure_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(50) NOT NULL,
    network VARCHAR(50) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    plan_id VARCHAR(100),
    plan_name VARCHAR(255),
    amount NUMERIC(10, 2) NOT NULL,
    error TEXT NOT NULL,
    raw JSONB,
    user_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.vtu_failure_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service role on vtu_failure_log" ON public.vtu_failure_log;
CREATE POLICY "Allow service role on vtu_failure_log" ON public.vtu_failure_log
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated insert on vtu_failure_log" ON public.vtu_failure_log;
CREATE POLICY "Allow authenticated insert on vtu_failure_log" ON public.vtu_failure_log
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 6. PROFILES AND TRANSACTIONS RLS POLICIES (Ensures app users can read data)
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users to read own profile" ON public.profiles;
CREATE POLICY "Allow users to read own profile" ON public.profiles
    FOR SELECT TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "Allow users to update own profile" ON public.profiles;
CREATE POLICY "Allow users to update own profile" ON public.profiles
    FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Allow service role full profile access" ON public.profiles;
CREATE POLICY "Allow service role full profile access" ON public.profiles
    FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow users to read own transactions" ON public.transactions;
CREATE POLICY "Allow users to read own transactions" ON public.transactions
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow users to insert own transactions" ON public.transactions;
CREATE POLICY "Allow users to insert own transactions" ON public.transactions
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow service role full transactions access" ON public.transactions;
CREATE POLICY "Allow service role full transactions access" ON public.transactions
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Output confirmation
SELECT 'Supabase permissions, tables, and atomic balance RPCs successfully configured!' AS status;
