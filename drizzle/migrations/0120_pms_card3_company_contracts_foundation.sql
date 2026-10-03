-- PMS Property Setup Card 3 & 4 — Company Contracts, Policies & Document Types Foundation
-- Sequential after 0119. Dual-lane copies live in:
--   supabase/migrations/0120_pms_card3_company_contracts_foundation.sql
--   drizzle/migrations/0120_pms_card3_company_contracts_foundation.sql
--
-- 1. Creates Settings-owned contract types master: public.pms_contract_types
-- 2. Creates Settings-owned cancellation policies master: public.pms_cancellation_policies
-- 3. Creates Settings-owned no-show policies master: public.pms_no_show_policies
-- 4. Extends public.pms_corporate_agreements with Step 4 domain columns
-- 5. Extends public.pms_company_document_types with Card 4 requirement and contract applicability flags
-- 6. Adds agreement_id linkage to public.guest_company_documents

-- 1. Contract Types Master
CREATE TABLE IF NOT EXISTS public.pms_contract_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_contract_types_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_contract_types_code_check CHECK (
    code ~ '^[A-Z0-9_]{1,30}$'
  ),
  CONSTRAINT pms_contract_types_name_check CHECK (
    length(btrim(name)) BETWEEN 1 AND 120
  ),
  CONSTRAINT pms_contract_types_description_check CHECK (
    description IS NULL OR length(btrim(description)) BETWEEN 1 AND 500
  )
);

CREATE INDEX IF NOT EXISTS pms_contract_types_restaurant_idx
  ON public.pms_contract_types (restaurant_id, display_order, name);

CREATE INDEX IF NOT EXISTS pms_contract_types_active_idx
  ON public.pms_contract_types (restaurant_id, active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_contract_types TO authenticated;
GRANT ALL ON public.pms_contract_types TO service_role;
ALTER TABLE public.pms_contract_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read pms contract types" ON public.pms_contract_types;
CREATE POLICY "Members read pms contract types" ON public.pms_contract_types
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));

DROP POLICY IF EXISTS "Managers write pms contract types" ON public.pms_contract_types;
CREATE POLICY "Managers write pms contract types" ON public.pms_contract_types
  FOR ALL TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
    OR public.has_restaurant_role(restaurant_id, 'receptionist')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
    OR public.has_restaurant_role(restaurant_id, 'receptionist')
  );

DROP TRIGGER IF EXISTS set_pms_contract_types_updated_at ON public.pms_contract_types;
CREATE TRIGGER set_pms_contract_types_updated_at
  BEFORE UPDATE ON public.pms_contract_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Cancellation Policies Master
CREATE TABLE IF NOT EXISTS public.pms_cancellation_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  cutoff_hours integer NOT NULL DEFAULT 24,
  penalty_type text NOT NULL,
  penalty_value numeric(12,2) NOT NULL DEFAULT 0,
  refundable_before_cutoff boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_cancellation_policies_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_cancellation_policies_code_check CHECK (
    code ~ '^[A-Z0-9_]{1,30}$'
  ),
  CONSTRAINT pms_cancellation_policies_name_check CHECK (
    length(btrim(name)) BETWEEN 1 AND 120
  ),
  CONSTRAINT pms_cancellation_policies_cutoff_check CHECK (
    cutoff_hours >= 0
  ),
  CONSTRAINT pms_cancellation_policies_penalty_type_check CHECK (
    penalty_type IN ('none', 'first_night', 'percent_stay', 'fixed_amount', 'full_stay')
  ),
  CONSTRAINT pms_cancellation_policies_penalty_value_check CHECK (
    penalty_value >= 0
    AND (
      (penalty_type IN ('none', 'first_night', 'full_stay') AND penalty_value = 0)
      OR (penalty_type = 'percent_stay' AND penalty_value <= 100)
      OR (penalty_type = 'fixed_amount')
    )
  ),
  CONSTRAINT pms_cancellation_policies_description_check CHECK (
    description IS NULL OR length(btrim(description)) BETWEEN 1 AND 500
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS pms_cancellation_policies_default_unique
  ON public.pms_cancellation_policies (restaurant_id)
  WHERE is_default;

CREATE INDEX IF NOT EXISTS pms_cancellation_policies_restaurant_idx
  ON public.pms_cancellation_policies (restaurant_id, code);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_cancellation_policies TO authenticated;
GRANT ALL ON public.pms_cancellation_policies TO service_role;
ALTER TABLE public.pms_cancellation_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read pms cancellation policies" ON public.pms_cancellation_policies;
CREATE POLICY "Members read pms cancellation policies" ON public.pms_cancellation_policies
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));

DROP POLICY IF EXISTS "Managers write pms cancellation policies" ON public.pms_cancellation_policies;
CREATE POLICY "Managers write pms cancellation policies" ON public.pms_cancellation_policies
  FOR ALL TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
    OR public.has_restaurant_role(restaurant_id, 'receptionist')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
    OR public.has_restaurant_role(restaurant_id, 'receptionist')
  );

DROP TRIGGER IF EXISTS set_pms_cancellation_policies_updated_at ON public.pms_cancellation_policies;
CREATE TRIGGER set_pms_cancellation_policies_updated_at
  BEFORE UPDATE ON public.pms_cancellation_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. No-Show Policies Master
