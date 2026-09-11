-- Issue #22 — Restaurant Management property-level tax/VAT + optional service.
--
-- Additive only. RM-owned settings live on public.restaurants (same pattern as
-- timezone / currency_code). Order totals snapshot the rates at place time so
-- later settings changes affect NEW orders only. orders.total remains payable.
--
-- Does NOT create, alter, or write Standalone POS pos_* / pos_settings.
-- Does NOT change package entitlements or tenant approval.
-- Does NOT add fiscal printers, tips, discounts, or a tax drawer.
-- Historical orders keep NULL snapshots and are treated as legacy price × qty.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f drizzle/migrations/0038_rm_tax_service.sql
--   or the project's usual drizzle / Supabase migration apply path.
--
-- Rollback:
--   ALTER TABLE public.orders
--     DROP COLUMN IF EXISTS merchandise_subtotal,
--     DROP COLUMN IF EXISTS tax_amount,
--     DROP COLUMN IF EXISTS service_amount,
--     DROP COLUMN IF EXISTS tax_rate_snapshot,
--     DROP COLUMN IF EXISTS tax_inclusive_snapshot,
--     DROP COLUMN IF EXISTS service_enabled_snapshot,
--     DROP COLUMN IF EXISTS service_rate_snapshot;
--   ALTER TABLE public.restaurants
--     DROP COLUMN IF EXISTS tax_rate,
--     DROP COLUMN IF EXISTS tax_inclusive,
--     DROP COLUMN IF EXISTS service_enabled,
--     DROP COLUMN IF EXISTS service_rate;
--   REVOKE SELECT (tax_rate, tax_inclusive, service_enabled, service_rate)
--     ON public.restaurants FROM anon, authenticated;

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS tax_rate numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_inclusive boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS service_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS service_rate numeric(5,2) NOT NULL DEFAULT 0;

ALTER TABLE public.restaurants
  DROP CONSTRAINT IF EXISTS restaurants_tax_rate_check;
ALTER TABLE public.restaurants
  ADD CONSTRAINT restaurants_tax_rate_check
  CHECK (tax_rate >= 0 AND tax_rate <= 100);

ALTER TABLE public.restaurants
  DROP CONSTRAINT IF EXISTS restaurants_service_rate_check;
ALTER TABLE public.restaurants
  ADD CONSTRAINT restaurants_service_rate_check
  CHECK (service_rate >= 0 AND service_rate <= 100);

COMMENT ON COLUMN public.restaurants.tax_rate IS
  'RM property tax/VAT rate 0–100. Not Standalone POS pos_settings.';
COMMENT ON COLUMN public.restaurants.tax_inclusive IS
  'When true, catalog prices include tax (extract, do not add again).';
COMMENT ON COLUMN public.restaurants.service_enabled IS
  'Optional service charge. Off by default.';
COMMENT ON COLUMN public.restaurants.service_rate IS
  'Service % of tax-exclusive merchandise net. Used only when service_enabled.';

-- Public QR preview and staff tills need to read the live rates.
GRANT SELECT (tax_rate, tax_inclusive, service_enabled, service_rate)
  ON public.restaurants TO anon, authenticated;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS merchandise_subtotal numeric(10,2),
  ADD COLUMN IF NOT EXISTS tax_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS service_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS tax_rate_snapshot numeric(5,2),
  ADD COLUMN IF NOT EXISTS tax_inclusive_snapshot boolean,
  ADD COLUMN IF NOT EXISTS service_enabled_snapshot boolean,
  ADD COLUMN IF NOT EXISTS service_rate_snapshot numeric(5,2);

COMMENT ON COLUMN public.orders.merchandise_subtotal IS
  'Catalog Σ(price×qty) at place time. NULL = pre-tax-service legacy order.';
COMMENT ON COLUMN public.orders.tax_amount IS
  'Tax snapshotted at place time. Inclusive = extracted, exclusive = added.';
COMMENT ON COLUMN public.orders.service_amount IS
  'Service snapshotted at place time. NULL = pre-tax-service legacy order.';
COMMENT ON COLUMN public.orders.total IS
  'Payable: exclusive merchandise+tax+service; inclusive merchandise+service.';
