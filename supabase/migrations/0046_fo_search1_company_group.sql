-- FO-SEARCH1 — nullable company / group names on stays (Issue #54).
--
-- Additive only. Does not seed values, invent company/group from
-- hotel_reservations.source, or add an FO company/group editor.
--
-- No CHECK that copies source into these columns.
-- Trim-on-write lives in TypeScript (trimCompanyGroupName).
--
-- No new tables, RPCs, RLS policies, or SECURITY DEFINER functions.
--
-- IN THE PR ONLY — do not apply to live until Abel instructs after merge.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f supabase/migrations/0046_fo_search1_company_group.sql
--
-- Rollback:
--   ALTER TABLE public.hotel_reservations DROP COLUMN IF EXISTS company_name;
--   ALTER TABLE public.hotel_reservations DROP COLUMN IF EXISTS group_name;

ALTER TABLE public.hotel_reservations
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS group_name text;

COMMENT ON COLUMN public.hotel_reservations.company_name IS
  'FO-SEARCH1 optional company label. Null until stored. Never derived from source.';
COMMENT ON COLUMN public.hotel_reservations.group_name IS
  'FO-SEARCH1 optional group label. Null until stored. Never derived from source.';
