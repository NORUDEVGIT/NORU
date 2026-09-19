-- PMS Property Setup Card 3 — Corporate & Contract Rates schema (Phase 7).
--
-- Sequential after 0074. Dual-lane: byte-identical copies live in
--   supabase/migrations/0075_pms_card3_corporate_contract_rates.sql
--   drizzle/migrations/0075_pms_card3_corporate_contract_rates.sql
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY AFTER MERGE — wait for PM approval of this SQL before apply.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f drizzle/migrations/0075_pms_card3_corporate_contract_rates.sql
--   or the project's usual drizzle / Supabase migration apply path.
--   Do not run both copies against the same database.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.pms_contract_rates;
--   DROP TABLE IF EXISTS public.pms_corporate_agreements;
--
-- Guest Profile / 0053 remains the owning migration for guest_account_masters.
-- This migration only references that master via a composite FK. No new company
-- table. No backfill from negotiated_rate_reference.
--
-- Scope fence — this migration explicitly does NOT touch:
--   guest_account_masters columns, guest_account_links roles, authorized bookers
--   payment_terms / credit_limit on agreements, AR, city ledger
--   hotel_reservations, price_hotel_stay, nightly_rate_snapshot
--   hotel_rate_plans (Phase 3 rack catalogue stays separate)
--   Card 1 identity, Card 2 room_types definition (FK only), Phases 1–6 tables
--   restaurants.pms_property_setup_status or any programme / go-live status
--   Revenue & Commercial Rules
--   no new audit table — reuse public.restaurant_staff_audit_log
--
-- account_type = company is enforced in the Card 3 API, not a SQL CHECK
-- (CHECK cannot see guest_account_masters.account_type without a trigger).
--
-- No seed. No types.ts regen.

