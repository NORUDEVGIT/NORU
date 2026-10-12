-- Phase 4A: guest accounts may reference the canonical rate cancellation catalogue.
--
-- Sequential after 0143. Dual-lane: byte-identical copies live in
--   supabase/migrations/0144_guest_account_rate_cancellation.sql
--   drizzle/migrations/0144_guest_account_rate_cancellation.sql
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY AFTER MERGE — wait for PM approval of this SQL before apply.
--
-- 0124 named the live legacy FK guest_account_masters_default_cancellation_policy_fk
-- and pointed default_cancellation_policy_id at pms_cancellation_policies(id).
-- 0125 tried to drop that FK and retarget the same column at
-- pms_rate_cancellation_policies(id), then swallowed every error. That in-place
-- repoint is not safe: 0125 copied rate rows into the legacy table with the same
-- id, and it did not map distinct legacy ids onto canonical rows. This migration
-- does not edit 0125 and does not repoint default_cancellation_policy_id.
--
-- Adds nullable rate_cancellation_policy_id. Leaves default_cancellation_policy_id
-- and public.pms_cancellation_policies in place. Does not drop either.
--
-- Backfill uses the Phase 2 field mapping. An id that already exists on
-- pms_rate_cancellation_policies for the same property is reused. Otherwise one
-- equivalent canonical row is reused, or one equivalent row is inserted. More
-- than one equivalent match fails. A same-code row with different terms is not
-- updated. An already-populated rate_cancellation_policy_id is not overwritten.
--
-- Rollback does not drop the legacy column or table:
--   ALTER TABLE public.guest_account_masters
--     DROP CONSTRAINT IF EXISTS guest_account_masters_rate_cancellation_same_property;
--   DROP INDEX IF EXISTS public.guest_account_masters_rate_cancellation_idx;
--   ALTER TABLE public.guest_account_masters
--     DROP COLUMN IF EXISTS rate_cancellation_policy_id;

