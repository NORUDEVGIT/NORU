-- RR-P3-01 — Immutable operational restriction-change history + atomic apply RPC.
-- Dual-lane with drizzle/migrations/0102_pms_rate_restriction_change_events.sql.
-- Does not edit 0016 or 0076. Does not replace price_hotel_stay or priced reservation RPCs.
-- Does not add a template FK to hotel_rate_restrictions.
-- History starts at this migration; no backfill of older hotel_rate_restrictions writes.
-- Open product decisions (do not invent here):
--   1. Past-date / Night Audit-closed date edit policy — current behavior is preserved (not blocked).
--   2. Active plan / valid_from / valid_to — current saveRateRestriction does not enforce these; this RPC also does not.
--   3. Reason-required policy — reason is nullable; UI/product decides later.

CREATE TABLE public.hotel_rate_restriction_change_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  operation_id uuid NOT NULL,
  action_type text NOT NULL,
  rate_plan_id uuid NOT NULL,
  room_type_id uuid NOT NULL,
  stay_date date NOT NULL,
  previous_min_stay integer,
  new_min_stay integer,
  previous_max_stay integer,
  new_max_stay integer,
  previous_closed_to_arrival boolean NOT NULL,
  new_closed_to_arrival boolean NOT NULL,
  previous_closed_to_departure boolean NOT NULL,
  new_closed_to_departure boolean NOT NULL,
  previous_stop_sell boolean NOT NULL,
  new_stop_sell boolean NOT NULL,
  reason text,
  actor_membership_id uuid REFERENCES public.restaurant_users(id),
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT hotel_rate_restriction_change_events_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT hotel_rate_restriction_change_events_action_check CHECK (action_type IN (
    'single_restriction_change',
    'bulk_restriction_change',
    'clear_restriction'
  )),
  CONSTRAINT hotel_rate_restriction_change_events_source_check CHECK (source IN (
    'restriction_calendar',
    'rate_revenue'
  )),
  CONSTRAINT hotel_rate_restriction_change_events_plan_same_property FOREIGN KEY (rate_plan_id, restaurant_id)
    REFERENCES public.hotel_rate_plans(id, restaurant_id),
  CONSTRAINT hotel_rate_restriction_change_events_type_same_property FOREIGN KEY (room_type_id, restaurant_id)
    REFERENCES public.room_types(id, restaurant_id)
);

COMMENT ON TABLE public.hotel_rate_restriction_change_events IS
  'Immutable operational restriction-change history for UI-11. Begins at migration 0102; no backfill. One full before/after snapshot per changed target. No-ops are not recorded.';

CREATE INDEX hotel_rate_restriction_change_events_created_idx
  ON public.hotel_rate_restriction_change_events (restaurant_id, created_at DESC);

CREATE INDEX hotel_rate_restriction_change_events_plan_date_idx
  ON public.hotel_rate_restriction_change_events (restaurant_id, rate_plan_id, stay_date);

CREATE INDEX hotel_rate_restriction_change_events_operation_idx
  ON public.hotel_rate_restriction_change_events (operation_id);

GRANT SELECT ON public.hotel_rate_restriction_change_events TO authenticated;
GRANT ALL ON public.hotel_rate_restriction_change_events TO service_role;
ALTER TABLE public.hotel_rate_restriction_change_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read restriction change events" ON public.hotel_rate_restriction_change_events
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE OR REPLACE FUNCTION public.prevent_hotel_rate_restriction_change_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'RESTRICTION_CHANGE_EVENT_IMMUTABLE';
END;
$$;

CREATE TRIGGER hotel_rate_restriction_change_events_immutable
  BEFORE UPDATE OR DELETE ON public.hotel_rate_restriction_change_events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_hotel_rate_restriction_change_event_mutation();

