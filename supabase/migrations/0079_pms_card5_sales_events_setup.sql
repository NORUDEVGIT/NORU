-- PMS Property Setup Card 5 — Sales & Events setup schema (Phase 3).
--
-- Sequential after 0078. Dual-lane: byte-identical copies live in
--   supabase/migrations/0079_pms_card5_sales_events_setup.sql
--   drizzle/migrations/0079_pms_card5_sales_events_setup.sql
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY AFTER MERGE — wait for PM approval of this SQL before apply.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f drizzle/migrations/0079_pms_card5_sales_events_setup.sql
--   or the project's usual drizzle / Supabase migration apply path.
--   Do not run both copies against the same database.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.pms_event_package_template_services;
--   DROP TABLE IF EXISTS public.pms_event_package_template_outlets;
--   DROP TABLE IF EXISTS public.pms_event_package_templates;
--   DROP TABLE IF EXISTS public.pms_event_contract_defaults;
--   DROP TABLE IF EXISTS public.pms_function_space_outlets;
--   DROP TABLE IF EXISTS public.pms_sales_pipeline_stages;
--   DROP TABLE IF EXISTS public.pms_event_statuses;
--   DROP TABLE IF EXISTS public.pms_lead_types;
--
-- Scope fence — this migration explicitly does NOT touch:
--   pms_market_segments, pms_source_codes, pms_event_types, pms_function_space_labels
--     (reuse; no second masters; no SET1 #sales-events behavior change)
--   pms_sales_channel_labels, pms_account_type_labels
--   pms_packages, pms_corporate_agreements, pms_contract_rates
--   pms_outlets row ownership (junctions only)
--   fo_service_catalogue ownership (junction only; unique key already from 0072)
--   live leads, opportunities, event bookings, contract instances, pipeline records
--   Card 2, Guest Profile payment_terms, restaurants.pms_property_setup_status
--   no new audit table — reuse public.restaurant_staff_audit_log (SET6 pms_set6_*)
--
-- Additive only. No seed. No backfill. No types.ts regen. No privileged functions.

-- 1. Function-space label → Card 5 facility applicability. Labels stay labels.
CREATE TABLE IF NOT EXISTS public.pms_function_space_outlets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  function_space_label_id uuid NOT NULL,
  outlet_id uuid NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_function_space_outlets_mapping_unique
    UNIQUE (restaurant_id, function_space_label_id, outlet_id),
  CONSTRAINT pms_function_space_outlets_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_function_space_outlets_label_fk
    FOREIGN KEY (function_space_label_id, restaurant_id)
    REFERENCES public.pms_function_space_labels (id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT pms_function_space_outlets_outlet_fk
    FOREIGN KEY (outlet_id, restaurant_id)
    REFERENCES public.pms_outlets (id, restaurant_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS pms_function_space_outlets_restaurant_idx
  ON public.pms_function_space_outlets(restaurant_id, function_space_label_id);

COMMENT ON TABLE public.pms_function_space_outlets IS
  'Card 5 setup map: SET6 function-space label → pms_outlets venue. Not a second facility master. Not a live booking.';

-- 2. Lead types catalogue. No live leads.
CREATE TABLE IF NOT EXISTS public.pms_lead_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_lead_types_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_lead_types_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_lead_types_code_check CHECK (length(btrim(code)) BETWEEN 1 AND 20),
  CONSTRAINT pms_lead_types_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT pms_lead_types_description_check CHECK (
    description IS NULL OR length(btrim(description)) BETWEEN 1 AND 500
  )
);

CREATE INDEX IF NOT EXISTS pms_lead_types_restaurant_idx
  ON public.pms_lead_types(restaurant_id, code);

COMMENT ON TABLE public.pms_lead_types IS
  'Card 5 / SET6-shaped lead-type catalogue. Setup only. Not a live lead or opportunity.';

-- 3. Event statuses catalogue. No live event-state records.
CREATE TABLE IF NOT EXISTS public.pms_event_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_event_statuses_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_event_statuses_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_event_statuses_code_check CHECK (length(btrim(code)) BETWEEN 1 AND 20),
  CONSTRAINT pms_event_statuses_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT pms_event_statuses_description_check CHECK (
    description IS NULL OR length(btrim(description)) BETWEEN 1 AND 500
  )
);

CREATE INDEX IF NOT EXISTS pms_event_statuses_restaurant_idx
  ON public.pms_event_statuses(restaurant_id, sort_order, code);

COMMENT ON TABLE public.pms_event_statuses IS
  'Card 5 event-status catalogue with display order. Setup only. Not live event execution.';

-- 4. Sales pipeline stages. Configuration only.
CREATE TABLE IF NOT EXISTS public.pms_sales_pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_terminal boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_sales_pipeline_stages_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_sales_pipeline_stages_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_sales_pipeline_stages_code_check CHECK (length(btrim(code)) BETWEEN 1 AND 20),
  CONSTRAINT pms_sales_pipeline_stages_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 80)
);

