-- PMS Property Setup Card 5 — Outlets & Facilities schema (Phase 2).
--
-- Sequential after 0077. Dual-lane: byte-identical copies live in
--   supabase/migrations/0078_pms_card5_outlets_facilities.sql
--   drizzle/migrations/0078_pms_card5_outlets_facilities.sql
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY AFTER MERGE — wait for PM approval of this SQL before apply.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f drizzle/migrations/0078_pms_card5_outlets_facilities.sql
--   or the project's usual drizzle / Supabase migration apply path.
--   Do not run both copies against the same database.
--
-- Rollback:
--   ALTER TABLE public.pms_outlets
--     DROP CONSTRAINT IF EXISTS pms_outlets_description_check,
--     DROP CONSTRAINT IF EXISTS pms_outlets_facility_category_check,
--     DROP CONSTRAINT IF EXISTS pms_outlets_facility_type_code_check,
--     DROP CONSTRAINT IF EXISTS pms_outlets_responsible_role_check,
--     DROP CONSTRAINT IF EXISTS pms_outlets_capacity_check,
--     DROP CONSTRAINT IF EXISTS pms_outlets_operating_hours_check,
--     DROP CONSTRAINT IF EXISTS pms_outlets_revenue_center_check,
--     DROP CONSTRAINT IF EXISTS pms_outlets_currency_code_check,
--     DROP CONSTRAINT IF EXISTS pms_outlets_min_lead_minutes_check,
--     DROP CONSTRAINT IF EXISTS pms_outlets_availability_mode_check,
--     DROP CONSTRAINT IF EXISTS pms_outlets_features_check,
--     DROP CONSTRAINT IF EXISTS pms_outlets_building_fk,
--     DROP CONSTRAINT IF EXISTS pms_outlets_floor_fk,
--     DROP CONSTRAINT IF EXISTS pms_outlets_wing_fk,
--     DROP CONSTRAINT IF EXISTS pms_outlets_department_fk,
--     DROP CONSTRAINT IF EXISTS pms_outlets_manager_fk,
--     DROP CONSTRAINT IF EXISTS pms_outlets_tax_group_fk,
--     DROP CONSTRAINT IF EXISTS pms_outlets_currency_fk,
--     DROP COLUMN IF EXISTS description,
--     DROP COLUMN IF EXISTS facility_category,
--     DROP COLUMN IF EXISTS facility_type_code,
--     DROP COLUMN IF EXISTS building_id,
--     DROP COLUMN IF EXISTS floor_id,
--     DROP COLUMN IF EXISTS wing_id,
--     DROP COLUMN IF EXISTS department_id,
--     DROP COLUMN IF EXISTS manager_user_id,
--     DROP COLUMN IF EXISTS responsible_role,
--     DROP COLUMN IF EXISTS minimum_capacity,
--     DROP COLUMN IF EXISTS standard_capacity,
--     DROP COLUMN IF EXISTS maximum_capacity,
--     DROP COLUMN IF EXISTS operating_hours,
--     DROP COLUMN IF EXISTS chargeable,
--     DROP COLUMN IF EXISTS revenue_center,
--     DROP COLUMN IF EXISTS tax_group_id,
--     DROP COLUMN IF EXISTS currency_code,
--     DROP COLUMN IF EXISTS reservation_required,
--     DROP COLUMN IF EXISTS advance_booking_required,
--     DROP COLUMN IF EXISTS minimum_lead_minutes,
--     DROP COLUMN IF EXISTS availability_mode,
--     DROP COLUMN IF EXISTS features;
--   DROP INDEX IF EXISTS pms_outlets_department_idx;
--   DROP INDEX IF EXISTS pms_outlets_building_idx;
--
-- Scope fence — this migration explicitly does NOT touch:
--   SET2 columns type, is_default_rooms, department_text, default_posting_label
--   SET2 #outlets UI / savePmsOutlet / Activate rooms-outlet rule
--   pms_facilities (do not create a second master)
--   Card 2 hotel_buildings / hotel_floors / hotel_wings row ownership
--   Card 3 pms_taxes / pms_tax_groups / pms_property_currencies masters
--   F&B/POS transaction tables, restaurant_tables
--   pms_function_space_labels, live Sales & Events bookings
--   maintenance / live closure calendars
--   restaurants.pms_property_setup_status
--   no new audit table — reuse public.restaurant_staff_audit_log (SET2 pms_set2_outlet_updated)
--
-- Additive only. No seed. No backfill. Existing SET2 outlet rows stay valid:
--   facility_category defaults to 'other'; facility_type_code to 'custom';
--   availability_mode to 'always_available'; new commercial/location/capacity
--   columns are nullable; operating_hours and features default to {}.
-- Existing pms_outlets RLS (member SELECT, owner/manager write) is unchanged.
-- No types.ts regen. No privileged functions.

