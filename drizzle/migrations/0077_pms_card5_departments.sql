-- PMS Property Setup Card 5 — Departments schema (Phase 1).
--
-- Sequential after 0076. Dual-lane: byte-identical copies live in
--   supabase/migrations/0077_pms_card5_departments.sql
--   drizzle/migrations/0077_pms_card5_departments.sql
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY AFTER MERGE — wait for PM approval of this SQL before apply.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f drizzle/migrations/0077_pms_card5_departments.sql
--   or the project's usual drizzle / Supabase migration apply path.
--   Do not run both copies against the same database.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.pms_department_routing_rules;
--   ALTER TABLE public.pms_departments
--     DROP CONSTRAINT IF EXISTS pms_departments_parent_fk,
--     DROP CONSTRAINT IF EXISTS pms_departments_manager_fk,
--     DROP CONSTRAINT IF EXISTS pms_departments_escalation_manager_fk,
--     DROP CONSTRAINT IF EXISTS pms_departments_no_self_parent,
--     DROP CONSTRAINT IF EXISTS pms_departments_description_check,
--     DROP CONSTRAINT IF EXISTS pms_departments_type_check,
--     DROP CONSTRAINT IF EXISTS pms_departments_responsible_role_check,
--     DROP CONSTRAINT IF EXISTS pms_departments_cost_center_check,
--     DROP CONSTRAINT IF EXISTS pms_departments_revenue_center_check,
--     DROP CONSTRAINT IF EXISTS pms_departments_operating_hours_check,
--     DROP CONSTRAINT IF EXISTS pms_departments_default_language_check,
--     DROP CONSTRAINT IF EXISTS pms_departments_default_notification_check,
--     DROP CONSTRAINT IF EXISTS pms_departments_default_priority_check,
--     DROP CONSTRAINT IF EXISTS pms_departments_default_sla_check,
--     DROP COLUMN IF EXISTS description,
--     DROP COLUMN IF EXISTS parent_id,
--     DROP COLUMN IF EXISTS department_type,
--     DROP COLUMN IF EXISTS manager_user_id,
--     DROP COLUMN IF EXISTS responsible_role,
--     DROP COLUMN IF EXISTS cost_center,
--     DROP COLUMN IF EXISTS revenue_center,
--     DROP COLUMN IF EXISTS operating_hours,
--     DROP COLUMN IF EXISTS default_language,
--     DROP COLUMN IF EXISTS default_notification_channel,
--     DROP COLUMN IF EXISTS default_priority,
--     DROP COLUMN IF EXISTS default_sla_minutes,
--     DROP COLUMN IF EXISTS escalation_manager_user_id;
--   DROP INDEX IF EXISTS pms_departments_parent_idx;
--
-- Scope fence — this migration explicitly does NOT touch:
--   restaurants.pms_routing_defaults (SET5 folio posting defaults)
--   pms_work_centers, pms_guest_request_types
--   Card 2 maintenance preventive_assigned_department_id
--   Card 1 department_contacts, Card 3 tax/currency, pms_outlets
--   staff_shifts / attendance / live guest requests / work orders
--   restaurants.pms_property_setup_status
--   no new audit table — reuse public.restaurant_staff_audit_log
--
-- Additive only. No seed. No backfill. Existing SET5 rows stay valid:
--   department_type defaults to 'custom'; new columns are nullable or '{}'.
-- No types.ts regen. No privileged functions. Deeper hierarchy cycles stay API-side.

-- 1. Extend the existing SET5 department master. Do not create a second table.
ALTER TABLE public.pms_departments
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS parent_id uuid,
  ADD COLUMN IF NOT EXISTS department_type text NOT NULL DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS manager_user_id uuid,
  ADD COLUMN IF NOT EXISTS responsible_role text,
  ADD COLUMN IF NOT EXISTS cost_center text,
  ADD COLUMN IF NOT EXISTS revenue_center text,
  ADD COLUMN IF NOT EXISTS operating_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS default_language text,
  ADD COLUMN IF NOT EXISTS default_notification_channel text,
  ADD COLUMN IF NOT EXISTS default_priority text,
  ADD COLUMN IF NOT EXISTS default_sla_minutes integer,
  ADD COLUMN IF NOT EXISTS escalation_manager_user_id uuid;

