-- Migration 0125: Unify PMS Cancellation Policies on Card 2 (pms_rate_cancellation_policies)
-- Dual-lane with drizzle/migrations/0125_pms_cancellation_policies_card2_unification.sql
-- Card 2 (Rate & Pricing) is the canonical owner of cancellation policies.
-- Card 3 (Payments & Deposits) cancellation policies section has been retired.
-- Re-point foreign keys in pms_corporate_agreements and guest_account_masters to pms_rate_cancellation_policies(id).

-- 1. Sync any existing policies from pms_rate_cancellation_policies to pms_cancellation_policies for backward compatibility if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pms_cancellation_policies')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pms_rate_cancellation_policies') THEN
    INSERT INTO public.pms_cancellation_policies (
      id,
      restaurant_id,
      code,
      name,
      description,
      cutoff_hours,
      penalty_type,
      penalty_value,
      is_default,
      active,
      created_at,
      updated_at
    )
    SELECT
      r.id,
      r.restaurant_id,
      r.code,
      r.name,
      r.description,
      COALESCE(r.deadline_hours, 24),
      'none',
      COALESCE(r.penalty_value, 0),
      false,
      COALESCE(r.active, true),
      COALESCE(r.created_at, now()),
      COALESCE(r.updated_at, now())
    FROM public.pms_rate_cancellation_policies r
    ON CONFLICT (id) DO NOTHING;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 2. Update pms_corporate_agreements foreign key to reference pms_rate_cancellation_policies(id)
DO $$
DECLARE
  r RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pms_corporate_agreements') THEN
    -- Drop existing foreign key pointing to pms_cancellation_policies
    FOR r IN (
      SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid
      JOIN pg_class rcl ON rcl.oid = c.confrelid
      WHERE cl.relname = 'pms_corporate_agreements'
        AND rcl.relname = 'pms_cancellation_policies'
    ) LOOP
      EXECUTE 'ALTER TABLE public.pms_corporate_agreements DROP CONSTRAINT ' || quote_ident(r.conname);
    END LOOP;

    -- Add constraint referencing pms_rate_cancellation_policies(id)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pms_rate_cancellation_policies')
       AND NOT EXISTS (
         SELECT 1
         FROM pg_constraint c
         JOIN pg_class cl ON cl.oid = c.conrelid
         JOIN pg_class rcl ON rcl.oid = c.confrelid
         WHERE cl.relname = 'pms_corporate_agreements'
           AND rcl.relname = 'pms_rate_cancellation_policies'
       ) THEN
      ALTER TABLE public.pms_corporate_agreements
        ADD CONSTRAINT pms_corporate_agreements_rate_cancellation_policy_fk
        FOREIGN KEY (cancellation_policy_id)
        REFERENCES public.pms_rate_cancellation_policies(id)
        ON DELETE SET NULL;
    END IF;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 3. Update guest_account_masters foreign key to reference pms_rate_cancellation_policies(id)
DO $$
DECLARE
  r RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'guest_account_masters') THEN
    -- Drop existing foreign key pointing to pms_cancellation_policies
    FOR r IN (
      SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid
      JOIN pg_class rcl ON rcl.oid = c.confrelid
      WHERE cl.relname = 'guest_account_masters'
        AND rcl.relname = 'pms_cancellation_policies'
    ) LOOP
      EXECUTE 'ALTER TABLE public.guest_account_masters DROP CONSTRAINT ' || quote_ident(r.conname);
    END LOOP;

    -- Add constraint referencing pms_rate_cancellation_policies(id)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pms_rate_cancellation_policies')
       AND NOT EXISTS (
         SELECT 1
         FROM pg_constraint c
         JOIN pg_class cl ON cl.oid = c.conrelid
         JOIN pg_class rcl ON rcl.oid = c.confrelid
         WHERE cl.relname = 'guest_account_masters'
           AND rcl.relname = 'pms_rate_cancellation_policies'
       ) THEN
      ALTER TABLE public.guest_account_masters
        ADD CONSTRAINT guest_account_masters_rate_cancellation_policy_fk
        FOREIGN KEY (default_cancellation_policy_id)
        REFERENCES public.pms_rate_cancellation_policies(id)
        ON DELETE SET NULL;
    END IF;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