CREATE TABLE IF NOT EXISTS public.pms_no_show_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  penalty_type text NOT NULL,
  penalty_value numeric(12,2) NOT NULL DEFAULT 0,
  release_hour integer NOT NULL DEFAULT 18,
  is_default boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_no_show_policies_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_no_show_policies_code_check CHECK (
    code ~ '^[A-Z0-9_]{1,30}$'
  ),
  CONSTRAINT pms_no_show_policies_name_check CHECK (
    length(btrim(name)) BETWEEN 1 AND 120
  ),
  CONSTRAINT pms_no_show_policies_penalty_type_check CHECK (
    penalty_type IN ('none', 'first_night', 'percent_stay', 'fixed_amount', 'full_stay')
  ),
  CONSTRAINT pms_no_show_policies_penalty_value_check CHECK (
    penalty_value >= 0
    AND (
      (penalty_type IN ('none', 'first_night', 'full_stay') AND penalty_value = 0)
      OR (penalty_type = 'percent_stay' AND penalty_value <= 100)
      OR (penalty_type = 'fixed_amount')
    )
  ),
  CONSTRAINT pms_no_show_policies_release_hour_check CHECK (
    release_hour BETWEEN 0 AND 23
  ),
  CONSTRAINT pms_no_show_policies_description_check CHECK (
    description IS NULL OR length(btrim(description)) BETWEEN 1 AND 500
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS pms_no_show_policies_default_unique
  ON public.pms_no_show_policies (restaurant_id)
  WHERE is_default;

CREATE INDEX IF NOT EXISTS pms_no_show_policies_restaurant_idx
  ON public.pms_no_show_policies (restaurant_id, code);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_no_show_policies TO authenticated;
GRANT ALL ON public.pms_no_show_policies TO service_role;
ALTER TABLE public.pms_no_show_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read pms no show policies" ON public.pms_no_show_policies;
CREATE POLICY "Members read pms no show policies" ON public.pms_no_show_policies
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));

DROP POLICY IF EXISTS "Managers write pms no show policies" ON public.pms_no_show_policies;
CREATE POLICY "Managers write pms no show policies" ON public.pms_no_show_policies
  FOR ALL TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
    OR public.has_restaurant_role(restaurant_id, 'receptionist')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
    OR public.has_restaurant_role(restaurant_id, 'receptionist')
  );

DROP TRIGGER IF EXISTS set_pms_no_show_policies_updated_at ON public.pms_no_show_policies;
CREATE TRIGGER set_pms_no_show_policies_updated_at
  BEFORE UPDATE ON public.pms_no_show_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Extend pms_corporate_agreements
ALTER TABLE public.pms_corporate_agreements
  ADD COLUMN IF NOT EXISTS contract_type_id uuid REFERENCES public.pms_contract_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS pricing_method text NOT NULL DEFAULT 'contracted_rates',
  ADD COLUMN IF NOT EXISTS rate_plan_id uuid REFERENCES public.hotel_rate_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rate_plan_scope text NOT NULL DEFAULT 'selected',
  ADD COLUMN IF NOT EXISTS rate_plan_ids text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS discount_application text NOT NULL DEFAULT 'uniform',
  ADD COLUMN IF NOT EXISTS discount_type text,
  ADD COLUMN IF NOT EXISTS discount_value numeric(12,2),
  ADD COLUMN IF NOT EXISTS rate_plan_discounts jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS deposit_policy_id uuid REFERENCES public.pms_deposit_policies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancellation_policy_id uuid REFERENCES public.pms_cancellation_policies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS no_show_policy_id uuid REFERENCES public.pms_no_show_policies(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pms_corporate_agreements_status_check'
  ) THEN
    ALTER TABLE public.pms_corporate_agreements
      ADD CONSTRAINT pms_corporate_agreements_status_check CHECK (
        status IN ('draft', 'active', 'suspended', 'terminated')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pms_corporate_agreements_pricing_method_check'
  ) THEN
    ALTER TABLE public.pms_corporate_agreements
      ADD CONSTRAINT pms_corporate_agreements_pricing_method_check CHECK (
        pricing_method IN ('rate_plan', 'rate_plan_discount', 'contracted_rates')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pms_corporate_agreements_discount_type_check'
  ) THEN
    ALTER TABLE public.pms_corporate_agreements
      ADD CONSTRAINT pms_corporate_agreements_discount_type_check CHECK (
        discount_type IS NULL OR discount_type IN ('percent', 'fixed')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pms_corporate_agreements_discount_value_check'
  ) THEN
    ALTER TABLE public.pms_corporate_agreements
      ADD CONSTRAINT pms_corporate_agreements_discount_value_check CHECK (
        discount_value IS NULL OR (
          discount_value >= 0
          AND (discount_type <> 'percent' OR discount_value <= 100)
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS pms_corporate_agreements_status_idx
  ON public.pms_corporate_agreements (restaurant_id, status);

CREATE INDEX IF NOT EXISTS pms_corporate_agreements_contract_type_idx
  ON public.pms_corporate_agreements (restaurant_id, contract_type_id);

CREATE INDEX IF NOT EXISTS pms_corporate_agreements_rate_plan_idx
  ON public.pms_corporate_agreements (restaurant_id, rate_plan_id);

-- 5. Extend pms_company_document_types
ALTER TABLE public.pms_company_document_types
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS applies_to_contract boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS applies_to_company boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS pms_company_document_types_contract_idx
  ON public.pms_company_document_types (restaurant_id, active, applies_to_contract, display_order);

-- 6. Extend guest_company_documents with optional agreement_id linkage
ALTER TABLE public.guest_company_documents
  ADD COLUMN IF NOT EXISTS agreement_id uuid REFERENCES public.pms_corporate_agreements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS guest_company_documents_agreement_idx
  ON public.guest_company_documents (restaurant_id, agreement_id);
