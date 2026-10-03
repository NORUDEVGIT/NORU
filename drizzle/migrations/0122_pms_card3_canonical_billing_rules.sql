-- PMS Card 3 — Canonical Billing Rules & Profile Applicability
-- Dual-lane with drizzle/migrations/0122_pms_card3_canonical_billing_rules.sql
-- Forward-additive schema additions to public.pms_billing_rules.
-- Adds system_code, is_system, operational_status, and applicable_profile_types.
-- Seeds canonical billing rule catalogue idempotently per property.

ALTER TABLE public.pms_billing_rules
  ADD COLUMN IF NOT EXISTS system_code text,
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS operational_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS applicable_profile_types text[] DEFAULT '{company,travel_agent,group,individual}'::text[];

-- Update code check to allow up to 50 characters (e.g. DIRECT_BILL_CITY_LEDGER, GOVERNMENT_ORGANIZATION)
ALTER TABLE public.pms_billing_rules
  DROP CONSTRAINT IF EXISTS pms_billing_rules_code_check;

ALTER TABLE public.pms_billing_rules
  ADD CONSTRAINT pms_billing_rules_code_check
  CHECK (code ~* '^[a-z0-9_]{1,50}$');

-- Relax split check so split_guest_percent is optional / intent-only
ALTER TABLE public.pms_billing_rules
  DROP CONSTRAINT IF EXISTS pms_billing_rules_split_check;

ALTER TABLE public.pms_billing_rules
  ADD CONSTRAINT pms_billing_rules_split_check
  CHECK (
    (payer_kind = 'split' AND (split_guest_percent IS NULL OR (split_guest_percent >= 0 AND split_guest_percent <= 100)))
    OR (payer_kind <> 'split')
  );

-- Operational status domain check
ALTER TABLE public.pms_billing_rules
  DROP CONSTRAINT IF EXISTS pms_billing_rules_operational_status_check;

ALTER TABLE public.pms_billing_rules
  ADD CONSTRAINT pms_billing_rules_operational_status_check
  CHECK (operational_status IN ('active', 'planned', 'intent_only', 'deprecated'));

-- Unique index per restaurant and system_code
CREATE UNIQUE INDEX IF NOT EXISTS pms_billing_rules_restaurant_system_code_idx
  ON public.pms_billing_rules(restaurant_id, system_code)
  WHERE system_code IS NOT NULL;

-- Backfill legacy records matching canonical codes
UPDATE public.pms_billing_rules
SET
  system_code = 'none',
  is_system = true,
  applicable_profile_types = ARRAY['company', 'travel_agent', 'group', 'individual']::text[]
WHERE system_code IS NULL AND LOWER(code) IN ('none');

UPDATE public.pms_billing_rules
SET
  system_code = 'company_master',
  is_system = true,
  applicable_profile_types = ARRAY['company']::text[]
WHERE system_code IS NULL AND LOWER(code) IN ('company_master', 'company');

UPDATE public.pms_billing_rules
SET
  system_code = 'individual_guest',
  is_system = true,
  applicable_profile_types = ARRAY['company', 'travel_agent', 'group', 'individual']::text[]
WHERE system_code IS NULL AND LOWER(code) IN ('individual_guest', 'guest');

UPDATE public.pms_billing_rules
SET
  system_code = 'split_billing',
  is_system = true,
  operational_status = 'intent_only',
  applicable_profile_types = ARRAY['company', 'travel_agent', 'group']::text[]
WHERE system_code IS NULL AND LOWER(code) IN ('split_billing', 'split');

-- Idempotently seed the 10 canonical NORU billing rules for all existing restaurants
INSERT INTO public.pms_billing_rules (
  restaurant_id,
  code,
  system_code,
  name,
  description,
  payer_kind,
  split_guest_percent,
  payment_terms,
  is_default,
  active,
  is_system,
  operational_status,
  applicable_profile_types
)
SELECT
  r.id,
  c.code,
  c.system_code,
  c.name,
  c.description,
  c.payer_kind,
  c.split_guest_percent,
  c.payment_terms,
  CASE
    WHEN c.system_code = 'company_master' AND NOT EXISTS (
      SELECT 1 FROM public.pms_billing_rules ex WHERE ex.restaurant_id = r.id AND ex.is_default = true
    ) THEN true
    ELSE false
  END AS is_default,
  true AS active,
  true AS is_system,
  c.operational_status,
  c.applicable_profile_types
