-- Business Date recovery must not be permanently disabled simply because
-- visiting Night Audit created a harmless current-date run. A recovery may
-- terminally supersede that run only when it has no fiscal authorization and
-- no persisted close request. Closed runs remain immutable.

ALTER TABLE public.night_audit_runs
  DROP CONSTRAINT IF EXISTS night_audit_runs_status_check;

ALTER TABLE public.night_audit_runs
  ADD CONSTRAINT night_audit_runs_status_check
  CHECK (status IN ('open', 'ready', 'closed', 'failed', 'superseded'));

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

  -- Serializes recovery against close_business_date. If a close is underway,
  -- this waits for its lock, then sees the resulting closed/stale state rather
  -- than superseding a partially completed close.
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

  -- An anomalous closed run on the effective date is immutable and must never
  -- be made to look like a recoverable current run.
  IF EXISTS (
    SELECT 1
      FROM public.night_audit_runs
     WHERE restaurant_id = _restaurant_id
       AND business_date = _effective
       AND status = 'closed'
  ) THEN
    RAISE EXCEPTION 'ACTIVE_NIGHT_AUDIT_RUN';
  END IF;

  -- The property lock is held before this row lock, matching close order.
  SELECT * INTO _active_run
    FROM public.night_audit_runs
   WHERE restaurant_id = _restaurant_id
     AND business_date = _effective
     AND status IN ('open', 'ready')
   FOR UPDATE;

  IF _active_run.id IS NOT NULL AND _new_business_date <> _effective THEN
    -- A persisted close request is defensive protection for incomplete legacy
    -- writes. Normal close writes request id and closed status atomically.
    IF coalesce(_active_run.summary, '{}'::jsonb) ? 'closeRequestId'
       OR _active_run.closed_at IS NOT NULL
       OR _active_run.closed_by_membership_id IS NOT NULL THEN
      RAISE EXCEPTION 'ACTIVE_NIGHT_AUDIT_RUN';
    END IF;

    -- Fiscal overrides are management authorizations and must be preserved.
    -- Any persisted override row blocks recovery, including historical rows.
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

  INSERT INTO public.business_date_adjustments (
    restaurant_id, old_business_date, new_business_date, reason, changed_by_membership_id
  ) VALUES (
    _restaurant_id, _stored, _new_business_date, trim(_reason), _membership_id
  )
  RETURNING * INTO _row;

  -- Initialization to the same effective property-local date keeps the
  -- harmless run current. A real date change records why the prior run became
  -- terminal and prevents it from ever being closed.
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
