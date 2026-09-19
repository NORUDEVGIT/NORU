-- PMS Property Setup Card 3 — Revenue & Commercial Rules schema (Phase 8).
--
-- Sequential after 0075. Dual-lane: byte-identical copies live in
--   supabase/migrations/0076_pms_card3_revenue_commercial_rules.sql
--   drizzle/migrations/0076_pms_card3_revenue_commercial_rules.sql
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY AFTER MERGE — wait for PM approval of this SQL before apply.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f drizzle/migrations/0076_pms_card3_revenue_commercial_rules.sql
--   or the project's usual drizzle / Supabase migration apply path.
--   Do not run both copies against the same database.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.pms_season_room_types;
--   DROP TABLE IF EXISTS public.pms_promotion_room_types;
--   DROP TABLE IF EXISTS public.pms_commercial_restriction_room_types;
--   DROP TABLE IF EXISTS public.pms_seasons;
--   DROP TABLE IF EXISTS public.pms_promotions;
--   DROP TABLE IF EXISTS public.pms_commercial_restrictions;
--
-- Scope fence — this migration explicitly does NOT touch:
--   hotel_rate_restrictions, hotel_rate_calendar, hotel_rate_plans, price_hotel_stay
--   pms_inventory_rules / Card 2 overbooking (inherited read-only in the API)
--   restaurants.pms_distribution_channel_posture / SET6
--   hotel_reservations snapshots, booking engine, distribution engine
--   Card 1, Card 2 room_types definition (FK only), Phases 1–7 tables
--   restaurants.pms_property_setup_status or any programme / go-live status
--   no new audit table — reuse public.restaurant_staff_audit_log
--
-- Empty room-type mapping means all types as a setup hint, not availability.
-- No seed. No backfill from SET3 restrictions. No types.ts regen.

-- 1. Commercial restrictions (setup catalogue, not hotel_rate_restrictions).
CREATE TABLE IF NOT EXISTS public.pms_commercial_restrictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  restriction_kind text NOT NULL,
  min_stay_nights int,
  valid_from date NOT NULL,
  valid_to date NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_commercial_restrictions_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_commercial_restrictions_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_commercial_restrictions_code_check CHECK (code ~ '^[A-Z0-9_]{1,20}$'),
  CONSTRAINT pms_commercial_restrictions_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT pms_commercial_restrictions_kind_check CHECK (
    restriction_kind IN ('min_stay', 'stop_sell', 'closed_to_arrival', 'closed_to_departure')
  ),
  CONSTRAINT pms_commercial_restrictions_min_stay_check CHECK (
    (restriction_kind = 'min_stay' AND min_stay_nights IS NOT NULL AND min_stay_nights >= 1)
    OR (restriction_kind <> 'min_stay' AND min_stay_nights IS NULL)
  ),
  CONSTRAINT pms_commercial_restrictions_dates_check CHECK (valid_to >= valid_from),
  CONSTRAINT pms_commercial_restrictions_description_check CHECK (
    description IS NULL OR length(btrim(description)) BETWEEN 1 AND 500
  )
);

CREATE INDEX IF NOT EXISTS pms_commercial_restrictions_restaurant_idx
  ON public.pms_commercial_restrictions(restaurant_id, valid_from, valid_to);

COMMENT ON TABLE public.pms_commercial_restrictions IS
  'Card 3 commercial restriction catalogue. Setup only. Does not replace hotel_rate_restrictions or price_hotel_stay.';
COMMENT ON COLUMN public.pms_commercial_restrictions.min_stay_nights IS
  'Required only when restriction_kind = min_stay. Not enforced by the booking engine in Phase 8.';

