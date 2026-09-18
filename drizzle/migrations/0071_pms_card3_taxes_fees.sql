-- PMS Property Setup Card 3 — Taxes & Fees schema (Phase 2).
--
-- Sequential after 0070. Dual-lane: byte-identical copies live in
--   supabase/migrations/0071_pms_card3_taxes_fees.sql
--   drizzle/migrations/0071_pms_card3_taxes_fees.sql
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY AFTER MERGE — wait for PM approval of this SQL before apply.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f drizzle/migrations/0071_pms_card3_taxes_fees.sql
--   or the project's usual drizzle / Supabase migration apply path.
--   Do not run both copies against the same database.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.pms_tax_group_taxes;
--   DROP TABLE IF EXISTS public.pms_tax_exemption_rules;
--   DROP TABLE IF EXISTS public.pms_fees;
--   DROP TABLE IF EXISTS public.pms_service_charges;
--   DROP TABLE IF EXISTS public.pms_tax_groups;
--   DROP TABLE IF EXISTS public.pms_taxes;
--
-- SET1 / RM remain the live single till rate:
--   restaurants.tax_rate, tax_inclusive, tax_name
--   restaurants.service_enabled, service_rate
-- This migration does not ALTER restaurants, POS snapshots, folio rows,
-- Card 1 VAT identity, Card 1, or Card 2. No seed. No backfill.
--
-- Audit History:
--   Reuse public.restaurant_staff_audit_log (SET1 / Card 3 currency writeAudit).
--   No pms_tax_activity table. No pms_tax_exemptions operational table.
--   pms_tax_exemption_rules is setup/configuration only. Applied
--   reservation/folio exemptions belong to later operational modules.
--
-- No types.ts regen. No tax engine on reservations. No Rates & Pricing.

-- 1. Tax catalogue (setup master). Not restaurants.tax_*.
CREATE TABLE IF NOT EXISTS public.pms_taxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  charge_type text NOT NULL DEFAULT 'percentage',
  amount numeric NOT NULL,
  basis text NOT NULL DEFAULT 'all',
  calculation text NOT NULL DEFAULT 'exclusive',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_taxes_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_taxes_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_taxes_code_check CHECK (code ~ '^[A-Z0-9_]{1,20}$'),
  CONSTRAINT pms_taxes_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT pms_taxes_charge_type_check CHECK (charge_type IN ('percentage', 'fixed')),
  CONSTRAINT pms_taxes_amount_positive CHECK (amount > 0),
  CONSTRAINT pms_taxes_percentage_amount_check CHECK (
    charge_type <> 'percentage' OR amount <= 100
  ),
  CONSTRAINT pms_taxes_basis_check CHECK (basis IN ('room', 'folio', 'fnb', 'all')),
  CONSTRAINT pms_taxes_calculation_check CHECK (calculation IN ('inclusive', 'exclusive'))
);

CREATE INDEX IF NOT EXISTS pms_taxes_restaurant_idx
  ON public.pms_taxes(restaurant_id, code);

COMMENT ON TABLE public.pms_taxes IS
  'Card 3 tax catalogue. Setup master only. Does not replace restaurants.tax_rate (SET1/RM till).';
COMMENT ON COLUMN public.pms_taxes.charge_type IS
  'percentage | fixed. amount is percent 0–100 exclusive of 0, or a positive fixed amount.';
COMMENT ON COLUMN public.pms_taxes.amount IS
  'Rate or amount. Percentage values must be > 0 and <= 100. Fixed values must be > 0.';
COMMENT ON COLUMN public.pms_taxes.calculation IS
  'inclusive | exclusive. Application-side posting later; not a folio snapshot.';
COMMENT ON COLUMN public.pms_taxes.basis IS
  'room | folio | fnb | all. Applicability for later posting; not stored on folio rows here.';

-- 2. Tax groups (setup master).
CREATE TABLE IF NOT EXISTS public.pms_tax_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_tax_groups_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_tax_groups_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_tax_groups_code_check CHECK (code ~ '^[A-Z0-9_]{1,20}$'),
  CONSTRAINT pms_tax_groups_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 80)
);

CREATE INDEX IF NOT EXISTS pms_tax_groups_restaurant_idx
  ON public.pms_tax_groups(restaurant_id, code);

COMMENT ON TABLE public.pms_tax_groups IS
  'Card 3 named tax groups. Membership lives on pms_tax_group_taxes.';

