-- End of Day (Night Audit redesign). Additive only: no row is deleted and
-- warning-review history stays in night_audit_warning_reviews.

-- 1. Progress the user can resume. Check results are never stored here; they
--    are re-derived from source modules on every evaluation.
ALTER TABLE public.night_audit_runs
  ADD COLUMN IF NOT EXISTS current_step text,
  ADD COLUMN IF NOT EXISTS progress_updated_at timestamptz;

ALTER TABLE public.night_audit_runs
  DROP CONSTRAINT IF EXISTS night_audit_runs_current_step_check;
ALTER TABLE public.night_audit_runs
  ADD CONSTRAINT night_audit_runs_current_step_check
  CHECK (
    current_step IS NULL OR current_step IN (
      'prepare', 'arrivals', 'departures', 'in_house', 'folios',
      'cashier', 'reconcile', 'business_date', 'finalize'
    )
  );

-- 2. One live run per property and business date. A superseded run (Business
--    Date Recovery) stays as history and no longer blocks a new run on the
--    same date when the property returns to it.
ALTER TABLE public.night_audit_runs
  DROP CONSTRAINT IF EXISTS night_audit_runs_restaurant_id_business_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS night_audit_runs_one_live_run_per_date
  ON public.night_audit_runs (restaurant_id, business_date)
  WHERE status <> 'superseded';

-- 3. Closing outside the Night Audit Window is its own grant, not a role.
--    0193's action list does not include this verb, and the composed-code
--    check requires the action to match the code.
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
      'window_override'
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
  'night_audit.business_date.window_override',
  'night_audit',
  'business_date',
  'window_override',
  'Close Outside Night Audit Window',
  'Close the business date outside the configured Night Audit Window. Blockers still apply.',
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

-- 4. Warnings are no longer reviewed. The exception grant now covers OTB retry.
UPDATE public.pms_permissions
SET
  name = 'Retry OTB Snapshot',
  description = 'Retry the post-close OTB snapshot for the latest End of Day.'
WHERE code = 'night_audit.exception.edit';

UPDATE public.pms_permissions
SET
  name = 'Start / Recheck End of Day',
  description = 'Start, resume, and recheck End of Day.'
WHERE code = 'night_audit.run.create';
