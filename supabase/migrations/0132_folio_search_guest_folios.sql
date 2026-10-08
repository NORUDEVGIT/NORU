-- Guest folio search read model for Cashiering > Folio Search (v1).
-- Dual-lane with supabase/migrations/0132_folio_search_guest_folios.sql.

CREATE INDEX IF NOT EXISTS guest_folios_opened_idx
  ON public.guest_folios (restaurant_id, opened_at DESC);

CREATE OR REPLACE FUNCTION public.search_guest_folios(
  _restaurant_id uuid,
  _search text DEFAULT NULL,
  _folio_status text DEFAULT 'all',
  _stay_statuses text[] DEFAULT NULL,
  _stay_start date DEFAULT NULL,
  _stay_end date DEFAULT NULL,
  _payment_states text[] DEFAULT NULL,
  _room_type_id uuid DEFAULT NULL,
  _rate_plan_id uuid DEFAULT NULL,
  _market_segment text DEFAULT NULL,
  _booking_source text DEFAULT NULL,
  _sales_channel text DEFAULT NULL,
  _currency text DEFAULT NULL,
  _unsettled_only boolean DEFAULT false,
  _sort_by text DEFAULT 'arrival_date',
  _sort_dir text DEFAULT 'desc',
  _limit int DEFAULT 25,
  _offset int DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  clean_search text := NULLIF(btrim(COALESCE(_search, '')), '');
  total_count bigint;
  page_rows jsonb;
BEGIN
  IF _limit < 1 OR _limit > 100 THEN
    RAISE EXCEPTION 'INVALID_LIMIT';
  END IF;
  IF _offset < 0 THEN
    RAISE EXCEPTION 'INVALID_OFFSET';
  END IF;
  IF (_stay_start IS NULL) <> (_stay_end IS NULL) THEN
    RAISE EXCEPTION 'STAY_RANGE_INCOMPLETE';
  END IF;
  IF _stay_start IS NOT NULL AND _stay_end < _stay_start THEN
    RAISE EXCEPTION 'STAY_RANGE_INVALID';
  END IF;

  WITH folio_balances AS (
    SELECT
      ft.folio_id,
      COALESCE(round(sum(ft.amount), 2), 0) AS balance,
      COALESCE(round(sum(ft.amount) FILTER (WHERE ft.amount >= 0), 2), 0) AS charges,
      COALESCE(round(-sum(ft.amount) FILTER (WHERE ft.amount < 0), 2), 0) AS credits,
      bool_or(ft.transaction_type IN ('payment', 'deposit')) AS has_payments,
      max(ft.posted_at) AS last_activity
    FROM public.folio_transactions ft
    WHERE ft.restaurant_id = _restaurant_id
      AND ft.folio_id IS NOT NULL
    GROUP BY ft.folio_id
  ),
  filtered AS (
    SELECT
      gf.id,
      gf.folio_number,
      gf.status AS folio_status,
      gf.currency,
      gf.opened_at,
      gf.closed_at,
      gf.reservation_id,
      gf.guest_id,
      gf.settlement_exception,
      gp.first_name,
      gp.last_name,
      gp.email,
      gp.phone,
      hr.confirmation_number,
      hr.status AS reservation_status,
      hr.arrival_date,
      hr.departure_date,
      hr.room_type_id,
      hr.rate_plan_id,
      hr.market_segment,
      hr.commercial_booking_source,
      hr.commercial_sales_channel,
      hr.room_id,
      room.room_number,
      rt.name AS room_type_name,
      rp.name AS rate_plan_name,
      COALESCE(fb.balance, 0) AS balance,
      COALESCE(fb.charges, 0) AS charges,
      COALESCE(fb.credits, 0) AS credits,
      COALESCE(fb.has_payments, false) AS has_payments,
      fb.last_activity,
      CASE
        WHEN abs(COALESCE(fb.balance, 0)) < 0.01 THEN 'settled'
        WHEN COALESCE(fb.balance, 0) > 0.01 AND COALESCE(fb.has_payments, false) THEN 'partially_paid'
        WHEN COALESCE(fb.balance, 0) > 0.01 THEN 'outstanding'
        WHEN COALESCE(fb.balance, 0) < -0.01 THEN 'credit_balance'
        ELSE 'settled'
      END AS payment_state
    FROM public.guest_folios gf
    INNER JOIN public.guest_profiles gp
      ON gp.id = gf.guest_id AND gp.restaurant_id = gf.restaurant_id
    LEFT JOIN public.hotel_reservations hr
      ON hr.id = gf.reservation_id AND hr.restaurant_id = gf.restaurant_id
    LEFT JOIN public.hotel_rooms room
      ON room.id = hr.room_id AND room.restaurant_id = hr.restaurant_id
    LEFT JOIN public.room_types rt
      ON rt.id = hr.room_type_id AND rt.restaurant_id = hr.restaurant_id
    LEFT JOIN public.hotel_rate_plans rp
      ON rp.id = hr.rate_plan_id AND rp.restaurant_id = hr.restaurant_id
    LEFT JOIN folio_balances fb ON fb.folio_id = gf.id
    WHERE gf.restaurant_id = _restaurant_id
      AND (
        _folio_status = 'all'
        OR gf.status = _folio_status
      )
      AND (
        _stay_statuses IS NULL
        OR cardinality(_stay_statuses) = 0
        OR hr.status = ANY (_stay_statuses)
      )
      AND (
        _stay_start IS NULL
        OR (
          hr.arrival_date IS NOT NULL
          AND hr.departure_date IS NOT NULL
          AND hr.arrival_date <= _stay_end
          AND hr.departure_date >= _stay_start
        )
      )
      AND (_room_type_id IS NULL OR hr.room_type_id = _room_type_id)
      AND (_rate_plan_id IS NULL OR hr.rate_plan_id = _rate_plan_id)
      AND (_market_segment IS NULL OR hr.market_segment = _market_segment)
      AND (_booking_source IS NULL OR hr.commercial_booking_source = _booking_source)
      AND (_sales_channel IS NULL OR hr.commercial_sales_channel = _sales_channel)
      AND (_currency IS NULL OR gf.currency = _currency)
      AND (
        NOT COALESCE(_unsettled_only, false)
        OR (
          gf.settlement_exception = 'unsettled_checkout'
          AND gf.status = 'open'
        )
      )
      AND (
        _payment_states IS NULL
        OR cardinality(_payment_states) = 0
        OR (
          CASE
            WHEN abs(COALESCE(fb.balance, 0)) < 0.01 THEN 'settled'
            WHEN COALESCE(fb.balance, 0) > 0.01 AND COALESCE(fb.has_payments, false) THEN 'partially_paid'
            WHEN COALESCE(fb.balance, 0) > 0.01 THEN 'outstanding'
            WHEN COALESCE(fb.balance, 0) < -0.01 THEN 'credit_balance'
            ELSE 'settled'
          END
        ) = ANY (_payment_states)
      )
      AND (
        clean_search IS NULL
        OR gf.folio_number ILIKE '%' || clean_search || '%'
        OR hr.confirmation_number ILIKE '%' || clean_search || '%'
        OR room.room_number ILIKE '%' || clean_search || '%'
        OR concat_ws(' ', gp.first_name, gp.last_name) ILIKE '%' || clean_search || '%'
      )
  )
  SELECT count(*) INTO total_count FROM filtered;

  WITH folio_balances AS (
    SELECT
      ft.folio_id,
      COALESCE(round(sum(ft.amount), 2), 0) AS balance,
      COALESCE(round(sum(ft.amount) FILTER (WHERE ft.amount >= 0), 2), 0) AS charges,
      COALESCE(round(-sum(ft.amount) FILTER (WHERE ft.amount < 0), 2), 0) AS credits,
      bool_or(ft.transaction_type IN ('payment', 'deposit')) AS has_payments,
      max(ft.posted_at) AS last_activity
    FROM public.folio_transactions ft
    WHERE ft.restaurant_id = _restaurant_id
      AND ft.folio_id IS NOT NULL
    GROUP BY ft.folio_id
  ),
  filtered AS (
    SELECT
      gf.id,
      gf.folio_number,
      gf.status AS folio_status,
      gf.currency,
      gf.opened_at,
      gf.closed_at,
      gf.reservation_id,
      gf.guest_id,
      gf.settlement_exception,
      gp.first_name,
      gp.last_name,
      gp.email,
      gp.phone,
      hr.confirmation_number,
      hr.status AS reservation_status,
      hr.arrival_date,
      hr.departure_date,
      hr.room_type_id,
      hr.rate_plan_id,
      hr.market_segment,
      hr.commercial_booking_source,
      hr.commercial_sales_channel,
      hr.room_id,
      room.room_number,
      rt.name AS room_type_name,
      rp.name AS rate_plan_name,
      COALESCE(fb.balance, 0) AS balance,
      COALESCE(fb.charges, 0) AS charges,
      COALESCE(fb.credits, 0) AS credits,
      COALESCE(fb.has_payments, false) AS has_payments,
      fb.last_activity,
      CASE
        WHEN abs(COALESCE(fb.balance, 0)) < 0.01 THEN 'settled'
        WHEN COALESCE(fb.balance, 0) > 0.01 AND COALESCE(fb.has_payments, false) THEN 'partially_paid'
        WHEN COALESCE(fb.balance, 0) > 0.01 THEN 'outstanding'
        WHEN COALESCE(fb.balance, 0) < -0.01 THEN 'credit_balance'
        ELSE 'settled'
      END AS payment_state
    FROM public.guest_folios gf
    INNER JOIN public.guest_profiles gp
      ON gp.id = gf.guest_id AND gp.restaurant_id = gf.restaurant_id
    LEFT JOIN public.hotel_reservations hr
      ON hr.id = gf.reservation_id AND hr.restaurant_id = gf.restaurant_id
    LEFT JOIN public.hotel_rooms room
      ON room.id = hr.room_id AND room.restaurant_id = hr.restaurant_id
    LEFT JOIN public.room_types rt
      ON rt.id = hr.room_type_id AND rt.restaurant_id = hr.restaurant_id
    LEFT JOIN public.hotel_rate_plans rp
      ON rp.id = hr.rate_plan_id AND rp.restaurant_id = hr.restaurant_id
    LEFT JOIN folio_balances fb ON fb.folio_id = gf.id
    WHERE gf.restaurant_id = _restaurant_id
      AND (
        _folio_status = 'all'
        OR gf.status = _folio_status
      )
      AND (
        _stay_statuses IS NULL
        OR cardinality(_stay_statuses) = 0
        OR hr.status = ANY (_stay_statuses)
      )
      AND (
        _stay_start IS NULL
        OR (
          hr.arrival_date IS NOT NULL
          AND hr.departure_date IS NOT NULL
          AND hr.arrival_date <= _stay_end
          AND hr.departure_date >= _stay_start
        )
      )
      AND (_room_type_id IS NULL OR hr.room_type_id = _room_type_id)
      AND (_rate_plan_id IS NULL OR hr.rate_plan_id = _rate_plan_id)
      AND (_market_segment IS NULL OR hr.market_segment = _market_segment)
      AND (_booking_source IS NULL OR hr.commercial_booking_source = _booking_source)
      AND (_sales_channel IS NULL OR hr.commercial_sales_channel = _sales_channel)
      AND (_currency IS NULL OR gf.currency = _currency)
      AND (
        NOT COALESCE(_unsettled_only, false)
        OR (
          gf.settlement_exception = 'unsettled_checkout'
          AND gf.status = 'open'
        )
      )
      AND (
        _payment_states IS NULL
        OR cardinality(_payment_states) = 0
        OR (
          CASE
            WHEN abs(COALESCE(fb.balance, 0)) < 0.01 THEN 'settled'
            WHEN COALESCE(fb.balance, 0) > 0.01 AND COALESCE(fb.has_payments, false) THEN 'partially_paid'
            WHEN COALESCE(fb.balance, 0) > 0.01 THEN 'outstanding'
            WHEN COALESCE(fb.balance, 0) < -0.01 THEN 'credit_balance'
            ELSE 'settled'
          END
        ) = ANY (_payment_states)
      )
      AND (
        clean_search IS NULL
        OR gf.folio_number ILIKE '%' || clean_search || '%'
        OR hr.confirmation_number ILIKE '%' || clean_search || '%'
        OR room.room_number ILIKE '%' || clean_search || '%'
        OR concat_ws(' ', gp.first_name, gp.last_name) ILIKE '%' || clean_search || '%'
      )
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(page)), '[]'::jsonb)
  INTO page_rows
  FROM (
    SELECT * FROM filtered
    ORDER BY
      CASE WHEN _sort_by = 'arrival_date' AND _sort_dir = 'asc' THEN arrival_date END ASC NULLS LAST,
      CASE WHEN _sort_by = 'arrival_date' AND _sort_dir <> 'asc' THEN arrival_date END DESC NULLS LAST,
      CASE WHEN _sort_by = 'departure_date' AND _sort_dir = 'asc' THEN departure_date END ASC NULLS LAST,
      CASE WHEN _sort_by = 'departure_date' AND _sort_dir <> 'asc' THEN departure_date END DESC NULLS LAST,
      CASE WHEN _sort_by = 'balance' AND _sort_dir = 'asc' THEN balance END ASC NULLS LAST,
      CASE WHEN _sort_by = 'balance' AND _sort_dir <> 'asc' THEN balance END DESC NULLS LAST,
      CASE WHEN _sort_by = 'opened_at' AND _sort_dir = 'asc' THEN opened_at END ASC NULLS LAST,
      CASE WHEN _sort_by = 'opened_at' AND _sort_dir <> 'asc' THEN opened_at END DESC NULLS LAST,
      folio_number ASC
    LIMIT _limit
    OFFSET _offset
  ) page;

  RETURN jsonb_build_object(
    'total', total_count,
    'rows', page_rows
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_guest_folios(
  uuid, text, text, text[], date, date, text[], uuid, uuid, text, text, text, text, boolean, text, text, int, int
) TO service_role;

COMMENT ON FUNCTION public.search_guest_folios IS
  'Paginated guest folio search for Cashiering. Balance and payment_state are derived from folio_transactions.';