-- 3. Tenant-safe group ↔ tax mapping.
CREATE TABLE IF NOT EXISTS public.pms_tax_group_taxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  tax_group_id uuid NOT NULL,
  tax_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_tax_group_taxes_mapping_unique UNIQUE (tax_group_id, tax_id),
  CONSTRAINT pms_tax_group_taxes_group_fk
    FOREIGN KEY (tax_group_id, restaurant_id)
    REFERENCES public.pms_tax_groups (id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT pms_tax_group_taxes_tax_fk
    FOREIGN KEY (tax_id, restaurant_id)
    REFERENCES public.pms_taxes (id, restaurant_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS pms_tax_group_taxes_restaurant_idx
  ON public.pms_tax_group_taxes(restaurant_id, tax_group_id);

COMMENT ON TABLE public.pms_tax_group_taxes IS
  'Maps a tax group to a tax in the same restaurant. Composite FKs prevent cross-tenant joins.';

-- 4. Service charges (setup master). Not restaurants.service_*.
CREATE TABLE IF NOT EXISTS public.pms_service_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  charge_type text NOT NULL DEFAULT 'percentage',
  amount numeric NOT NULL,
  basis text NOT NULL DEFAULT 'all',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_service_charges_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_service_charges_code_check CHECK (code ~ '^[A-Z0-9_]{1,20}$'),
  CONSTRAINT pms_service_charges_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT pms_service_charges_charge_type_check CHECK (charge_type IN ('percentage', 'fixed')),
  CONSTRAINT pms_service_charges_amount_positive CHECK (amount > 0),
  CONSTRAINT pms_service_charges_percentage_amount_check CHECK (
    charge_type <> 'percentage' OR amount <= 100
  ),
  CONSTRAINT pms_service_charges_basis_check CHECK (basis IN ('room', 'folio', 'fnb', 'all'))
);

CREATE INDEX IF NOT EXISTS pms_service_charges_restaurant_idx
  ON public.pms_service_charges(restaurant_id, code);

COMMENT ON TABLE public.pms_service_charges IS
  'Card 3 service-charge catalogue. Does not replace restaurants.service_rate (SET1/RM till).';
COMMENT ON COLUMN public.pms_service_charges.amount IS
  'Rate or amount. Percentage values must be > 0 and <= 100. Fixed values must be > 0.';

-- 5. Additional fees (setup master). Not FO cancel/no-show columns.
CREATE TABLE IF NOT EXISTS public.pms_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  charge_type text NOT NULL DEFAULT 'fixed',
  amount numeric NOT NULL,
  basis text NOT NULL DEFAULT 'stay',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_fees_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_fees_code_check CHECK (code ~ '^[A-Z0-9_]{1,20}$'),
  CONSTRAINT pms_fees_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT pms_fees_charge_type_check CHECK (charge_type IN ('percentage', 'fixed')),
  CONSTRAINT pms_fees_amount_positive CHECK (amount > 0),
  CONSTRAINT pms_fees_percentage_amount_check CHECK (
    charge_type <> 'percentage' OR amount <= 100
  ),
  CONSTRAINT pms_fees_basis_check CHECK (
    basis IN ('room', 'folio', 'stay', 'person', 'night')
  )
);

CREATE INDEX IF NOT EXISTS pms_fees_restaurant_idx
  ON public.pms_fees(restaurant_id, code);

COMMENT ON TABLE public.pms_fees IS
  'Card 3 additional-charge catalogue (resort fee, levy). Not FO cancel/no-show or deposit policy.';
COMMENT ON COLUMN public.pms_fees.basis IS
  'room | folio | stay | person | night. Applicability for later posting; not a folio snapshot.';

-- 6. Exemption rules (setup/configuration only).
CREATE TABLE IF NOT EXISTS public.pms_tax_exemption_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  reason_category text NOT NULL DEFAULT 'other',
  documentation_required boolean NOT NULL DEFAULT false,
  approval_required boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_tax_exemption_rules_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_tax_exemption_rules_code_check CHECK (code ~ '^[A-Z0-9_]{1,20}$'),
  CONSTRAINT pms_tax_exemption_rules_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT pms_tax_exemption_rules_description_check CHECK (
    description IS NULL OR length(btrim(description)) BETWEEN 1 AND 500
  ),
  CONSTRAINT pms_tax_exemption_rules_reason_check CHECK (
    reason_category IN ('diplomatic', 'government', 'nonprofit', 'other')
  )
);

CREATE INDEX IF NOT EXISTS pms_tax_exemption_rules_restaurant_idx
  ON public.pms_tax_exemption_rules(restaurant_id, code);

COMMENT ON TABLE public.pms_tax_exemption_rules IS
  'Card 3 exemption configuration. Not an applied reservation/folio exemption. No pms_tax_exemptions table.';
COMMENT ON COLUMN public.pms_tax_exemption_rules.documentation_required IS
  'When true, later operational modules should require supporting documents. Not stored on folios here.';
COMMENT ON COLUMN public.pms_tax_exemption_rules.approval_required IS
  'When true, later operational modules should require approval. Not an applied exemption row.';

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.pms_taxes,
  public.pms_tax_groups,
  public.pms_tax_group_taxes,
  public.pms_service_charges,
  public.pms_fees,
  public.pms_tax_exemption_rules
  TO authenticated;
