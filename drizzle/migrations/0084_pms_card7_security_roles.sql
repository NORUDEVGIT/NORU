-- PMS Property Setup Card 7 — Security & Roles schema (Phase 1).
--
-- Sequential after 0083. Dual-lane: byte-identical copies live in
--   supabase/migrations/0084_pms_card7_security_roles.sql
--   drizzle/migrations/0084_pms_card7_security_roles.sql
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY AFTER MERGE — wait for PM approval of this SQL before apply.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f drizzle/migrations/0084_pms_card7_security_roles.sql
--   or the project's usual drizzle / Supabase migration apply path.
--   Do not run both copies against the same database.
--
-- Rollback:
--   ALTER TABLE public.restaurant_users
--     DROP CONSTRAINT IF EXISTS restaurant_users_hotel_role_fk,
--     DROP COLUMN IF EXISTS hotel_role_id;
--   DROP TABLE IF EXISTS public.pms_approval_rules;
--   DROP TABLE IF EXISTS public.pms_role_permissions;
--   DROP TABLE IF EXISTS public.pms_hotel_roles;
--   DROP TABLE IF EXISTS public.pms_permissions;
--
-- Scope fence — this migration explicitly does NOT touch:
--   restaurant_users.role CHECK / STAFF_ROLES
--   public.has_restaurant_role / public.is_restaurant_member
--   staff_module_access / module-access resolvers
--   pms_departments hierarchy (no parent_department_id on hotel roles)
--   restaurants.pms_property_setup_status / pms_set1_live
--   audit, reports, data-import tables
--   operational approval request / inbox tables
--   no user-role junction (multi-role later)
--
-- Additive only. No permission seed. No hotel_role_id backfill.
-- No types.ts regen. No privileged functions.
-- Setup CRUD RLS uses existing owner/manager helpers only.
-- pms_role_permissions is configuration storage, not live authorization.

-- 1. Global permission catalogue. Product-owned. Tenants do not insert keys.
CREATE TABLE IF NOT EXISTS public.pms_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  module text NOT NULL,
  function text NOT NULL,
  action text NOT NULL,
  name text NOT NULL,
  description text,
  sensitive boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_permissions_code_unique UNIQUE (code),
  CONSTRAINT pms_permissions_code_composed CHECK (
    code = module || '.' || function || '.' || action
  ),
  CONSTRAINT pms_permissions_module_check CHECK (
    module ~ '^[a-z][a-z0-9_]{0,39}$'
  ),
  CONSTRAINT pms_permissions_function_check CHECK (
    function ~ '^[a-z][a-z0-9_]{0,39}$'
  ),
  CONSTRAINT pms_permissions_action_check CHECK (
    action IN ('view', 'create', 'update', 'delete', 'approve', 'override')
  ),
  CONSTRAINT pms_permissions_name_check CHECK (
    length(btrim(name)) BETWEEN 1 AND 80
  ),
  CONSTRAINT pms_permissions_description_check CHECK (
    description IS NULL OR length(btrim(description)) BETWEEN 1 AND 500
  )
);

CREATE INDEX IF NOT EXISTS pms_permissions_module_idx
  ON public.pms_permissions(module, function, action);

COMMENT ON TABLE public.pms_permissions IS
  'Card 7 global PMS permission catalogue. No restaurant_id. Not STAFF_ROLES, not staff_module_access, not live RLS.';
COMMENT ON COLUMN public.pms_permissions.code IS
  'Stable key module.function.action. Do not reuse a deactivated code.';
COMMENT ON COLUMN public.pms_permissions.sensitive IS
  'Setup flag for later audit coverage. Not an enforcement bit in 0084.';
COMMENT ON COLUMN public.pms_permissions.active IS
  'Product-wide deactivate. Tenants cannot add custom permission keys in Phase 1.';

GRANT SELECT ON public.pms_permissions TO authenticated;
GRANT ALL ON public.pms_permissions TO service_role;
ALTER TABLE public.pms_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read pms permissions" ON public.pms_permissions;
CREATE POLICY "Authenticated read pms permissions" ON public.pms_permissions
  FOR SELECT TO authenticated USING (true);

DROP TRIGGER IF EXISTS set_pms_permissions_updated_at ON public.pms_permissions;
CREATE TRIGGER set_pms_permissions_updated_at
  BEFORE UPDATE ON public.pms_permissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Tenant hotel role master. Custom roles. Not restaurant_users.role.
