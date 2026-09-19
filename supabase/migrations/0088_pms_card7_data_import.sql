-- PMS Property Setup Card 7 — Data Import & Migration setup schema (Phase 4).
--
-- Sequential after 0087. Dual-lane: byte-identical copies live in
--   supabase/migrations/0088_pms_card7_data_import.sql
--   drizzle/migrations/0088_pms_card7_data_import.sql
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY AFTER MERGE — wait for PM approval of this SQL before apply.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f drizzle/migrations/0088_pms_card7_data_import.sql
--   or the project's usual drizzle / Supabase migration apply path.
--   Do not run both copies against the same database.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.pms_import_job_issues;
--   DROP TABLE IF EXISTS public.pms_import_jobs;
--   DROP TABLE IF EXISTS public.pms_import_mapping_template_fields;
--   DROP TABLE IF EXISTS public.pms_import_mapping_templates;
--   DROP TABLE IF EXISTS public.pms_import_validation_rules;
--   DROP TABLE IF EXISTS public.pms_import_duplicate_policies;
--   DROP TABLE IF EXISTS public.pms_import_type_settings;
--   DROP TABLE IF EXISTS public.pms_import_policies;
--   DROP TABLE IF EXISTS public.pms_import_field_definitions;
--   DROP TABLE IF EXISTS public.pms_import_types;
--   DELETE FROM public.pms_permissions
--     WHERE code IN (
--       'configuration.import.configure',
--       'data.import_preview.view',
--       'data.import.create'
--     );
--
-- Scope fence — this migration explicitly does NOT touch:
--   guest_profiles writers / createGuest / mergeGuests / unmergeGuests
--   guest_merge_ledger / guest_profile_history
--   hotel_rooms / saveRoom / bulkCreateRooms
--   hotel_rate_plans / saveRatePlan
--   hotel_reservations / createReservation
--   folio / cashiering / pms_financial_settings
--   restaurant_users / staff_module_access / STAFF_ROLES
--   public.has_restaurant_role / public.is_restaurant_member
--   reports / audit / security-role tables
--   storage buckets / csv parsers
--   job queues / background workers
--   types.ts
--
-- Setup/governance only. No unrestricted database import.
-- handler_key is an opaque pointer to an existing domain writer. Not SQL.
-- Duplicate policy may warn, skip or block. It must not merge.
-- pms_import_jobs records history. It is not a runner or queue.
-- No types.ts regen. No privileged functions. No parser. No worker.

-- 0. Catalogue keys for configure / preview-intent / create-intent. Not live authz.
INSERT INTO public.pms_permissions (
  code, module, function, action, name, description, sensitive, active
)
VALUES
  (
    'configuration.import.configure',
    'configuration',
    'import',
    'configure',
    'Configure data import',
    'Save Card 7 import types, mapping templates, validation and duplicate policy.',
    false,
    true
  ),
  (
    'data.import_preview.view',
    'data',
    'import_preview',
    'view',
    'View import preview',
    'Preview/intend to dry-run an import when an import engine exists.',
    false,
    true
  ),
  (
    'data.import.create',
    'data',
    'import',
    'create',
    'Create data import',
    'Initiate a controlled data import when an import runner exists.',
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
  active = EXCLUDED.active;

-- 1. Global import types. Supported handlers only.
CREATE TABLE IF NOT EXISTS public.pms_import_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  description text,
  handler_key text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_import_types_code_unique UNIQUE (code),
  CONSTRAINT pms_import_types_code_format CHECK (
    code ~ '^[a-z][a-z0-9_]{0,39}$'
  ),
  CONSTRAINT pms_import_types_name_check CHECK (
    length(btrim(name)) BETWEEN 1 AND 80
  ),
  CONSTRAINT pms_import_types_description_check CHECK (
    description IS NULL OR length(btrim(description)) BETWEEN 1 AND 500
  ),
  CONSTRAINT pms_import_types_handler_key_check CHECK (
    handler_key IN (
      'createGuest',
      'saveRoom',
      'saveRoomType',
      'saveRateCategory',
      'saveRatePlan'
    )
  )
);

