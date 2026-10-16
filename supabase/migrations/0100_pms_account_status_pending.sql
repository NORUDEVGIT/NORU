-- Drop the Wave 4 status check that still forbids pending.
-- 0090 added guest_account_masters_account_status_check (active/inactive/pending)
-- but left guest_account_masters_status_check (active/inactive) in place.
-- Dual-lane with drizzle/migrations/0100_pms_account_status_pending.sql.

ALTER TABLE public.guest_account_masters
  DROP CONSTRAINT IF EXISTS guest_account_masters_status_check;