CREATE TABLE IF NOT EXISTS public.pms_commercial_restriction_room_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  restriction_id uuid NOT NULL,
  room_type_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_commercial_restriction_room_types_mapping_unique UNIQUE (restriction_id, room_type_id),
  CONSTRAINT pms_commercial_restriction_room_types_restriction_fk
    FOREIGN KEY (restriction_id, restaurant_id)
    REFERENCES public.pms_commercial_restrictions (id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT pms_commercial_restriction_room_types_room_type_fk
    FOREIGN KEY (room_type_id, restaurant_id)
    REFERENCES public.room_types (id, restaurant_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS pms_commercial_restriction_room_types_restaurant_idx
  ON public.pms_commercial_restriction_room_types(restaurant_id, restriction_id);

-- 2. Promotions. Setup classification only; not a discount engine.
CREATE TABLE IF NOT EXISTS public.pms_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  promo_kind text NOT NULL,
  promo_value numeric(12,2) NOT NULL DEFAULT 0,
  valid_from date NOT NULL,
  valid_to date NOT NULL,
  conditions text,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_promotions_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_promotions_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_promotions_code_check CHECK (code ~ '^[A-Z0-9_]{1,20}$'),
  CONSTRAINT pms_promotions_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT pms_promotions_kind_check CHECK (promo_kind IN ('percent', 'fixed', 'free_night')),
  CONSTRAINT pms_promotions_value_check CHECK (
    promo_value >= 0
    AND (
      (promo_kind = 'percent' AND promo_value <= 100)
      OR (promo_kind = 'fixed')
      OR (promo_kind = 'free_night' AND promo_value = trunc(promo_value) AND promo_value >= 1)
    )
  ),
  CONSTRAINT pms_promotions_dates_check CHECK (valid_to >= valid_from),
  CONSTRAINT pms_promotions_conditions_check CHECK (
    conditions IS NULL OR length(btrim(conditions)) BETWEEN 1 AND 500
  ),
  CONSTRAINT pms_promotions_description_check CHECK (
    description IS NULL OR length(btrim(description)) BETWEEN 1 AND 500
  )
);

CREATE INDEX IF NOT EXISTS pms_promotions_restaurant_idx
  ON public.pms_promotions(restaurant_id, valid_from, valid_to);

COMMENT ON TABLE public.pms_promotions IS
  'Card 3 promotion catalogue. Setup only. Not RM/POS discounts and not a quote modifier.';

CREATE TABLE IF NOT EXISTS public.pms_promotion_room_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  promotion_id uuid NOT NULL,
  room_type_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_promotion_room_types_mapping_unique UNIQUE (promotion_id, room_type_id),
  CONSTRAINT pms_promotion_room_types_promotion_fk
    FOREIGN KEY (promotion_id, restaurant_id)
    REFERENCES public.pms_promotions (id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT pms_promotion_room_types_room_type_fk
    FOREIGN KEY (room_type_id, restaurant_id)
    REFERENCES public.room_types (id, restaurant_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS pms_promotion_room_types_restaurant_idx
  ON public.pms_promotion_room_types(restaurant_id, promotion_id);

-- 3. Named seasons. Not hotel_rate_calendar.
CREATE TABLE IF NOT EXISTS public.pms_seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  season_type text NOT NULL,
  valid_from date NOT NULL,
  valid_to date NOT NULL,
  rate_adjustment_percent numeric(5,2),
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_seasons_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT pms_seasons_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_seasons_code_check CHECK (code ~ '^[A-Z0-9_]{1,20}$'),
  CONSTRAINT pms_seasons_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT pms_seasons_type_check CHECK (season_type IN ('high', 'shoulder', 'low', 'custom')),
  CONSTRAINT pms_seasons_dates_check CHECK (valid_to >= valid_from),
  CONSTRAINT pms_seasons_adjustment_check CHECK (
    rate_adjustment_percent IS NULL
    OR (rate_adjustment_percent >= -100 AND rate_adjustment_percent <= 100)
  ),
  CONSTRAINT pms_seasons_description_check CHECK (
    description IS NULL OR length(btrim(description)) BETWEEN 1 AND 500
  )
);

CREATE INDEX IF NOT EXISTS pms_seasons_restaurant_idx
  ON public.pms_seasons(restaurant_id, valid_from, valid_to);

COMMENT ON TABLE public.pms_seasons IS
  'Card 3 named-season catalogue. Setup hint only. Does not write hotel_rate_calendar.';
COMMENT ON COLUMN public.pms_seasons.rate_adjustment_percent IS
  'Optional setup hint. Not a nightly override and not applied by price_hotel_stay in Phase 8.';

CREATE TABLE IF NOT EXISTS public.pms_season_room_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  season_id uuid NOT NULL,
  room_type_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_season_room_types_mapping_unique UNIQUE (season_id, room_type_id),
  CONSTRAINT pms_season_room_types_season_fk
    FOREIGN KEY (season_id, restaurant_id)
    REFERENCES public.pms_seasons (id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT pms_season_room_types_room_type_fk
    FOREIGN KEY (room_type_id, restaurant_id)
    REFERENCES public.room_types (id, restaurant_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS pms_season_room_types_restaurant_idx
  ON public.pms_season_room_types(restaurant_id, season_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.pms_commercial_restrictions,
  public.pms_commercial_restriction_room_types,
  public.pms_promotions,
  public.pms_promotion_room_types,
  public.pms_seasons,
  public.pms_season_room_types
  TO authenticated;
GRANT ALL ON
  public.pms_commercial_restrictions,
  public.pms_commercial_restriction_room_types,
  public.pms_promotions,
  public.pms_promotion_room_types,
  public.pms_seasons,
  public.pms_season_room_types
  TO service_role;

ALTER TABLE public.pms_commercial_restrictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pms_commercial_restriction_room_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pms_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pms_promotion_room_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pms_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pms_season_room_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read pms commercial restrictions" ON public.pms_commercial_restrictions;
CREATE POLICY "Members read pms commercial restrictions" ON public.pms_commercial_restrictions
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert pms commercial restrictions" ON public.pms_commercial_restrictions;
CREATE POLICY "Managers insert pms commercial restrictions" ON public.pms_commercial_restrictions
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update pms commercial restrictions" ON public.pms_commercial_restrictions;
CREATE POLICY "Managers update pms commercial restrictions" ON public.pms_commercial_restrictions
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete pms commercial restrictions" ON public.pms_commercial_restrictions;
CREATE POLICY "Managers delete pms commercial restrictions" ON public.pms_commercial_restrictions
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP POLICY IF EXISTS "Members read pms commercial restriction room types" ON public.pms_commercial_restriction_room_types;
CREATE POLICY "Members read pms commercial restriction room types" ON public.pms_commercial_restriction_room_types
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert pms commercial restriction room types" ON public.pms_commercial_restriction_room_types;
CREATE POLICY "Managers insert pms commercial restriction room types" ON public.pms_commercial_restriction_room_types
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update pms commercial restriction room types" ON public.pms_commercial_restriction_room_types;
CREATE POLICY "Managers update pms commercial restriction room types" ON public.pms_commercial_restriction_room_types
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete pms commercial restriction room types" ON public.pms_commercial_restriction_room_types;
CREATE POLICY "Managers delete pms commercial restriction room types" ON public.pms_commercial_restriction_room_types
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP POLICY IF EXISTS "Members read pms promotions" ON public.pms_promotions;
CREATE POLICY "Members read pms promotions" ON public.pms_promotions
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert pms promotions" ON public.pms_promotions;
CREATE POLICY "Managers insert pms promotions" ON public.pms_promotions
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update pms promotions" ON public.pms_promotions;
CREATE POLICY "Managers update pms promotions" ON public.pms_promotions
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete pms promotions" ON public.pms_promotions;
CREATE POLICY "Managers delete pms promotions" ON public.pms_promotions
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP POLICY IF EXISTS "Members read pms promotion room types" ON public.pms_promotion_room_types;
CREATE POLICY "Members read pms promotion room types" ON public.pms_promotion_room_types
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert pms promotion room types" ON public.pms_promotion_room_types;
CREATE POLICY "Managers insert pms promotion room types" ON public.pms_promotion_room_types
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update pms promotion room types" ON public.pms_promotion_room_types;
CREATE POLICY "Managers update pms promotion room types" ON public.pms_promotion_room_types
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete pms promotion room types" ON public.pms_promotion_room_types;
CREATE POLICY "Managers delete pms promotion room types" ON public.pms_promotion_room_types
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP POLICY IF EXISTS "Members read pms seasons" ON public.pms_seasons;
CREATE POLICY "Members read pms seasons" ON public.pms_seasons
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert pms seasons" ON public.pms_seasons;
CREATE POLICY "Managers insert pms seasons" ON public.pms_seasons
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update pms seasons" ON public.pms_seasons;
CREATE POLICY "Managers update pms seasons" ON public.pms_seasons
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete pms seasons" ON public.pms_seasons;
CREATE POLICY "Managers delete pms seasons" ON public.pms_seasons
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP POLICY IF EXISTS "Members read pms season room types" ON public.pms_season_room_types;
CREATE POLICY "Members read pms season room types" ON public.pms_season_room_types
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert pms season room types" ON public.pms_season_room_types;
CREATE POLICY "Managers insert pms season room types" ON public.pms_season_room_types
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update pms season room types" ON public.pms_season_room_types;
CREATE POLICY "Managers update pms season room types" ON public.pms_season_room_types
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete pms season room types" ON public.pms_season_room_types;
CREATE POLICY "Managers delete pms season room types" ON public.pms_season_room_types
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_commercial_restrictions_updated_at ON public.pms_commercial_restrictions;
CREATE TRIGGER set_pms_commercial_restrictions_updated_at
  BEFORE UPDATE ON public.pms_commercial_restrictions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_pms_commercial_restriction_room_types_updated_at ON public.pms_commercial_restriction_room_types;
CREATE TRIGGER set_pms_commercial_restriction_room_types_updated_at
  BEFORE UPDATE ON public.pms_commercial_restriction_room_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_pms_promotions_updated_at ON public.pms_promotions;
CREATE TRIGGER set_pms_promotions_updated_at
  BEFORE UPDATE ON public.pms_promotions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_pms_promotion_room_types_updated_at ON public.pms_promotion_room_types;
CREATE TRIGGER set_pms_promotion_room_types_updated_at
  BEFORE UPDATE ON public.pms_promotion_room_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_pms_seasons_updated_at ON public.pms_seasons;
CREATE TRIGGER set_pms_seasons_updated_at
  BEFORE UPDATE ON public.pms_seasons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_pms_season_room_types_updated_at ON public.pms_season_room_types;
CREATE TRIGGER set_pms_season_room_types_updated_at
  BEFORE UPDATE ON public.pms_season_room_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