COMMENT ON TABLE public.pms_import_types IS
  'Card 7 global import-type catalogue. handler_key names an existing domain writer. Not a generic table importer.';
COMMENT ON COLUMN public.pms_import_types.handler_key IS
  'Opaque pointer to createGuest, saveRoom, saveRoomType, saveRateCategory or saveRatePlan. Do not store SQL here.';

GRANT SELECT ON public.pms_import_types TO authenticated;
GRANT ALL ON public.pms_import_types TO service_role;
ALTER TABLE public.pms_import_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read import types" ON public.pms_import_types;
CREATE POLICY "Authenticated read import types" ON public.pms_import_types
  FOR SELECT TO authenticated USING (true);

DROP TRIGGER IF EXISTS set_pms_import_types_updated_at ON public.pms_import_types;
CREATE TRIGGER set_pms_import_types_updated_at
  BEFORE UPDATE ON public.pms_import_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.pms_import_types (code, name, description, handler_key, active)
VALUES
  ('guest', 'Guests', 'Guest profiles via createGuest. Duplicate warn/skip/block only. No merge.', 'createGuest', true),
  ('room', 'Rooms', 'Rooms via saveRoom. Not bulkCreateRooms sequential numbering.', 'saveRoom', true),
  ('room_type', 'Room types', 'Room types via saveRoomType.', 'saveRoomType', true),
  ('rate_category', 'Rate categories', 'Rate categories via saveRateCategory.', 'saveRateCategory', true),
  ('rate_plan', 'Rate plans', 'Rate plan catalogue via saveRatePlan. Calendar and overrides are out.', 'saveRatePlan', true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  handler_key = EXCLUDED.handler_key,
  active = EXCLUDED.active;

-- 2. Global target field catalogue.
CREATE TABLE IF NOT EXISTS public.pms_import_field_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_type_id uuid NOT NULL REFERENCES public.pms_import_types(id) ON DELETE RESTRICT,
  code text NOT NULL,
  name text NOT NULL,
  required boolean NOT NULL DEFAULT false,
  value_kind text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_import_field_definitions_unique UNIQUE (import_type_id, code),
  CONSTRAINT pms_import_field_definitions_code_format CHECK (
    code ~ '^[a-z][a-z0-9_]{0,39}$'
  ),
  CONSTRAINT pms_import_field_definitions_name_check CHECK (
    length(btrim(name)) BETWEEN 1 AND 80
  ),
  CONSTRAINT pms_import_field_definitions_value_kind_check CHECK (
    value_kind IN ('text', 'integer', 'amount', 'boolean', 'date', 'code')
  )
);

COMMENT ON TABLE public.pms_import_field_definitions IS
  'Card 7 target fields for mapping templates. Codes match domain writer inputs. Not executable transforms.';

GRANT SELECT ON public.pms_import_field_definitions TO authenticated;
GRANT ALL ON public.pms_import_field_definitions TO service_role;
ALTER TABLE public.pms_import_field_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read import field definitions" ON public.pms_import_field_definitions;
CREATE POLICY "Authenticated read import field definitions" ON public.pms_import_field_definitions
  FOR SELECT TO authenticated USING (true);

