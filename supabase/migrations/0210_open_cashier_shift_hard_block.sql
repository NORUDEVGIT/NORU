-- An open hotel cashier shift always blocks End of Day.
-- The stored business_date_blockers key open_cashier_shifts is ignored.
-- Close and recovery re-check open shifts while holding the property row lock,
-- so opening a shift and closing the business date cannot interleave.
-- Cash posted onto a shift must be on the current business date. Closing an
-- older shift (close_count) stays allowed so existing bad data can be recovered.

COMMENT ON COLUMN public.restaurants.business_date_blockers IS
  'PMS Card 1 business-date blocker labels. Not a roll engine. open_cashier_shifts is deprecated and ignored: an open hotel cashier shift always blocks End of Day.';

CREATE INDEX IF NOT EXISTS hotel_cashier_shifts_open_property_idx
  ON public.hotel_cashier_shifts (restaurant_id)
  WHERE status = 'open';

-- Cash on a shift, and cash in / cash out, require an open shift on the
-- current hotel day. Opening float and the closing count are not cash posts:
-- a shift from an older day can still be closed.
CREATE OR REPLACE FUNCTION public.reject_stale_cashier_shift_post()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _status text;
  _shift_date date;
  _current date;
BEGIN
  IF NEW.hotel_cashier_shift_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- to_jsonb so this one function can run on tables that have no movement_type.
  IF TG_TABLE_NAME = 'hotel_drawer_movements'
     AND (to_jsonb(NEW) ->> 'movement_type') IN ('opening', 'close_count') THEN
    RETURN NEW;
  END IF;

  SELECT status, business_date INTO _status, _shift_date
    FROM public.hotel_cashier_shifts
   WHERE id = NEW.hotel_cashier_shift_id
     AND restaurant_id = NEW.restaurant_id;

  _current := public.current_property_business_date(NEW.restaurant_id);
  IF _status IS DISTINCT FROM 'open' OR _shift_date IS DISTINCT FROM _current THEN
    RAISE EXCEPTION 'CASHIER_SHIFT_CLOSED_DATE';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_stale_cashier_shift_post() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS folio_transactions_current_shift ON public.folio_transactions;
CREATE TRIGGER folio_transactions_current_shift
  BEFORE INSERT ON public.folio_transactions
  FOR EACH ROW EXECUTE FUNCTION public.reject_stale_cashier_shift_post();

DROP TRIGGER IF EXISTS hotel_drawer_movements_current_shift ON public.hotel_drawer_movements;
CREATE TRIGGER hotel_drawer_movements_current_shift
  BEFORE INSERT ON public.hotel_drawer_movements
  FOR EACH ROW EXECUTE FUNCTION public.reject_stale_cashier_shift_post();

-- Same close as 0209, plus a re-check of open shifts inside the property lock.
CREATE OR REPLACE FUNCTION public.close_business_date(
  _restaurant_id uuid,
  _run_id uuid,
  _summary jsonb,
  _membership_id uuid
) RETURNS public.night_audit_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _run public.night_audit_runs;
  _house_date date;
  _blocking integer;
  _later_closed integer;
