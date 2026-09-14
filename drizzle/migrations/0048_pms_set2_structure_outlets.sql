-- PMS-SET2 — Structure masters, room FKs, amenity extras, outlets (Issue #62).
--
-- Sequential after 0047. Dual-lane with
--   supabase/migrations/0048_pms_set2_structure_outlets.sql
-- Additive only. No privileged functions. No seed hotel sample data.
-- RLS on new tables matches rooms: members read; owner/manager write.
--
-- IN THE PR ONLY — Abel authorised apply 2026-09-14; Afrobel applies live
-- from this SQL. Do not apply to production from an agent.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f drizzle/migrations/0048_pms_set2_structure_outlets.sql
--   or the project's usual drizzle / Supabase migration apply path.
--
-- Rollback:
--   ALTER TABLE public.hotel_rooms
--     DROP CONSTRAINT IF EXISTS hotel_rooms_building_fk,
--     DROP CONSTRAINT IF EXISTS hotel_rooms_floor_fk,
--     DROP CONSTRAINT IF EXISTS hotel_rooms_wing_fk,
--     DROP COLUMN IF EXISTS building_id,
--     DROP COLUMN IF EXISTS floor_id,
--     DROP COLUMN IF EXISTS wing_id;
--   ALTER TABLE public.room_amenities
--     DROP COLUMN IF EXISTS code,
--     DROP COLUMN IF EXISTS category;
--   ALTER TABLE public.restaurants
--     DROP COLUMN IF EXISTS single_building_mode;
--   DROP TABLE IF EXISTS public.pms_outlets;
--   DROP TABLE IF EXISTS public.hotel_wings;
--   DROP TABLE IF EXISTS public.hotel_floors;
--   DROP TABLE IF EXISTS public.hotel_buildings;

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS single_building_mode boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.restaurants.single_building_mode IS
  'PMS-SET2 single-building assist. When true, Settings ensures Main building + Floor 1.';

GRANT SELECT (single_building_mode) ON public.restaurants TO authenticated;

CREATE TABLE IF NOT EXISTS public.hotel_buildings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_buildings_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT hotel_buildings_id_restaurant_unique UNIQUE (id, restaurant_id)
);

CREATE INDEX IF NOT EXISTS hotel_buildings_restaurant_idx
  ON public.hotel_buildings(restaurant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hotel_buildings TO authenticated;
GRANT ALL ON public.hotel_buildings TO service_role;
ALTER TABLE public.hotel_buildings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read buildings" ON public.hotel_buildings;
CREATE POLICY "Members read buildings" ON public.hotel_buildings
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert buildings" ON public.hotel_buildings;
CREATE POLICY "Managers insert buildings" ON public.hotel_buildings
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update buildings" ON public.hotel_buildings;
CREATE POLICY "Managers update buildings" ON public.hotel_buildings
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete buildings" ON public.hotel_buildings;
CREATE POLICY "Managers delete buildings" ON public.hotel_buildings
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_hotel_buildings_updated_at ON public.hotel_buildings;
CREATE TRIGGER set_hotel_buildings_updated_at BEFORE UPDATE ON public.hotel_buildings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.hotel_floors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  building_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_floors_code_unique UNIQUE (restaurant_id, building_id, code),
  CONSTRAINT hotel_floors_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT hotel_floors_building_fk FOREIGN KEY (building_id, restaurant_id)
    REFERENCES public.hotel_buildings(id, restaurant_id)
);

CREATE INDEX IF NOT EXISTS hotel_floors_restaurant_idx
  ON public.hotel_floors(restaurant_id);
CREATE INDEX IF NOT EXISTS hotel_floors_building_idx
  ON public.hotel_floors(building_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hotel_floors TO authenticated;
GRANT ALL ON public.hotel_floors TO service_role;
ALTER TABLE public.hotel_floors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read floors" ON public.hotel_floors;
CREATE POLICY "Members read floors" ON public.hotel_floors
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert floors" ON public.hotel_floors;
CREATE POLICY "Managers insert floors" ON public.hotel_floors
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update floors" ON public.hotel_floors;
CREATE POLICY "Managers update floors" ON public.hotel_floors
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete floors" ON public.hotel_floors;
CREATE POLICY "Managers delete floors" ON public.hotel_floors
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_hotel_floors_updated_at ON public.hotel_floors;
CREATE TRIGGER set_hotel_floors_updated_at BEFORE UPDATE ON public.hotel_floors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.hotel_wings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  parent_building_id uuid,
  parent_floor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_wings_name_unique UNIQUE (restaurant_id, name),
  CONSTRAINT hotel_wings_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT hotel_wings_parent_xor CHECK (
    (parent_building_id IS NOT NULL AND parent_floor_id IS NULL)
    OR
    (parent_building_id IS NULL AND parent_floor_id IS NOT NULL)
  ),
  CONSTRAINT hotel_wings_building_fk FOREIGN KEY (parent_building_id, restaurant_id)
    REFERENCES public.hotel_buildings(id, restaurant_id),
  CONSTRAINT hotel_wings_floor_fk FOREIGN KEY (parent_floor_id, restaurant_id)
    REFERENCES public.hotel_floors(id, restaurant_id)
);

