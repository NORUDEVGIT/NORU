-- Migration 0126: Expand PMS Tax Exemption Rule reason categories and add custom_reason
-- Dual-lane with drizzle/migrations/0126_pms_card3_taxes_exemption_reasons.sql
-- Reason Category dropdown options:
-- Government, Diplomatic, International Organization, Non-Profit / NGO,
-- Tax Status, Corporate / Business, Guest Status, Long Stay, Group / Event,
-- Promotional, Management, Legal / Regulatory, Other / Custom

ALTER TABLE public.pms_tax_exemption_rules
  ADD COLUMN IF NOT EXISTS custom_reason text;

COMMENT ON COLUMN public.pms_tax_exemption_rules.custom_reason IS
  'Custom reason entered by the user when reason_category is other.';

ALTER TABLE public.pms_tax_exemption_rules
  DROP CONSTRAINT IF EXISTS pms_tax_exemption_rules_reason_check;

ALTER TABLE public.pms_tax_exemption_rules
  ADD CONSTRAINT pms_tax_exemption_rules_reason_check CHECK (
    reason_category IN (
      'government',
      'diplomatic',
      'international_organization',
      'nonprofit',
      'tax_status',
      'corporate_business',
      'guest_status',
      'long_stay',
      'group_event',
      'promotional',
      'management',
      'legal_regulatory',
      'other'
    )
  );

ALTER TABLE public.pms_tax_exemption_rules
  DROP CONSTRAINT IF EXISTS pms_tax_exemption_rules_custom_reason_check;

ALTER TABLE public.pms_tax_exemption_rules
  ADD CONSTRAINT pms_tax_exemption_rules_custom_reason_check CHECK (
    reason_category IS DISTINCT FROM 'other'
    OR btrim(coalesce(custom_reason, '')) <> ''
    OR custom_reason IS NULL
  );
