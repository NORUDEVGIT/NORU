-- PMS Property Setup Card 3 — Meal Plans & Packages schema (Phase 4).
--
-- Sequential after 0071. Dual-lane: byte-identical copies live in
--   supabase/migrations/0072_pms_card3_meal_plans_packages.sql
--   drizzle/migrations/0072_pms_card3_meal_plans_packages.sql
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY AFTER MERGE — wait for PM approval of this SQL before apply.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f drizzle/migrations/0072_pms_card3_meal_plans_packages.sql
--   or the project's usual drizzle / Supabase migration apply path.
--   Do not run both copies against the same database.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.pms_package_components;
--   DROP TABLE IF EXISTS public.pms_package_rate_plans;
--   DROP TABLE IF EXISTS public.pms_package_room_types;
--   ALTER TABLE public.fo_service_catalogue
--     DROP CONSTRAINT IF EXISTS fo_service_catalogue_id_restaurant_unique;
--     (drop this only after pms_package_components is gone — the FK depends on it)
--   ALTER TABLE public.pms_packages
--     DROP CONSTRAINT IF EXISTS pms_packages_package_price_check,
--     DROP CONSTRAINT IF EXISTS pms_packages_description_check,
--     DROP COLUMN IF EXISTS package_price,
--     DROP COLUMN IF EXISTS description;
--   ALTER TABLE public.pms_meal_plans
--     DROP CONSTRAINT IF EXISTS pms_meal_plans_description_check,
--     DROP COLUMN IF EXISTS includes_dinner,
--     DROP COLUMN IF EXISTS includes_lunch,
--     DROP COLUMN IF EXISTS includes_breakfast,
--     DROP COLUMN IF EXISTS description;
--
-- SET3 / 0049 remain the owning migration for pms_meal_plans and pms_packages.
-- This migration is additive only on those two tables. Their legacy JSON columns
--   pms_meal_plans.included, pms_meal_plans.chargeable
--   pms_packages.inclusion
-- are kept as-is. Nothing reads from or writes to them here. The new typed
-- structured-component tables sit alongside the JSON, not on top of it.
-- No seed. No backfill. No migration of JSON rows into the new tables.
--
-- Scope fence — this migration explicitly does NOT touch:
--   reservations or reservation lines, and no reservation-level plan/package rows
--   any snapshot column or snapshot table (folio, POS, rate, reservation)
--   quote / pricing / rate-derivation RPCs — package_price is a stored setup
--     figure only, not a computed or quoted price
--   folio_transactions, posting, or any charge-generation path
--   Card 2 or Phase 3 masters — room_types, room_amenities, hotel_rate_plans,
--     fo_service_catalogue keep their own definitions; the only change is one
--     additive (id, restaurant_id) unique key on fo_service_catalogue so a
--     composite FK can target it — no column, data, RLS, or grant change
--   F&B menu / menu_items / outlet menus — meal-plan components reference
--     pms_meal_plans, never menu rows
--   restaurants.pms_property_setup_status or any programme / go-live status
--   no new audit table — reuse public.restaurant_staff_audit_log
--     (SET1 / Card 3 writeAudit). No pms_package_activity table.
--
-- No types.ts regen.

-- 1. Meal plan setup fields. Additive on the 0049 master. JSON columns kept.
ALTER TABLE public.pms_meal_plans
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS includes_breakfast boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS includes_lunch boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS includes_dinner boolean NOT NULL DEFAULT false;

ALTER TABLE public.pms_meal_plans
  DROP CONSTRAINT IF EXISTS pms_meal_plans_description_check;
ALTER TABLE public.pms_meal_plans
  ADD CONSTRAINT pms_meal_plans_description_check CHECK (
    description IS NULL OR length(btrim(description)) BETWEEN 1 AND 500
  );

COMMENT ON COLUMN public.pms_meal_plans.description IS
  'Optional setup note. Not a guest-facing rate description and not a folio narrative.';
COMMENT ON COLUMN public.pms_meal_plans.includes_breakfast IS
  'Setup flag for what the plan covers. Not enforced against type, and not an F&B menu link.';
COMMENT ON COLUMN public.pms_meal_plans.includes_lunch IS
  'Setup flag for what the plan covers. Not enforced against type, and not an F&B menu link.';
