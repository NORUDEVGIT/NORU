-- Narrow Night Audit authorization for fiscal blockers only.
-- It never changes a fiscal document or an exception's source status.

CREATE TABLE public.night_audit_fiscal_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  night_audit_run_id uuid NOT NULL REFERENCES public.night_audit_runs(id) ON DELETE CASCADE,
  exception_id uuid NOT NULL REFERENCES public.night_audit_exceptions(id) ON DELETE RESTRICT,
  business_date date NOT NULL,
  exception_type text NOT NULL,
  fiscal_status text NOT NULL,
  fiscal_reference text,
  reason text NOT NULL CHECK (length(trim(reason)) > 0 AND length(reason) <= 500),
  reason_category text,
  overridden_by_membership_id uuid NOT NULL REFERENCES public.restaurant_users(id) ON DELETE RESTRICT,
  overridden_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exception_id)
);

CREATE INDEX night_audit_fiscal_overrides_run_idx
  ON public.night_audit_fiscal_overrides (night_audit_run_id, overridden_at);

ALTER TABLE public.night_audit_fiscal_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read fiscal close overrides"
  ON public.night_audit_fiscal_overrides
  FOR SELECT TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );

GRANT SELECT ON public.night_audit_fiscal_overrides TO authenticated;
GRANT ALL ON public.night_audit_fiscal_overrides TO service_role;

-- Keep the close RPC's locking and +1 business-date contract. The only
-- difference is that an open exception covered by a persisted fiscal override
-- is not a hard close blocker for that same run.
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
