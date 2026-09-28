-- Night Audit Phase 0 — close only the current house date.
-- Dual-lane with supabase/migrations/0115_night_audit_phase0_close_guard.sql.
-- Does not post folios, change stays, or add a second business-date column.

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

  -- Idempotent: an already closed run returns its stored result and does not roll the date again.
  IF _run.status = 'closed' THEN
    RETURN _run;
  END IF;

  IF _run.status NOT IN ('open', 'ready') THEN
    RAISE EXCEPTION 'AUDIT_RUN_NOT_CLOSABLE';
  END IF;

  SELECT business_date INTO _house_date
    FROM public.restaurants
   WHERE id = _restaurant_id;

  -- Null house date is the first close. A persisted date must be this run's date.
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
    FROM public.night_audit_exceptions
   WHERE night_audit_run_id = _run.id
     AND severity = 'blocking'
     AND status = 'open';

  IF _blocking > 0 THEN
    RAISE EXCEPTION 'BLOCKING_EXCEPTIONS_OPEN';
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