CREATE OR REPLACE FUNCTION public.apply_hotel_rate_restrictions(
  _restaurant_id uuid,
  _membership_id uuid,
  _operation_id uuid,
  _source text,
  _reason text,
  _operation jsonb,
  _targets jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  op_type text;
  fields jsonb := '{}'::jsonb;
  action_type text;
  target_count integer;
  elem jsonb;
  item jsonb;
  work jsonb := '[]'::jsonb;
  plan public.hotel_rate_plans%ROWTYPE;
  rec public.hotel_rate_restrictions%ROWTYPE;
  stay date;
  stay_text text;
  plan_id uuid;
  expected text;
  membership_restaurant uuid;
  prev_min integer;
  prev_max integer;
  prev_cta boolean;
  prev_ctd boolean;
  prev_stop boolean;
  new_min integer;
  new_max integer;
  new_cta boolean;
  new_ctd boolean;
  new_stop boolean;
  do_delete boolean;
  skip boolean;
  applied integer := 0;
  deleted_count integer := 0;
  upserted_count integer := 0;
BEGIN
  IF _restaurant_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.restaurants WHERE id = _restaurant_id
  ) THEN
    RAISE EXCEPTION 'RESTRICTION_CHANGE_FORBIDDEN';
  END IF;

  SELECT ru.restaurant_id INTO membership_restaurant
  FROM public.restaurant_users ru
  WHERE ru.id = _membership_id;

  IF membership_restaurant IS DISTINCT FROM _restaurant_id THEN
    RAISE EXCEPTION 'RESTRICTION_CHANGE_FORBIDDEN';
  END IF;

  IF _operation_id IS NULL THEN
    _operation_id := gen_random_uuid();
  END IF;

  IF _source IS NULL OR btrim(_source) = '' THEN
    _source := 'rate_revenue';
  ELSE
    _source := btrim(_source);
  END IF;

  IF _source NOT IN ('restriction_calendar', 'rate_revenue') THEN
    RAISE EXCEPTION 'RESTRICTION_CHANGE_UNSUPPORTED';
  END IF;

  IF _reason IS NOT NULL AND btrim(_reason) = '' THEN
    _reason := NULL;
  ELSE
    _reason := NULLIF(btrim(COALESCE(_reason, '')), '');
  END IF;

  IF _targets IS NULL OR jsonb_typeof(_targets) <> 'array' OR jsonb_array_length(_targets) < 1 THEN
    RAISE EXCEPTION 'RESTRICTION_CHANGE_EMPTY';
  END IF;

  target_count := jsonb_array_length(_targets);
  IF target_count > 366 THEN
    RAISE EXCEPTION 'RESTRICTION_TARGET_LIMIT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(_targets) e
    GROUP BY e->>'ratePlanId', e->>'date'
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'RESTRICTION_DUPLICATE_TARGET';
  END IF;

  op_type := COALESCE(_operation->>'type', '');
  IF op_type NOT IN ('SET_FIELDS', 'CLEAR_ALL') THEN
    RAISE EXCEPTION 'RESTRICTION_CHANGE_UNSUPPORTED';
  END IF;

  IF op_type = 'SET_FIELDS' THEN
    fields := COALESCE(_operation->'fields', '{}'::jsonb);
    IF jsonb_typeof(fields) <> 'object' THEN
      RAISE EXCEPTION 'RESTRICTION_NO_FIELDS';
    END IF;
    IF NOT (
      fields ? 'minStay'
      OR fields ? 'maxStay'
      OR fields ? 'closedToArrival'
      OR fields ? 'closedToDeparture'
      OR fields ? 'stopSell'
    ) THEN
      RAISE EXCEPTION 'RESTRICTION_NO_FIELDS';
    END IF;
  END IF;

  IF op_type = 'CLEAR_ALL' THEN
    action_type := 'clear_restriction';
  ELSIF target_count = 1 THEN
    action_type := 'single_restriction_change';
  ELSE
    action_type := 'bulk_restriction_change';
  END IF;

  -- Pass 1: validate and calculate every target. No restriction/history writes yet.
  -- Past dates and Night Audit-closed dates are not blocked (open product decision).
  -- Active / valid_from / valid_to are not enforced (preserves saveRateRestriction).
  FOR elem IN SELECT value FROM jsonb_array_elements(_targets)
  LOOP
    stay_text := elem->>'date';
    IF stay_text IS NULL OR stay_text !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RAISE EXCEPTION 'RESTRICTION_INVALID_DATE';
    END IF;
    stay := stay_text::date;
    IF to_char(stay, 'YYYY-MM-DD') IS DISTINCT FROM stay_text THEN
      RAISE EXCEPTION 'RESTRICTION_INVALID_DATE';
    END IF;

    BEGIN
      plan_id := (elem->>'ratePlanId')::uuid;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'RESTRICTION_PLAN_NOT_FOUND';
    END;

    SELECT * INTO plan
    FROM public.hotel_rate_plans
    WHERE id = plan_id AND restaurant_id = _restaurant_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'RESTRICTION_PLAN_NOT_FOUND';
    END IF;

    rec := NULL;
    SELECT * INTO rec
    FROM public.hotel_rate_restrictions
    WHERE rate_plan_id = plan.id AND restriction_date = stay AND restaurant_id = _restaurant_id;

    IF FOUND THEN
      prev_min := rec.min_stay;
      prev_max := rec.max_stay;
      prev_cta := rec.closed_to_arrival;
      prev_ctd := rec.closed_to_departure;
      prev_stop := rec.stop_sell;
    ELSE
      prev_min := NULL;
      prev_max := NULL;
      prev_cta := false;
      prev_ctd := false;
      prev_stop := false;
    END IF;

    expected := NULLIF(elem->>'expectedVersion', '');
    IF expected IS NOT NULL THEN
      IF expected = 'absent' THEN
        IF rec.id IS NOT NULL THEN
          RAISE EXCEPTION 'RESTRICTION_CHANGE_STALE';
        END IF;
      ELSE
        IF rec.id IS NULL OR rec.updated_at IS DISTINCT FROM expected::timestamptz THEN
          RAISE EXCEPTION 'RESTRICTION_CHANGE_STALE';
        END IF;
      END IF;
    END IF;

    IF op_type = 'CLEAR_ALL' THEN
      new_min := NULL;
      new_max := NULL;
      new_cta := false;
      new_ctd := false;
      new_stop := false;
    ELSE
      new_min := prev_min;
      new_max := prev_max;
      new_cta := prev_cta;
      new_ctd := prev_ctd;
      new_stop := prev_stop;

      IF fields ? 'minStay' THEN
        IF fields->'minStay' = 'null'::jsonb THEN
          new_min := NULL;
        ELSE
          BEGIN
            new_min := (fields->>'minStay')::integer;
          EXCEPTION WHEN others THEN
            RAISE EXCEPTION 'RESTRICTION_MIN_STAY_INVALID';
          END;
          IF new_min IS NULL OR new_min < 1 OR new_min > 365 THEN
            RAISE EXCEPTION 'RESTRICTION_MIN_STAY_INVALID';
          END IF;
        END IF;
      END IF;

      IF fields ? 'maxStay' THEN
        IF fields->'maxStay' = 'null'::jsonb THEN
          new_max := NULL;
        ELSE
          BEGIN
            new_max := (fields->>'maxStay')::integer;
          EXCEPTION WHEN others THEN
            RAISE EXCEPTION 'RESTRICTION_MAX_STAY_INVALID';
          END;
          IF new_max IS NULL OR new_max < 1 OR new_max > 365 THEN
            RAISE EXCEPTION 'RESTRICTION_MAX_STAY_INVALID';
          END IF;
        END IF;
      END IF;

      IF fields ? 'closedToArrival' THEN
        IF jsonb_typeof(fields->'closedToArrival') <> 'boolean' THEN
          RAISE EXCEPTION 'RESTRICTION_CHANGE_UNSUPPORTED';
        END IF;
        new_cta := (fields->>'closedToArrival')::boolean;
      END IF;

      IF fields ? 'closedToDeparture' THEN
        IF jsonb_typeof(fields->'closedToDeparture') <> 'boolean' THEN
          RAISE EXCEPTION 'RESTRICTION_CHANGE_UNSUPPORTED';
        END IF;
        new_ctd := (fields->>'closedToDeparture')::boolean;
      END IF;

      IF fields ? 'stopSell' THEN
        IF jsonb_typeof(fields->'stopSell') <> 'boolean' THEN
          RAISE EXCEPTION 'RESTRICTION_CHANGE_UNSUPPORTED';
        END IF;
        new_stop := (fields->>'stopSell')::boolean;
      END IF;
    END IF;

    IF new_min IS NOT NULL AND new_max IS NOT NULL AND new_max < new_min THEN
      RAISE EXCEPTION 'RESTRICTION_STAY_RANGE_INVALID';
    END IF;

    skip :=
      prev_min IS NOT DISTINCT FROM new_min
      AND prev_max IS NOT DISTINCT FROM new_max
      AND prev_cta IS NOT DISTINCT FROM new_cta
      AND prev_ctd IS NOT DISTINCT FROM new_ctd
      AND prev_stop IS NOT DISTINCT FROM new_stop;

    do_delete :=
      new_min IS NULL
      AND new_max IS NULL
      AND new_cta IS FALSE
      AND new_ctd IS FALSE
      AND new_stop IS FALSE;

    work := work || jsonb_build_array(jsonb_build_object(
      'rate_plan_id', plan.id,
      'room_type_id', plan.room_type_id,
      'stay_date', stay_text,
      'previous_min_stay', prev_min,
      'previous_max_stay', prev_max,
      'previous_closed_to_arrival', prev_cta,
      'previous_closed_to_departure', prev_ctd,
      'previous_stop_sell', prev_stop,
      'new_min_stay', new_min,
      'new_max_stay', new_max,
      'new_closed_to_arrival', new_cta,
      'new_closed_to_departure', new_ctd,
      'new_stop_sell', new_stop,
      'do_delete', do_delete,
      'skip', skip,
      'expected_version', expected
    ));
  END LOOP;

  -- Pass 2: apply every restriction write. Any exception rolls the whole operation back.
  FOR item IN SELECT value FROM jsonb_array_elements(work)
  LOOP
    IF (item->>'skip')::boolean THEN
      CONTINUE;
    END IF;

    IF (item->>'do_delete')::boolean THEN
      DELETE FROM public.hotel_rate_restrictions
      WHERE restaurant_id = _restaurant_id
        AND rate_plan_id = (item->>'rate_plan_id')::uuid
        AND restriction_date = (item->>'stay_date')::date;
      deleted_count := deleted_count + 1;
    ELSE
      INSERT INTO public.hotel_rate_restrictions (
        restaurant_id,
        rate_plan_id,
        restriction_date,
        min_stay,
        max_stay,
        closed_to_arrival,
        closed_to_departure,
        stop_sell,
        created_by_membership_id
      ) VALUES (
        _restaurant_id,
        (item->>'rate_plan_id')::uuid,
        (item->>'stay_date')::date,
        NULLIF(item->>'new_min_stay', '')::integer,
        NULLIF(item->>'new_max_stay', '')::integer,
        (item->>'new_closed_to_arrival')::boolean,
        (item->>'new_closed_to_departure')::boolean,
        (item->>'new_stop_sell')::boolean,
        _membership_id
      )
      ON CONFLICT (rate_plan_id, restriction_date) DO UPDATE
      SET min_stay = EXCLUDED.min_stay,
          max_stay = EXCLUDED.max_stay,
          closed_to_arrival = EXCLUDED.closed_to_arrival,
          closed_to_departure = EXCLUDED.closed_to_departure,
          stop_sell = EXCLUDED.stop_sell,
          created_by_membership_id = EXCLUDED.created_by_membership_id;
      upserted_count := upserted_count + 1;
    END IF;
    applied := applied + 1;
  END LOOP;

  -- Pass 3: immutable history rows. Written only for real changes after operational writes succeed.
  FOR item IN SELECT value FROM jsonb_array_elements(work)
  LOOP
    IF (item->>'skip')::boolean THEN
      CONTINUE;
    END IF;

    INSERT INTO public.hotel_rate_restriction_change_events (
      restaurant_id,
      operation_id,
      action_type,
      rate_plan_id,
      room_type_id,
      stay_date,
      previous_min_stay,
      new_min_stay,
      previous_max_stay,
      new_max_stay,
      previous_closed_to_arrival,
      new_closed_to_arrival,
      previous_closed_to_departure,
      new_closed_to_departure,
      previous_stop_sell,
      new_stop_sell,
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
      NULLIF(item->>'previous_min_stay', '')::integer,
      NULLIF(item->>'new_min_stay', '')::integer,
      NULLIF(item->>'previous_max_stay', '')::integer,
      NULLIF(item->>'new_max_stay', '')::integer,
      (item->>'previous_closed_to_arrival')::boolean,
      (item->>'new_closed_to_arrival')::boolean,
      (item->>'previous_closed_to_departure')::boolean,
      (item->>'new_closed_to_departure')::boolean,
      (item->>'previous_stop_sell')::boolean,
      (item->>'new_stop_sell')::boolean,
      _reason,
      _membership_id,
      _source,
      jsonb_build_object(
        'operationType', op_type,
        'expectedVersion', item->>'expected_version'
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'operationId', _operation_id,
    'actionType', action_type,
    'appliedCount', applied,
    'deletedCount', deleted_count,
    'upsertedCount', upserted_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_hotel_rate_restrictions(uuid, uuid, uuid, text, text, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_hotel_rate_restrictions(uuid, uuid, uuid, text, text, jsonb, jsonb) TO service_role;

COMMENT ON FUNCTION public.apply_hotel_rate_restrictions(uuid, uuid, uuid, text, text, jsonb, jsonb) IS
  'Atomic single/bulk operational restriction apply. SET_FIELDS is a partial patch. CLEAR_ALL and all-default SET_FIELDS delete the row. No-ops write no row and no history. Optimistic concurrency via expectedVersion (absent | timestamptz).';