FROM public.restaurants r
CROSS JOIN (
  VALUES
    ('NONE', 'none', 'None', 'No pre-assigned billing rule. Settlement details determined at reservation or check-in.', 'guest', NULL::numeric(5,2), NULL::text, 'active', ARRAY['company', 'travel_agent', 'group', 'individual']::text[]),
    ('COMPANY_MASTER', 'company_master', 'Company Master', 'All agreed room and tax charges billed directly to company master account.', 'company', NULL::numeric(5,2), NULL::text, 'active', ARRAY['company']::text[]),
    ('INDIVIDUAL_GUEST', 'individual_guest', 'Individual Guest', 'Guest settles folio directly upon departure.', 'guest', NULL::numeric(5,2), NULL::text, 'active', ARRAY['company', 'travel_agent', 'group', 'individual']::text[]),
    ('SPLIT_BILLING', 'split_billing', 'Split Billing', 'Company and guest share billing responsibility according to reservation/folio rules.', 'split', 50.00::numeric(5,2), NULL::text, 'intent_only', ARRAY['company', 'travel_agent', 'group']::text[]),
    ('THIRD_PARTY', 'third_party', 'Third Party', 'Designated third-party organization or sponsor covers charges.', 'company', NULL::numeric(5,2), NULL::text, 'active', ARRAY['company', 'group']::text[]),
    ('DIRECT_BILL_CITY_LEDGER', 'direct_bill_city_ledger', 'Direct Bill / City Ledger', 'Direct billing to approved city ledger account. (Commercial agreement; operational AR pending).', 'company', NULL::numeric(5,2), NULL::text, 'planned', ARRAY['company', 'travel_agent', 'group']::text[]),
    ('TRAVEL_AGENCY', 'travel_agency', 'Travel Agency', 'Travel agency vouchers or credit arrangement settles authorized charges.', 'company', NULL::numeric(5,2), NULL::text, 'active', ARRAY['travel_agent']::text[]),
    ('TOUR_OPERATOR', 'tour_operator', 'Tour Operator', 'Contracted tour operator account settles package or group allocations.', 'company', NULL::numeric(5,2), NULL::text, 'active', ARRAY['travel_agent', 'group']::text[]),
    ('GOVERNMENT_ORGANIZATION', 'government_organization', 'Government / Organization', 'Official government purchase order or embassy letter of guarantee.', 'company', NULL::numeric(5,2), NULL::text, 'active', ARRAY['company']::text[]),
    ('CUSTOM_OTHER', 'custom_other', 'Custom / Other', 'Custom or non-standard billing instructions defined in descriptive metadata.', 'company', NULL::numeric(5,2), NULL::text, 'active', ARRAY['company', 'travel_agent', 'group', 'individual']::text[])
) AS c(code, system_code, name, description, payer_kind, split_guest_percent, payment_terms, operational_status, applicable_profile_types)
WHERE NOT EXISTS (
  SELECT 1 FROM public.pms_billing_rules br
  WHERE br.restaurant_id = r.id AND (br.system_code = c.system_code OR br.code = c.code)
);

COMMENT ON COLUMN public.pms_billing_rules.system_code IS
  'Predefined NORU canonical billing rule code: none, company_master, individual_guest, split_billing, third_party, direct_bill_city_ledger, travel_agency, tour_operator, government_organization, custom_other.';
COMMENT ON COLUMN public.pms_billing_rules.is_system IS
  'True if rule belongs to NORU canonical catalogue. Property controls display name, default, active, and description, but not arbitrary system behavior.';
COMMENT ON COLUMN public.pms_billing_rules.operational_status IS
  'active | planned | intent_only | deprecated. Documents current engine capability (e.g. direct_bill_city_ledger is planned; split_billing is intent_only).';
COMMENT ON COLUMN public.pms_billing_rules.applicable_profile_types IS
  'Array of guest/business profile types where this rule may be chosen: company, travel_agent, group, individual.';
