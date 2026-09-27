-- RR-P2-01 — Immutable operational rate-change history + atomic apply RPC.
-- Dual-lane with drizzle/migrations/0101_pms_rate_change_events.sql.
-- Does not edit 0016. Does not replace price_hotel_stay or priced reservation RPCs.
-- History starts at this migration; no backfill of older hotel_rate_calendar writes.
-- Open product decisions (do not invent here):
--   1. Past-date / Night Audit-closed date edit policy — current behavior is preserved (not blocked).
--   2. Reason-required policy — reason is nullable; UI/product decides later.

CREATE TABLE public.hotel_rate_change_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  operation_id uuid NOT NULL,
  action_type text NOT NULL,
  rate_plan_id uuid NOT NULL,
  room_type_id uuid NOT NULL,
  stay_date date NOT NULL,
  previous_base_rate numeric(12,2) NOT NULL,
  previous_override_rate numeric(12,2),
  previous_effective_rate numeric(12,2) NOT NULL,
  new_override_rate numeric(12,2),
  new_effective_rate numeric(12,2) NOT NULL,
  currency text NOT NULL,
  reason text,
  actor_membership_id uuid REFERENCES public.restaurant_users(id),
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT hotel_rate_change_events_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT hotel_rate_change_events_action_check CHECK (action_type IN (
    'single_rate_change',
    'bulk_rate_change',
    'reset_override',
    'copy_rate'
  )),
  CONSTRAINT hotel_rate_change_events_plan_same_property FOREIGN KEY (rate_plan_id, restaurant_id)
    REFERENCES public.hotel_rate_plans(id, restaurant_id),
  CONSTRAINT hotel_rate_change_events_type_same_property FOREIGN KEY (room_type_id, restaurant_id)
    REFERENCES public.room_types(id, restaurant_id)
);

COMMENT ON TABLE public.hotel_rate_change_events IS
  'Immutable operational rate-change history for UI-06. Begins at migration 0101; no backfill. Domain source for before/after rates, stay date, plan, and operation grouping.';

CREATE INDEX hotel_rate_change_events_created_idx
  ON public.hotel_rate_change_events (restaurant_id, created_at DESC);

CREATE INDEX hotel_rate_change_events_plan_date_idx
  ON public.hotel_rate_change_events (restaurant_id, rate_plan_id, stay_date);

CREATE INDEX hotel_rate_change_events_operation_idx
  ON public.hotel_rate_change_events (operation_id);

GRANT SELECT ON public.hotel_rate_change_events TO authenticated;
GRANT ALL ON public.hotel_rate_change_events TO service_role;
ALTER TABLE public.hotel_rate_change_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read rate change events" ON public.hotel_rate_change_events
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE OR REPLACE FUNCTION public.prevent_hotel_rate_change_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'RATE_CHANGE_EVENT_IMMUTABLE';
END;
$$;

CREATE TRIGGER hotel_rate_change_events_immutable
  BEFORE UPDATE OR DELETE ON public.hotel_rate_change_events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_hotel_rate_change_event_mutation();

