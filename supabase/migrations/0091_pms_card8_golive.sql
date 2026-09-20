-- PMS Property Setup Card 8 — Go-Live governance schema (Phase 3).
--
-- Sequential after 0090. Dual-lane: byte-identical copies live in
--   supabase/migrations/0091_pms_card8_golive.sql
--   drizzle/migrations/0091_pms_card8_golive.sql
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY AFTER MERGE — wait for PM apply approval of this SQL before apply.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f drizzle/migrations/0091_pms_card8_golive.sql
--   or the project's usual drizzle / Supabase migration apply path.
--   Do not run both copies against the same database.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.pms_golive_tasks;
--   DROP TABLE IF EXISTS public.pms_golive_plans;
--
-- Scope fence — this migration explicitly does NOT touch:
--   restaurants.pms_set1_live / activatePmsSet1 / SET1 #golive
--   evaluateSet1Checklist / evaluateGoLive
--   pms_offline_policies / pms_offline_capabilities
--   pms_validation_runs / System Validation adapters
--   restaurants.business_date / business_date_config
--   hotel_rooms / housekeeping_tasks / hotel_reservations
--   Card 6 connector environment / sandbox runtime
--   Card 1 lockDuringAudit / configuration freeze writers
--   restaurants.pms_property_setup_status
--   restaurant_staff_audit_log / pms_audit_events (none created — reuse staff audit on save later)
--   types.ts
--
-- Governance only. Rows do not activate the property, ship a sandbox, or
-- enforce a cutover lock. Do not persist operational opening/reservation
-- counts or System Validation results. No seed. No SET1 checklist backfill.

-- 1. Tenant-scoped Go-Live plan. One row per property.
CREATE TABLE IF NOT EXISTS public.pms_golive_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft',
  business_date_confirmed boolean NOT NULL DEFAULT false,
  opening_state_confirmed boolean NOT NULL DEFAULT false,
  future_reservations_confirmed boolean NOT NULL DEFAULT false,
  sandbox_acknowledgement boolean NOT NULL DEFAULT false,
  cutover_lock_acknowledgement boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_golive_plans_restaurant_unique UNIQUE (restaurant_id),
  CONSTRAINT pms_golive_plans_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_golive_plans_status_check CHECK (
    status IN ('draft', 'preparing', 'ready')
  ),
  CONSTRAINT pms_golive_plans_status_not_activation CHECK (
    status NOT IN ('live', 'active', 'activated')
  ),
  CONSTRAINT pms_golive_plans_notes_check CHECK (
    notes IS NULL OR length(btrim(notes)) BETWEEN 1 AND 2000
  )
);

CREATE INDEX IF NOT EXISTS pms_golive_plans_restaurant_idx
  ON public.pms_golive_plans(restaurant_id);

COMMENT ON TABLE public.pms_golive_plans IS
  'Card 8 Go-Live governance plan. One row per restaurant. status ready is preparation only and must never write restaurants.pms_set1_live.';
COMMENT ON COLUMN public.pms_golive_plans.status IS
  'draft, preparing or ready. live/active/activated are forbidden; those belong to SET1 Activate.';
COMMENT ON COLUMN public.pms_golive_plans.business_date_confirmed IS
  'Human confirmation that restaurants.business_date was reviewed. Does not store or override the date.';
COMMENT ON COLUMN public.pms_golive_plans.opening_state_confirmed IS
  'Human confirmation of the live housekeeping opening board. Does not store room or occupancy totals.';
COMMENT ON COLUMN public.pms_golive_plans.future_reservations_confirmed IS
  'Human confirmation of live upcoming reservations. Does not store reservation counts.';
COMMENT ON COLUMN public.pms_golive_plans.sandbox_acknowledgement IS
  'True only acknowledges that property sandbox/test isolation is unavailable. Not a sandbox-supported flag.';
COMMENT ON COLUMN public.pms_golive_plans.cutover_lock_acknowledgement IS
  'True only acknowledges that enforced cutover locking is unavailable/deferred. Not a lock-enabled flag.';
COMMENT ON COLUMN public.pms_golive_plans.notes IS
  'Optional preparation notes. Not an activation reason and not a validation report.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_golive_plans TO authenticated;