COMMENT ON COLUMN public.pms_meal_plans.includes_dinner IS
  'Setup flag for what the plan covers. Not enforced against type, and not an F&B menu link.';
COMMENT ON COLUMN public.pms_meal_plans.included IS
  'Legacy SET3 JSON. Kept for compatibility. Phase 4 typed flags live on includes_* columns.';
COMMENT ON COLUMN public.pms_meal_plans.chargeable IS
  'Legacy SET3 JSON. Kept for compatibility. Not read or written by Phase 4.';

-- 2. Package setup fields. Additive on the 0049 master. inclusion JSON kept.
ALTER TABLE public.pms_packages
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS package_price numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.pms_packages
  DROP CONSTRAINT IF EXISTS pms_packages_description_check;
ALTER TABLE public.pms_packages
  ADD CONSTRAINT pms_packages_description_check CHECK (
    description IS NULL OR length(btrim(description)) BETWEEN 1 AND 500
  );

ALTER TABLE public.pms_packages
  DROP CONSTRAINT IF EXISTS pms_packages_package_price_check;
ALTER TABLE public.pms_packages
  ADD CONSTRAINT pms_packages_package_price_check CHECK (package_price >= 0);

COMMENT ON COLUMN public.pms_packages.description IS
  'Optional setup note. Not a guest-facing rate description and not a folio narrative.';
COMMENT ON COLUMN public.pms_packages.package_price IS
  'Stored setup price in the property base currency (restaurants.currency_code). Not a quote, not a computed total, not a folio amount. No pricing RPC in Phase 4.';
COMMENT ON COLUMN public.pms_packages.inclusion IS
  'Legacy SET3 JSON. Kept for compatibility. Phase 4 typed components live on pms_package_components.';

-- 3. Composite-FK target for fo_service_catalogue (0045 has no (id, restaurant_id) key).
--    Every other master this migration references already carries its own
--    *_id_restaurant_unique key; fo_service_catalogue does not, so add one here.
--    ADD CONSTRAINT has no IF NOT EXISTS spelling, and the usual
--    DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT pair would fail on re-run once
--    pms_package_components depends on it. The guard below keeps this idempotent
--    without ever dropping a key an FK is sitting on. Adds no uniqueness beyond
--    the existing id primary key. The existing name uidx is untouched.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fo_service_catalogue_id_restaurant_unique'
      AND conrelid = 'public.fo_service_catalogue'::regclass
  ) THEN
    ALTER TABLE public.fo_service_catalogue
      ADD CONSTRAINT fo_service_catalogue_id_restaurant_unique UNIQUE (id, restaurant_id);
  END IF;
END $$;

COMMENT ON CONSTRAINT fo_service_catalogue_id_restaurant_unique
  ON public.fo_service_catalogue IS
  'Tenant-safe composite FK target for pms_package_components.fo_service_id. Adds no new uniqueness beyond the existing id primary key.';