-- 1. Extend the existing SET2 outlet master. Do not create pms_facilities.
ALTER TABLE public.pms_outlets
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS facility_category text NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS facility_type_code text NOT NULL DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS building_id uuid,
  ADD COLUMN IF NOT EXISTS floor_id uuid,
  ADD COLUMN IF NOT EXISTS wing_id uuid,
  ADD COLUMN IF NOT EXISTS department_id uuid,
  ADD COLUMN IF NOT EXISTS manager_user_id uuid,
  ADD COLUMN IF NOT EXISTS responsible_role text,
  ADD COLUMN IF NOT EXISTS minimum_capacity integer,
  ADD COLUMN IF NOT EXISTS standard_capacity integer,
  ADD COLUMN IF NOT EXISTS maximum_capacity integer,
  ADD COLUMN IF NOT EXISTS operating_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS chargeable boolean,
  ADD COLUMN IF NOT EXISTS revenue_center text,
  ADD COLUMN IF NOT EXISTS tax_group_id uuid,
  ADD COLUMN IF NOT EXISTS currency_code text,
  ADD COLUMN IF NOT EXISTS reservation_required boolean,
  ADD COLUMN IF NOT EXISTS advance_booking_required boolean,
  ADD COLUMN IF NOT EXISTS minimum_lead_minutes integer,
  ADD COLUMN IF NOT EXISTS availability_mode text NOT NULL DEFAULT 'always_available',
  ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.pms_outlets
  DROP CONSTRAINT IF EXISTS pms_outlets_description_check,
  DROP CONSTRAINT IF EXISTS pms_outlets_facility_category_check,
  DROP CONSTRAINT IF EXISTS pms_outlets_facility_type_code_check,
  DROP CONSTRAINT IF EXISTS pms_outlets_responsible_role_check,
  DROP CONSTRAINT IF EXISTS pms_outlets_capacity_check,
  DROP CONSTRAINT IF EXISTS pms_outlets_operating_hours_check,
  DROP CONSTRAINT IF EXISTS pms_outlets_revenue_center_check,
  DROP CONSTRAINT IF EXISTS pms_outlets_currency_code_check,
  DROP CONSTRAINT IF EXISTS pms_outlets_min_lead_minutes_check,
  DROP CONSTRAINT IF EXISTS pms_outlets_availability_mode_check,
  DROP CONSTRAINT IF EXISTS pms_outlets_features_check,
  DROP CONSTRAINT IF EXISTS pms_outlets_building_fk,
  DROP CONSTRAINT IF EXISTS pms_outlets_floor_fk,
  DROP CONSTRAINT IF EXISTS pms_outlets_wing_fk,
  DROP CONSTRAINT IF EXISTS pms_outlets_department_fk,
  DROP CONSTRAINT IF EXISTS pms_outlets_manager_fk,
  DROP CONSTRAINT IF EXISTS pms_outlets_tax_group_fk,
  DROP CONSTRAINT IF EXISTS pms_outlets_currency_fk;

ALTER TABLE public.pms_outlets
  ADD CONSTRAINT pms_outlets_description_check CHECK (
    description IS NULL OR length(btrim(description)) BETWEEN 1 AND 500
  ),
  ADD CONSTRAINT pms_outlets_facility_category_check CHECK (
    facility_category IN ('fnb', 'events', 'wellness', 'services', 'other')
  ),
  ADD CONSTRAINT pms_outlets_facility_type_code_check CHECK (
    facility_type_code ~ '^[a-z][a-z0-9_]{0,39}$'
  ),
  ADD CONSTRAINT pms_outlets_responsible_role_check CHECK (
    responsible_role IS NULL OR responsible_role IN (
      'owner',
      'manager',
      'kitchen',
      'waiter',
      'housekeeping',
      'receptionist',
      'housekeeper',
      'housekeeping_supervisor',
      'cashier',
      'storekeeper',
      'accountant',
      'maintenance'
    )
  ),
  ADD CONSTRAINT pms_outlets_capacity_check CHECK (
    (minimum_capacity IS NULL OR minimum_capacity >= 0)
    AND (standard_capacity IS NULL OR standard_capacity >= 0)
    AND (maximum_capacity IS NULL OR maximum_capacity >= 0)
    AND (
      minimum_capacity IS NULL
      OR standard_capacity IS NULL
      OR minimum_capacity <= standard_capacity
    )
    AND (
      standard_capacity IS NULL
      OR maximum_capacity IS NULL
      OR standard_capacity <= maximum_capacity
    )
    AND (
      minimum_capacity IS NULL
      OR maximum_capacity IS NULL
      OR minimum_capacity <= maximum_capacity
    )
  ),
  ADD CONSTRAINT pms_outlets_operating_hours_check CHECK (jsonb_typeof(operating_hours) = 'object'),
  ADD CONSTRAINT pms_outlets_revenue_center_check CHECK (
    revenue_center IS NULL OR length(btrim(revenue_center)) BETWEEN 1 AND 40
  ),
  ADD CONSTRAINT pms_outlets_currency_code_check CHECK (
    currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$'
  ),
  ADD CONSTRAINT pms_outlets_min_lead_minutes_check CHECK (
    minimum_lead_minutes IS NULL OR minimum_lead_minutes >= 0
  ),
  ADD CONSTRAINT pms_outlets_availability_mode_check CHECK (
    availability_mode IN (
      'always_available',
      'scheduled',
      'reservation_based',
      'temporarily_unavailable'
    )
  ),
  ADD CONSTRAINT pms_outlets_features_check CHECK (jsonb_typeof(features) = 'object'),
  ADD CONSTRAINT pms_outlets_building_fk
    FOREIGN KEY (building_id, restaurant_id)
    REFERENCES public.hotel_buildings (id, restaurant_id)
    ON DELETE SET NULL,
  ADD CONSTRAINT pms_outlets_floor_fk
    FOREIGN KEY (floor_id, restaurant_id)
    REFERENCES public.hotel_floors (id, restaurant_id)
    ON DELETE SET NULL,
  ADD CONSTRAINT pms_outlets_wing_fk
    FOREIGN KEY (wing_id, restaurant_id)
    REFERENCES public.hotel_wings (id, restaurant_id)
    ON DELETE SET NULL,
  ADD CONSTRAINT pms_outlets_department_fk
    FOREIGN KEY (department_id, restaurant_id)
    REFERENCES public.pms_departments (id, restaurant_id)
    ON DELETE SET NULL,
  ADD CONSTRAINT pms_outlets_manager_fk
    FOREIGN KEY (restaurant_id, manager_user_id)
    REFERENCES public.restaurant_users (restaurant_id, user_id)
    ON DELETE SET NULL,
  ADD CONSTRAINT pms_outlets_tax_group_fk
    FOREIGN KEY (tax_group_id, restaurant_id)
    REFERENCES public.pms_tax_groups (id, restaurant_id)
    ON DELETE SET NULL,
  ADD CONSTRAINT pms_outlets_currency_fk
    FOREIGN KEY (restaurant_id, currency_code)
    REFERENCES public.pms_property_currencies (restaurant_id, code)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS pms_outlets_department_idx
  ON public.pms_outlets(restaurant_id, department_id);