ALTER TABLE public.guest_account_masters
  ADD COLUMN IF NOT EXISTS rate_cancellation_policy_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'guest_account_masters_rate_cancellation_same_property'
      AND conrelid = 'public.guest_account_masters'::regclass
  ) THEN
    ALTER TABLE public.guest_account_masters
      ADD CONSTRAINT guest_account_masters_rate_cancellation_same_property
      FOREIGN KEY (rate_cancellation_policy_id, restaurant_id)
      REFERENCES public.pms_rate_cancellation_policies(id, restaurant_id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS guest_account_masters_rate_cancellation_idx
  ON public.guest_account_masters (restaurant_id, rate_cancellation_policy_id);

COMMENT ON COLUMN public.guest_account_masters.rate_cancellation_policy_id IS
  'Canonical stay cancellation catalogue (pms_rate_cancellation_policies). Legacy default_cancellation_policy_id remains until Phase 4B.';

DO $$
DECLARE
  bad_count integer;
  rec record;
  mapped_penalty text;
  mapped_kind text;
  mapped_description text;
  corp_code text;
  id_code text;
  target_code text;
  match_count integer;
  match_id uuid;
  chosen_id uuid;
  code_owner uuid;
BEGIN
  SELECT COUNT(*)::integer INTO bad_count
  FROM public.guest_account_masters a
  JOIN public.pms_cancellation_policies p ON p.id = a.default_cancellation_policy_id
  WHERE a.rate_cancellation_policy_id IS NULL
    AND p.restaurant_id IS DISTINCT FROM a.restaurant_id;
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'Phase 4A: guest account references a cancellation policy from another property (% row(s))', bad_count;
  END IF;

  SELECT COUNT(*)::integer INTO bad_count
  FROM public.guest_account_masters a
  WHERE a.rate_cancellation_policy_id IS NULL
    AND a.default_cancellation_policy_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.pms_cancellation_policies p
      WHERE p.id = a.default_cancellation_policy_id
        AND p.restaurant_id = a.restaurant_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.pms_rate_cancellation_policies c
      WHERE c.id = a.default_cancellation_policy_id
        AND c.restaurant_id = a.restaurant_id
    );
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'Phase 4A: referenced cancellation policy cannot be converted (% row(s))', bad_count;
  END IF;

  SELECT COUNT(*)::integer INTO bad_count
  FROM public.pms_cancellation_policies p
  WHERE EXISTS (
      SELECT 1
      FROM public.guest_account_masters a
      WHERE a.default_cancellation_policy_id = p.id
        AND a.restaurant_id = p.restaurant_id
        AND a.rate_cancellation_policy_id IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.pms_rate_cancellation_policies c
          WHERE c.id = a.default_cancellation_policy_id
            AND c.restaurant_id = a.restaurant_id
        )
    )
    AND p.penalty_type NOT IN ('none', 'first_night', 'percent_stay', 'fixed_amount', 'full_stay');
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'Phase 4A: unsupported cancellation penalty type (% row(s))', bad_count;
  END IF;

  UPDATE public.guest_account_masters a
     SET rate_cancellation_policy_id = a.default_cancellation_policy_id
   WHERE a.rate_cancellation_policy_id IS NULL
     AND a.default_cancellation_policy_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.pms_rate_cancellation_policies c
       WHERE c.id = a.default_cancellation_policy_id
         AND c.restaurant_id = a.restaurant_id
     );

  FOR rec IN
    SELECT
      p.id,
      p.restaurant_id,
      p.code,
      p.name,
      p.description,
      p.cutoff_hours,
      p.penalty_type,
      p.penalty_value,
      p.refundable_before_cutoff,
      p.active
    FROM public.pms_cancellation_policies p
    WHERE EXISTS (
      SELECT 1
      FROM public.guest_account_masters a
      WHERE a.default_cancellation_policy_id = p.id
        AND a.restaurant_id = p.restaurant_id
        AND a.rate_cancellation_policy_id IS NULL
    )
    ORDER BY p.id
  LOOP
    mapped_penalty := CASE rec.penalty_type
      WHEN 'percent_stay' THEN 'percentage'
      WHEN 'none' THEN 'none'
      WHEN 'first_night' THEN 'first_night'
      WHEN 'fixed_amount' THEN 'fixed_amount'
      WHEN 'full_stay' THEN 'full_stay'
      ELSE NULL
    END;
    IF mapped_penalty IS NULL THEN
      RAISE EXCEPTION 'Phase 4A: unsupported cancellation penalty type % on policy %', rec.penalty_type, rec.id;
    END IF;

    mapped_kind := CASE
      WHEN rec.refundable_before_cutoff THEN 'free_cancellation'
      ELSE 'flexible'
    END;
    mapped_description := NULLIF(btrim(rec.description), '');

    SELECT COUNT(*)::integer, MIN(c.id)
      INTO match_count, match_id
    FROM public.pms_rate_cancellation_policies c
    WHERE c.restaurant_id = rec.restaurant_id
      AND btrim(c.name) = btrim(rec.name)
      AND c.description IS NOT DISTINCT FROM mapped_description
      AND c.active IS NOT DISTINCT FROM rec.active
      AND c.policy_kind = mapped_kind
      AND c.window_value IS NOT DISTINCT FROM rec.cutoff_hours
      AND c.window_unit = 'hours_before_arrival'
      AND c.deadline_hours IS NOT DISTINCT FROM rec.cutoff_hours
      AND c.penalty_type = mapped_penalty
      AND c.penalty_value IS NOT DISTINCT FROM rec.penalty_value
      AND c.cutoff_time IS NULL;

    IF match_count > 1 THEN
      RAISE EXCEPTION 'Phase 4A: ambiguous canonical cancellation policy matches for legacy policy %', rec.id;
    END IF;

    chosen_id := match_id;

    IF match_count = 0 THEN
      corp_code := CASE
        WHEN length(rec.code) <= 15 THEN rec.code || '_CORP'
        ELSE left(rec.code, 15) || '_CORP'
      END;
      id_code := left(rec.code, 11) || '_' || left(upper(replace(rec.id::text, '-', '')), 8);
      target_code := NULL;

      IF length(rec.code) <= 20 AND rec.code ~ '^[A-Z0-9_]{1,20}$' THEN
        code_owner := NULL;
        SELECT c.id INTO code_owner
        FROM public.pms_rate_cancellation_policies c
        WHERE c.restaurant_id = rec.restaurant_id
          AND c.code = rec.code;
        IF code_owner IS NULL THEN
          target_code := rec.code;
        END IF;
      END IF;

      IF target_code IS NULL THEN
        code_owner := NULL;
        SELECT c.id INTO code_owner
        FROM public.pms_rate_cancellation_policies c
        WHERE c.restaurant_id = rec.restaurant_id
          AND c.code = corp_code;
        IF code_owner IS NULL THEN
          target_code := corp_code;
        END IF;
      END IF;

      IF target_code IS NULL THEN
        code_owner := NULL;
        SELECT c.id INTO code_owner
        FROM public.pms_rate_cancellation_policies c
        WHERE c.restaurant_id = rec.restaurant_id
          AND c.code = id_code;
        IF code_owner IS NULL AND id_code ~ '^[A-Z0-9_]{1,20}$' THEN
          target_code := id_code;
        ELSE
          RAISE EXCEPTION 'Phase 4A: canonical cancellation code collision for legacy policy %', rec.id;
        END IF;
      END IF;

      IF target_code IS NULL OR target_code !~ '^[A-Z0-9_]{1,20}$' THEN
        RAISE EXCEPTION 'Phase 4A: canonical cancellation code collision for legacy policy %', rec.id;
      END IF;

      INSERT INTO public.pms_rate_cancellation_policies (
        restaurant_id,
        code,
        name,
        description,
        deadline_hours,
        penalty_type,
        penalty_value,
        active,
        policy_kind,
        window_value,
        window_unit,
        cutoff_time
      ) VALUES (
        rec.restaurant_id,
        target_code,
        btrim(rec.name),
        mapped_description,
        rec.cutoff_hours,
        mapped_penalty,
        rec.penalty_value,
        rec.active,
        mapped_kind,
        rec.cutoff_hours,
        'hours_before_arrival',
        NULL
      )
      RETURNING id INTO chosen_id;
    END IF;

    UPDATE public.guest_account_masters a
       SET rate_cancellation_policy_id = chosen_id
     WHERE a.default_cancellation_policy_id = rec.id
       AND a.restaurant_id = rec.restaurant_id
       AND a.rate_cancellation_policy_id IS NULL;
  END LOOP;

  SELECT COUNT(*)::integer INTO bad_count
  FROM public.guest_account_masters a
  WHERE a.default_cancellation_policy_id IS NOT NULL
    AND a.rate_cancellation_policy_id IS NULL;
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'Phase 4A: referenced cancellation policy cannot be converted (% guest account(s) remain unresolved)', bad_count;
  END IF;
END $$;