BEGIN
  PERFORM 1 FROM public.restaurants WHERE id = _restaurant_id FOR UPDATE;

  SELECT * INTO _run FROM public.night_audit_runs
   WHERE id = _run_id AND restaurant_id = _restaurant_id
   FOR UPDATE;

  IF _run.id IS NULL THEN
    RAISE EXCEPTION 'AUDIT_RUN_NOT_FOUND';
  END IF;

  IF _run.status = 'closed' THEN
    RETURN _run;
  END IF;

  IF _run.status NOT IN ('open', 'ready') THEN
    RAISE EXCEPTION 'AUDIT_RUN_NOT_CLOSABLE';
  END IF;

  SELECT business_date INTO _house_date
    FROM public.restaurants
   WHERE id = _restaurant_id;

  IF _house_date IS NOT NULL AND _house_date <> _run.business_date THEN
    RAISE EXCEPTION 'STALE_BUSINESS_DATE';
  END IF;

  SELECT count(*) INTO _later_closed
    FROM public.night_audit_runs
   WHERE restaurant_id = _restaurant_id
     AND status = 'closed'
     AND business_date > _run.business_date;

  IF _later_closed > 0 THEN
    RAISE EXCEPTION 'STALE_BUSINESS_DATE';
  END IF;

  SELECT count(*) INTO _blocking
    FROM public.night_audit_exceptions e
   WHERE e.night_audit_run_id = _run.id
     AND e.severity = 'blocking'
     AND e.status = 'open'
     AND NOT EXISTS (
       SELECT 1
         FROM public.night_audit_fiscal_overrides o
        WHERE o.exception_id = e.id
          AND o.restaurant_id = _restaurant_id
          AND o.night_audit_run_id = _run.id
          AND o.invalidated_at IS NULL
          AND o.revoked_at IS NULL
     )
     AND NOT EXISTS (
       SELECT 1
         FROM public.night_audit_fiscal_overrides p
        WHERE p.restaurant_id = _restaurant_id
          AND p.scope = 'persistent'
          AND p.invalidated_at IS NULL
          AND p.revoked_at IS NULL
          AND e.exception_type IN (
            'fiscal_failed', 'fiscal_cancel_pending', 'fiscal_not_registered', 'fiscal_blocked'
          )
          AND p.source_type = e.reference_type
          AND p.source_id = e.reference_id
     );

  IF _blocking > 0 THEN
    RAISE EXCEPTION 'BLOCKING_EXCEPTIONS_OPEN';
  END IF;

  -- Re-read after the lock. A shift opened since evaluation is visible here,
  -- and a shift opened during this lock waits and then takes the new date.
  IF EXISTS (
    SELECT 1
      FROM public.hotel_cashier_shifts
     WHERE restaurant_id = _restaurant_id
       AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'OPEN_CASHIER_SHIFT';
  END IF;

  UPDATE public.night_audit_runs
     SET status = 'closed',
         summary = _summary,
         closed_by_membership_id = _membership_id,
         closed_at = now()
   WHERE id = _run.id
  RETURNING * INTO _run;

  UPDATE public.restaurants
     SET business_date = _run.business_date + 1
   WHERE id = _restaurant_id;

  RETURN _run;
END;
$$;

REVOKE ALL ON FUNCTION public.close_business_date(uuid, uuid, jsonb, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_business_date(uuid, uuid, jsonb, uuid) TO service_role;

-- Recovery cannot jump the hotel day past an open shift. A shift already on
-- the target date does not block initializing that same date.
CREATE OR REPLACE FUNCTION public.adjust_business_date(
  _restaurant_id uuid,
  _expected_business_date date,
  _new_business_date date,
  _reason text,
  _membership_id uuid
) RETURNS public.business_date_adjustments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _stored date;
  _timezone text;
  _effective date;
  _last_closed date;
  _active_run public.night_audit_runs;
  _row public.business_date_adjustments;
BEGIN
  IF _new_business_date IS NULL THEN
    RAISE EXCEPTION 'BUSINESS_DATE_INVALID';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) = 0 OR length(trim(_reason)) > 500 THEN
    RAISE EXCEPTION 'BUSINESS_DATE_REASON_REQUIRED';
  END IF;

  SELECT business_date, timezone INTO _stored, _timezone
    FROM public.restaurants
   WHERE id = _restaurant_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROPERTY_NOT_FOUND';
  END IF;

  IF _stored IS DISTINCT FROM _expected_business_date THEN
    RAISE EXCEPTION 'BUSINESS_DATE_STALE';
  END IF;

  IF _stored IS NOT NULL AND _stored = _new_business_date THEN
    RAISE EXCEPTION 'BUSINESS_DATE_UNCHANGED';
  END IF;

  _effective := coalesce(_stored, (now() AT TIME ZONE coalesce(_timezone, 'UTC'))::date);

  IF EXISTS (
    SELECT 1
      FROM public.night_audit_runs
     WHERE restaurant_id = _restaurant_id
       AND business_date = _effective
       AND status = 'closed'
  ) THEN
    RAISE EXCEPTION 'ACTIVE_NIGHT_AUDIT_RUN';
  END IF;

  SELECT * INTO _active_run
    FROM public.night_audit_runs
   WHERE restaurant_id = _restaurant_id
     AND business_date = _effective
     AND status IN ('open', 'ready')
   FOR UPDATE;

  IF _active_run.id IS NOT NULL AND _new_business_date <> _effective THEN
    IF coalesce(_active_run.summary, '{}'::jsonb) ? 'closeRequestId'
       OR _active_run.closed_at IS NOT NULL
       OR _active_run.closed_by_membership_id IS NOT NULL THEN
      RAISE EXCEPTION 'ACTIVE_NIGHT_AUDIT_RUN';
    END IF;

    IF EXISTS (
      SELECT 1
        FROM public.night_audit_fiscal_overrides
       WHERE restaurant_id = _restaurant_id
         AND night_audit_run_id = _active_run.id
    ) THEN
      RAISE EXCEPTION 'ACTIVE_NIGHT_AUDIT_RUN';
    END IF;
  END IF;

  SELECT max(business_date) INTO _last_closed
    FROM public.night_audit_runs
   WHERE restaurant_id = _restaurant_id
     AND status = 'closed';

  IF _last_closed IS NOT NULL AND _new_business_date <= _last_closed THEN
    RAISE EXCEPTION 'BUSINESS_DATE_BEFORE_CLOSED_HISTORY';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.hotel_cashier_shifts
     WHERE restaurant_id = _restaurant_id
       AND status = 'open'
       AND business_date IS DISTINCT FROM _new_business_date
  ) THEN
    RAISE EXCEPTION 'OPEN_CASHIER_SHIFT';
  END IF;

  INSERT INTO public.business_date_adjustments (
    restaurant_id, old_business_date, new_business_date, reason, changed_by_membership_id
  ) VALUES (
    _restaurant_id, _stored, _new_business_date, trim(_reason), _membership_id
  )
  RETURNING * INTO _row;

  IF _active_run.id IS NOT NULL AND _new_business_date <> _effective THEN
    UPDATE public.night_audit_runs
       SET status = 'superseded',
           summary = coalesce(summary, '{}'::jsonb) || jsonb_build_object(
             'businessDateRecovery',
             jsonb_build_object(
               'superseded', true,
               'adjustmentId', _row.id,
               'oldBusinessDate', _effective,
               'newBusinessDate', _new_business_date,
               'reason', trim(_reason),
               'supersededByMembershipId', _membership_id,
               'supersededAt', now()
             )
           )
     WHERE id = _active_run.id
       AND status IN ('open', 'ready');
  END IF;

  UPDATE public.restaurants
     SET business_date = _new_business_date
   WHERE id = _restaurant_id;

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_business_date(uuid, date, date, text, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_business_date(uuid, date, date, text, uuid) TO service_role;
