-- Phase 6I — Night Audit & business date close

ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS business_date date;

ALTER TABLE public.folio_transactions ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE public.folio_transactions
  ADD CONSTRAINT folio_transactions_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('cash','card','bank_transfer','mobile_money','other'));

CREATE TABLE public.night_audit_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  business_date date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','ready','closed','failed')),
  started_by_membership_id uuid REFERENCES public.restaurant_users(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  closed_by_membership_id uuid REFERENCES public.restaurant_users(id) ON DELETE SET NULL,
  closed_at timestamptz,
  summary jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, business_date)
);

CREATE TABLE public.night_audit_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  night_audit_run_id uuid NOT NULL REFERENCES public.night_audit_runs(id) ON DELETE CASCADE,
  exception_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('warning','blocking')),
  reference_type text,
  reference_id uuid,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','ignored')),
  resolved_by_membership_id uuid REFERENCES public.restaurant_users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX night_audit_exceptions_run_idx ON public.night_audit_exceptions (night_audit_run_id, status);
CREATE UNIQUE INDEX night_audit_exceptions_unique_key
  ON public.night_audit_exceptions (night_audit_run_id, exception_type, coalesce(reference_id, '00000000-0000-0000-0000-000000000000'::uuid));

GRANT SELECT ON public.night_audit_runs TO authenticated;
GRANT ALL ON public.night_audit_runs TO service_role;
GRANT SELECT ON public.night_audit_exceptions TO authenticated;
GRANT ALL ON public.night_audit_exceptions TO service_role;

ALTER TABLE public.night_audit_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.night_audit_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read night audit runs" ON public.night_audit_runs
  FOR SELECT TO authenticated
  USING (public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager'));

CREATE POLICY "Managers read night audit exceptions" ON public.night_audit_exceptions
  FOR SELECT TO authenticated
  USING (public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager'));

CREATE TRIGGER night_audit_runs_set_updated_at
  BEFORE UPDATE ON public.night_audit_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Transaction-safe business date close.
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
  _blocking integer;
BEGIN
  PERFORM 1 FROM public.restaurants WHERE id = _restaurant_id FOR UPDATE;

  SELECT * INTO _run FROM public.night_audit_runs
   WHERE id = _run_id AND restaurant_id = _restaurant_id
   FOR UPDATE;

  IF _run.id IS NULL THEN
    RAISE EXCEPTION 'AUDIT_RUN_NOT_FOUND';
  END IF;

  -- Idempotent: an already closed date returns its stored result untouched.
  IF _run.status = 'closed' THEN
    RETURN _run;
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
