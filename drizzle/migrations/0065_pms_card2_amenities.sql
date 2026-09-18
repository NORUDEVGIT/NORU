-- PMS Property Setup Card 2 — Amenities schema (Phase 2).
--
-- Sequential after 0064. Dual-lane with
--   supabase/migrations/0065_pms_card2_amenities.sql
-- Additive catalog columns + hotel_room_amenity_overrides.
-- Does not flatten type amenities onto hotel_rooms.
-- Does not touch hotel_rooms.room_features.
-- No availability, quantity, default_room_type, core-protected flag.
-- No inventory or pricing behavior.
-- No pms_card1_live. No SECURITY DEFINER. No sample seed. No types.ts regen.
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY AFTER MERGE — wait for PM approval of this SQL before apply.
-- Afrobel applies live after merge.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f drizzle/migrations/0065_pms_card2_amenities.sql
--   or the project's usual drizzle / Supabase migration apply path.
--   Do not run both copies against the same database.
--
-- Preflight (do not auto-rewrite colliding codes):
--   SELECT restaurant_id, lower(btrim(code)) AS code_key, count(*)
--   FROM public.room_amenities
--   WHERE code IS NOT NULL AND btrim(code) <> ''
--   GROUP BY 1, 2
--   HAVING count(*) > 1;
--   If any rows, unique index creation fails. Resolve duplicates first.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.hotel_room_amenity_overrides;
--   DROP INDEX IF EXISTS public.room_amenities_restaurant_code_unique;
--   ALTER TABLE public.room_amenities
--     DROP COLUMN IF EXISTS description,
--     DROP COLUMN IF EXISTS icon,
--     DROP COLUMN IF EXISTS complimentary,
--     DROP COLUMN IF EXISTS display_to_guest,
--     DROP COLUMN IF EXISTS internal_only;

-- 1. Catalog fields (existing name/code/category/active unchanged).
ALTER TABLE public.room_amenities
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS icon text,
  ADD COLUMN IF NOT EXISTS complimentary boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS display_to_guest boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS internal_only boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.room_amenities.description IS
  'Optional amenity description. Card 2 catalogue.';
COMMENT ON COLUMN public.room_amenities.icon IS
  'Optional short icon key (e.g. lucide name). Not a storage-path contract.';
COMMENT ON COLUMN public.room_amenities.complimentary IS
  'true = complimentary; false = chargeable. No pricing columns in 0065.';
COMMENT ON COLUMN public.room_amenities.display_to_guest IS
  'Whether the amenity may be shown to guests.';
COMMENT ON COLUMN public.room_amenities.internal_only IS
  'Internal catalogue flag. Independent of display_to_guest.';

-- 2. Partial unique code per property. Blank/null codes are not unique.
-- Case-insensitive: colliding codes after lower(btrim(code)) fail this step.
CREATE UNIQUE INDEX IF NOT EXISTS room_amenities_restaurant_code_unique
  ON public.room_amenities (restaurant_id, lower(btrim(code)))
  WHERE code IS NOT NULL AND btrim(code) <> '';

-- 3. Room-level add/remove overrides. Same-tenant composite FKs.
-- Requires hotel_rooms_id_restaurant_unique (0064) and
-- room_amenities_id_restaurant_unique (0010).
CREATE TABLE IF NOT EXISTS public.hotel_room_amenity_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  room_id uuid NOT NULL,
  amenity_id uuid NOT NULL,
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_room_amenity_overrides_kind_check CHECK (kind IN ('add', 'remove')),
  CONSTRAINT hotel_room_amenity_overrides_unique UNIQUE (room_id, amenity_id),
  CONSTRAINT hotel_room_amenity_overrides_room_fk FOREIGN KEY (room_id, restaurant_id)
    REFERENCES public.hotel_rooms(id, restaurant_id) ON DELETE CASCADE,
  CONSTRAINT hotel_room_amenity_overrides_amenity_fk FOREIGN KEY (amenity_id, restaurant_id)
    REFERENCES public.room_amenities(id, restaurant_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS hotel_room_amenity_overrides_restaurant_idx
  ON public.hotel_room_amenity_overrides(restaurant_id);
CREATE INDEX IF NOT EXISTS hotel_room_amenity_overrides_amenity_idx
  ON public.hotel_room_amenity_overrides(amenity_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hotel_room_amenity_overrides TO authenticated;
GRANT ALL ON public.hotel_room_amenity_overrides TO service_role;
ALTER TABLE public.hotel_room_amenity_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read room amenity overrides" ON public.hotel_room_amenity_overrides;
CREATE POLICY "Members read room amenity overrides" ON public.hotel_room_amenity_overrides
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert room amenity overrides" ON public.hotel_room_amenity_overrides;
CREATE POLICY "Managers insert room amenity overrides" ON public.hotel_room_amenity_overrides
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update room amenity overrides" ON public.hotel_room_amenity_overrides;
CREATE POLICY "Managers update room amenity overrides" ON public.hotel_room_amenity_overrides
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete room amenity overrides" ON public.hotel_room_amenity_overrides;
CREATE POLICY "Managers delete room amenity overrides" ON public.hotel_room_amenity_overrides
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

COMMENT ON TABLE public.hotel_room_amenity_overrides IS
  'Room-specific amenity add/remove vs room_type_amenities. Effective set = type mappings plus add minus remove. Reset to type defaults = DELETE rows for that room_id. Not hotel_rooms.room_features.';
COMMENT ON COLUMN public.hotel_room_amenity_overrides.kind IS
  'add = extra amenity on this room; remove = hide a type-default amenity on this room.';