GRANT ALL ON public.pms_golive_plans TO service_role;
ALTER TABLE public.pms_golive_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read golive plans" ON public.pms_golive_plans;
CREATE POLICY "Members read golive plans" ON public.pms_golive_plans
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert golive plans" ON public.pms_golive_plans;
CREATE POLICY "Managers insert golive plans" ON public.pms_golive_plans
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update golive plans" ON public.pms_golive_plans;
CREATE POLICY "Managers update golive plans" ON public.pms_golive_plans
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete golive plans" ON public.pms_golive_plans;
CREATE POLICY "Managers delete golive plans" ON public.pms_golive_plans
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_golive_plans_updated_at ON public.pms_golive_plans;
CREATE TRIGGER set_pms_golive_plans_updated_at
  BEFORE UPDATE ON public.pms_golive_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Tenant-scoped Go-Live checklist. Explicit status; never inferred from Cards 1–7.
CREATE TABLE IF NOT EXISTS public.pms_golive_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  golive_plan_id uuid NOT NULL,
  category text NOT NULL,
  task_key text NOT NULL,
  title text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  owner_department_id uuid,
  owner_user_id uuid,
  status text NOT NULL DEFAULT 'not_started',
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_golive_tasks_unique UNIQUE (restaurant_id, task_key),
  CONSTRAINT pms_golive_tasks_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_golive_tasks_plan_fk
    FOREIGN KEY (golive_plan_id, restaurant_id)
    REFERENCES public.pms_golive_plans (id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT pms_golive_tasks_department_fk
    FOREIGN KEY (owner_department_id, restaurant_id)
    REFERENCES public.pms_departments (id, restaurant_id)
    ON DELETE SET NULL,
  CONSTRAINT pms_golive_tasks_owner_fk
    FOREIGN KEY (restaurant_id, owner_user_id)
    REFERENCES public.restaurant_users (restaurant_id, user_id)
    ON DELETE SET NULL,
  CONSTRAINT pms_golive_tasks_category_check CHECK (
    category IN (
      'property',
      'commercial',
      'operations',
      'connectivity',
      'security',
      'data'
    )
  ),
  CONSTRAINT pms_golive_tasks_key_check CHECK (
    length(btrim(task_key)) BETWEEN 1 AND 80
  ),
  CONSTRAINT pms_golive_tasks_title_check CHECK (
    length(btrim(title)) BETWEEN 1 AND 160
  ),
  CONSTRAINT pms_golive_tasks_status_check CHECK (
    status IN ('not_started', 'in_progress', 'complete', 'not_applicable')
  ),
  CONSTRAINT pms_golive_tasks_notes_check CHECK (
    notes IS NULL OR length(btrim(notes)) BETWEEN 1 AND 2000
  ),
  CONSTRAINT pms_golive_tasks_sort_check CHECK (sort_order >= 0)
);

CREATE INDEX IF NOT EXISTS pms_golive_tasks_restaurant_idx
  ON public.pms_golive_tasks(restaurant_id, category, sort_order);
CREATE INDEX IF NOT EXISTS pms_golive_tasks_plan_idx
  ON public.pms_golive_tasks(golive_plan_id);

COMMENT ON TABLE public.pms_golive_tasks IS
  'Card 8 Go-Live governance checklist. Status is explicit. Completing a Card 1–7 domain must never auto-complete a task. Not an operational test-result store.';
COMMENT ON COLUMN public.pms_golive_tasks.task_key IS
  'Stable catalogue key unique per restaurant. Not inferred from programme card ids.';
COMMENT ON COLUMN public.pms_golive_tasks.required IS
  'Required tasks block later READY unless complete or not_applicable. Optional tasks do not.';
COMMENT ON COLUMN public.pms_golive_tasks.owner_department_id IS
  'Optional Card 5 pms_departments id. Composite tenant-safe FK. Not a new org model.';
COMMENT ON COLUMN public.pms_golive_tasks.owner_user_id IS
  'Optional auth user id of an existing restaurant_users membership. Nullable. Not a second user table and not a notification engine.';
COMMENT ON COLUMN public.pms_golive_tasks.status IS
  'not_started, in_progress, complete or not_applicable. Never derived from domain configured.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_golive_tasks TO authenticated;
GRANT ALL ON public.pms_golive_tasks TO service_role;
ALTER TABLE public.pms_golive_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read golive tasks" ON public.pms_golive_tasks;
CREATE POLICY "Members read golive tasks" ON public.pms_golive_tasks
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert golive tasks" ON public.pms_golive_tasks;
CREATE POLICY "Managers insert golive tasks" ON public.pms_golive_tasks
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update golive tasks" ON public.pms_golive_tasks;
CREATE POLICY "Managers update golive tasks" ON public.pms_golive_tasks
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete golive tasks" ON public.pms_golive_tasks;
CREATE POLICY "Managers delete golive tasks" ON public.pms_golive_tasks
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_golive_tasks_updated_at ON public.pms_golive_tasks;
CREATE TRIGGER set_pms_golive_tasks_updated_at
  BEFORE UPDATE ON public.pms_golive_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
