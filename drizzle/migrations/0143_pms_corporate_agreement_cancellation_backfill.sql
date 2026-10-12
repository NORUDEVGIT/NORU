-- Phase 2: backfill corporate agreement cancellation onto the canonical catalogue.
--
-- Sequential after 0142. Dual-lane: byte-identical copies live in
--   supabase/migrations/0143_pms_corporate_agreement_cancellation_backfill.sql
--   drizzle/migrations/0143_pms_corporate_agreement_cancellation_backfill.sql
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY AFTER MERGE — wait for PM approval of this SQL before apply.
--
-- Copies only legacy cancellation policies referenced by
-- pms_corporate_agreements.cancellation_policy_id when
-- rate_cancellation_policy_id is still null.
-- Does not drop pms_cancellation_policies or cancellation_policy_id.
-- Does not null cancellation_policy_id.
-- Does not overwrite a non-null rate_cancellation_policy_id.
-- Does not change hotel_rate_plans, quote, reservation create, front office, or cashiering.
--
-- Field mapping (pms_cancellation_policies → pms_rate_cancellation_policies):
--   restaurant_id → restaurant_id
--   name → btrim(name)
--   description → NULLIF(btrim(description), '')
--   active → active
--   cutoff_hours → deadline_hours
--   cutoff_hours → window_value
--   window_unit → 'hours_before_arrival'
--   cutoff_time → NULL
--     0123 treats null cutoff_time as date-only merchandising. Legacy has no clock.
--   refundable_before_cutoff true → policy_kind 'free_cancellation'
--   refundable_before_cutoff false → policy_kind 'flexible'
--     non_refundable is not used. Card 2 clears window_value and deadline_hours
--     for that kind, while every legacy row keeps cutoff_hours. false means the
--     penalty applies before that cutoff, so flexible is the penalty-bearing kind.
--   penalty_type:
--     none → none
--     first_night → first_night
--     percent_stay → percentage
--       percent_stay is not in the 0123 canonical penalty check.
--     fixed_amount → fixed_amount
--     full_stay → full_stay
--   penalty_value → unchanged
--
-- Reuse one same-property canonical row when name, description, active,
-- policy_kind, window, deadline, penalty type, penalty value, and null
-- cutoff_time all match. More than one match fails. A same-code row with
-- different semantics is not updated. The inserted code is the legacy code
-- when it fits ^[A-Z0-9_]{1,20}$ and is free; otherwise <code or 15 chars>_CORP;
-- otherwise <11 chars>_<8 hex of the legacy id>.
--
-- Rollback does not drop the legacy column or table. It clears only dual-linked
-- agreement FKs created here, leaving Phase 1 rows whose legacy id is null:
--   UPDATE public.pms_corporate_agreements
--      SET rate_cancellation_policy_id = NULL
--    WHERE cancellation_policy_id IS NOT NULL
--      AND rate_cancellation_policy_id IS NOT NULL;
--   Delete unused canonical rows this statement inserted only after checking
--   hotel_rate_plans.cancellation_policy_id. Do not delete a row a rate plan uses.

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
  FROM public.pms_corporate_agreements a
  JOIN public.pms_cancellation_policies p ON p.id = a.cancellation_policy_id
  WHERE a.rate_cancellation_policy_id IS NULL
    AND p.restaurant_id IS DISTINCT FROM a.restaurant_id;
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'Phase 2: corporate agreement references a cancellation policy from another property (% row(s))', bad_count;
  END IF;

  SELECT COUNT(*)::integer INTO bad_count
  FROM public.pms_corporate_agreements a
  WHERE a.rate_cancellation_policy_id IS NULL
    AND a.cancellation_policy_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.pms_cancellation_policies p
      WHERE p.id = a.cancellation_policy_id
        AND p.restaurant_id = a.restaurant_id
    );
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'Phase 2: referenced cancellation policy cannot be converted (% row(s))', bad_count;
  END IF;

  SELECT COUNT(*)::integer INTO bad_count
  FROM public.pms_cancellation_policies p
  WHERE EXISTS (
      SELECT 1
      FROM public.pms_corporate_agreements a
      WHERE a.cancellation_policy_id = p.id
        AND a.restaurant_id = p.restaurant_id
        AND a.rate_cancellation_policy_id IS NULL
    )
    AND p.penalty_type NOT IN ('none', 'first_night', 'percent_stay', 'fixed_amount', 'full_stay');
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'Phase 2: unsupported cancellation penalty type (% row(s))', bad_count;
  END IF;

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
      FROM public.pms_corporate_agreements a
      WHERE a.cancellation_policy_id = p.id
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
      RAISE EXCEPTION 'Phase 2: unsupported cancellation penalty type % on policy %', rec.penalty_type, rec.id;
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
      RAISE EXCEPTION 'Phase 2: ambiguous canonical cancellation policy matches for legacy policy %', rec.id;
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
          RAISE EXCEPTION 'Phase 2: canonical cancellation code collision for legacy policy %', rec.id;
        END IF;
      END IF;

      IF target_code IS NULL OR target_code !~ '^[A-Z0-9_]{1,20}$' THEN
        RAISE EXCEPTION 'Phase 2: canonical cancellation code collision for legacy policy %', rec.id;
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

    UPDATE public.pms_corporate_agreements a
       SET rate_cancellation_policy_id = chosen_id
     WHERE a.cancellation_policy_id = rec.id
       AND a.restaurant_id = rec.restaurant_id
       AND a.rate_cancellation_policy_id IS NULL;
  END LOOP;

  SELECT COUNT(*)::integer INTO bad_count
  FROM public.pms_corporate_agreements a
  WHERE a.cancellation_policy_id IS NOT NULL
    AND a.rate_cancellation_policy_id IS NULL;
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'Phase 2: referenced cancellation policy cannot be converted (% agreement(s) remain unresolved)', bad_count;
  END IF;
