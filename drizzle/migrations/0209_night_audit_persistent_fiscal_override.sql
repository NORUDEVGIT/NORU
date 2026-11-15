-- Fiscal override scope. Additive only; no override row is deleted.
--
-- run_only   : the existing behaviour. Covers one exception on one open run.
-- persistent : covers one exact fiscal source (restaurant_id + source_type +
--              source_id) on every future End of Day until it is revoked.
--              It never changes fiscal status and never covers any other
--              document. A revoked row stays as history.

ALTER TABLE public.night_audit_fiscal_overrides
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'run_only',
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_id uuid,
  ADD COLUMN IF NOT EXISTS fiscal_registration_id uuid
    REFERENCES public.fiscal_registrations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by_membership_id uuid
    REFERENCES public.restaurant_users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS revocation_reason text;

ALTER TABLE public.night_audit_fiscal_overrides
  DROP CONSTRAINT IF EXISTS night_audit_fiscal_overrides_scope_check;
ALTER TABLE public.night_audit_fiscal_overrides
  ADD CONSTRAINT night_audit_fiscal_overrides_scope_check
  CHECK (scope IN ('run_only', 'persistent'));

ALTER TABLE public.night_audit_fiscal_overrides
  DROP CONSTRAINT IF EXISTS night_audit_fiscal_overrides_persistent_source_check;
ALTER TABLE public.night_audit_fiscal_overrides
  ADD CONSTRAINT night_audit_fiscal_overrides_persistent_source_check
  CHECK (
    scope <> 'persistent'
    OR (
      source_type IS NOT NULL
      AND source_id IS NOT NULL
      AND reason_category IS NOT NULL
    )
  );

-- Only a persistent waiver is revoked. A run-only row ends by invalidation.
ALTER TABLE public.night_audit_fiscal_overrides
  DROP CONSTRAINT IF EXISTS night_audit_fiscal_overrides_revocation_check;
ALTER TABLE public.night_audit_fiscal_overrides
  ADD CONSTRAINT night_audit_fiscal_overrides_revocation_check
  CHECK (
    (revoked_at IS NULL AND revoked_by_membership_id IS NULL AND revocation_reason IS NULL)
    OR (
      scope = 'persistent'
      AND revoked_at IS NOT NULL
      AND revocation_reason IS NOT NULL
      AND length(btrim(revocation_reason)) BETWEEN 1 AND 500
    )
  );

-- One active override per exception, now excluding revoked rows.
DROP INDEX IF EXISTS public.night_audit_fiscal_overrides_active_exception_idx;
CREATE UNIQUE INDEX IF NOT EXISTS night_audit_fiscal_overrides_active_exception_v2_idx
  ON public.night_audit_fiscal_overrides (exception_id)
  WHERE invalidated_at IS NULL AND revoked_at IS NULL;

-- One active persistent waiver per exact source.
CREATE UNIQUE INDEX IF NOT EXISTS night_audit_fiscal_overrides_active_persistent_source_idx
  ON public.night_audit_fiscal_overrides (restaurant_id, source_type, source_id)
  WHERE scope = 'persistent' AND invalidated_at IS NULL AND revoked_at IS NULL;

-- Authorization facts never change. invalidated_* and revoked_* are written
-- once, from NULL, by the server.
CREATE OR REPLACE FUNCTION public.night_audit_fiscal_overrides_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id
    OR NEW.night_audit_run_id IS DISTINCT FROM OLD.night_audit_run_id
    OR NEW.exception_id IS DISTINCT FROM OLD.exception_id
    OR NEW.business_date IS DISTINCT FROM OLD.business_date
    OR NEW.exception_type IS DISTINCT FROM OLD.exception_type
    OR NEW.fiscal_status IS DISTINCT FROM OLD.fiscal_status
    OR NEW.fiscal_reference IS DISTINCT FROM OLD.fiscal_reference
    OR NEW.reason IS DISTINCT FROM OLD.reason
    OR NEW.reason_category IS DISTINCT FROM OLD.reason_category
    OR NEW.overridden_by_membership_id IS DISTINCT FROM OLD.overridden_by_membership_id
    OR NEW.overridden_at IS DISTINCT FROM OLD.overridden_at
    OR NEW.scope IS DISTINCT FROM OLD.scope
    OR NEW.source_type IS DISTINCT FROM OLD.source_type
    OR NEW.source_id IS DISTINCT FROM OLD.source_id
    OR NEW.fiscal_registration_id IS DISTINCT FROM OLD.fiscal_registration_id
  THEN
    RAISE EXCEPTION 'FISCAL_OVERRIDE_IMMUTABLE';
  END IF;
  IF OLD.invalidated_at IS NOT NULL
    AND (NEW.invalidated_at IS DISTINCT FROM OLD.invalidated_at
      OR NEW.invalidated_reason IS DISTINCT FROM OLD.invalidated_reason) THEN
    RAISE EXCEPTION 'FISCAL_OVERRIDE_IMMUTABLE';
  END IF;
  IF OLD.revoked_at IS NOT NULL
    AND (NEW.revoked_at IS DISTINCT FROM OLD.revoked_at
      OR NEW.revoked_by_membership_id IS DISTINCT FROM OLD.revoked_by_membership_id
      OR NEW.revocation_reason IS DISTINCT FROM OLD.revocation_reason) THEN
    RAISE EXCEPTION 'FISCAL_OVERRIDE_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.night_audit_fiscal_overrides_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS night_audit_fiscal_overrides_guard ON public.night_audit_fiscal_overrides;
CREATE TRIGGER night_audit_fiscal_overrides_guard
  BEFORE UPDATE ON public.night_audit_fiscal_overrides
  FOR EACH ROW EXECUTE FUNCTION public.night_audit_fiscal_overrides_guard();

COMMENT ON COLUMN public.night_audit_fiscal_overrides.scope IS
  'run_only covers one exception on one run. persistent covers one exact fiscal source on future End of Days until revoked.';
COMMENT ON COLUMN public.night_audit_fiscal_overrides.revoked_at IS
  'Persistent waiver ended, by a user or because the source was resolved. The row is kept.';

-- Permission: persistent waiver is its own CRITICAL grant. Not in templates.
ALTER TABLE public.pms_permissions
  DROP CONSTRAINT IF EXISTS pms_permissions_action_check;

ALTER TABLE public.pms_permissions
  ADD CONSTRAINT pms_permissions_action_check CHECK (
    action IN (
      'view',
      'create',
      'edit',
      'delete',
      'cancel',
      'approve',
      'post',
      'refund',
      'export',
      'print',
      'configure',
      'activate',
      'override',
      'authorize',
      'recover',
      'assign_roles',
      'reset_access',
      'assign_permissions',
      'window_override',
      'override_persistent'
    )
  );

INSERT INTO public.pms_permissions (
  code,
  module,
  function,
  action,
  name,
  description,
  sensitive,
  active
)
VALUES (
  'night_audit.fiscal.override_persistent',
  'night_audit',
  'fiscal',
  'override_persistent',
  'Persistent Fiscal Override',
  'Waive one fiscal document on every future End of Day until revoked. Fiscal status does not change.',
  true,
  true
)
ON CONFLICT (code) DO UPDATE SET
  module = EXCLUDED.module,
  function = EXCLUDED.function,
  action = EXCLUDED.action,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sensitive = EXCLUDED.sensitive,
  active = true;

-- Close gate. Same locking, stale checks, and +1 contract as 0179. A revoked
-- override no longer covers anything. An active persistent waiver covers an
-- open fiscal exception for its exact source on any run.
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