DROP TRIGGER IF EXISTS set_pms_import_field_definitions_updated_at ON public.pms_import_field_definitions;
CREATE TRIGGER set_pms_import_field_definitions_updated_at
  BEFORE UPDATE ON public.pms_import_field_definitions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.pms_import_field_definitions (
  import_type_id, code, name, required, value_kind, active
)
SELECT t.id, v.code, v.name, v.required, v.value_kind, true
FROM (
  VALUES
    ('guest', 'first_name', 'First name', true, 'text'),
    ('guest', 'last_name', 'Last name', false, 'text'),
    ('guest', 'email', 'Email', false, 'text'),
    ('guest', 'phone', 'Phone', false, 'text'),
    ('guest', 'nationality', 'Nationality', false, 'text'),
    ('guest', 'language', 'Language', false, 'text'),
    ('guest', 'date_of_birth', 'Date of birth', false, 'date'),
    ('guest', 'city', 'City', false, 'text'),
    ('guest', 'country', 'Country', false, 'text'),
    ('guest', 'notes', 'Notes', false, 'text'),
    ('room', 'room_number', 'Room number', true, 'text'),
    ('room', 'room_code', 'Room code', false, 'text'),
    ('room', 'room_type_code', 'Room type code', true, 'code'),
    ('room', 'smoking', 'Smoking', false, 'boolean'),
    ('room', 'accessible', 'Accessible', false, 'boolean'),
    ('room', 'sellable', 'Sellable', false, 'boolean'),
    ('room', 'active', 'Active', false, 'boolean'),
    ('room', 'notes', 'Notes', false, 'text'),
    ('room_type', 'code', 'Code', true, 'code'),
    ('room_type', 'name', 'Name', true, 'text'),
    ('room_type', 'max_occupancy', 'Max occupancy', true, 'integer'),
    ('room_type', 'adult_capacity', 'Adult capacity', false, 'integer'),
    ('room_type', 'child_capacity', 'Child capacity', false, 'integer'),
    ('room_type', 'sellable', 'Sellable', false, 'boolean'),
    ('room_type', 'active', 'Active', false, 'boolean'),
    ('rate_category', 'code', 'Code', true, 'code'),
    ('rate_category', 'name', 'Name', true, 'text'),
    ('rate_category', 'description', 'Description', false, 'text'),
    ('rate_category', 'active', 'Active', false, 'boolean'),
    ('rate_plan', 'code', 'Code', true, 'code'),
    ('rate_plan', 'name', 'Name', true, 'text'),
    ('rate_plan', 'rate_category_code', 'Rate category code', true, 'code'),
    ('rate_plan', 'room_type_code', 'Room type code', true, 'code'),
    ('rate_plan', 'base_rate', 'Base rate', true, 'amount'),
    ('rate_plan', 'valid_from', 'Valid from', false, 'date'),
    ('rate_plan', 'valid_to', 'Valid to', false, 'date'),
    ('rate_plan', 'active', 'Active', false, 'boolean')
) AS v(type_code, code, name, required, value_kind)
JOIN public.pms_import_types t ON t.code = v.type_code
ON CONFLICT (import_type_id, code) DO UPDATE SET
  name = EXCLUDED.name,
  required = EXCLUDED.required,
  value_kind = EXCLUDED.value_kind,
  active = EXCLUDED.active;

-- 3. Tenant import policy.
CREATE TABLE IF NOT EXISTS public.pms_import_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  preview_required boolean NOT NULL DEFAULT true,
  max_rows integer NOT NULL DEFAULT 500,
  allowed_format text NOT NULL DEFAULT 'csv',
  owner_manager_execute_only boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_import_policies_restaurant_unique UNIQUE (restaurant_id),
  CONSTRAINT pms_import_policies_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_import_policies_max_rows_check CHECK (
    max_rows BETWEEN 1 AND 10000
  ),
  CONSTRAINT pms_import_policies_format_check CHECK (
    allowed_format = 'csv'
  )
);

COMMENT ON TABLE public.pms_import_policies IS
  'Card 7 tenant import defaults. CSV only. Not a parser, storage bucket, or Excel engine.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_import_policies TO authenticated;
GRANT ALL ON public.pms_import_policies TO service_role;
ALTER TABLE public.pms_import_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read import policies" ON public.pms_import_policies;
CREATE POLICY "Members read import policies" ON public.pms_import_policies
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert import policies" ON public.pms_import_policies;
CREATE POLICY "Managers insert import policies" ON public.pms_import_policies
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update import policies" ON public.pms_import_policies;
CREATE POLICY "Managers update import policies" ON public.pms_import_policies
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete import policies" ON public.pms_import_policies;
CREATE POLICY "Managers delete import policies" ON public.pms_import_policies
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_import_policies_updated_at ON public.pms_import_policies;
CREATE TRIGGER set_pms_import_policies_updated_at
  BEFORE UPDATE ON public.pms_import_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.pms_import_policies (restaurant_id)
