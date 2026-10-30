-- Card 2 Room Type pricing defaults (setup/reference only).
-- NOT READ DIRECTLY BY price_hotel_stay.

ALTER TABLE public.room_types
  ADD COLUMN IF NOT EXISTS base_nightly_rate numeric(12,2) NULL,
  ADD COLUMN IF NOT EXISTS extra_adult_rate_default numeric(12,2) NULL,
  ADD COLUMN IF NOT EXISTS extra_child_rate_default numeric(12,2) NULL;

COMMENT ON COLUMN public.room_types.base_nightly_rate IS
  'SETUP DEFAULT ONLY. NOT READ DIRECTLY BY price_hotel_stay.';
COMMENT ON COLUMN public.room_types.extra_adult_rate_default IS
  'SETUP DEFAULT ONLY. NOT READ DIRECTLY BY price_hotel_stay.';
COMMENT ON COLUMN public.room_types.extra_child_rate_default IS
  'SETUP DEFAULT ONLY. NOT READ DIRECTLY BY price_hotel_stay.';
COMMENT ON COLUMN public.room_types.standard_occupancy IS
  'Included occupancy for Rate Plan base (setup default). Hard capacity remains max_occupancy. NOT READ DIRECTLY BY price_hotel_stay for surcharge until Phase 6.';

ALTER TABLE public.room_types
  DROP CONSTRAINT IF EXISTS room_types_base_nightly_rate_check;
ALTER TABLE public.room_types
  ADD CONSTRAINT room_types_base_nightly_rate_check
  CHECK (base_nightly_rate IS NULL OR base_nightly_rate >= 0);

ALTER TABLE public.room_types
  DROP CONSTRAINT IF EXISTS room_types_extra_adult_rate_default_check;
ALTER TABLE public.room_types
  ADD CONSTRAINT room_types_extra_adult_rate_default_check
  CHECK (extra_adult_rate_default IS NULL OR extra_adult_rate_default >= 0);

ALTER TABLE public.room_types
  DROP CONSTRAINT IF EXISTS room_types_extra_child_rate_default_check;
ALTER TABLE public.room_types
  ADD CONSTRAINT room_types_extra_child_rate_default_check
  CHECK (extra_child_rate_default IS NULL OR extra_child_rate_default >= 0);
