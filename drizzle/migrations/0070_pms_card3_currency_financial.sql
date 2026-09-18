-- PMS Property Setup Card 3 — Currency & Financial Settings schema (Phase 1).
--
-- Sequential after 0069. Dual-lane: byte-identical copies live in
--   supabase/migrations/0070_pms_card3_currency_financial.sql
--   drizzle/migrations/0070_pms_card3_currency_financial.sql
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY AFTER MERGE — wait for PM approval of this SQL before apply.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f drizzle/migrations/0070_pms_card3_currency_financial.sql
--   or the project's usual drizzle / Supabase migration apply path.
--   Do not run both copies against the same database.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.pms_exchange_rates;
--   DROP TABLE IF EXISTS public.pms_financial_settings;
--   DROP TABLE IF EXISTS public.pms_property_currencies;
--
-- Card 1 remains authoritative for:
--   restaurants.currency_code (base / primary currency)
--   restaurants.timezone
--   restaurants.business_date
-- This migration does not ALTER those columns, folio/POS/rate snapshots, Card 1, or Card 2.
--
-- FX direction (fixed):
--   rate = quote currency units per 1 base currency unit
--   Base currency is restaurants.currency_code. It is not stored on FX rows.
--   Example: base ETB, quote USD, rate 0.017 means 1 ETB = 0.017 USD.
--
-- Audit History:
--   Reuse public.restaurant_staff_audit_log (SET1 / Card 1 writeAudit).
--   No pms_currency_activity table. Card 6's pms_integration_activity stays
--   integration-specific (simulated tests, integration_id). Currency settings
--   fit action + metadata JSON on the shared staff audit log.
--
-- No seed. No backfill. No types.ts regen. No live bank/FX integration.
-- source values bank and system are labels only.

-- 1. Supported currencies (extensions around Card 1 base). No is_base column.
CREATE TABLE IF NOT EXISTS public.pms_property_currencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  symbol text NOT NULL,
  decimal_places smallint NOT NULL DEFAULT 2,
  rounding text NOT NULL DEFAULT 'half_up',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_property_currencies_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_property_currencies_code_check CHECK (code ~ '^[A-Z]{3}$'),
  CONSTRAINT pms_property_currencies_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT pms_property_currencies_symbol_check CHECK (length(btrim(symbol)) BETWEEN 1 AND 12),
  CONSTRAINT pms_property_currencies_decimal_places_check CHECK (decimal_places BETWEEN 0 AND 4),
  CONSTRAINT pms_property_currencies_rounding_check CHECK (
    rounding IN ('half_up', 'half_even', 'down', 'up')
  )
);

CREATE INDEX IF NOT EXISTS pms_property_currencies_restaurant_idx
  ON public.pms_property_currencies(restaurant_id, code);

COMMENT ON TABLE public.pms_property_currencies IS
  'Card 3 supported currencies. Base currency is restaurants.currency_code; API derives isBase as code = restaurants.currency_code. No is_base column.';
COMMENT ON COLUMN public.pms_property_currencies.code IS
  'ISO 4217 alphabetic code. Not an authoritative base-currency flag.';

