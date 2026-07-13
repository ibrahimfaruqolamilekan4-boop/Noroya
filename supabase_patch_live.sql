-- ============================================================================
-- Noroya — LIVE DB targeted patch (July 2026)
-- Applied directly against the real project via the session pooler.
-- Safe to re-run (idempotent). Does NOT touch transactions / wallet_funding_logs /
-- services_config / system_config — those weren't part of the diagnosed bug and
-- weren't audited in this pass.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. ROOT CAUSE: two conflicting AFTER INSERT triggers on auth.users.
-- `handle_new_user_setup()` tried to INSERT INTO public.transactions using a
-- column called `type` (the real column is `transaction_type`) and omitted two
-- other NOT NULL columns (`provider_or_network`, `item_name`). That INSERT threw
-- a hard SQL error every single time, which aborted the *entire* auth.users
-- insert transaction — meaning literally every signup failed at the database
-- level. This is why only one account (created before this was introduced, or
-- via a path that didn't trip it) ever made it into `profiles`.
-- ----------------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_signup on auth.users;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.handle_new_user_setup() cascade;

-- ----------------------------------------------------------------------------
-- 1. Align columns with what the app actually reads (AuthContext.tsx expects
-- `full_name` and `role`; the live table only had `name` and no role at all).
-- ----------------------------------------------------------------------------
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists role text not null default 'user';

update public.profiles
set full_name = coalesce(full_name, name),
    role = case when lower(email) = 'ibrahimfaruqolamilekan4@gmail.com' then 'admin' else role end
where full_name is null or (lower(email) = 'ibrahimfaruqolamilekan4@gmail.com' and role <> 'admin');

-- ----------------------------------------------------------------------------
-- 2. One clean, correct signup trigger. Reads the exact metadata keys the
-- client sends (name, username, phone_number, transaction_pin, referral_code).
-- No transactions-table side effect -- a signup is not a VTU transaction.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id, email, name, full_name, username, phone_number,
    transaction_pin, referral_code, role, balance, wallet_balance
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'phone_number',
    new.raw_user_meta_data->>'transaction_pin',
    nullif(new.raw_user_meta_data->>'referral_code', ''),
    case when lower(new.email) = 'ibrahimfaruqolamilekan4@gmail.com' then 'admin' else 'user' end,
    0.00,
    0.00
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 3. Lock down RLS. The live policy set included "Master Open Access" --
-- USING (true) WITH CHECK (true) FOR ALL -- which let any authenticated (or
-- anon, depending on key) request read or overwrite ANY user's row, including
-- wallet_balance and transaction_pin. That's a critical hole; removing it.
-- Also de-duplicates the redundant self-select/self-update policies.
-- ----------------------------------------------------------------------------
drop policy if exists "Master Open Access" on public.profiles;
drop policy if exists "Allow users to view their own profile" on public.profiles;
drop policy if exists "Allow users to update their own profile" on public.profiles;
drop policy if exists "Allow new signups to insert a profile" on public.profiles;
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Admins can view all profiles" on public.profiles;
drop policy if exists "Admins can update all profiles" on public.profiles;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select role from public.profiles where id = auth.uid()) = 'admin', false);
$$;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id or public.is_admin());

create policy "Allow new signups to insert a profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- ----------------------------------------------------------------------------
-- 4. Defense in depth: even with RLS locked to "own row", a client could still
-- PATCH their own row's wallet_balance/role/referral_code to anything they want
-- (RLS only checks *which rows*, not *which columns*). Block that at the
-- trigger level -- only service_role (backend, bypasses RLS+this check) or an
-- existing admin may change these fields.
-- ----------------------------------------------------------------------------
create or replace function public.guard_profile_tamper()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' or public.is_admin() then
    return new;
  end if;

  if new.wallet_balance is distinct from old.wallet_balance
     or new.balance is distinct from old.balance
     or new.role is distinct from old.role
     or new.referral_code is distinct from old.referral_code then
    raise exception 'Not permitted to modify protected profile fields directly.';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_profile_tamper_trigger on public.profiles;
create trigger guard_profile_tamper_trigger
  before update on public.profiles
  for each row execute function public.guard_profile_tamper();

-- ----------------------------------------------------------------------------
-- 5. Referral-code lookup RPC, since RLS no longer allows reading other users'
-- rows directly -- signup needs to verify a referral code belongs to someone.
-- ----------------------------------------------------------------------------
create or replace function public.get_referral_owner(code text)
returns table(owner_id uuid, owner_name text)
language sql
security definer
set search_path = public
stable
as $$
  select id, coalesce(full_name, name, 'User') from public.profiles where referral_code = code;
$$;
