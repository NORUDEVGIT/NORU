-- Phase 5: Rate Plan owns live occupancy / extra-person fields.
-- Still NOT consumed by price_hotel_stay until Phase 6.

ALTER TABLE public.hotel_rate_plans
  ADD COLUMN IF NOT EXISTS included_occupancy integer NULL,
  ADD COLUMN IF NOT EXISTS extra_adult_rate numeric(12,2) NULL,
  ADD COLUMN IF NOT EXISTS extra_child_rate numeric(12,2) NULL;

COMMENT ON COLUMN public.hotel_rate_plans.included_occupancy IS
  'Persons included in base_rate before extra-person surcharge. NOT applied by price_hotel_stay until Phase 6.';
COMMENT ON COLUMN public.hotel_rate_plans.extra_adult_rate IS
  'Per-extra-adult amount. NOT applied by price_hotel_stay until Phase 6.';
COMMENT ON COLUMN public.hotel_rate_plans.extra_child_rate IS
  'Per-extra-child amount. NOT applied by price_hotel_stay until Phase 6.';

ALTER TABLE public.hotel_rate_plans
  DROP CONSTRAINT IF EXISTS hotel_rate_plans_included_occupancy_check;
ALTER TABLE public.hotel_rate_plans
  ADD CONSTRAINT hotel_rate_plans_included_occupancy_check
  CHECK (included_occupancy IS NULL OR included_occupancy >= 1);

ALTER TABLE public.hotel_rate_plans
  DROP CONSTRAINT IF EXISTS hotel_rate_plans_extra_adult_rate_check;
ALTER TABLE public.hotel_rate_plans
  ADD CONSTRAINT hotel_rate_plans_extra_adult_rate_check
  CHECK (extra_adult_rate IS NULL OR extra_adult_rate >= 0);

ALTER TABLE public.hotel_rate_plans
  DROP CONSTRAINT IF EXISTS hotel_rate_plans_extra_child_rate_check;
ALTER TABLE public.hotel_rate_plans
  ADD CONSTRAINT hotel_rate_plans_extra_child_rate_check
  CHECK (extra_child_rate IS NULL OR extra_child_rate >= 0);
