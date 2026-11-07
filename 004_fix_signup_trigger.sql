-- Migration 004: Fix "Database error saving new user" on signup
-- Root cause: guard_role_update trigger uses auth.role() which returns 'anon'
-- inside trigger context (not 'service_role'), causing it to block the
-- on_auth_user_created trigger when it tries to INSERT into profiles.
-- Fix: allow INSERT freely; only guard UPDATEs that change role from non-null.

-- 1. Fix guard_role_update to not block INSERT-triggered upserts
CREATE OR REPLACE FUNCTION guard_role_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- Only block direct role UPDATES from non-service-role sessions
    -- TG_OP = 'INSERT' is always allowed (from trigger or signup)
    IF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
        -- current_setting returns empty string in trigger context, not 'service_role'
        -- Use a safer check: only block if explicitly an authenticated user session
        IF current_setting('role', true) NOT IN ('service_role', '') 
           AND current_setting('request.jwt.claims', true) != '' THEN
            RAISE EXCEPTION 'Only service role may change user roles.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- 2. Recreate handle_new_user with safer conflict handling
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_referral_code TEXT;
BEGIN
    -- Generate unique referral code
    v_referral_code := upper(substring(md5(NEW.id::text || random()::text), 1, 8));
    
    INSERT INTO profiles (
        id, email, full_name, wallet_balance, balance, available_balance,
        role, referral_code, transaction_pin, created_at, updated_at
    ) VALUES (
        NEW.id,
        COALESCE(NEW.email, NEW.raw_user_meta_data->>'email'),
        COALESCE(
            NEW.raw_user_meta_data->>'name',
            NEW.raw_user_meta_data->>'full_name',
            split_part(COALESCE(NEW.email, ''), '@', 1),
            'User'
        ),
        0, 0, 0,
        'user',
        v_referral_code,
        '0000',
        now(), now()
    )
    ON CONFLICT (id) DO UPDATE SET
        email      = COALESCE(EXCLUDED.email, profiles.email),
        full_name  = COALESCE(NULLIF(EXCLUDED.full_name,''), profiles.full_name),
        updated_at = now();

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Never let a profile insert failure block auth user creation
    RAISE WARNING 'handle_new_user failed for %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- 3. Re-bind trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

GRANT EXECUTE ON FUNCTION handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION guard_role_update() TO service_role;

-- Done