-- 4. Package ↔ room type applicability. Setup only, not a reservation link.
CREATE TABLE IF NOT EXISTS public.pms_package_room_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  package_id uuid NOT NULL,
  room_type_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_package_room_types_mapping_unique UNIQUE (package_id, room_type_id),
  CONSTRAINT pms_package_room_types_package_fk
    FOREIGN KEY (package_id, restaurant_id)
    REFERENCES public.pms_packages (id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT pms_package_room_types_room_type_fk
    FOREIGN KEY (room_type_id, restaurant_id)
    REFERENCES public.room_types (id, restaurant_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS pms_package_room_types_restaurant_idx
  ON public.pms_package_room_types(restaurant_id, package_id);
CREATE INDEX IF NOT EXISTS pms_package_room_types_room_type_idx
  ON public.pms_package_room_types(restaurant_id, room_type_id);

COMMENT ON TABLE public.pms_package_room_types IS
  'Card 3 package applicability by room type. Setup only. Composite FKs prevent cross-tenant joins. Not a reservation or availability row.';
COMMENT ON COLUMN public.pms_package_room_types.package_id IS
  'Owning package. ON DELETE CASCADE: deleting the package removes its applicability rows.';
COMMENT ON COLUMN public.pms_package_room_types.room_type_id IS
  'Referenced Card 2 master. ON DELETE RESTRICT: a room type in use by a package cannot be deleted.';

-- 5. Package ↔ rate plan applicability. Setup only, no rate derivation.
CREATE TABLE IF NOT EXISTS public.pms_package_rate_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  package_id uuid NOT NULL,
  rate_plan_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_package_rate_plans_mapping_unique UNIQUE (package_id, rate_plan_id),
  CONSTRAINT pms_package_rate_plans_package_fk
    FOREIGN KEY (package_id, restaurant_id)
    REFERENCES public.pms_packages (id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT pms_package_rate_plans_rate_plan_fk
    FOREIGN KEY (rate_plan_id, restaurant_id)
    REFERENCES public.hotel_rate_plans (id, restaurant_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS pms_package_rate_plans_restaurant_idx
  ON public.pms_package_rate_plans(restaurant_id, package_id);
CREATE INDEX IF NOT EXISTS pms_package_rate_plans_rate_plan_idx
  ON public.pms_package_rate_plans(restaurant_id, rate_plan_id);

COMMENT ON TABLE public.pms_package_rate_plans IS
  'Card 3 package applicability by rate plan. Setup only. Does not alter hotel_rate_plans and does not derive, override, or quote a rate.';
COMMENT ON COLUMN public.pms_package_rate_plans.package_id IS
  'Owning package. ON DELETE CASCADE: deleting the package removes its applicability rows.';
COMMENT ON COLUMN public.pms_package_rate_plans.rate_plan_id IS
  'Referenced rate-plan master. ON DELETE RESTRICT: a rate plan in use by a package cannot be deleted.';

-- 6. Typed package components. Replaces reliance on pms_packages.inclusion JSON
--    for new work; the JSON column itself stays. Exactly one typed source is
--    populated per row and it must match component_kind.
CREATE TABLE IF NOT EXISTS public.pms_package_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  package_id uuid NOT NULL,
  component_kind text NOT NULL,
  meal_plan_id uuid,
  room_amenity_id uuid,
  fo_service_id uuid,
  quantity numeric(12,3) NOT NULL DEFAULT 1,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_package_components_kind_check CHECK (
    component_kind IN ('meal_plan', 'room_amenity', 'fo_service')
  ),
  CONSTRAINT pms_package_components_quantity_positive CHECK (quantity > 0),
  CONSTRAINT pms_package_components_sort_order_check CHECK (sort_order >= 0),
  CONSTRAINT pms_package_components_source_check CHECK (
    (
      component_kind = 'meal_plan'
      AND meal_plan_id IS NOT NULL
      AND room_amenity_id IS NULL
      AND fo_service_id IS NULL
    ) OR (
      component_kind = 'room_amenity'
      AND room_amenity_id IS NOT NULL
      AND meal_plan_id IS NULL
      AND fo_service_id IS NULL
    ) OR (
      component_kind = 'fo_service'
      AND fo_service_id IS NOT NULL
      AND meal_plan_id IS NULL
      AND room_amenity_id IS NULL
    )
  ),
  CONSTRAINT pms_package_components_package_fk
    FOREIGN KEY (package_id, restaurant_id)
    REFERENCES public.pms_packages (id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT pms_package_components_meal_plan_fk
    FOREIGN KEY (meal_plan_id, restaurant_id)
    REFERENCES public.pms_meal_plans (id, restaurant_id)
    ON DELETE RESTRICT,
  CONSTRAINT pms_package_components_room_amenity_fk
    FOREIGN KEY (room_amenity_id, restaurant_id)
    REFERENCES public.room_amenities (id, restaurant_id)
    ON DELETE RESTRICT,
  CONSTRAINT pms_package_components_fo_service_fk
    FOREIGN KEY (fo_service_id, restaurant_id)
    REFERENCES public.fo_service_catalogue (id, restaurant_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS pms_package_components_restaurant_idx
  ON public.pms_package_components(restaurant_id, package_id, sort_order);
CREATE INDEX IF NOT EXISTS pms_package_components_meal_plan_idx
  ON public.pms_package_components(restaurant_id, meal_plan_id);
CREATE INDEX IF NOT EXISTS pms_package_components_room_amenity_idx
  ON public.pms_package_components(restaurant_id, room_amenity_id);
CREATE INDEX IF NOT EXISTS pms_package_components_fo_service_idx
  ON public.pms_package_components(restaurant_id, fo_service_id);

COMMENT ON TABLE public.pms_package_components IS
  'Card 3 typed package inclusions. Setup master only. No price per component, no posting, no folio row, no reservation link.';
COMMENT ON COLUMN public.pms_package_components.component_kind IS
  'meal_plan | room_amenity | fo_service. Selects which typed source column must be populated.';
COMMENT ON COLUMN public.pms_package_components.meal_plan_id IS
  'Set only when component_kind = meal_plan. References pms_meal_plans, never an F&B menu row. ON DELETE RESTRICT.';
COMMENT ON COLUMN public.pms_package_components.room_amenity_id IS
  'Set only when component_kind = room_amenity. References the Card 2 room_amenities master. ON DELETE RESTRICT.';
COMMENT ON COLUMN public.pms_package_components.fo_service_id IS
  'Set only when component_kind = fo_service. References the fo_service_catalogue master. ON DELETE RESTRICT.';
COMMENT ON COLUMN public.pms_package_components.quantity IS
  'Configured count or units per package. Not multiplied into any price here; pricing stays application-side and later.';
COMMENT ON COLUMN public.pms_package_components.sort_order IS
  'Display ordering within the package. Non-negative. Not a business rule.';

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.pms_package_room_types,
  public.pms_package_rate_plans,
  public.pms_package_components
  TO authenticated;
GRANT ALL ON
  public.pms_package_room_types,
  public.pms_package_rate_plans,
  public.pms_package_components
  TO service_role;

ALTER TABLE public.pms_package_room_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pms_package_rate_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pms_package_components ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read pms package room types" ON public.pms_package_room_types;
CREATE POLICY "Members read pms package room types" ON public.pms_package_room_types
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert pms package room types" ON public.pms_package_room_types;
CREATE POLICY "Managers insert pms package room types" ON public.pms_package_room_types
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update pms package room types" ON public.pms_package_room_types;
CREATE POLICY "Managers update pms package room types" ON public.pms_package_room_types
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete pms package room types" ON public.pms_package_room_types;
CREATE POLICY "Managers delete pms package room types" ON public.pms_package_room_types
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP POLICY IF EXISTS "Members read pms package rate plans" ON public.pms_package_rate_plans;
CREATE POLICY "Members read pms package rate plans" ON public.pms_package_rate_plans
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert pms package rate plans" ON public.pms_package_rate_plans;
CREATE POLICY "Managers insert pms package rate plans" ON public.pms_package_rate_plans
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update pms package rate plans" ON public.pms_package_rate_plans;
CREATE POLICY "Managers update pms package rate plans" ON public.pms_package_rate_plans
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete pms package rate plans" ON public.pms_package_rate_plans;
CREATE POLICY "Managers delete pms package rate plans" ON public.pms_package_rate_plans
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP POLICY IF EXISTS "Members read pms package components" ON public.pms_package_components;
CREATE POLICY "Members read pms package components" ON public.pms_package_components
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));
DROP POLICY IF EXISTS "Managers insert pms package components" ON public.pms_package_components;
CREATE POLICY "Managers insert pms package components" ON public.pms_package_components
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers update pms package components" ON public.pms_package_components;
CREATE POLICY "Managers update pms package components" ON public.pms_package_components
  FOR UPDATE TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );
DROP POLICY IF EXISTS "Managers delete pms package components" ON public.pms_package_components;
CREATE POLICY "Managers delete pms package components" ON public.pms_package_components
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

DROP TRIGGER IF EXISTS set_pms_package_room_types_updated_at ON public.pms_package_room_types;
CREATE TRIGGER set_pms_package_room_types_updated_at
  BEFORE UPDATE ON public.pms_package_room_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_pms_package_rate_plans_updated_at ON public.pms_package_rate_plans;
CREATE TRIGGER set_pms_package_rate_plans_updated_at
  BEFORE UPDATE ON public.pms_package_rate_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_pms_package_components_updated_at ON public.pms_package_components;
CREATE TRIGGER set_pms_package_components_updated_at
  BEFORE UPDATE ON public.pms_package_components
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
