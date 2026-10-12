-- Phase 1 compatibility: corporate agreements may reference the canonical
-- rate cancellation catalogue without moving existing legacy rows.
--
-- Sequential after 0141. Dual-lane: byte-identical copies live in
--   supabase/migrations/0142_pms_corporate_agreement_rate_cancellation.sql
--   drizzle/migrations/0142_pms_corporate_agreement_rate_cancellation.sql
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY AFTER MERGE — wait for PM approval of this SQL before apply.
--
-- Adds nullable rate_cancellation_policy_id. Leaves cancellation_policy_id
-- and public.pms_cancellation_policies in place. Does not copy or update rows.
--
-- Rollback:
--   ALTER TABLE public.pms_corporate_agreements
--     DROP CONSTRAINT IF EXISTS pms_corporate_agreements_rate_cancellation_same_property;
--   DROP INDEX IF EXISTS public.pms_corporate_agreements_rate_cancellation_idx;
--   ALTER TABLE public.pms_corporate_agreements
--     DROP COLUMN IF EXISTS rate_cancellation_policy_id;

ALTER TABLE public.pms_corporate_agreements
  ADD COLUMN IF NOT EXISTS rate_cancellation_policy_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pms_corporate_agreements_rate_cancellation_same_property'
      AND conrelid = 'public.pms_corporate_agreements'::regclass
  ) THEN
    ALTER TABLE public.pms_corporate_agreements
      ADD CONSTRAINT pms_corporate_agreements_rate_cancellation_same_property
      FOREIGN KEY (rate_cancellation_policy_id, restaurant_id)
      REFERENCES public.pms_rate_cancellation_policies(id, restaurant_id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS pms_corporate_agreements_rate_cancellation_idx
  ON public.pms_corporate_agreements (restaurant_id, rate_cancellation_policy_id);

COMMENT ON COLUMN public.pms_corporate_agreements.rate_cancellation_policy_id IS
  'Canonical stay cancellation catalogue (pms_rate_cancellation_policies). Nullable during Phase 1. Legacy cancellation_policy_id remains until a later phase.';