ALTER TABLE public.pms_departments
  DROP CONSTRAINT IF EXISTS pms_departments_no_self_parent,
  DROP CONSTRAINT IF EXISTS pms_departments_description_check,
  DROP CONSTRAINT IF EXISTS pms_departments_type_check,
  DROP CONSTRAINT IF EXISTS pms_departments_responsible_role_check,
  DROP CONSTRAINT IF EXISTS pms_departments_cost_center_check,
  DROP CONSTRAINT IF EXISTS pms_departments_revenue_center_check,
  DROP CONSTRAINT IF EXISTS pms_departments_operating_hours_check,
  DROP CONSTRAINT IF EXISTS pms_departments_default_language_check,
  DROP CONSTRAINT IF EXISTS pms_departments_default_notification_check,
  DROP CONSTRAINT IF EXISTS pms_departments_default_priority_check,
  DROP CONSTRAINT IF EXISTS pms_departments_default_sla_check,
  DROP CONSTRAINT IF EXISTS pms_departments_parent_fk,
  DROP CONSTRAINT IF EXISTS pms_departments_manager_fk,
  DROP CONSTRAINT IF EXISTS pms_departments_escalation_manager_fk;

ALTER TABLE public.pms_departments
  ADD CONSTRAINT pms_departments_no_self_parent CHECK (parent_id IS DISTINCT FROM id),
  ADD CONSTRAINT pms_departments_description_check CHECK (
    description IS NULL OR length(btrim(description)) BETWEEN 1 AND 500
  ),
  ADD CONSTRAINT pms_departments_type_check CHECK (
    department_type IN ('operations', 'commercial', 'fnb', 'administration', 'custom')
  ),
  ADD CONSTRAINT pms_departments_responsible_role_check CHECK (
    responsible_role IS NULL OR responsible_role IN (
      'owner',
      'manager',
      'kitchen',
      'waiter',
      'housekeeping',
      'receptionist',
      'housekeeper',
      'housekeeping_supervisor',
      'cashier',
      'storekeeper',
      'accountant',
      'maintenance'
    )
  ),
  ADD CONSTRAINT pms_departments_cost_center_check CHECK (
    cost_center IS NULL OR length(btrim(cost_center)) BETWEEN 1 AND 40
  ),
  ADD CONSTRAINT pms_departments_revenue_center_check CHECK (
    revenue_center IS NULL OR length(btrim(revenue_center)) BETWEEN 1 AND 40
  ),
  ADD CONSTRAINT pms_departments_operating_hours_check CHECK (jsonb_typeof(operating_hours) = 'object'),
  ADD CONSTRAINT pms_departments_default_language_check CHECK (
    default_language IS NULL OR default_language ~ '^[a-z]{2,8}$'
  ),
  ADD CONSTRAINT pms_departments_default_notification_check CHECK (
    default_notification_channel IS NULL
    OR default_notification_channel IN ('email', 'sms', 'in_app')
  ),
  ADD CONSTRAINT pms_departments_default_priority_check CHECK (
    default_priority IS NULL OR default_priority IN ('low', 'normal', 'high', 'urgent')
  ),
  ADD CONSTRAINT pms_departments_default_sla_check CHECK (
    default_sla_minutes IS NULL OR default_sla_minutes >= 1
  ),
  ADD CONSTRAINT pms_departments_parent_fk
    FOREIGN KEY (parent_id, restaurant_id)
    REFERENCES public.pms_departments (id, restaurant_id)
    ON DELETE SET NULL,
  ADD CONSTRAINT pms_departments_manager_fk
    FOREIGN KEY (restaurant_id, manager_user_id)
    REFERENCES public.restaurant_users (restaurant_id, user_id)
    ON DELETE SET NULL,
  ADD CONSTRAINT pms_departments_escalation_manager_fk
    FOREIGN KEY (restaurant_id, escalation_manager_user_id)
    REFERENCES public.restaurant_users (restaurant_id, user_id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS pms_departments_parent_idx
  ON public.pms_departments(restaurant_id, parent_id);

COMMENT ON COLUMN public.pms_departments.parent_id IS
  'Optional parent in the same restaurant. Composite FK with restaurant_id. Self-parent blocked; deeper cycles stay API-side.';
COMMENT ON COLUMN public.pms_departments.department_type IS
  'Category only (operations/commercial/fnb/administration/custom). Not a hotel org chart seed.';
COMMENT ON COLUMN public.pms_departments.manager_user_id IS
  'auth user id of an existing restaurant_users membership in this restaurant. Nullable. Not a second user table.';
COMMENT ON COLUMN public.pms_departments.responsible_role IS
  'Existing STAFF_ROLES value. Role catalogue ownership stays in restaurant_users.';
COMMENT ON COLUMN public.pms_departments.cost_center IS
  'Setup identifier only. No chart of accounts in 0077.';
COMMENT ON COLUMN public.pms_departments.revenue_center IS
  'Setup identifier only. No chart of accounts in 0077.';
COMMENT ON COLUMN public.pms_departments.operating_hours IS
  'Setup-only object: daily / weekend / holiday windows and 24-hour flag. Not shifts or attendance.';
COMMENT ON COLUMN public.pms_departments.default_notification_channel IS
  'Reuses SET5 channels email/sms/in_app. WhatsApp stays out.';

-- 2. Setup routing map. Not restaurants.pms_routing_defaults and not live tasks.
CREATE TABLE IF NOT EXISTS public.pms_department_routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  service_key text NOT NULL,
  department_id uuid NOT NULL,
  default_role text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_department_routing_rules_service_unique UNIQUE (restaurant_id, service_key),
  CONSTRAINT pms_department_routing_rules_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_department_routing_rules_service_key_check CHECK (
    service_key ~ '^[a-z][a-z0-9_]{0,39}$'
  ),
  CONSTRAINT pms_department_routing_rules_role_check CHECK (
    default_role IN (
      'owner',
      'manager',
      'kitchen',
      'waiter',
      'housekeeping',
      'receptionist',
      'housekeeper',
      'housekeeping_supervisor',
      'cashier',
      'storekeeper',
      'accountant',
      'maintenance'
    )
  ),
  CONSTRAINT pms_department_routing_rules_description_check CHECK (
    description IS NULL OR length(btrim(description)) BETWEEN 1 AND 200
  ),
  CONSTRAINT pms_department_routing_rules_department_fk
    FOREIGN KEY (department_id, restaurant_id)
    REFERENCES public.pms_departments (id, restaurant_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS pms_department_routing_rules_restaurant_idx
  ON public.pms_department_routing_rules(restaurant_id, department_id);

COMMENT ON TABLE public.pms_department_routing_rules IS
  'Card 5 setup map: service/task key → department → default role. Not folio pms_routing_defaults, not fo_guest_requests, not work orders.';
COMMENT ON COLUMN public.pms_department_routing_rules.service_key IS
  'Stable snake_case key. Reuse guest_request, room_cleaning, room_repair, restaurant_reservation, corporate_inquiry, payment_issue, airport_transfer when they match. Custom keys allowed. Not a guest-request row id.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_department_routing_rules TO authenticated;
GRANT ALL ON public.pms_department_routing_rules TO service_role;
ALTER TABLE public.pms_department_routing_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read department routing rules" ON public.pms_department_routing_rules;
CREATE POLICY "Members read department routing rules" ON public.pms_department_routing_rules
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert department routing rules" ON public.pms_department_routing_rules;
CREATE POLICY "Managers insert department routing rules" ON public.pms_department_routing_rules
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update department routing rules" ON public.pms_department_routing_rules;
CREATE POLICY "Managers update department routing rules" ON public.pms_department_routing_rules
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete department routing rules" ON public.pms_department_routing_rules;
CREATE POLICY "Managers delete department routing rules" ON public.pms_department_routing_rules
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_department_routing_rules_updated_at ON public.pms_department_routing_rules;
CREATE TRIGGER set_pms_department_routing_rules_updated_at
  BEFORE UPDATE ON public.pms_department_routing_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