CREATE INDEX IF NOT EXISTS hotel_wings_restaurant_idx
  ON public.hotel_wings(restaurant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hotel_wings TO authenticated;
GRANT ALL ON public.hotel_wings TO service_role;
ALTER TABLE public.hotel_wings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read wings" ON public.hotel_wings;
CREATE POLICY "Members read wings" ON public.hotel_wings
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert wings" ON public.hotel_wings;
CREATE POLICY "Managers insert wings" ON public.hotel_wings
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update wings" ON public.hotel_wings;
CREATE POLICY "Managers update wings" ON public.hotel_wings
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete wings" ON public.hotel_wings;
CREATE POLICY "Managers delete wings" ON public.hotel_wings
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_hotel_wings_updated_at ON public.hotel_wings;
CREATE TRIGGER set_hotel_wings_updated_at BEFORE UPDATE ON public.hotel_wings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.pms_outlets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  type text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  department_text text,
  default_posting_label text,
  is_default_rooms boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_outlets_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_outlets_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_outlets_type_check CHECK (type IN ('rooms', 'restaurant', 'bar', 'spa', 'other')),
  CONSTRAINT pms_outlets_default_rooms_type CHECK (NOT is_default_rooms OR type = 'rooms')
);

CREATE INDEX IF NOT EXISTS pms_outlets_restaurant_idx
  ON public.pms_outlets(restaurant_id);
CREATE UNIQUE INDEX IF NOT EXISTS pms_outlets_one_default_rooms
  ON public.pms_outlets (restaurant_id)
  WHERE is_default_rooms;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pms_outlets TO authenticated;
GRANT ALL ON public.pms_outlets TO service_role;
ALTER TABLE public.pms_outlets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read outlets" ON public.pms_outlets;
CREATE POLICY "Members read outlets" ON public.pms_outlets
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert outlets" ON public.pms_outlets;
CREATE POLICY "Managers insert outlets" ON public.pms_outlets
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update outlets" ON public.pms_outlets;
CREATE POLICY "Managers update outlets" ON public.pms_outlets
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete outlets" ON public.pms_outlets;
CREATE POLICY "Managers delete outlets" ON public.pms_outlets
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_outlets_updated_at ON public.pms_outlets;
CREATE TRIGGER set_pms_outlets_updated_at BEFORE UPDATE ON public.pms_outlets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.hotel_rooms
  ADD COLUMN IF NOT EXISTS building_id uuid,
  ADD COLUMN IF NOT EXISTS floor_id uuid,
  ADD COLUMN IF NOT EXISTS wing_id uuid;

ALTER TABLE public.hotel_rooms
  DROP CONSTRAINT IF EXISTS hotel_rooms_building_fk;
ALTER TABLE public.hotel_rooms
  ADD CONSTRAINT hotel_rooms_building_fk FOREIGN KEY (building_id, restaurant_id)
    REFERENCES public.hotel_buildings(id, restaurant_id);

ALTER TABLE public.hotel_rooms
  DROP CONSTRAINT IF EXISTS hotel_rooms_floor_fk;
ALTER TABLE public.hotel_rooms
  ADD CONSTRAINT hotel_rooms_floor_fk FOREIGN KEY (floor_id, restaurant_id)
    REFERENCES public.hotel_floors(id, restaurant_id);

ALTER TABLE public.hotel_rooms
  DROP CONSTRAINT IF EXISTS hotel_rooms_wing_fk;
ALTER TABLE public.hotel_rooms
  ADD CONSTRAINT hotel_rooms_wing_fk FOREIGN KEY (wing_id, restaurant_id)
    REFERENCES public.hotel_wings(id, restaurant_id);

CREATE INDEX IF NOT EXISTS hotel_rooms_building_idx ON public.hotel_rooms(building_id);
CREATE INDEX IF NOT EXISTS hotel_rooms_floor_idx ON public.hotel_rooms(floor_id);
CREATE INDEX IF NOT EXISTS hotel_rooms_wing_idx ON public.hotel_rooms(wing_id);

ALTER TABLE public.room_amenities
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS category text;

COMMENT ON TABLE public.hotel_buildings IS
  'PMS-SET2 building masters. hotel_rooms.building text is kept and synced from name.';
COMMENT ON TABLE public.hotel_floors IS
  'PMS-SET2 floor masters. hotel_rooms.floor text is kept and synced from name.';
COMMENT ON TABLE public.hotel_wings IS
  'PMS-SET2 wing masters. Parent is building XOR floor.';
COMMENT ON TABLE public.pms_outlets IS
  'PMS-SET2 outlet masters only. Folio posting is not rewritten in this wave.';
COMMENT ON COLUMN public.room_amenities.code IS
  'PMS-SET2 optional amenity code. Catalogue CRUD lives in Settings.';
COMMENT ON COLUMN public.room_amenities.category IS
  'PMS-SET2 optional amenity category.';