SELECT r.id FROM public.restaurants r
ON CONFLICT (restaurant_id) DO NOTHING;

-- 4. Tenant enablement of global import types.
CREATE TABLE IF NOT EXISTS public.pms_import_type_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  import_type_id uuid NOT NULL REFERENCES public.pms_import_types(id) ON DELETE RESTRICT,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_import_type_settings_unique UNIQUE (restaurant_id, import_type_id),
  CONSTRAINT pms_import_type_settings_id_restaurant_unique UNIQUE (id, restaurant_id)
);

CREATE INDEX IF NOT EXISTS pms_import_type_settings_restaurant_idx
  ON public.pms_import_type_settings(restaurant_id, import_type_id);

COMMENT ON TABLE public.pms_import_type_settings IS
  'Card 7 tenant enablement of supported import types. Deferred types are not catalogued.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_import_type_settings TO authenticated;
GRANT ALL ON public.pms_import_type_settings TO service_role;
ALTER TABLE public.pms_import_type_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read import type settings" ON public.pms_import_type_settings;
CREATE POLICY "Members read import type settings" ON public.pms_import_type_settings
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert import type settings" ON public.pms_import_type_settings;
CREATE POLICY "Managers insert import type settings" ON public.pms_import_type_settings
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update import type settings" ON public.pms_import_type_settings;
CREATE POLICY "Managers update import type settings" ON public.pms_import_type_settings
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete import type settings" ON public.pms_import_type_settings;
CREATE POLICY "Managers delete import type settings" ON public.pms_import_type_settings
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_import_type_settings_updated_at ON public.pms_import_type_settings;
CREATE TRIGGER set_pms_import_type_settings_updated_at
  BEFORE UPDATE ON public.pms_import_type_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.pms_import_type_settings (restaurant_id, import_type_id, enabled)
SELECT r.id, t.id, true
FROM public.restaurants r
CROSS JOIN public.pms_import_types t
ON CONFLICT (restaurant_id, import_type_id) DO NOTHING;

-- 5. Mapping templates (source column to target field). No SQL transforms.
CREATE TABLE IF NOT EXISTS public.pms_import_mapping_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  import_type_id uuid NOT NULL REFERENCES public.pms_import_types(id) ON DELETE RESTRICT,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_import_mapping_templates_unique UNIQUE (restaurant_id, import_type_id, name),
  CONSTRAINT pms_import_mapping_templates_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_import_mapping_templates_name_check CHECK (
    length(btrim(name)) BETWEEN 1 AND 80
  )
);

CREATE INDEX IF NOT EXISTS pms_import_mapping_templates_restaurant_idx
  ON public.pms_import_mapping_templates(restaurant_id, import_type_id);

COMMENT ON TABLE public.pms_import_mapping_templates IS
  'Card 7 tenant field-mapping templates. Configuration only. Not a CSV reader.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_import_mapping_templates TO authenticated;
GRANT ALL ON public.pms_import_mapping_templates TO service_role;
ALTER TABLE public.pms_import_mapping_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read import mapping templates" ON public.pms_import_mapping_templates;
CREATE POLICY "Members read import mapping templates" ON public.pms_import_mapping_templates
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert import mapping templates" ON public.pms_import_mapping_templates;
CREATE POLICY "Managers insert import mapping templates" ON public.pms_import_mapping_templates
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update import mapping templates" ON public.pms_import_mapping_templates;
CREATE POLICY "Managers update import mapping templates" ON public.pms_import_mapping_templates
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete import mapping templates" ON public.pms_import_mapping_templates;
CREATE POLICY "Managers delete import mapping templates" ON public.pms_import_mapping_templates
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_import_mapping_templates_updated_at ON public.pms_import_mapping_templates;
CREATE TRIGGER set_pms_import_mapping_templates_updated_at
  BEFORE UPDATE ON public.pms_import_mapping_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.pms_import_mapping_template_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  template_id uuid NOT NULL,
  field_definition_id uuid NOT NULL REFERENCES public.pms_import_field_definitions(id) ON DELETE RESTRICT,
  source_column text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_import_mapping_template_fields_unique UNIQUE (template_id, field_definition_id),
  CONSTRAINT pms_import_mapping_template_fields_source_unique UNIQUE (template_id, source_column),
  CONSTRAINT pms_import_mapping_template_fields_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_import_mapping_template_fields_template_fk
    FOREIGN KEY (template_id, restaurant_id)
    REFERENCES public.pms_import_mapping_templates(id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT pms_import_mapping_template_fields_source_check CHECK (
    length(btrim(source_column)) BETWEEN 1 AND 80
  )
);