CREATE INDEX IF NOT EXISTS pms_outlets_building_idx
  ON public.pms_outlets(restaurant_id, building_id);

COMMENT ON COLUMN public.pms_outlets.facility_category IS
  'Card 5 classification only (fnb/events/wellness/services/other). Does not replace SET2 type.';
COMMENT ON COLUMN public.pms_outlets.facility_type_code IS
  'Snake_case facility type. Catalogue examples: restaurant, bar, conference_hall, gym, pool, spa, custom. Custom property codes allowed. Not SET2 type.';
COMMENT ON COLUMN public.pms_outlets.building_id IS
  'Nullable Card 2 hotel_buildings reference. Composite FK with restaurant_id. Does not copy building names.';
COMMENT ON COLUMN public.pms_outlets.floor_id IS
  'Nullable Card 2 hotel_floors reference. Composite FK with restaurant_id.';
COMMENT ON COLUMN public.pms_outlets.wing_id IS
  'Nullable Card 2 hotel_wings reference. Composite FK with restaurant_id.';
COMMENT ON COLUMN public.pms_outlets.department_id IS
  'Nullable Card 5 pms_departments reference. department_text remains for SET2 compatibility.';
COMMENT ON COLUMN public.pms_outlets.manager_user_id IS
  'auth user id of an existing restaurant_users membership in this restaurant. Nullable. Not a second user table.';
COMMENT ON COLUMN public.pms_outlets.responsible_role IS
  'Existing STAFF_ROLES value. Role catalogue ownership stays in restaurant_users.';
COMMENT ON COLUMN public.pms_outlets.minimum_capacity IS
  'Setup occupancy floor. Checked with standard/maximum when values are present.';
COMMENT ON COLUMN public.pms_outlets.operating_hours IS
  'Setup-only object: daily / weekend / holiday windows and 24-hour flag. Not shifts, attendance, or live closures.';
COMMENT ON COLUMN public.pms_outlets.chargeable IS
  'Setup flag only. Not meal-plan chargeable and not a live charge.';
COMMENT ON COLUMN public.pms_outlets.revenue_center IS
  'Setup identifier only. No chart of accounts in 0078.';
COMMENT ON COLUMN public.pms_outlets.tax_group_id IS
  'Nullable Card 3 pms_tax_groups reference. Composite FK with restaurant_id.';
COMMENT ON COLUMN public.pms_outlets.currency_code IS
  'Nullable ISO code on Card 3 pms_property_currencies for this restaurant. Not a new currency master.';
COMMENT ON COLUMN public.pms_outlets.reservation_required IS
  'Setup policy only. Does not create booking records.';
COMMENT ON COLUMN public.pms_outlets.availability_mode IS
  'Setup policy: always_available | scheduled | reservation_based | temporarily_unavailable. Not a closure calendar.';
COMMENT ON COLUMN public.pms_outlets.features IS
  'Structured setup flags only (projector, wifi, sound_system, microphones, air_conditioning, stage, screen, buffet, breakfast, lunch, dinner, outdoor_seating, …). Not live operational state.';
COMMENT ON COLUMN public.pms_outlets.active IS
  'Existing SET2 active flag. Soft-deactivate only; 0078 does not add hard-delete behavior.';
