-- PMS Property Setup Card 3 — Billing & Invoicing schema (Phase 6).
--
-- Sequential after 0073. Dual-lane: byte-identical copies live in
--   supabase/migrations/0074_pms_card3_billing_invoicing.sql
--   drizzle/migrations/0074_pms_card3_billing_invoicing.sql
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY AFTER MERGE — wait for PM approval of this SQL before apply.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f drizzle/migrations/0074_pms_card3_billing_invoicing.sql
--   or the project's usual drizzle / Supabase migration apply path.
--   Do not run both copies against the same database.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.pms_billing_rules;
--   DROP TABLE IF EXISTS public.pms_invoice_settings;
--
-- Scope fence — this migration explicitly does NOT touch:
--   restaurants identity, branding, VAT, tax IDs, currency_code (Card 1)
--   restaurants.pms_admin_controls / SET5 folioPrefix
--   guest_folio_counters, guest_folios, folio_transactions, folio_history
--   post_folio_transaction, open_folio_for_reservation, close_guest_folio
--   invoices / invoice lines / fake invoice seed
--   guest_account_masters, city ledger, AR, credit limits
--   pms_billing_profiles
--   Card 3 Phases 1–5 tables
--   restaurants.pms_property_setup_status or any programme / go-live status
--   no new audit table — reuse public.restaurant_staff_audit_log
--
-- No seed. No backfill. No types.ts regen.
-- starting_number is a setup figure only, not a live issued-document counter.

-- 1. Property invoice document settings. One row per restaurant.
CREATE TABLE IF NOT EXISTS public.pms_invoice_settings (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  prefix text NOT NULL,
  starting_number int NOT NULL DEFAULT 1,
  number_padding smallint NOT NULL DEFAULT 6,
  tax_display text NOT NULL DEFAULT 'exclusive',
  invoice_format text NOT NULL DEFAULT 'standard',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_invoice_settings_prefix_check CHECK (
    prefix ~ '^[A-Za-z0-9_-]{1,12}$'
  ),
  CONSTRAINT pms_invoice_settings_starting_number_check CHECK (starting_number >= 1),
  CONSTRAINT pms_invoice_settings_padding_check CHECK (number_padding BETWEEN 1 AND 12),
  CONSTRAINT pms_invoice_settings_tax_display_check CHECK (
    tax_display IN ('exclusive', 'inclusive', 'both')
  ),
  CONSTRAINT pms_invoice_settings_format_check CHECK (
    invoice_format IN ('standard', 'detailed', 'summary')
  )
);

COMMENT ON TABLE public.pms_invoice_settings IS
  'Card 3 invoice document setup. Not an invoice row, folio counter, or SET5 folioPrefix. Currency and branding stay on restaurants (Card 1).';
COMMENT ON COLUMN public.pms_invoice_settings.prefix IS
  'Setup document prefix. Does not replace guest_folio_counters or FL- cashiering numbers.';
COMMENT ON COLUMN public.pms_invoice_settings.starting_number IS
  'Stored setup starting figure. Not a live next-number and not an issued invoice.';
COMMENT ON COLUMN public.pms_invoice_settings.tax_display IS
  'exclusive | inclusive | both. Display preference only. Does not replace pms_taxes.';
COMMENT ON COLUMN public.pms_invoice_settings.invoice_format IS
  'standard | detailed | summary. Layout preference only. No document generator in Phase 6.';

-- 2. Billing-rule catalogue. Setup hints only; not folio routing.
CREATE TABLE IF NOT EXISTS public.pms_billing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  payer_kind text NOT NULL,
  split_guest_percent numeric(5,2),
  payment_terms text,
  is_default boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_billing_rules_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_billing_rules_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_billing_rules_code_check CHECK (
    code ~ '^[A-Z0-9_]{1,20}$'
  ),
  CONSTRAINT pms_billing_rules_name_check CHECK (
    length(btrim(name)) BETWEEN 1 AND 120
  ),
  CONSTRAINT pms_billing_rules_description_check CHECK (
    description IS NULL OR length(btrim(description)) BETWEEN 1 AND 500
  ),
  CONSTRAINT pms_billing_rules_payer_kind_check CHECK (
    payer_kind IN ('guest', 'company', 'group', 'split')
  ),
  CONSTRAINT pms_billing_rules_split_check CHECK (
    (
      payer_kind = 'split'
      AND split_guest_percent IS NOT NULL
      AND split_guest_percent >= 0
      AND split_guest_percent <= 100
    )
    OR (
      payer_kind <> 'split'
      AND split_guest_percent IS NULL
    )
  ),
  CONSTRAINT pms_billing_rules_payment_terms_check CHECK (
    payment_terms IS NULL OR length(btrim(payment_terms)) BETWEEN 1 AND 80
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS pms_billing_rules_default_unique
  ON public.pms_billing_rules (restaurant_id)
  WHERE is_default;

CREATE INDEX IF NOT EXISTS pms_billing_rules_restaurant_idx
  ON public.pms_billing_rules(restaurant_id, code);

COMMENT ON TABLE public.pms_billing_rules IS
  'Card 3 billing-rule catalogue. Setup only. Not folio split, city ledger, or a guest_account_masters link.';
COMMENT ON COLUMN public.pms_billing_rules.payer_kind IS
  'guest | company | group | split. Setup hint only; not operational folio routing.';
COMMENT ON COLUMN public.pms_billing_rules.split_guest_percent IS
  'Guest share when payer_kind = split. Setup hint only. Not a folio-split engine.';
COMMENT ON COLUMN public.pms_billing_rules.payment_terms IS
  'Optional terms label. Not AR, city-ledger, or Guest Profile payment_terms.';
COMMENT ON COLUMN public.pms_billing_rules.is_default IS
  'At most one default rule per property. Not a go-live or programme flag.';

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.pms_invoice_settings,
  public.pms_billing_rules
  TO authenticated;
GRANT ALL ON
  public.pms_invoice_settings,
  public.pms_billing_rules
  TO service_role;

ALTER TABLE public.pms_invoice_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pms_billing_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read pms invoice settings" ON public.pms_invoice_settings;
CREATE POLICY "Members read pms invoice settings" ON public.pms_invoice_settings
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert pms invoice settings" ON public.pms_invoice_settings;
CREATE POLICY "Managers insert pms invoice settings" ON public.pms_invoice_settings
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update pms invoice settings" ON public.pms_invoice_settings;
CREATE POLICY "Managers update pms invoice settings" ON public.pms_invoice_settings
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete pms invoice settings" ON public.pms_invoice_settings;
CREATE POLICY "Managers delete pms invoice settings" ON public.pms_invoice_settings
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP POLICY IF EXISTS "Members read pms billing rules" ON public.pms_billing_rules;
CREATE POLICY "Members read pms billing rules" ON public.pms_billing_rules
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert pms billing rules" ON public.pms_billing_rules;
CREATE POLICY "Managers insert pms billing rules" ON public.pms_billing_rules
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update pms billing rules" ON public.pms_billing_rules;
CREATE POLICY "Managers update pms billing rules" ON public.pms_billing_rules
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete pms billing rules" ON public.pms_billing_rules;
CREATE POLICY "Managers delete pms billing rules" ON public.pms_billing_rules
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_invoice_settings_updated_at ON public.pms_invoice_settings;
CREATE TRIGGER set_pms_invoice_settings_updated_at
  BEFORE UPDATE ON public.pms_invoice_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_pms_billing_rules_updated_at ON public.pms_billing_rules;
CREATE TRIGGER set_pms_billing_rules_updated_at
  BEFORE UPDATE ON public.pms_billing_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