CREATE TABLE IF NOT EXISTS public.pms_hotel_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  description text,
  department_id uuid,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_hotel_roles_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_hotel_roles_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_hotel_roles_code_format CHECK (
    code = upper(code) AND code ~ '^[A-Z][A-Z0-9_]{1,19}$'
  ),
  CONSTRAINT pms_hotel_roles_name_check CHECK (
    length(btrim(name)) BETWEEN 1 AND 80
  ),
  CONSTRAINT pms_hotel_roles_description_check CHECK (
    description IS NULL OR length(btrim(description)) BETWEEN 1 AND 500
  ),
  CONSTRAINT pms_hotel_roles_department_fk
    FOREIGN KEY (department_id, restaurant_id)
    REFERENCES public.pms_departments (id, restaurant_id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS pms_hotel_roles_restaurant_idx
  ON public.pms_hotel_roles(restaurant_id, active, code);
CREATE INDEX IF NOT EXISTS pms_hotel_roles_department_idx
  ON public.pms_hotel_roles(restaurant_id, department_id);

COMMENT ON TABLE public.pms_hotel_roles IS
  'Card 7 tenant hotel roles. Parallel to restaurant_users.role (STAFF_ROLES). Not a second identity table.';
COMMENT ON COLUMN public.pms_hotel_roles.department_id IS
  'Optional Card 5 department. Composite FK. No parent_department_id; hierarchy stays on pms_departments.';
COMMENT ON COLUMN public.pms_hotel_roles.active IS
  'Inactive roles remain stored. 0084 does not revoke restaurant_users.role access.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_hotel_roles TO authenticated;
GRANT ALL ON public.pms_hotel_roles TO service_role;
ALTER TABLE public.pms_hotel_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read hotel roles" ON public.pms_hotel_roles;
CREATE POLICY "Members read hotel roles" ON public.pms_hotel_roles
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert hotel roles" ON public.pms_hotel_roles;
CREATE POLICY "Managers insert hotel roles" ON public.pms_hotel_roles
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update hotel roles" ON public.pms_hotel_roles;
CREATE POLICY "Managers update hotel roles" ON public.pms_hotel_roles
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete hotel roles" ON public.pms_hotel_roles;
CREATE POLICY "Managers delete hotel roles" ON public.pms_hotel_roles
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_hotel_roles_updated_at ON public.pms_hotel_roles;
CREATE TRIGGER set_pms_hotel_roles_updated_at
  BEFORE UPDATE ON public.pms_hotel_roles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Role → permission mappings. Stored intent only. Not consulted by RLS in 0084.
CREATE TABLE IF NOT EXISTS public.pms_role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  role_id uuid NOT NULL,
  permission_id uuid NOT NULL REFERENCES public.pms_permissions(id) ON DELETE RESTRICT,
  allowed boolean NOT NULL DEFAULT true,
  data_scope text NOT NULL DEFAULT 'property',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_role_permissions_role_permission_unique UNIQUE (role_id, permission_id),
  CONSTRAINT pms_role_permissions_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_role_permissions_data_scope_check CHECK (
    data_scope IN ('property', 'department', 'own', 'assigned')
  ),
  CONSTRAINT pms_role_permissions_role_fk
    FOREIGN KEY (role_id, restaurant_id)
    REFERENCES public.pms_hotel_roles (id, restaurant_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS pms_role_permissions_restaurant_idx
  ON public.pms_role_permissions(restaurant_id, role_id);
CREATE INDEX IF NOT EXISTS pms_role_permissions_permission_idx
  ON public.pms_role_permissions(permission_id);

COMMENT ON TABLE public.pms_role_permissions IS
  'Card 7 role-permission map. Configuration only. Existing RLS must not read this table in 0084.';
COMMENT ON COLUMN public.pms_role_permissions.allowed IS
  'Grant when true. Action grain lives on pms_permissions.action, not a second access-level enum.';
COMMENT ON COLUMN public.pms_role_permissions.data_scope IS
  'Stored scope intent: property | department | own | assigned. Not enforced in 0084. No org/multi-property scope. Department uses pms_hotel_roles.department_id; own/assigned need per-domain actor FKs later.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_role_permissions TO authenticated;
GRANT ALL ON public.pms_role_permissions TO service_role;
ALTER TABLE public.pms_role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read role permissions" ON public.pms_role_permissions;
CREATE POLICY "Members read role permissions" ON public.pms_role_permissions
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert role permissions" ON public.pms_role_permissions;
CREATE POLICY "Managers insert role permissions" ON public.pms_role_permissions
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update role permissions" ON public.pms_role_permissions;
CREATE POLICY "Managers update role permissions" ON public.pms_role_permissions
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete role permissions" ON public.pms_role_permissions;
CREATE POLICY "Managers delete role permissions" ON public.pms_role_permissions
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_role_permissions_updated_at ON public.pms_role_permissions;
CREATE TRIGGER set_pms_role_permissions_updated_at
  BEFORE UPDATE ON public.pms_role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Setup-only approval rules. Not a workflow engine. No operational instances.
CREATE TABLE IF NOT EXISTS public.pms_approval_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.pms_permissions(id) ON DELETE RESTRICT,
  approver_role_id uuid NOT NULL,
  threshold_amount numeric,
  threshold_unit text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_approval_rules_permission_unique UNIQUE (restaurant_id, permission_id),
  CONSTRAINT pms_approval_rules_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_approval_rules_threshold_check CHECK (
    (
      threshold_amount IS NULL
      AND threshold_unit IS NULL
    )
    OR (
      threshold_amount IS NOT NULL
      AND threshold_amount > 0
      AND threshold_unit IN ('amount', 'percent')
    )
  ),
  CONSTRAINT pms_approval_rules_approver_fk
    FOREIGN KEY (approver_role_id, restaurant_id)
    REFERENCES public.pms_hotel_roles (id, restaurant_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS pms_approval_rules_restaurant_idx
  ON public.pms_approval_rules(restaurant_id, active);
CREATE INDEX IF NOT EXISTS pms_approval_rules_approver_idx
  ON public.pms_approval_rules(restaurant_id, approver_role_id);

COMMENT ON TABLE public.pms_approval_rules IS
  'Card 7 setup approval configuration. Not an approval inbox, request log, or workflow engine.';
COMMENT ON COLUMN public.pms_approval_rules.threshold_amount IS
  'Optional gate. Null means the permission always requires the approver role when the rule is active. Not enforced in 0084.';
COMMENT ON COLUMN public.pms_approval_rules.approver_role_id IS
  'Required hotel role. Not STAFF_ROLES. Composite tenant FK.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_approval_rules TO authenticated;
GRANT ALL ON public.pms_approval_rules TO service_role;
ALTER TABLE public.pms_approval_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read approval rules" ON public.pms_approval_rules;
CREATE POLICY "Members read approval rules" ON public.pms_approval_rules
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert approval rules" ON public.pms_approval_rules;
CREATE POLICY "Managers insert approval rules" ON public.pms_approval_rules
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update approval rules" ON public.pms_approval_rules;
CREATE POLICY "Managers update approval rules" ON public.pms_approval_rules
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete approval rules" ON public.pms_approval_rules;
CREATE POLICY "Managers delete approval rules" ON public.pms_approval_rules
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_approval_rules_updated_at ON public.pms_approval_rules;
CREATE TRIGGER set_pms_approval_rules_updated_at
  BEFORE UPDATE ON public.pms_approval_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. One hotel role per membership. Additive. Does not replace restaurant_users.role.
ALTER TABLE public.restaurant_users
  ADD COLUMN IF NOT EXISTS hotel_role_id uuid;

ALTER TABLE public.restaurant_users
  DROP CONSTRAINT IF EXISTS restaurant_users_hotel_role_fk;

ALTER TABLE public.restaurant_users
  ADD CONSTRAINT restaurant_users_hotel_role_fk
    FOREIGN KEY (hotel_role_id, restaurant_id)
    REFERENCES public.pms_hotel_roles (id, restaurant_id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS restaurant_users_hotel_role_idx
  ON public.restaurant_users(restaurant_id, hotel_role_id);

COMMENT ON COLUMN public.restaurant_users.hotel_role_id IS
  'Optional Card 7 hotel role. One per membership. Not a junction. Live authz remains restaurant_users.role (STAFF_ROLES) until a separately approved resolver phase.';
