-- Night Audit fiscal override lifecycle correction.
-- An override is valid only for the exact exception occurrence it was authorized
-- for. If the source fiscal condition resolves, the override is invalidated.
-- A later reopen of the same exception row requires a brand new authorization.
-- Historical override rows are never deleted or overwritten.

ALTER TABLE public.night_audit_fiscal_overrides
  ADD COLUMN invalidated_at timestamptz NULL,
  ADD COLUMN invalidated_reason text NULL;

-- Replace "one override per exception, ever" with "at most one ACTIVE
-- override per exception, with unlimited historical rows".
ALTER TABLE public.night_audit_fiscal_overrides
  DROP CONSTRAINT IF EXISTS night_audit_fiscal_overrides_exception_id_key;

CREATE UNIQUE INDEX night_audit_fiscal_overrides_active_exception_idx
  ON public.night_audit_fiscal_overrides (exception_id)
  WHERE invalidated_at IS NULL;

-- Existing rows keep invalidated_at = NULL, i.e. they remain the active
-- override for their exception. No data is destroyed or rewritten.

-- Keep the close RPC's locking and +1 business-date contract. The only
-- change is that the close gate now ignores an INVALIDATED fiscal override:
-- a reopened fiscal exception whose only override is invalidated is treated
-- as a live blocker again, exactly like a non-overridden exception.
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
     );

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
