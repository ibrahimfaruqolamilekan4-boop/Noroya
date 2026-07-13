-- Supabase Migration File for VTU billing app: Noroya
-- This migration consolidates user profile management into a single 'profiles' table,
-- sets up Row Level Security (RLS) with security triggers to prevent privileged field updates,
-- implements security definer functions for safe referral code lookups,
-- and automates user profile creation server-side using a database trigger on auth.users.

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

--------------------------------------------------------------------------------
-- 1. Consolidated Profiles Table
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email text,
    full_name text,
    username text UNIQUE,
    phone_number text,
    referral_code text UNIQUE,
    referred_by uuid REFERENCES public.profiles(id),
    transaction_pin text,
    wallet_balance numeric(14,2) DEFAULT 0.00 NOT NULL,
    role text DEFAULT 'user' NOT NULL CHECK (role IN ('user', 'admin')),
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- Note: The client-side also searches/writes to a 'users' table or view in some legacy files.
-- To maintain backward compatibility without data drift or duplicate writes, we can expose 'users' as a VIEW pointing to 'profiles'.
-- This guarantees perfect single-source-of-truth and prevents any write race conditions!
-- Let's drop the table if it was there and create a view, or simply provide it as a secure view.
DROP VIEW IF EXISTS public.users;
CREATE OR REPLACE VIEW public.users AS
SELECT 
    id,
    id AS uid, -- Alias to support client structures
    email,
    full_name,
    full_name AS name, -- Supporting alternate name keys
    username,
    phone_number,
    phone_number AS "phoneNumber",
    referral_code,
    referral_code AS "referralCode",
    referred_by,
    referred_by AS "referredBy",
    transaction_pin,
    transaction_pin AS "transactionPin",
    wallet_balance,
    wallet_balance AS balance, -- Alias balance to wallet_balance
    wallet_balance AS available_balance,
    role,
    role AS user_role, -- Alias user_role to role
    false AS is_reseller, -- Alias is_reseller to maintain client structures
    created_at,
    created_at AS "createdAt",
    updated_at
FROM public.profiles;

--------------------------------------------------------------------------------
-- 2. Enable Row Level Security (RLS) on Profiles
--------------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--------------------------------------------------------------------------------
-- 3. RLS Policies & Security Definer Functions
--------------------------------------------------------------------------------

-- (a) Policies for Authenticated Users (Select and Update own row)
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" 
    ON public.profiles 
    FOR SELECT 
    TO authenticated 
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" 
    ON public.profiles 
    FOR UPDATE 
    TO authenticated 
    USING (auth.uid() = id) 
    WITH CHECK (auth.uid() = id);

-- (a-1) Trigger to prevent non-admin/non-service-role users from updating 'role' or 'wallet_balance'
CREATE OR REPLACE FUNCTION public.prevent_privileged_field_update()
RETURNS trigger AS $$
DECLARE
    current_jwt_role text;
    current_user_db_role text;
BEGIN
    -- Get current user db role if available
    SELECT role INTO current_user_db_role FROM public.profiles WHERE id = auth.uid();
    
    -- Extract role from JWT if available
    BEGIN
        current_jwt_role := coalesce(auth.jwt() ->> 'role', '');
    EXCEPTION WHEN OTHERS THEN
        current_jwt_role := '';
    END;

    -- Bypass check if executing as service_role, or if the logged-in user is an admin
    IF current_jwt_role = 'service_role' OR current_user_db_role = 'admin' THEN
        RETURN NEW;
    END IF;

    -- Block normal authenticated users from modifying wallet_balance or role
    IF NEW.role IS DISTINCT FROM OLD.role THEN
        RAISE EXCEPTION 'You are not authorized to update user roles.';
    END IF;

    IF NEW.wallet_balance IS DISTINCT FROM OLD.wallet_balance THEN
        RAISE EXCEPTION 'You are not authorized to directly modify your wallet balance.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_prevent_privileged_field_update ON public.profiles;