CREATE INDEX IF NOT EXISTS pms_sales_pipeline_stages_restaurant_idx
  ON public.pms_sales_pipeline_stages(restaurant_id, sort_order, code);

COMMENT ON TABLE public.pms_sales_pipeline_stages IS
  'Card 5 sales-pipeline stage catalogue. Setup only. Not opportunities, leads, or pipeline transactions.';
COMMENT ON COLUMN public.pms_sales_pipeline_stages.is_terminal IS
  'Setup flag for a closing stage. Does not record a win/loss.';

-- 5. Event package templates. Not Card 3 pms_packages.
CREATE TABLE IF NOT EXISTS public.pms_event_package_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  event_type_id uuid,
  pricing_method text NOT NULL DEFAULT 'per_event',
  default_price numeric(12, 2),
  currency_code text,
  tax_group_id uuid,
  valid_from date,
  valid_to date,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_event_package_templates_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_event_package_templates_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_event_package_templates_code_check CHECK (length(btrim(code)) BETWEEN 1 AND 20),
  CONSTRAINT pms_event_package_templates_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT pms_event_package_templates_pricing_check CHECK (
    pricing_method IN ('per_person', 'per_event', 'hourly', 'custom')
  ),
  CONSTRAINT pms_event_package_templates_price_check CHECK (
    default_price IS NULL OR default_price >= 0
  ),
  CONSTRAINT pms_event_package_templates_currency_check CHECK (
    currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$'
  ),
  CONSTRAINT pms_event_package_templates_validity_check CHECK (
    valid_from IS NULL OR valid_to IS NULL OR valid_from <= valid_to
  ),
  CONSTRAINT pms_event_package_templates_event_type_fk
    FOREIGN KEY (event_type_id, restaurant_id)
    REFERENCES public.pms_event_types (id, restaurant_id)
    ON DELETE SET NULL,
  CONSTRAINT pms_event_package_templates_tax_group_fk
    FOREIGN KEY (tax_group_id, restaurant_id)
    REFERENCES public.pms_tax_groups (id, restaurant_id)
    ON DELETE SET NULL,
  CONSTRAINT pms_event_package_templates_currency_fk
    FOREIGN KEY (restaurant_id, currency_code)
    REFERENCES public.pms_property_currencies (restaurant_id, code)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS pms_event_package_templates_restaurant_idx
  ON public.pms_event_package_templates(restaurant_id, event_type_id);

COMMENT ON TABLE public.pms_event_package_templates IS
  'Card 5 event package templates. Setup only. Not pms_packages stay packages and not consumed bookings.';
COMMENT ON COLUMN public.pms_event_package_templates.event_type_id IS
  'Optional SET6 pms_event_types reference. Composite FK with restaurant_id.';
COMMENT ON COLUMN public.pms_event_package_templates.tax_group_id IS
  'Optional Card 3 pms_tax_groups reference.';
COMMENT ON COLUMN public.pms_event_package_templates.currency_code IS
  'Optional Card 3 pms_property_currencies code. Not a new currency master.';