CREATE INDEX IF NOT EXISTS pms_import_mapping_template_fields_restaurant_idx
  ON public.pms_import_mapping_template_fields(restaurant_id, template_id);

COMMENT ON TABLE public.pms_import_mapping_template_fields IS
  'Source CSV column names mapped to pms_import_field_definitions. No SQL or formula payload.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_import_mapping_template_fields TO authenticated;
GRANT ALL ON public.pms_import_mapping_template_fields TO service_role;
ALTER TABLE public.pms_import_mapping_template_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read import mapping fields" ON public.pms_import_mapping_template_fields;
CREATE POLICY "Members read import mapping fields" ON public.pms_import_mapping_template_fields
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert import mapping fields" ON public.pms_import_mapping_template_fields;
CREATE POLICY "Managers insert import mapping fields" ON public.pms_import_mapping_template_fields
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update import mapping fields" ON public.pms_import_mapping_template_fields;
CREATE POLICY "Managers update import mapping fields" ON public.pms_import_mapping_template_fields
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete import mapping fields" ON public.pms_import_mapping_template_fields;
CREATE POLICY "Managers delete import mapping fields" ON public.pms_import_mapping_template_fields
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_import_mapping_template_fields_updated_at ON public.pms_import_mapping_template_fields;
CREATE TRIGGER set_pms_import_mapping_template_fields_updated_at
  BEFORE UPDATE ON public.pms_import_mapping_template_fields
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. Tenant validation flags. Not a second validator engine.
CREATE TABLE IF NOT EXISTS public.pms_import_validation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  import_type_id uuid NOT NULL REFERENCES public.pms_import_types(id) ON DELETE RESTRICT,
  field_code text NOT NULL,
  rule_kind text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_import_validation_rules_unique UNIQUE (restaurant_id, import_type_id, field_code, rule_kind),
  CONSTRAINT pms_import_validation_rules_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_import_validation_rules_field_code_format CHECK (
    field_code ~ '^[a-z][a-z0-9_]{0,39}$'
  ),
  CONSTRAINT pms_import_validation_rules_kind_check CHECK (
    rule_kind IN ('required', 'format', 'referential')
  )
);

CREATE INDEX IF NOT EXISTS pms_import_validation_rules_restaurant_idx
  ON public.pms_import_validation_rules(restaurant_id, import_type_id);

COMMENT ON TABLE public.pms_import_validation_rules IS
  'Card 7 import validation flags. Domain writers remain the real validators. Not executable expressions.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_import_validation_rules TO authenticated;