CREATE TRIGGER tr_prevent_privileged_field_update
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_privileged_field_update();


-- (b) SECURITY DEFINER function to lookup profiles by referral code safely without broad SELECT access
CREATE OR REPLACE FUNCTION public.get_referral_owner(code text)
RETURNS TABLE(owner_id uuid, owner_name text) AS $$
BEGIN
    RETURN QUERY
    SELECT id, full_name
    FROM public.profiles
    WHERE upper(referral_code) = upper(code)
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant EXECUTE permission to public, anon, and authenticated
GRANT EXECUTE ON FUNCTION public.get_referral_owner(text) TO anon, authenticated, public;


-- (c) Policies for Admins to view/update all profiles
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" 
    ON public.profiles 
    FOR SELECT 
    TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p 
            WHERE p.id = auth.uid() AND p.role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles" 
    ON public.profiles 
    FOR UPDATE 
    TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p 
            WHERE p.id = auth.uid() AND p.role = 'admin'
        )
    );

--------------------------------------------------------------------------------
-- 4. Automatically Sync auth.users to public.profiles via Trigger
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    meta_name text;
    meta_username text;
    meta_phone text;
    meta_transaction_pin text;
    meta_referral_code_input text;
    new_referral_code text;
    referrer_id uuid;
    resolved_role text;
BEGIN
    -- Extract values from raw_user_meta_data payload
    meta_name := coalesce(
        NEW.raw_user_meta_data ->> 'name',
        NEW.raw_user_meta_data ->> 'full_name',
        NEW.raw_user_meta_data ->> 'fullName',
        split_part(NEW.email, '@', 1)
    );
    
    meta_username := coalesce(
        NEW.raw_user_meta_data ->> 'username',
        split_part(NEW.email, '@', 1) || '_' || substr(md5(random()::text), 1, 4)
    );
    
    meta_phone := coalesce(
        NEW.raw_user_meta_data ->> 'phone_number',
        NEW.raw_user_meta_data ->> 'phone',
        ''
    );
    
    meta_transaction_pin := coalesce(
        NEW.raw_user_meta_data ->> 'transaction_pin',
        NEW.raw_user_meta_data ->> 'pin',
        ''
    );
    
    meta_referral_code_input := NEW.raw_user_meta_data ->> 'referral_code';

    -- Generate a unique referral code for the new user if none exists
    new_referral_code := 'NOROYA-' || upper(substr(md5(random()::text), 1, 5));
    
    -- Determine role (Admin for specified owner email, else user)
    IF NEW.email = 'ibrahimfaruqolamilekan4@gmail.com' THEN
        resolved_role := 'admin';
    ELSE
        resolved_role := 'user';
    END IF;

    -- Resolve referredBy id using the submitted referral code
    IF meta_referral_code_input IS NOT NULL AND meta_referral_code_input <> '' THEN
        SELECT id INTO referrer_id 
        FROM public.profiles 
        WHERE upper(referral_code) = upper(meta_referral_code_input) 
        LIMIT 1;
    END IF;

    -- Insert atomic profile record
    INSERT INTO public.profiles (
        id,
        email,
        full_name,
        username,
        phone_number,
        referral_code,
        referred_by,
        transaction_pin,
        wallet_balance,
        role
    ) VALUES (
        NEW.id,
        NEW.email,
        meta_name,
        meta_username,
        meta_phone,
        new_referral_code,
        referrer_id,
        meta_transaction_pin,
        0.00,
        resolved_role
    ) ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = coalesce(profiles.full_name, EXCLUDED.full_name),
        username = coalesce(profiles.username, EXCLUDED.username);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_handle_new_user ON auth.users;
CREATE TRIGGER tr_handle_new_user
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

--------------------------------------------------------------------------------
-- 5. Auto-update updated_at Trigger
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_handle_updated_at ON public.profiles;
CREATE TRIGGER tr_handle_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