GRANT ALL ON
  public.pms_taxes,
  public.pms_tax_groups,
  public.pms_tax_group_taxes,
  public.pms_service_charges,
  public.pms_fees,
  public.pms_tax_exemption_rules
  TO service_role;

ALTER TABLE public.pms_taxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pms_tax_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pms_tax_group_taxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pms_service_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pms_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pms_tax_exemption_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read pms taxes" ON public.pms_taxes;
CREATE POLICY "Members read pms taxes" ON public.pms_taxes
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert pms taxes" ON public.pms_taxes;
CREATE POLICY "Managers insert pms taxes" ON public.pms_taxes
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update pms taxes" ON public.pms_taxes;
CREATE POLICY "Managers update pms taxes" ON public.pms_taxes
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete pms taxes" ON public.pms_taxes;
CREATE POLICY "Managers delete pms taxes" ON public.pms_taxes
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP POLICY IF EXISTS "Members read pms tax groups" ON public.pms_tax_groups;
CREATE POLICY "Members read pms tax groups" ON public.pms_tax_groups
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert pms tax groups" ON public.pms_tax_groups;
CREATE POLICY "Managers insert pms tax groups" ON public.pms_tax_groups
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update pms tax groups" ON public.pms_tax_groups;
CREATE POLICY "Managers update pms tax groups" ON public.pms_tax_groups
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete pms tax groups" ON public.pms_tax_groups;
CREATE POLICY "Managers delete pms tax groups" ON public.pms_tax_groups
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP POLICY IF EXISTS "Members read pms tax group taxes" ON public.pms_tax_group_taxes;
CREATE POLICY "Members read pms tax group taxes" ON public.pms_tax_group_taxes
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert pms tax group taxes" ON public.pms_tax_group_taxes;
CREATE POLICY "Managers insert pms tax group taxes" ON public.pms_tax_group_taxes
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update pms tax group taxes" ON public.pms_tax_group_taxes;
CREATE POLICY "Managers update pms tax group taxes" ON public.pms_tax_group_taxes
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete pms tax group taxes" ON public.pms_tax_group_taxes;
CREATE POLICY "Managers delete pms tax group taxes" ON public.pms_tax_group_taxes
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP POLICY IF EXISTS "Members read pms service charges" ON public.pms_service_charges;
CREATE POLICY "Members read pms service charges" ON public.pms_service_charges
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert pms service charges" ON public.pms_service_charges;
CREATE POLICY "Managers insert pms service charges" ON public.pms_service_charges
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update pms service charges" ON public.pms_service_charges;
CREATE POLICY "Managers update pms service charges" ON public.pms_service_charges
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete pms service charges" ON public.pms_service_charges;
CREATE POLICY "Managers delete pms service charges" ON public.pms_service_charges
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP POLICY IF EXISTS "Members read pms fees" ON public.pms_fees;
CREATE POLICY "Members read pms fees" ON public.pms_fees
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert pms fees" ON public.pms_fees;
CREATE POLICY "Managers insert pms fees" ON public.pms_fees
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update pms fees" ON public.pms_fees;
CREATE POLICY "Managers update pms fees" ON public.pms_fees
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete pms fees" ON public.pms_fees;
CREATE POLICY "Managers delete pms fees" ON public.pms_fees
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP POLICY IF EXISTS "Members read pms tax exemption rules" ON public.pms_tax_exemption_rules;
CREATE POLICY "Members read pms tax exemption rules" ON public.pms_tax_exemption_rules
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert pms tax exemption rules" ON public.pms_tax_exemption_rules;
CREATE POLICY "Managers insert pms tax exemption rules" ON public.pms_tax_exemption_rules
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update pms tax exemption rules" ON public.pms_tax_exemption_rules;
CREATE POLICY "Managers update pms tax exemption rules" ON public.pms_tax_exemption_rules
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete pms tax exemption rules" ON public.pms_tax_exemption_rules;
CREATE POLICY "Managers delete pms tax exemption rules" ON public.pms_tax_exemption_rules
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_taxes_updated_at ON public.pms_taxes;
CREATE TRIGGER set_pms_taxes_updated_at
  BEFORE UPDATE ON public.pms_taxes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_pms_tax_groups_updated_at ON public.pms_tax_groups;
CREATE TRIGGER set_pms_tax_groups_updated_at
  BEFORE UPDATE ON public.pms_tax_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_pms_service_charges_updated_at ON public.pms_service_charges;
CREATE TRIGGER set_pms_service_charges_updated_at
  BEFORE UPDATE ON public.pms_service_charges
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_pms_fees_updated_at ON public.pms_fees;
CREATE TRIGGER set_pms_fees_updated_at
  BEFORE UPDATE ON public.pms_fees
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_pms_tax_exemption_rules_updated_at ON public.pms_tax_exemption_rules;
CREATE TRIGGER set_pms_tax_exemption_rules_updated_at
  BEFORE UPDATE ON public.pms_tax_exemption_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
