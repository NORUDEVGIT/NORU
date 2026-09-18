-- PMS Property Setup Card 6 — Connectivity & Distribution, Phase 2: mapping.
-- Sequential after 0069. Dual-lane: byte-identical copies live in
--   supabase/migrations/0070_pms_card6_distribution_mapping.sql
--   drizzle/migrations/0070_pms_card6_distribution_mapping.sql
--
-- Extends the live Direct/OTA tables. Does not invent a parallel store.
-- Card 6 never lists, edits or deletes the seeded DIRECT channel.
-- Credentials stay on pms_integrations. These columns carry mapping only.
-- Applied to qcwptraosaudcbjasmul on 2026-09-18 after explicit user request.

ALTER TABLE public.pms_integrations DROP CONSTRAINT IF EXISTS pms_integrations_category_check;
ALTER TABLE public.pms_integrations ADD CONSTRAINT pms_integrations_category_check CHECK (
  category IN (
    'payments','sms','email','accounting','hospitality','government','distribution','other'
  )
);

ALTER TABLE public.distribution_channels
  ADD COLUMN IF NOT EXISTS integration_id uuid REFERENCES public.pms_integrations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'sandbox',
  ADD COLUMN IF NOT EXISTS mapping_status text NOT NULL DEFAULT 'pending';

ALTER TABLE public.distribution_channels DROP CONSTRAINT IF EXISTS distribution_channels_environment_check;
ALTER TABLE public.distribution_channels ADD CONSTRAINT distribution_channels_environment_check CHECK (
  environment IN ('sandbox','production')
);

ALTER TABLE public.distribution_channels DROP CONSTRAINT IF EXISTS distribution_channels_mapping_status_check;
ALTER TABLE public.distribution_channels ADD CONSTRAINT distribution_channels_mapping_status_check CHECK (
  mapping_status IN ('pending','attention','disabled')
);

CREATE INDEX IF NOT EXISTS distribution_channels_integration_idx
  ON public.distribution_channels(restaurant_id, integration_id);

COMMENT ON COLUMN public.distribution_channels.integration_id IS
  'Phase 1 integration this channel is mapped through. NULL for NORU Direct Booking.';
COMMENT ON COLUMN public.distribution_channels.mapping_status IS
  'Card 6 mapping completeness. Phase 2 never writes connected.';

ALTER TABLE public.distribution_room_mappings
  ADD COLUMN IF NOT EXISTS external_entity_id text;
ALTER TABLE public.distribution_rate_mappings
  ADD COLUMN IF NOT EXISTS external_entity_id text;

COMMENT ON COLUMN public.distribution_room_mappings.external_entity_id IS
  'Catalog id of the external room type. Not a free-typed name.';
COMMENT ON COLUMN public.distribution_rate_mappings.external_entity_id IS
  'Catalog id of the external rate plan. Not a free-typed name.';

CREATE TABLE IF NOT EXISTS public.distribution_meal_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL,
  meal_plan_id uuid NOT NULL,
  external_entity_id text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT distribution_meal_mappings_unique UNIQUE (channel_id, meal_plan_id),
  CONSTRAINT distribution_meal_mappings_channel_fk FOREIGN KEY (channel_id, restaurant_id)
    REFERENCES public.distribution_channels(id, restaurant_id) ON DELETE CASCADE,
  CONSTRAINT distribution_meal_mappings_plan_fk FOREIGN KEY (meal_plan_id, restaurant_id)
    REFERENCES public.pms_meal_plans(id, restaurant_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS distribution_meal_mappings_channel_idx
  ON public.distribution_meal_mappings(channel_id);

COMMENT ON TABLE public.distribution_meal_mappings IS
  'Card 6 meal-plan mapping. Deleting a channel removes these rows only.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.distribution_meal_mappings TO authenticated;
GRANT ALL ON public.distribution_meal_mappings TO service_role;
ALTER TABLE public.distribution_meal_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers read meal mappings" ON public.distribution_meal_mappings;
CREATE POLICY "Managers read meal mappings" ON public.distribution_meal_mappings
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers write meal mappings" ON public.distribution_meal_mappings;
CREATE POLICY "Managers write meal mappings" ON public.distribution_meal_mappings
  FOR ALL TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_distribution_meal_mappings_updated_at ON public.distribution_meal_mappings;
CREATE TRIGGER set_distribution_meal_mappings_updated_at
  BEFORE UPDATE ON public.distribution_meal_mappings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