-- 2. Exchange rates vs Card 1 base (not stored here).
CREATE TABLE IF NOT EXISTS public.pms_exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  quote_currency_code text NOT NULL,
  rate numeric NOT NULL,
  effective_date date NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_exchange_rates_quote_unique UNIQUE (restaurant_id, quote_currency_code, effective_date),
  CONSTRAINT pms_exchange_rates_quote_code_check CHECK (quote_currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT pms_exchange_rates_rate_positive CHECK (rate > 0),
  CONSTRAINT pms_exchange_rates_source_check CHECK (source IN ('manual', 'bank', 'system')),
  CONSTRAINT pms_exchange_rates_quote_fk
    FOREIGN KEY (restaurant_id, quote_currency_code)
    REFERENCES public.pms_property_currencies (restaurant_id, code)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS pms_exchange_rates_restaurant_idx
  ON public.pms_exchange_rates(restaurant_id, effective_date DESC);

COMMENT ON TABLE public.pms_exchange_rates IS
  'Card 3 FX quotes. Base is restaurants.currency_code. No second base column. No live FX feed.';
COMMENT ON COLUMN public.pms_exchange_rates.rate IS
  'quote currency units per 1 base currency unit. Base = restaurants.currency_code.';
COMMENT ON COLUMN public.pms_exchange_rates.quote_currency_code IS
  'ISO code being quoted against Card 1 base. Must exist on pms_property_currencies.';
COMMENT ON COLUMN public.pms_exchange_rates.source IS
  'manual | bank | system labels only. Phase 1 has no live bank or system FX integration.';

-- 3. One financial-settings row per property. Not Card 1 identity/date/tz.
CREATE TABLE IF NOT EXISTS public.pms_financial_settings (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  fiscal_year_start_month smallint NOT NULL DEFAULT 1,
  fiscal_year_start_day smallint NOT NULL DEFAULT 1,
  default_fx_source text NOT NULL DEFAULT 'manual',
  allow_multi_currency boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_financial_settings_month_check CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
  CONSTRAINT pms_financial_settings_day_check CHECK (fiscal_year_start_day BETWEEN 1 AND 31),
  CONSTRAINT pms_financial_settings_fx_source_check CHECK (
    default_fx_source IN ('manual', 'bank', 'system')
  )
);

COMMENT ON TABLE public.pms_financial_settings IS
  'Card 3 fiscal-year and FX defaults. Does not store primary currency, timezone, or business date.';
COMMENT ON COLUMN public.pms_financial_settings.fiscal_year_start_day IS
  '1–31 only. Leap-year and month-length validation is application-side, not SQL.';

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.pms_property_currencies,
  public.pms_exchange_rates,
  public.pms_financial_settings
  TO authenticated;
GRANT ALL ON
  public.pms_property_currencies,
  public.pms_exchange_rates,
  public.pms_financial_settings
  TO service_role;

ALTER TABLE public.pms_property_currencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pms_exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pms_financial_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read property currencies" ON public.pms_property_currencies;
CREATE POLICY "Members read property currencies" ON public.pms_property_currencies
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert property currencies" ON public.pms_property_currencies;
CREATE POLICY "Managers insert property currencies" ON public.pms_property_currencies
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update property currencies" ON public.pms_property_currencies;
CREATE POLICY "Managers update property currencies" ON public.pms_property_currencies
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete property currencies" ON public.pms_property_currencies;
CREATE POLICY "Managers delete property currencies" ON public.pms_property_currencies
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP POLICY IF EXISTS "Members read exchange rates" ON public.pms_exchange_rates;
CREATE POLICY "Members read exchange rates" ON public.pms_exchange_rates
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert exchange rates" ON public.pms_exchange_rates;
CREATE POLICY "Managers insert exchange rates" ON public.pms_exchange_rates
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update exchange rates" ON public.pms_exchange_rates;
CREATE POLICY "Managers update exchange rates" ON public.pms_exchange_rates
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete exchange rates" ON public.pms_exchange_rates;
CREATE POLICY "Managers delete exchange rates" ON public.pms_exchange_rates
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP POLICY IF EXISTS "Members read financial settings" ON public.pms_financial_settings;
CREATE POLICY "Members read financial settings" ON public.pms_financial_settings
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert financial settings" ON public.pms_financial_settings;
CREATE POLICY "Managers insert financial settings" ON public.pms_financial_settings
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update financial settings" ON public.pms_financial_settings;
CREATE POLICY "Managers update financial settings" ON public.pms_financial_settings
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete financial settings" ON public.pms_financial_settings;
CREATE POLICY "Managers delete financial settings" ON public.pms_financial_settings
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_property_currencies_updated_at ON public.pms_property_currencies;
CREATE TRIGGER set_pms_property_currencies_updated_at
  BEFORE UPDATE ON public.pms_property_currencies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_pms_exchange_rates_updated_at ON public.pms_exchange_rates;
CREATE TRIGGER set_pms_exchange_rates_updated_at
  BEFORE UPDATE ON public.pms_exchange_rates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_pms_financial_settings_updated_at ON public.pms_financial_settings;
CREATE TRIGGER set_pms_financial_settings_updated_at
  BEFORE UPDATE ON public.pms_financial_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