GRANT ALL ON public.pms_import_validation_rules TO service_role;
ALTER TABLE public.pms_import_validation_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read import validation rules" ON public.pms_import_validation_rules;
CREATE POLICY "Members read import validation rules" ON public.pms_import_validation_rules
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert import validation rules" ON public.pms_import_validation_rules;
CREATE POLICY "Managers insert import validation rules" ON public.pms_import_validation_rules
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update import validation rules" ON public.pms_import_validation_rules;
CREATE POLICY "Managers update import validation rules" ON public.pms_import_validation_rules
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete import validation rules" ON public.pms_import_validation_rules;
CREATE POLICY "Managers delete import validation rules" ON public.pms_import_validation_rules
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_import_validation_rules_updated_at ON public.pms_import_validation_rules;
CREATE TRIGGER set_pms_import_validation_rules_updated_at
  BEFORE UPDATE ON public.pms_import_validation_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.pms_import_validation_rules (
  restaurant_id, import_type_id, field_code, rule_kind, enabled
)
SELECT r.id, t.id, v.field_code, v.rule_kind, true
FROM public.restaurants r
CROSS JOIN (
  VALUES
    ('guest', 'first_name', 'required'),
    ('guest', 'email', 'format'),
    ('room', 'room_number', 'required'),
    ('room', 'room_type_code', 'required'),
    ('room', 'room_type_code', 'referential'),
    ('room_type', 'code', 'required'),
    ('room_type', 'name', 'required'),
    ('room_type', 'max_occupancy', 'required'),
    ('rate_category', 'code', 'required'),
    ('rate_category', 'name', 'required'),
    ('rate_plan', 'code', 'required'),
    ('rate_plan', 'name', 'required'),
    ('rate_plan', 'rate_category_code', 'required'),
    ('rate_plan', 'rate_category_code', 'referential'),
    ('rate_plan', 'room_type_code', 'required'),
    ('rate_plan', 'room_type_code', 'referential'),
    ('rate_plan', 'base_rate', 'required')
) AS v(type_code, field_code, rule_kind)
JOIN public.pms_import_types t ON t.code = v.type_code
ON CONFLICT (restaurant_id, import_type_id, field_code, rule_kind) DO NOTHING;

-- 7. Duplicate policy. warn / skip / block. Never merge.
CREATE TABLE IF NOT EXISTS public.pms_import_duplicate_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  import_type_id uuid NOT NULL REFERENCES public.pms_import_types(id) ON DELETE RESTRICT,
  match_keys text NOT NULL,
  action text NOT NULL DEFAULT 'warn',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_import_duplicate_policies_unique UNIQUE (restaurant_id, import_type_id),
  CONSTRAINT pms_import_duplicate_policies_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_import_duplicate_policies_match_keys_check CHECK (
    length(btrim(match_keys)) BETWEEN 1 AND 120
  ),
  CONSTRAINT pms_import_duplicate_policies_action_check CHECK (
    action IN ('warn', 'skip', 'block')
  )
);

CREATE INDEX IF NOT EXISTS pms_import_duplicate_policies_restaurant_idx
  ON public.pms_import_duplicate_policies(restaurant_id, import_type_id);

COMMENT ON TABLE public.pms_import_duplicate_policies IS
  'Card 7 duplicate handling. Guest match keys are email and phone. Action cannot merge. guest_merge_ledger stays in the guest module.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_import_duplicate_policies TO authenticated;
GRANT ALL ON public.pms_import_duplicate_policies TO service_role;
ALTER TABLE public.pms_import_duplicate_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read import duplicate policies" ON public.pms_import_duplicate_policies;
CREATE POLICY "Members read import duplicate policies" ON public.pms_import_duplicate_policies
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert import duplicate policies" ON public.pms_import_duplicate_policies;
CREATE POLICY "Managers insert import duplicate policies" ON public.pms_import_duplicate_policies
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update import duplicate policies" ON public.pms_import_duplicate_policies;
CREATE POLICY "Managers update import duplicate policies" ON public.pms_import_duplicate_policies
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete import duplicate policies" ON public.pms_import_duplicate_policies;
CREATE POLICY "Managers delete import duplicate policies" ON public.pms_import_duplicate_policies
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_import_duplicate_policies_updated_at ON public.pms_import_duplicate_policies;
CREATE TRIGGER set_pms_import_duplicate_policies_updated_at
  BEFORE UPDATE ON public.pms_import_duplicate_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.pms_import_duplicate_policies (
  restaurant_id, import_type_id, match_keys, action
)
SELECT r.id, t.id, v.match_keys, 'warn'
FROM public.restaurants r
CROSS JOIN (
  VALUES
    ('guest', 'email,phone'),
    ('room', 'room_number'),
    ('room_type', 'code'),
    ('rate_category', 'code'),
    ('rate_plan', 'code')
) AS v(type_code, match_keys)
JOIN public.pms_import_types t ON t.code = v.type_code
ON CONFLICT (restaurant_id, import_type_id) DO NOTHING;