END $$;

-- Manual non-prod verification. Do not run against production from an agent.
-- A. Legacy agreements
-- SELECT count(*) AS legacy_agreements
-- FROM public.pms_corporate_agreements
-- WHERE cancellation_policy_id IS NOT NULL;
--
-- B. Backfilled agreements
-- SELECT count(*) AS backfilled_agreements
-- FROM public.pms_corporate_agreements
-- WHERE cancellation_policy_id IS NOT NULL
--   AND rate_cancellation_policy_id IS NOT NULL;
--
-- C. Unresolved agreements
-- SELECT id, restaurant_id, cancellation_policy_id
-- FROM public.pms_corporate_agreements
-- WHERE cancellation_policy_id IS NOT NULL
--   AND rate_cancellation_policy_id IS NULL;
--
-- D. Cross-property mismatch
-- SELECT a.id AS agreement_id,
--        a.restaurant_id AS agreement_property,
--        p.restaurant_id AS legacy_property,
--        c.restaurant_id AS canonical_property
-- FROM public.pms_corporate_agreements a
-- LEFT JOIN public.pms_cancellation_policies p ON p.id = a.cancellation_policy_id
-- LEFT JOIN public.pms_rate_cancellation_policies c ON c.id = a.rate_cancellation_policy_id
-- WHERE a.cancellation_policy_id IS NOT NULL
--   AND (
--     p.restaurant_id IS DISTINCT FROM a.restaurant_id
--     OR c.restaurant_id IS DISTINCT FROM a.restaurant_id
--   );
--
-- E. Legacy policy beside canonical policy
-- SELECT a.id AS agreement_id,
--        p.id AS legacy_id, p.code AS legacy_code, p.name AS legacy_name,
--        p.cutoff_hours, p.penalty_type AS legacy_penalty, p.penalty_value AS legacy_penalty_value,
--        p.refundable_before_cutoff,
--        c.id AS canonical_id, c.code AS canonical_code, c.policy_kind,
--        c.window_value, c.window_unit, c.cutoff_time, c.deadline_hours,
--        c.penalty_type AS canonical_penalty, c.penalty_value AS canonical_penalty_value
-- FROM public.pms_corporate_agreements a
-- JOIN public.pms_cancellation_policies p
--   ON p.id = a.cancellation_policy_id AND p.restaurant_id = a.restaurant_id
-- LEFT JOIN public.pms_rate_cancellation_policies c
--   ON c.id = a.rate_cancellation_policy_id AND c.restaurant_id = a.restaurant_id
-- WHERE a.cancellation_policy_id IS NOT NULL;
--
-- F. Material semantic differences after backfill
-- SELECT a.id AS agreement_id, p.id AS legacy_id, c.id AS canonical_id
-- FROM public.pms_corporate_agreements a
-- JOIN public.pms_cancellation_policies p
--   ON p.id = a.cancellation_policy_id AND p.restaurant_id = a.restaurant_id
-- JOIN public.pms_rate_cancellation_policies c
--   ON c.id = a.rate_cancellation_policy_id AND c.restaurant_id = a.restaurant_id
-- WHERE btrim(c.name) IS DISTINCT FROM btrim(p.name)
--    OR c.description IS DISTINCT FROM NULLIF(btrim(p.description), '')
--    OR c.active IS DISTINCT FROM p.active
--    OR c.deadline_hours IS DISTINCT FROM p.cutoff_hours
--    OR c.window_value IS DISTINCT FROM p.cutoff_hours
--    OR c.window_unit IS DISTINCT FROM 'hours_before_arrival'
--    OR c.cutoff_time IS NOT NULL
--    OR c.penalty_value IS DISTINCT FROM p.penalty_value
--    OR c.penalty_type IS DISTINCT FROM (
--         CASE p.penalty_type WHEN 'percent_stay' THEN 'percentage' ELSE p.penalty_type END
--       )
--    OR c.policy_kind IS DISTINCT FROM (
--         CASE WHEN p.refundable_before_cutoff THEN 'free_cancellation' ELSE 'flexible' END
--       );