CREATE TABLE IF NOT EXISTS public.pms_event_package_template_outlets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  template_id uuid NOT NULL,
  outlet_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_event_package_template_outlets_mapping_unique
    UNIQUE (restaurant_id, template_id, outlet_id),
  CONSTRAINT pms_event_package_template_outlets_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_event_package_template_outlets_template_fk
    FOREIGN KEY (template_id, restaurant_id)
    REFERENCES public.pms_event_package_templates (id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT pms_event_package_template_outlets_outlet_fk
    FOREIGN KEY (outlet_id, restaurant_id)
    REFERENCES public.pms_outlets (id, restaurant_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS pms_event_package_template_outlets_idx
  ON public.pms_event_package_template_outlets(restaurant_id, template_id);

COMMENT ON TABLE public.pms_event_package_template_outlets IS
  'Included Card 5 facilities for an event package template. Not a live booking.';

CREATE TABLE IF NOT EXISTS public.pms_event_package_template_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  template_id uuid NOT NULL,
  fo_service_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_event_package_template_services_mapping_unique
    UNIQUE (restaurant_id, template_id, fo_service_id),
  CONSTRAINT pms_event_package_template_services_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_event_package_template_services_template_fk
    FOREIGN KEY (template_id, restaurant_id)
    REFERENCES public.pms_event_package_templates (id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT pms_event_package_template_services_service_fk
    FOREIGN KEY (fo_service_id, restaurant_id)
    REFERENCES public.fo_service_catalogue (id, restaurant_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS pms_event_package_template_services_idx
  ON public.pms_event_package_template_services(restaurant_id, template_id);

COMMENT ON TABLE public.pms_event_package_template_services IS
  'Included FO services for an event package template. Reuses fo_service_catalogue. Not a second service master.';

-- 6. Contract defaults. Not actual contracts and not Card 3 corporate agreements.
CREATE TABLE IF NOT EXISTS public.pms_event_contract_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  contract_type text NOT NULL,
  deposit_policy_id uuid,
  payment_terms text,
  cancellation_policy text,
  approval_required boolean NOT NULL DEFAULT false,
  default_validity_days integer,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_event_contract_defaults_type_unique UNIQUE (restaurant_id, contract_type),
  CONSTRAINT pms_event_contract_defaults_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_event_contract_defaults_type_check CHECK (
    length(btrim(contract_type)) BETWEEN 1 AND 40
  ),
  CONSTRAINT pms_event_contract_defaults_payment_terms_check CHECK (
    payment_terms IS NULL OR length(btrim(payment_terms)) BETWEEN 1 AND 80
  ),
  CONSTRAINT pms_event_contract_defaults_cancellation_check CHECK (
    cancellation_policy IS NULL OR length(btrim(cancellation_policy)) BETWEEN 1 AND 2000
  ),
  CONSTRAINT pms_event_contract_defaults_validity_check CHECK (
    default_validity_days IS NULL OR default_validity_days >= 1
  ),
  CONSTRAINT pms_event_contract_defaults_deposit_fk
    FOREIGN KEY (deposit_policy_id, restaurant_id)
    REFERENCES public.pms_deposit_policies (id, restaurant_id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS pms_event_contract_defaults_restaurant_idx
  ON public.pms_event_contract_defaults(restaurant_id, contract_type);

COMMENT ON TABLE public.pms_event_contract_defaults IS
  'Card 5 event contract defaults. Setup only. Not live contracts, not pms_corporate_agreements, not AR.';
COMMENT ON COLUMN public.pms_event_contract_defaults.deposit_policy_id IS
  'Optional Card 3 pms_deposit_policies reference. Composite FK with restaurant_id.';
COMMENT ON COLUMN public.pms_event_contract_defaults.payment_terms IS
  'Setup text only. Not a payment-terms master and not guest_account_masters.payment_terms.';

-- RLS: member SELECT; owner/manager write; USING + WITH CHECK. Same SET6 / Card 5 pattern.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.pms_function_space_outlets,
  public.pms_lead_types,
  public.pms_event_statuses,
  public.pms_sales_pipeline_stages,
  public.pms_event_package_templates,
  public.pms_event_package_template_outlets,
  public.pms_event_package_template_services,
  public.pms_event_contract_defaults
  TO authenticated;
GRANT ALL ON
  public.pms_function_space_outlets,
  public.pms_lead_types,
  public.pms_event_statuses,
  public.pms_sales_pipeline_stages,
  public.pms_event_package_templates,
  public.pms_event_package_template_outlets,
  public.pms_event_package_template_services,
  public.pms_event_contract_defaults
  TO service_role;

ALTER TABLE public.pms_function_space_outlets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pms_lead_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pms_event_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pms_sales_pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pms_event_package_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pms_event_package_template_outlets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pms_event_package_template_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pms_event_contract_defaults ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read function space outlets" ON public.pms_function_space_outlets;
CREATE POLICY "Members read function space outlets" ON public.pms_function_space_outlets
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert function space outlets" ON public.pms_function_space_outlets;
CREATE POLICY "Managers insert function space outlets" ON public.pms_function_space_outlets
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update function space outlets" ON public.pms_function_space_outlets;
CREATE POLICY "Managers update function space outlets" ON public.pms_function_space_outlets
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete function space outlets" ON public.pms_function_space_outlets;
CREATE POLICY "Managers delete function space outlets" ON public.pms_function_space_outlets
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP POLICY IF EXISTS "Members read lead types" ON public.pms_lead_types;
CREATE POLICY "Members read lead types" ON public.pms_lead_types
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert lead types" ON public.pms_lead_types;
CREATE POLICY "Managers insert lead types" ON public.pms_lead_types
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update lead types" ON public.pms_lead_types;
CREATE POLICY "Managers update lead types" ON public.pms_lead_types
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete lead types" ON public.pms_lead_types;
CREATE POLICY "Managers delete lead types" ON public.pms_lead_types
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP POLICY IF EXISTS "Members read event statuses" ON public.pms_event_statuses;
CREATE POLICY "Members read event statuses" ON public.pms_event_statuses
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert event statuses" ON public.pms_event_statuses;
CREATE POLICY "Managers insert event statuses" ON public.pms_event_statuses
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update event statuses" ON public.pms_event_statuses;
CREATE POLICY "Managers update event statuses" ON public.pms_event_statuses
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete event statuses" ON public.pms_event_statuses;
CREATE POLICY "Managers delete event statuses" ON public.pms_event_statuses
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP POLICY IF EXISTS "Members read pipeline stages" ON public.pms_sales_pipeline_stages;
CREATE POLICY "Members read pipeline stages" ON public.pms_sales_pipeline_stages
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert pipeline stages" ON public.pms_sales_pipeline_stages;
CREATE POLICY "Managers insert pipeline stages" ON public.pms_sales_pipeline_stages
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update pipeline stages" ON public.pms_sales_pipeline_stages;
CREATE POLICY "Managers update pipeline stages" ON public.pms_sales_pipeline_stages
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete pipeline stages" ON public.pms_sales_pipeline_stages;
CREATE POLICY "Managers delete pipeline stages" ON public.pms_sales_pipeline_stages
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP POLICY IF EXISTS "Members read event package templates" ON public.pms_event_package_templates;
CREATE POLICY "Members read event package templates" ON public.pms_event_package_templates
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert event package templates" ON public.pms_event_package_templates;
CREATE POLICY "Managers insert event package templates" ON public.pms_event_package_templates
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update event package templates" ON public.pms_event_package_templates;
CREATE POLICY "Managers update event package templates" ON public.pms_event_package_templates
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete event package templates" ON public.pms_event_package_templates;
CREATE POLICY "Managers delete event package templates" ON public.pms_event_package_templates
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP POLICY IF EXISTS "Members read event package template outlets" ON public.pms_event_package_template_outlets;
CREATE POLICY "Members read event package template outlets" ON public.pms_event_package_template_outlets
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert event package template outlets" ON public.pms_event_package_template_outlets;
CREATE POLICY "Managers insert event package template outlets" ON public.pms_event_package_template_outlets
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update event package template outlets" ON public.pms_event_package_template_outlets;
CREATE POLICY "Managers update event package template outlets" ON public.pms_event_package_template_outlets
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete event package template outlets" ON public.pms_event_package_template_outlets;
CREATE POLICY "Managers delete event package template outlets" ON public.pms_event_package_template_outlets
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP POLICY IF EXISTS "Members read event package template services" ON public.pms_event_package_template_services;
CREATE POLICY "Members read event package template services" ON public.pms_event_package_template_services
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert event package template services" ON public.pms_event_package_template_services;
CREATE POLICY "Managers insert event package template services" ON public.pms_event_package_template_services
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update event package template services" ON public.pms_event_package_template_services;
CREATE POLICY "Managers update event package template services" ON public.pms_event_package_template_services
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete event package template services" ON public.pms_event_package_template_services;
CREATE POLICY "Managers delete event package template services" ON public.pms_event_package_template_services
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP POLICY IF EXISTS "Members read event contract defaults" ON public.pms_event_contract_defaults;
CREATE POLICY "Members read event contract defaults" ON public.pms_event_contract_defaults
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert event contract defaults" ON public.pms_event_contract_defaults;
CREATE POLICY "Managers insert event contract defaults" ON public.pms_event_contract_defaults
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update event contract defaults" ON public.pms_event_contract_defaults;
CREATE POLICY "Managers update event contract defaults" ON public.pms_event_contract_defaults
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete event contract defaults" ON public.pms_event_contract_defaults;
CREATE POLICY "Managers delete event contract defaults" ON public.pms_event_contract_defaults
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_function_space_outlets_updated_at ON public.pms_function_space_outlets;
CREATE TRIGGER set_pms_function_space_outlets_updated_at
  BEFORE UPDATE ON public.pms_function_space_outlets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_pms_lead_types_updated_at ON public.pms_lead_types;
CREATE TRIGGER set_pms_lead_types_updated_at
  BEFORE UPDATE ON public.pms_lead_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_pms_event_statuses_updated_at ON public.pms_event_statuses;
CREATE TRIGGER set_pms_event_statuses_updated_at
  BEFORE UPDATE ON public.pms_event_statuses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_pms_sales_pipeline_stages_updated_at ON public.pms_sales_pipeline_stages;
CREATE TRIGGER set_pms_sales_pipeline_stages_updated_at
  BEFORE UPDATE ON public.pms_sales_pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_pms_event_package_templates_updated_at ON public.pms_event_package_templates;
CREATE TRIGGER set_pms_event_package_templates_updated_at
  BEFORE UPDATE ON public.pms_event_package_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_pms_event_contract_defaults_updated_at ON public.pms_event_contract_defaults;
CREATE TRIGGER set_pms_event_contract_defaults_updated_at
  BEFORE UPDATE ON public.pms_event_contract_defaults
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
