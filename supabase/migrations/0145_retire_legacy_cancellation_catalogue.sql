-- Phase 4B: retire the legacy cancellation catalogue.
--
-- Sequential after 0144. Dual-lane: byte-identical copies live in
--   supabase/migrations/0145_retire_legacy_cancellation_catalogue.sql
--   drizzle/migrations/0145_retire_legacy_cancellation_catalogue.sql
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY AFTER MERGE — wait for PM approval of this SQL before apply.
--
-- Does not edit 0120, 0125, 0142, 0143, or 0144.
-- Dependent objects are dropped explicitly before the table.
-- Does not change hotel_rate_plans.cancellation_policy_id.
--
-- Drops, after safety assertions:
--   pms_corporate_agreements.cancellation_policy_id
--   guest_account_masters.default_cancellation_policy_id
--   public.pms_cancellation_policies
--
-- Keeps:
--   pms_corporate_agreements.rate_cancellation_policy_id
--   guest_account_masters.rate_cancellation_policy_id

DO $$
DECLARE
  bad_count integer;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pms_corporate_agreements'
      AND column_name = 'cancellation_policy_id'
  ) THEN
    SELECT COUNT(*)::integer INTO bad_count
    FROM public.pms_corporate_agreements
    WHERE cancellation_policy_id IS NOT NULL
      AND rate_cancellation_policy_id IS NULL;
    IF bad_count > 0 THEN
      RAISE EXCEPTION 'Phase 4B: corporate agreement still has only a legacy cancellation policy (% row(s))', bad_count;
    END IF;
  END IF;

  SELECT COUNT(*)::integer INTO bad_count
  FROM public.pms_corporate_agreements a
  WHERE a.rate_cancellation_policy_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.pms_rate_cancellation_policies p
      WHERE p.id = a.rate_cancellation_policy_id
        AND p.restaurant_id = a.restaurant_id
    );
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'Phase 4B: corporate agreement canonical cancellation policy is missing or belongs to another property (% row(s))', bad_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'guest_account_masters'
      AND column_name = 'default_cancellation_policy_id'
  ) THEN
    SELECT COUNT(*)::integer INTO bad_count
    FROM public.guest_account_masters
    WHERE default_cancellation_policy_id IS NOT NULL
      AND rate_cancellation_policy_id IS NULL;
    IF bad_count > 0 THEN
      RAISE EXCEPTION 'Phase 4B: guest account still has only a legacy cancellation policy (% row(s))', bad_count;
    END IF;
  END IF;

  SELECT COUNT(*)::integer INTO bad_count
  FROM public.guest_account_masters a
  WHERE a.rate_cancellation_policy_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.pms_rate_cancellation_policies p
      WHERE p.id = a.rate_cancellation_policy_id
        AND p.restaurant_id = a.restaurant_id
    );
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'Phase 4B: guest account canonical cancellation policy is missing or belongs to another property (% row(s))', bad_count;
  END IF;
END $$;

ALTER TABLE public.pms_corporate_agreements
  DROP CONSTRAINT IF EXISTS pms_corporate_agreements_cancellation_policy_id_fkey;

ALTER TABLE public.pms_corporate_agreements
  DROP CONSTRAINT IF EXISTS pms_corporate_agreements_rate_cancellation_policy_fk;

ALTER TABLE public.guest_account_masters
  DROP CONSTRAINT IF EXISTS guest_account_masters_default_cancellation_policy_fk;

ALTER TABLE public.guest_account_masters
  DROP CONSTRAINT IF EXISTS guest_account_masters_rate_cancellation_policy_fk;

DROP INDEX IF EXISTS public.guest_account_masters_default_cancellation_policy_idx;

ALTER TABLE public.pms_corporate_agreements
  DROP COLUMN IF EXISTS cancellation_policy_id;

ALTER TABLE public.guest_account_masters
  DROP COLUMN IF EXISTS default_cancellation_policy_id;

DO $$
DECLARE
  bad_count integer;
BEGIN
  IF to_regclass('public.pms_cancellation_policies') IS NULL THEN
    RETURN;
  END IF;

  SELECT COUNT(*)::integer INTO bad_count
  FROM pg_constraint c
  JOIN pg_class referenced ON referenced.oid = c.confrelid
  JOIN pg_namespace referenced_ns ON referenced_ns.oid = referenced.relnamespace
  WHERE c.contype = 'f'
    AND referenced_ns.nspname = 'public'
    AND referenced.relname = 'pms_cancellation_policies';
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'Phase 4B: pms_cancellation_policies still has % foreign key dependency(s); refusing to drop the table while dependencies remain', bad_count;
  END IF;

  SELECT COUNT(*)::integer INTO bad_count
  FROM pg_depend d
  JOIN pg_class source ON source.oid = d.objid
  JOIN pg_class referenced ON referenced.oid = d.refobjid
  JOIN pg_namespace referenced_ns ON referenced_ns.oid = referenced.relnamespace
  WHERE referenced_ns.nspname = 'public'
    AND referenced.relname = 'pms_cancellation_policies'
    AND source.relkind = 'v';
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'Phase 4B: a view still depends on pms_cancellation_policies (% dependency(s)); refusing to drop the table while dependencies remain', bad_count;
  END IF;
END $$;

DROP TABLE IF EXISTS public.pms_cancellation_policies;