-- 8. Migration history. Records only. Not a runner.
CREATE TABLE IF NOT EXISTS public.pms_import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  import_type_id uuid NOT NULL REFERENCES public.pms_import_types(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'configured',
  original_filename text,
  row_count integer,
  actor_user_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_import_jobs_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_import_jobs_status_check CHECK (
    status IN ('configured', 'previewed', 'imported', 'failed')
  ),
  CONSTRAINT pms_import_jobs_filename_check CHECK (
    original_filename IS NULL OR length(btrim(original_filename)) BETWEEN 1 AND 200
  ),
  CONSTRAINT pms_import_jobs_row_count_check CHECK (
    row_count IS NULL OR row_count BETWEEN 0 AND 10000
  ),
  CONSTRAINT pms_import_jobs_notes_check CHECK (
    notes IS NULL OR length(btrim(notes)) BETWEEN 1 AND 500
  )
);

CREATE INDEX IF NOT EXISTS pms_import_jobs_restaurant_idx
  ON public.pms_import_jobs(restaurant_id, created_at DESC);

COMMENT ON TABLE public.pms_import_jobs IS
  'Card 7 import history. Status is a record. This table does not enqueue work, parse files, or write domain rows.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_import_jobs TO authenticated;
GRANT ALL ON public.pms_import_jobs TO service_role;
ALTER TABLE public.pms_import_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read import jobs" ON public.pms_import_jobs;
CREATE POLICY "Members read import jobs" ON public.pms_import_jobs
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert import jobs" ON public.pms_import_jobs;
CREATE POLICY "Managers insert import jobs" ON public.pms_import_jobs
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update import jobs" ON public.pms_import_jobs;
CREATE POLICY "Managers update import jobs" ON public.pms_import_jobs
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete import jobs" ON public.pms_import_jobs;
CREATE POLICY "Managers delete import jobs" ON public.pms_import_jobs
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_import_jobs_updated_at ON public.pms_import_jobs;
CREATE TRIGGER set_pms_import_jobs_updated_at
  BEFORE UPDATE ON public.pms_import_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.pms_import_job_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  job_id uuid NOT NULL,
  severity text NOT NULL,
  row_number integer,
  code text NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_import_job_issues_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_import_job_issues_job_fk
    FOREIGN KEY (job_id, restaurant_id)
    REFERENCES public.pms_import_jobs(id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT pms_import_job_issues_severity_check CHECK (
    severity IN ('error', 'warning')
  ),
  CONSTRAINT pms_import_job_issues_row_number_check CHECK (
    row_number IS NULL OR row_number BETWEEN 1 AND 10000
  ),
  CONSTRAINT pms_import_job_issues_code_format CHECK (
    code ~ '^[a-z][a-z0-9_]{0,39}$'
  ),
  CONSTRAINT pms_import_job_issues_message_check CHECK (
    length(btrim(message)) BETWEEN 1 AND 500
  )
);

CREATE INDEX IF NOT EXISTS pms_import_job_issues_job_idx
  ON public.pms_import_job_issues(restaurant_id, job_id);

COMMENT ON TABLE public.pms_import_job_issues IS
  'Card 7 import error/warning history. Empty until a later domain-safe run records issues.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_import_job_issues TO authenticated;
GRANT ALL ON public.pms_import_job_issues TO service_role;
ALTER TABLE public.pms_import_job_issues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read import job issues" ON public.pms_import_job_issues;
CREATE POLICY "Members read import job issues" ON public.pms_import_job_issues
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert import job issues" ON public.pms_import_job_issues;
CREATE POLICY "Managers insert import job issues" ON public.pms_import_job_issues
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update import job issues" ON public.pms_import_job_issues;
CREATE POLICY "Managers update import job issues" ON public.pms_import_job_issues
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete import job issues" ON public.pms_import_job_issues;
CREATE POLICY "Managers delete import job issues" ON public.pms_import_job_issues
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_import_job_issues_updated_at ON public.pms_import_job_issues;
CREATE TRIGGER set_pms_import_job_issues_updated_at
  BEFORE UPDATE ON public.pms_import_job_issues
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
