-- PMS Travel Agency Creation Step 3: Commission & Rates
-- Dual-lane migration: supabase/migrations and drizzle/migrations
-- Introduces pms_agency_commission_rules, pms_agency_rate_defaults,
-- and enhances pms_agency_commission_entries with rule traceability snapshot fields.

-- 1. Commission Rules Domain
CREATE TABLE IF NOT EXISTS public.pms_agency_commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  commission_plan_id uuid NOT NULL REFERENCES public.pms_agency_commission_plans(id) ON DELETE CASCADE,
  scope_type text NOT NULL,
  room_type_id uuid,
  rate_plan_id uuid,
  commission_type text NOT NULL,
  commission_value numeric(12, 4) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_agency_commission_rules_scope_check
    CHECK (scope_type IN ('all', 'room_type', 'rate_plan')),
  CONSTRAINT pms_agency_commission_rules_type_check
    CHECK (commission_type IN ('percent', 'fixed')),
  CONSTRAINT pms_agency_commission_rules_value_check
    CHECK (commission_value >= 0 AND (commission_type <> 'percent' OR commission_value <= 100)),
  CONSTRAINT pms_agency_commission_rules_scope_fields_check
    CHECK (
      (scope_type = 'all' AND room_type_id IS NULL AND rate_plan_id IS NULL) OR
      (scope_type = 'room_type' AND room_type_id IS NOT NULL AND rate_plan_id IS NULL) OR
      (scope_type = 'rate_plan' AND rate_plan_id IS NOT NULL)
    ),
  CONSTRAINT pms_agency_commission_rules_room_type_fk
    FOREIGN KEY (room_type_id, restaurant_id)
    REFERENCES public.room_types(id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT pms_agency_commission_rules_rate_plan_fk
    FOREIGN KEY (rate_plan_id, restaurant_id)
    REFERENCES public.hotel_rate_plans(id, restaurant_id)
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS pms_agency_commission_rules_plan_all_idx
  ON public.pms_agency_commission_rules(commission_plan_id)
  WHERE active = true AND scope_type = 'all';

CREATE UNIQUE INDEX IF NOT EXISTS pms_agency_commission_rules_plan_room_type_idx
  ON public.pms_agency_commission_rules(commission_plan_id, room_type_id)
  WHERE active = true AND scope_type = 'room_type';

CREATE UNIQUE INDEX IF NOT EXISTS pms_agency_commission_rules_plan_rate_plan_idx
  ON public.pms_agency_commission_rules(commission_plan_id, rate_plan_id)
  WHERE active = true AND scope_type = 'rate_plan';

CREATE INDEX IF NOT EXISTS pms_agency_commission_rules_plan_idx
  ON public.pms_agency_commission_rules(restaurant_id, commission_plan_id, active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_agency_commission_rules TO authenticated;
GRANT ALL ON public.pms_agency_commission_rules TO service_role;
ALTER TABLE public.pms_agency_commission_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read agency commission rules" ON public.pms_agency_commission_rules;
CREATE POLICY "Members read agency commission rules" ON public.pms_agency_commission_rules
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Managers write agency commission rules" ON public.pms_agency_commission_rules;
CREATE POLICY "Managers write agency commission rules" ON public.pms_agency_commission_rules
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. Agency Rate Defaults Domain (per Room Type)
CREATE TABLE IF NOT EXISTS public.pms_agency_rate_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  agency_master_id uuid NOT NULL,
  room_type_id uuid NOT NULL,
  rate_plan_id uuid NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_agency_rate_defaults_agency_fk
    FOREIGN KEY (agency_master_id, restaurant_id)
    REFERENCES public.guest_account_masters(id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT pms_agency_rate_defaults_room_type_fk
    FOREIGN KEY (room_type_id, restaurant_id)
    REFERENCES public.room_types(id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT pms_agency_rate_defaults_rate_plan_fk
    FOREIGN KEY (rate_plan_id, restaurant_id)
    REFERENCES public.hotel_rate_plans(id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT pms_agency_rate_defaults_agency_room_type_unique
    UNIQUE (restaurant_id, agency_master_id, room_type_id)
);

CREATE INDEX IF NOT EXISTS pms_agency_rate_defaults_agency_idx
  ON public.pms_agency_rate_defaults(restaurant_id, agency_master_id, active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_agency_rate_defaults TO authenticated;
GRANT ALL ON public.pms_agency_rate_defaults TO service_role;
ALTER TABLE public.pms_agency_rate_defaults ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read agency rate defaults" ON public.pms_agency_rate_defaults;
CREATE POLICY "Members read agency rate defaults" ON public.pms_agency_rate_defaults
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Managers write agency rate defaults" ON public.pms_agency_rate_defaults;
CREATE POLICY "Managers write agency rate defaults" ON public.pms_agency_rate_defaults
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. Commission Entry Traceability & Snapshot Extension
ALTER TABLE public.pms_agency_commission_entries
  ADD COLUMN IF NOT EXISTS commission_rule_id uuid REFERENCES public.pms_agency_commission_rules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rule_scope text,
  ADD COLUMN IF NOT EXISTS commission_type text,
  ADD COLUMN IF NOT EXISTS commission_value numeric(12, 4);

-- 4. Corporate Agreement Ownership Extension for Travel Agency Net Rates
ALTER TABLE public.pms_corporate_agreements
  ADD COLUMN IF NOT EXISTS agency_master_id uuid REFERENCES public.guest_account_masters(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS pms_corporate_agreements_agency_idx
  ON public.pms_corporate_agreements (restaurant_id, agency_master_id);
