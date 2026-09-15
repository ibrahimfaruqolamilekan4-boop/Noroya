-- ============================================================
-- Migration 005: Enable Realtime for profiles + transactions
-- Run in Supabase SQL Editor → https://sdbfuuxdquzvtcwryimh.supabase.co
--
-- WHY: the database was created from raw SQL scripts, so these
-- tables were never added to the `supabase_realtime` publication
-- (the "Enable Realtime" dashboard toggle is the only thing that
-- normally does that). Every realtime listener in the frontend
-- (AuthContext `profiles-realtime-*`, DashboardOverview
-- `profile-changes`, TransactionHistory `live-transactions-*`)
-- subscribed fine but received ZERO events — so admin wallet
-- funding / webhook credits / transfers only appeared after a
-- full reload or the 8s poll, and never while a phone had the
-- PWA backgrounded (setInterval is throttled there).
--
-- Safe to re-run: everything below is idempotent.
-- ============================================================

-- 1. Ensure the publication exists (Supabase creates it by
--    default on new projects, but never assume).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END
$$;

-- 2. Add the tables this app's realtime listeners depend on.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public' AND tablename = 'profiles'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public' AND tablename = 'transactions'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
    END IF;
END
$$;

-- 3. Full replica identity so UPDATE events carry the complete
--    new row for Realtime's per-subscriber RLS filtering.
ALTER TABLE public.profiles    REPLICA IDENTITY FULL;
ALTER TABLE public.transactions REPLICA IDENTITY FULL;

-- 4. Verify (optional): should return both tables.
-- SELECT tablename FROM pg_publication_tables
--  WHERE pubname = 'supabase_realtime' AND schemaname = 'public';