CREATE OR REPLACE FUNCTION public.apply_hotel_rate_changes(
  _restaurant_id uuid,
  _membership_id uuid,
  _operation_id uuid,
  _source text,
  _reason text,
  _rule jsonb,
  _targets jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rule_type text;
  rule_value numeric;
  source_date date;
  source_date_text text;
  action_type text;
  target_count integer;
  elem jsonb;
  item jsonb;
  work jsonb := '[]'::jsonb;
  plan public.hotel_rate_plans%ROWTYPE;
  cal public.hotel_rate_calendar%ROWTYPE;
  source_cal public.hotel_rate_calendar%ROWTYPE;
  stay date;
  stay_text text;
  plan_id uuid;
  expected text;
  current_effective numeric(12,2);
  previous_override numeric(12,2);
  source_effective numeric(12,2);
  proposed numeric(12,2);
  do_delete boolean;
  membership_restaurant uuid;
BEGIN
  IF _restaurant_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.restaurants WHERE id = _restaurant_id
  ) THEN
    RAISE EXCEPTION 'RATE_CHANGE_FORBIDDEN';
  END IF;

  SELECT ru.restaurant_id INTO membership_restaurant
  FROM public.restaurant_users ru
  WHERE ru.id = _membership_id;

  IF membership_restaurant IS DISTINCT FROM _restaurant_id THEN
    RAISE EXCEPTION 'RATE_CHANGE_FORBIDDEN';
  END IF;

  IF _operation_id IS NULL THEN
    _operation_id := gen_random_uuid();
  END IF;

  IF _source IS NULL OR btrim(_source) = '' THEN
    _source := 'rate_revenue';
  ELSE
    _source := btrim(_source);
  END IF;

  IF _reason IS NOT NULL AND btrim(_reason) = '' THEN
    _reason := NULL;
  ELSE
    _reason := NULLIF(btrim(COALESCE(_reason, '')), '');
  END IF;

  IF _targets IS NULL OR jsonb_typeof(_targets) <> 'array' OR jsonb_array_length(_targets) < 1 THEN
    RAISE EXCEPTION 'RATE_CHANGE_EMPTY';
  END IF;

  target_count := jsonb_array_length(_targets);
  IF target_count > 366 THEN
    RAISE EXCEPTION 'RATE_CHANGE_EMPTY';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(_targets) e
    GROUP BY e->>'ratePlanId', e->>'date'
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'RATE_CHANGE_DUPLICATE';
  END IF;

  rule_type := COALESCE(_rule->>'type', '');
  IF rule_type NOT IN (
    'SET_RATE', 'PERCENT_INCREASE', 'PERCENT_DECREASE', 'RESET_OVERRIDE', 'COPY_FROM_DATE'
  ) THEN
    RAISE EXCEPTION 'RATE_CHANGE_UNSUPPORTED';
  END IF;

  IF rule_type IN ('SET_RATE', 'PERCENT_INCREASE', 'PERCENT_DECREASE') THEN
    IF _rule->>'value' IS NULL OR btrim(_rule->>'value') = '' THEN
      RAISE EXCEPTION 'RATE_CHANGE_VALUE_REQUIRED';
    END IF;
    rule_value := (_rule->>'value')::numeric;
    IF rule_value IS NULL OR rule_value = 'NaN'::numeric OR rule_value = 'Infinity'::numeric THEN
      RAISE EXCEPTION 'RATE_CHANGE_UNSUPPORTED';
    END IF;
  END IF;

  IF rule_type = 'SET_RATE' THEN
    IF rule_value < 0 THEN
      RAISE EXCEPTION 'RATE_CHANGE_NEGATIVE';
    END IF;
    IF rule_value > 10000000 THEN
      RAISE EXCEPTION 'RATE_CHANGE_OVER_MAX';
    END IF;
  END IF;

  IF rule_type IN ('PERCENT_INCREASE', 'PERCENT_DECREASE') THEN
    IF rule_value < 0 OR rule_value > 1000 THEN
      RAISE EXCEPTION 'RATE_CHANGE_UNSUPPORTED';
    END IF;
  END IF;

  IF rule_type = 'COPY_FROM_DATE' THEN
    source_date_text := _rule->>'sourceDate';
    IF source_date_text IS NULL OR source_date_text !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RAISE EXCEPTION 'RATE_CHANGE_SOURCE_INVALID';
    END IF;
    source_date := source_date_text::date;
    IF to_char(source_date, 'YYYY-MM-DD') IS DISTINCT FROM source_date_text THEN
      RAISE EXCEPTION 'RATE_CHANGE_SOURCE_INVALID';
    END IF;
  END IF;

  IF rule_type = 'RESET_OVERRIDE' THEN
    action_type := 'reset_override';
  ELSIF rule_type = 'COPY_FROM_DATE' THEN
    action_type := 'copy_rate';
  ELSIF target_count = 1 THEN
    action_type := 'single_rate_change';
  ELSE
    action_type := 'bulk_rate_change';
  END IF;

  -- Pass 1: validate and calculate every target. No calendar/history writes yet.
  -- Past dates and Night Audit-closed dates are not blocked (open product decision).
  FOR elem IN SELECT value FROM jsonb_array_elements(_targets)
  LOOP
    stay_text := elem->>'date';
    IF stay_text IS NULL OR stay_text !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RAISE EXCEPTION 'RATE_CHANGE_INVALID_DATE';
    END IF;
    stay := stay_text::date;
    IF to_char(stay, 'YYYY-MM-DD') IS DISTINCT FROM stay_text THEN
      RAISE EXCEPTION 'RATE_CHANGE_INVALID_DATE';
    END IF;

    BEGIN
      plan_id := (elem->>'ratePlanId')::uuid;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'RATE_PLAN_NOT_FOUND';
    END;

    SELECT * INTO plan
    FROM public.hotel_rate_plans
    WHERE id = plan_id AND restaurant_id = _restaurant_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'RATE_PLAN_NOT_FOUND';
    END IF;
    IF plan.active IS NOT TRUE THEN
      RAISE EXCEPTION 'RATE_PLAN_INACTIVE';
    END IF;
    IF (plan.valid_from IS NOT NULL AND stay < plan.valid_from)
       OR (plan.valid_to IS NOT NULL AND stay > plan.valid_to) THEN
      RAISE EXCEPTION 'RATE_PLAN_OUT_OF_RANGE';
    END IF;

    cal := NULL;
    SELECT * INTO cal
    FROM public.hotel_rate_calendar
    WHERE rate_plan_id = plan.id AND rate_date = stay AND restaurant_id = _restaurant_id;

    IF FOUND THEN
      current_effective := cal.nightly_rate;
      previous_override := cal.nightly_rate;
    ELSE
      current_effective := plan.base_rate;
      previous_override := NULL;
    END IF;

    expected := NULLIF(elem->>'expectedVersion', '');
    IF expected IS NOT NULL THEN
      IF expected = 'absent' THEN
        IF cal.id IS NOT NULL THEN
          RAISE EXCEPTION 'RATE_CHANGE_STALE';
        END IF;
      ELSE
        IF cal.id IS NULL OR cal.updated_at IS DISTINCT FROM expected::timestamptz THEN
          RAISE EXCEPTION 'RATE_CHANGE_STALE';
        END IF;
      END IF;
    END IF;

    do_delete := false;
    proposed := NULL;

    IF rule_type = 'SET_RATE' THEN
      proposed := ROUND(rule_value, 2);
    ELSIF rule_type = 'PERCENT_INCREASE' THEN
      proposed := ROUND(current_effective * (1 + (rule_value / 100)), 2);
    ELSIF rule_type = 'PERCENT_DECREASE' THEN
      proposed := ROUND(current_effective * (1 - (rule_value / 100)), 2);
    ELSIF rule_type = 'RESET_OVERRIDE' THEN
      do_delete := true;
      proposed := NULL;
    ELSIF rule_type = 'COPY_FROM_DATE' THEN
      IF (plan.valid_from IS NOT NULL AND source_date < plan.valid_from)
         OR (plan.valid_to IS NOT NULL AND source_date > plan.valid_to) THEN
        RAISE EXCEPTION 'RATE_CHANGE_SOURCE_INVALID';
      END IF;
      source_cal := NULL;
      SELECT * INTO source_cal
      FROM public.hotel_rate_calendar
      WHERE rate_plan_id = plan.id AND rate_date = source_date AND restaurant_id = _restaurant_id;
      IF FOUND THEN
        source_effective := source_cal.nightly_rate;
      ELSE
        source_effective := plan.base_rate;
      END IF;
      proposed := ROUND(source_effective, 2);
    END IF;

    IF NOT do_delete THEN
      IF proposed IS NULL OR proposed < 0 THEN
        RAISE EXCEPTION 'RATE_CHANGE_NEGATIVE';
      END IF;
      IF proposed > 10000000 THEN
        RAISE EXCEPTION 'RATE_CHANGE_OVER_MAX';
      END IF;
    END IF;

    work := work || jsonb_build_array(jsonb_build_object(
      'rate_plan_id', plan.id,
      'room_type_id', plan.room_type_id,
      'stay_date', stay_text,
      'currency', plan.currency,
      'previous_base_rate', plan.base_rate,
      'previous_override_rate', previous_override,
      'previous_effective_rate', current_effective,
      'new_override_rate', proposed,
      'new_effective_rate', COALESCE(proposed, plan.base_rate),
      'do_delete', do_delete,
      'expected_version', expected
    ));
  END LOOP;

  -- Pass 2: apply every calendar write. Any exception rolls the whole operation back.
  FOR item IN SELECT value FROM jsonb_array_elements(work)
  LOOP
    IF (item->>'do_delete')::boolean THEN
      DELETE FROM public.hotel_rate_calendar
      WHERE restaurant_id = _restaurant_id
        AND rate_plan_id = (item->>'rate_plan_id')::uuid
        AND rate_date = (item->>'stay_date')::date;
    ELSE
      INSERT INTO public.hotel_rate_calendar (
        restaurant_id,
        rate_plan_id,
        rate_date,
        nightly_rate,
        created_by_membership_id
      ) VALUES (
        _restaurant_id,
        (item->>'rate_plan_id')::uuid,
        (item->>'stay_date')::date,
        (item->>'new_override_rate')::numeric,
        _membership_id
      )
      ON CONFLICT (rate_plan_id, rate_date) DO UPDATE
      SET nightly_rate = EXCLUDED.nightly_rate,
          created_by_membership_id = EXCLUDED.created_by_membership_id;
    END IF;
  END LOOP;

  -- Pass 3: immutable history rows. Written only if calendar writes above succeeded.
  FOR item IN SELECT value FROM jsonb_array_elements(work)
  LOOP
    INSERT INTO public.hotel_rate_change_events (
      restaurant_id,
      operation_id,
      action_type,
      rate_plan_id,
      room_type_id,
      stay_date,
      previous_base_rate,
      previous_override_rate,
      previous_effective_rate,
      new_override_rate,
      new_effective_rate,
      currency,
      reason,
      actor_membership_id,
      source,
      metadata
    ) VALUES (
      _restaurant_id,
      _operation_id,
      action_type,
      (item->>'rate_plan_id')::uuid,
      (item->>'room_type_id')::uuid,
      (item->>'stay_date')::date,
      (item->>'previous_base_rate')::numeric,
      NULLIF(item->>'previous_override_rate', '')::numeric,
      (item->>'previous_effective_rate')::numeric,
      NULLIF(item->>'new_override_rate', '')::numeric,
      (item->>'new_effective_rate')::numeric,
      item->>'currency',
      _reason,
      _membership_id,
      _source,
      jsonb_build_object(
        'ruleType', rule_type,
        'ruleValue', rule_value,
        'sourceDate', source_date_text,
        'expectedVersion', item->>'expected_version'
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'operationId', _operation_id,
    'actionType', action_type,
    'appliedCount', target_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_hotel_rate_changes(uuid, uuid, uuid, text, text, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_hotel_rate_changes(uuid, uuid, uuid, text, text, jsonb, jsonb) TO service_role;

COMMENT ON FUNCTION public.apply_hotel_rate_changes(uuid, uuid, uuid, text, text, jsonb, jsonb) IS
  'Atomic single/bulk rate override apply. Recalculates proposed nightly rates server-side. RESET deletes the calendar row. Percentage changes use current effective rate. ROUND(numeric, 2). Optimistic concurrency via expectedVersion (absent | timestamptz).';
