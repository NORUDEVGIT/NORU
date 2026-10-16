-- PMS Card 3 — Company Creation Step 3: Billing & Credit Foundation
-- Dual-lane with drizzle/migrations/0121_pms_card3_company_billing_credit.sql
-- Forward-additive schema additions to public.guest_account_masters.
-- Reuses existing credit_account_enabled, credit_limit_amount, payment_terms, billing_instruction.
-- No second company table, no AR/City Ledger engine, no folio charge-routing matrix, no tax engine changes.

ALTER TABLE public.guest_account_masters
  ADD COLUMN IF NOT EXISTS default_billing_rule_id uuid,
  ADD COLUMN IF NOT EXISTS default_payment_method_id uuid,
  ADD COLUMN IF NOT EXISTS billing_currency_code text,
  ADD COLUMN IF NOT EXISTS payment_timing text,
  ADD COLUMN IF NOT EXISTS credit_days integer,
  ADD COLUMN IF NOT EXISTS credit_status text,
  ADD COLUMN IF NOT EXISTS tax_exempt boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tax_exemption_rule_id uuid,
  ADD COLUMN IF NOT EXISTS tax_exemption_certificate_number text,
  ADD COLUMN IF NOT EXISTS tax_exemption_valid_to date;

-- Foreign Keys (ON DELETE SET NULL)
ALTER TABLE public.guest_account_masters
  DROP CONSTRAINT IF EXISTS guest_account_masters_default_billing_rule_fk;
ALTER TABLE public.guest_account_masters
  ADD CONSTRAINT guest_account_masters_default_billing_rule_fk
  FOREIGN KEY (default_billing_rule_id)
  REFERENCES public.pms_billing_rules(id)
  ON DELETE SET NULL;

ALTER TABLE public.guest_account_masters
  DROP CONSTRAINT IF EXISTS guest_account_masters_default_payment_method_fk;
ALTER TABLE public.guest_account_masters
  ADD CONSTRAINT guest_account_masters_default_payment_method_fk
  FOREIGN KEY (default_payment_method_id)
  REFERENCES public.pms_payment_methods(id)
  ON DELETE SET NULL;

ALTER TABLE public.guest_account_masters
  DROP CONSTRAINT IF EXISTS guest_account_masters_tax_exemption_rule_fk;
ALTER TABLE public.guest_account_masters
  ADD CONSTRAINT guest_account_masters_tax_exemption_rule_fk
  FOREIGN KEY (tax_exemption_rule_id)
  REFERENCES public.pms_tax_exemption_rules(id)
  ON DELETE SET NULL;

-- Domain Checks
ALTER TABLE public.guest_account_masters
  DROP CONSTRAINT IF EXISTS guest_account_masters_payment_timing_check;
ALTER TABLE public.guest_account_masters
  ADD CONSTRAINT guest_account_masters_payment_timing_check
  CHECK (payment_timing IS NULL OR payment_timing IN ('due_on_arrival', 'due_on_departure', 'prepaid', 'credit_terms'));

ALTER TABLE public.guest_account_masters
  DROP CONSTRAINT IF EXISTS guest_account_masters_credit_status_check;
ALTER TABLE public.guest_account_masters
  ADD CONSTRAINT guest_account_masters_credit_status_check
  CHECK (credit_status IS NULL OR credit_status IN ('pending_approval', 'approved', 'suspended'));

ALTER TABLE public.guest_account_masters
  DROP CONSTRAINT IF EXISTS guest_account_masters_credit_days_check;
ALTER TABLE public.guest_account_masters
  ADD CONSTRAINT guest_account_masters_credit_days_check
  CHECK (credit_days IS NULL OR (credit_days >= 0 AND credit_days <= 365));

ALTER TABLE public.guest_account_masters
  DROP CONSTRAINT IF EXISTS guest_account_masters_credit_limit_amount_check;
ALTER TABLE public.guest_account_masters
  ADD CONSTRAINT guest_account_masters_credit_limit_amount_check
  CHECK (credit_limit_amount IS NULL OR credit_limit_amount >= 0);

-- Indexes
CREATE INDEX IF NOT EXISTS guest_account_masters_default_billing_rule_idx
  ON public.guest_account_masters(restaurant_id, default_billing_rule_id);

CREATE INDEX IF NOT EXISTS guest_account_masters_default_payment_method_idx
  ON public.guest_account_masters(restaurant_id, default_payment_method_id);

CREATE INDEX IF NOT EXISTS guest_account_masters_tax_exemption_rule_idx
  ON public.guest_account_masters(restaurant_id, tax_exemption_rule_id);

CREATE INDEX IF NOT EXISTS guest_account_masters_credit_status_idx
  ON public.guest_account_masters(restaurant_id, credit_status);

-- Documentation
COMMENT ON COLUMN public.guest_account_masters.default_billing_rule_id IS
  'Default billing rule for company. Not yet driving live folio routing in this phase.';
COMMENT ON COLUMN public.guest_account_masters.default_payment_method_id IS
  'Preferred settlement method. Not a forced cashiering tender.';
COMMENT ON COLUMN public.guest_account_masters.billing_currency_code IS
  'Preferred currency for company billing context. Distinct from contracted currency.';
COMMENT ON COLUMN public.guest_account_masters.payment_timing IS
  'Canonical timing: due_on_arrival, due_on_departure, prepaid, credit_terms.';
COMMENT ON COLUMN public.guest_account_masters.credit_days IS
  'Settlement window in calendar days when credit facility is enabled.';
COMMENT ON COLUMN public.guest_account_masters.credit_status IS
  'Workflow state for corporate credit: pending_approval, approved, suspended.';
COMMENT ON COLUMN public.guest_account_masters.tax_exempt IS
  'Boolean flag indicating tax exemption status. Does not auto-suppress VAT yet.';
COMMENT ON COLUMN public.guest_account_masters.tax_exemption_rule_id IS
  'Reference to Settings Card 3 pms_tax_exemption_rules.';
COMMENT ON COLUMN public.guest_account_masters.tax_exemption_certificate_number IS
  'Structured exemption certificate or reference number.';
COMMENT ON COLUMN public.guest_account_masters.tax_exemption_valid_to IS
  'Expiry date for company tax exemption certificate if applicable.';