-- 1. Corporate agreements. Company identity stays on guest_account_masters.
CREATE TABLE IF NOT EXISTS public.pms_corporate_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  contract_number text NOT NULL,
  valid_from date NOT NULL,
  valid_to date NOT NULL,
  currency_code text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_corporate_agreements_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_corporate_agreements_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_corporate_agreements_code_check CHECK (
    code ~ '^[A-Z0-9_]{1,20}$'
  ),
  CONSTRAINT pms_corporate_agreements_name_check CHECK (
    length(btrim(name)) BETWEEN 1 AND 120
  ),
  CONSTRAINT pms_corporate_agreements_contract_number_check CHECK (
    length(btrim(contract_number)) BETWEEN 1 AND 40
  ),
  CONSTRAINT pms_corporate_agreements_dates_check CHECK (valid_to >= valid_from),
  CONSTRAINT pms_corporate_agreements_currency_check CHECK (
    currency_code ~ '^[A-Z]{3}$'
  ),
  CONSTRAINT pms_corporate_agreements_description_check CHECK (
    description IS NULL OR length(btrim(description)) BETWEEN 1 AND 500
  ),
  CONSTRAINT pms_corporate_agreements_company_fk
    FOREIGN KEY (company_id, restaurant_id)
    REFERENCES public.guest_account_masters (id, restaurant_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS pms_corporate_agreements_restaurant_idx
  ON public.pms_corporate_agreements(restaurant_id, company_id);
CREATE INDEX IF NOT EXISTS pms_corporate_agreements_dates_idx
  ON public.pms_corporate_agreements(restaurant_id, valid_from, valid_to);

COMMENT ON TABLE public.pms_corporate_agreements IS
  'Card 3 corporate-agreement catalogue. Company identity is guest_account_masters. Not AR, not a reservation snapshot, not an authorized-booker table.';
COMMENT ON COLUMN public.pms_corporate_agreements.company_id IS
  'Guest Profile company master. API requires account_type = company. ON DELETE RESTRICT.';
COMMENT ON COLUMN public.pms_corporate_agreements.currency_code IS
  'ISO 4217 code. Must match Card 1 base or a Card 3 supported currency. Validated in the API, not a currency FK.';
COMMENT ON COLUMN public.pms_corporate_agreements.contract_number IS
  'Setup contract number. Distinct from guest_account_masters.contract_reference.';

-- 2. Contract rates against Card 2 room types. Setup amounts only.
CREATE TABLE IF NOT EXISTS public.pms_contract_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  agreement_id uuid NOT NULL,
  room_type_id uuid NOT NULL,
  rate_kind text NOT NULL,
  amount numeric(12,2) NOT NULL,
  valid_from date NOT NULL,
  valid_to date NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_contract_rates_window_unique UNIQUE (agreement_id, room_type_id, valid_from),
  CONSTRAINT pms_contract_rates_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_contract_rates_kind_check CHECK (
    rate_kind IN ('negotiated', 'fixed')
  ),
  CONSTRAINT pms_contract_rates_amount_check CHECK (amount >= 0),
  CONSTRAINT pms_contract_rates_dates_check CHECK (valid_to >= valid_from),
  CONSTRAINT pms_contract_rates_agreement_fk
    FOREIGN KEY (agreement_id, restaurant_id)
    REFERENCES public.pms_corporate_agreements (id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT pms_contract_rates_room_type_fk
    FOREIGN KEY (room_type_id, restaurant_id)
    REFERENCES public.room_types (id, restaurant_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS pms_contract_rates_restaurant_idx
  ON public.pms_contract_rates(restaurant_id, agreement_id);
CREATE INDEX IF NOT EXISTS pms_contract_rates_room_type_idx
  ON public.pms_contract_rates(restaurant_id, room_type_id);

COMMENT ON TABLE public.pms_contract_rates IS
  'Card 3 contract-rate lines. Setup figure in the agreement currency. Not a quote RPC, not hotel_rate_plans, not a reservation snapshot.';
COMMENT ON COLUMN public.pms_contract_rates.rate_kind IS
  'negotiated | fixed. Stored setup classification only.';
COMMENT ON COLUMN public.pms_contract_rates.amount IS
  'Stored setup amount in the parent agreement currency_code. Not a computed stay total.';
COMMENT ON COLUMN public.pms_contract_rates.room_type_id IS
  'Card 2 room type. ON DELETE RESTRICT. This table does not create room types.';

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.pms_corporate_agreements,
  public.pms_contract_rates
  TO authenticated;
GRANT ALL ON
  public.pms_corporate_agreements,
  public.pms_contract_rates
  TO service_role;

ALTER TABLE public.pms_corporate_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pms_contract_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read pms corporate agreements" ON public.pms_corporate_agreements;
CREATE POLICY "Members read pms corporate agreements" ON public.pms_corporate_agreements
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert pms corporate agreements" ON public.pms_corporate_agreements;
CREATE POLICY "Managers insert pms corporate agreements" ON public.pms_corporate_agreements
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update pms corporate agreements" ON public.pms_corporate_agreements;
CREATE POLICY "Managers update pms corporate agreements" ON public.pms_corporate_agreements
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete pms corporate agreements" ON public.pms_corporate_agreements;
CREATE POLICY "Managers delete pms corporate agreements" ON public.pms_corporate_agreements
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP POLICY IF EXISTS "Members read pms contract rates" ON public.pms_contract_rates;
CREATE POLICY "Members read pms contract rates" ON public.pms_contract_rates
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert pms contract rates" ON public.pms_contract_rates;
CREATE POLICY "Managers insert pms contract rates" ON public.pms_contract_rates
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update pms contract rates" ON public.pms_contract_rates;
CREATE POLICY "Managers update pms contract rates" ON public.pms_contract_rates
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete pms contract rates" ON public.pms_contract_rates;
CREATE POLICY "Managers delete pms contract rates" ON public.pms_contract_rates
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_corporate_agreements_updated_at ON public.pms_corporate_agreements;
CREATE TRIGGER set_pms_corporate_agreements_updated_at
  BEFORE UPDATE ON public.pms_corporate_agreements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_pms_contract_rates_updated_at ON public.pms_contract_rates;
CREATE TRIGGER set_pms_contract_rates_updated_at
  BEFORE UPDATE ON public.pms_contract_rates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
