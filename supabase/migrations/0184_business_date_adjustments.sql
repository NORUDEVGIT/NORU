-- Owner-only Business Date recovery.
-- restaurants.business_date stays canonical and close_business_date stays the
-- normal (+1) writer. This adds one controlled setup/recovery path that always
-- writes an immutable audit row in the same transaction as the date change.
-- It never touches night_audit_runs, so closed runs and history are untouched.

CREATE TABLE public.business_date_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  -- NULL when the property had no persisted business date (initialization).
  old_business_date date NULL,
  new_business_date date NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) > 0 AND length(reason) <= 500),
  changed_by_membership_id uuid NOT NULL REFERENCES public.restaurant_users(id) ON DELETE RESTRICT,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX business_date_adjustments_restaurant_idx
  ON public.business_date_adjustments (restaurant_id, changed_at DESC);

ALTER TABLE public.business_date_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read business date adjustments"
  ON public.business_date_adjustments
  FOR SELECT TO authenticated
  USING (public.has_restaurant_role(restaurant_id, 'owner'));

-- Append-only: rows are written by adjust_business_date only and never edited.
GRANT SELECT ON public.business_date_adjustments TO authenticated;
GRANT SELECT, INSERT ON public.business_date_adjustments TO service_role;

CREATE OR REPLACE FUNCTION public.business_date_adjustments_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'BUSINESS_DATE_ADJUSTMENT_IMMUTABLE';
END;
$$;

CREATE TRIGGER business_date_adjustments_no_update
  BEFORE UPDATE ON public.business_date_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.business_date_adjustments_immutable();

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
  _row public.business_date_adjustments;
BEGIN
  IF _new_business_date IS NULL THEN
    RAISE EXCEPTION 'BUSINESS_DATE_INVALID';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) = 0 OR length(trim(_reason)) > 500 THEN
    RAISE EXCEPTION 'BUSINESS_DATE_REASON_REQUIRED';
  END IF;

  -- Same lock close_business_date takes: a close and an adjustment serialize.
  SELECT business_date, timezone INTO _stored, _timezone
    FROM public.restaurants
   WHERE id = _restaurant_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROPERTY_NOT_FOUND';
  END IF;

  -- Optimistic concurrency: the caller must have seen the current stored value.
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
       AND status IN ('open', 'ready')
  ) THEN
    RAISE EXCEPTION 'ACTIVE_NIGHT_AUDIT_RUN';
  END IF;

  -- A date on or before a closed run would collide with closed history and
  -- leave Night Audit unable to close (close_business_date rejects it).
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

  UPDATE public.restaurants
     SET business_date = _new_business_date
   WHERE id = _restaurant_id;

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_business_date(uuid, date, date, text, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_business_date(uuid, date, date, text, uuid) TO service_role;
