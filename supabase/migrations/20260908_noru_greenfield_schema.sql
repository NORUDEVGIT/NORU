-- NORU greenfield schema for a new managed Supabase project.
-- Assembled from the final surviving definitions in supabase/migrations and
-- drizzle/migrations. Contains no operational data and does not replay
-- historical seed/test migrations.
--
-- Public application tables: 69 (generated types listed 70 including an
-- obsolete leftover table that the current application does not use).
-- Guest order writes and guest tracking use the service-role server client.
-- Authenticated Data API is used for kitchen/customer SELECT and kitchen UPDATE.
-- After importing orders, reset the order_number identity to MAX(order_number)+1
-- in a later data step (not in this schema-only file).


-- 1. Extensions

-- gen_random_uuid() is provided by pgcrypto in this Postgres 17 / Supabase
-- setup. Schema SQL does not call uuid_generate_*.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


-- 2. set_updated_at (no table dependency); remaining helpers after tables

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;


-- 3. Public tables (dependency-ordered CREATE TABLE; overlays in section 4)
-- CREATE TABLE order satisfies foreign keys. Composite unique keys required by
-- restaurant-scoped FKs are declared on CREATE TABLE so they exist before
-- referencing tables (same final constraints as the historical ALTER overlays).

-- 3. Public tables (CREATE TABLE as first introduced, overlays in section 4)

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  email text,
  phone text,
  account_type text not null default 'customer' check (account_type in ('customer','restaurant_user','platform_admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE TABLE public.inventory_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  unit_type text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_units_type_check CHECK (unit_type IN ('weight','volume','count'))
);

create table if not exists public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  email text,
  phone text,
  address text,
  city text,
  postcode text,
  country text,
  logo_url text,
  active boolean not null default true,
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.restaurant_users (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','manager','kitchen','waiter')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (restaurant_id, user_id),
  CONSTRAINT restaurant_users_id_restaurant_unique UNIQUE (id, restaurant_id)
);

create table if not exists public.restaurant_tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  table_number text not null,
  name text,
  qr_token text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (restaurant_id, table_number)
);

CREATE TABLE public.restaurant_opening_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  is_closed boolean NOT NULL DEFAULT false,
  open_time time NOT NULL DEFAULT '09:00',
  close_time time NOT NULL DEFAULT '22:00',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, day_of_week)
);

CREATE TABLE IF NOT EXISTS public.restaurant_staff_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  old_role text,
  new_role text,
  old_active boolean,
  new_active boolean,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES auth.users(id),
  reason text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.restaurant_package_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  package_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  activated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT restaurant_package_entitlements_unique UNIQUE (restaurant_id, package_key),
  CONSTRAINT restaurant_package_entitlements_key_check CHECK (
    package_key = ANY (ARRAY[
      'restaurant_management'::text,
      'pms'::text,
      'pos'::text,
      'back_office'::text
    ])
  )
);

CREATE TABLE public.staff_module_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES public.restaurant_users(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_by_membership_id UUID REFERENCES public.restaurant_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT staff_module_access_unique UNIQUE (restaurant_id, membership_id, module_key),
  CONSTRAINT staff_module_access_module_key_check CHECK (
    module_key = ANY (ARRAY[
      'food_and_beverage'::text,
      'front_office'::text,
      'housekeeping'::text,
      'pos'::text,
      'inventory'::text,
      'procurement'::text,
      'human_resources'::text,
      'accounting_finance'::text,
      'reports_analytics'::text,
      'configuration'::text,
      'property_settings'::text
    ])
  )
);

create table if not exists public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  description text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

CREATE TABLE public.menu_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  category TEXT NOT NULL,
  image_url TEXT,
  available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  inventory_type text NOT NULL,
  base_unit_id uuid NOT NULL REFERENCES public.inventory_units(id),
  current_quantity numeric(14,3) NOT NULL DEFAULT 0,
  minimum_stock_level numeric(14,3) NOT NULL DEFAULT 0,
  unit_cost numeric(12,2),
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_by_staff_membership_id uuid REFERENCES public.restaurant_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_items_type_check CHECK (inventory_type IN ('ingredient','consumable')),
  CONSTRAINT inventory_items_min_level_check CHECK (minimum_stock_level >= 0)
);

CREATE TABLE public.menu_item_recipe_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  quantity_base numeric(14,4) NOT NULL,
  display_quantity numeric(14,4) NOT NULL,
  display_unit_id uuid NOT NULL REFERENCES public.inventory_units(id),
  created_by_staff_membership_id uuid REFERENCES public.restaurant_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recipe_components_quantity_positive CHECK (quantity_base > 0 AND display_quantity > 0)
);

CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  -- GENERATED BY DEFAULT so imported rows may supply explicit order_number.
  -- Do not start at the old demo value 1042. After data import, set the
  -- identity sequence to MAX(order_number)+1 (data step, not this file).
  order_number INTEGER NOT NULL GENERATED BY DEFAULT AS IDENTITY,
  table_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','preparing','ready','served')),
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  menu_item_id UUID REFERENCES public.menu_items(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  special_instructions TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

create table if not exists public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

CREATE TABLE public.staff_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  staff_membership_id uuid NOT NULL REFERENCES public.restaurant_users(id) ON DELETE CASCADE,
  shift_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_shifts_status_check CHECK (status IN ('scheduled','cancelled')),
  CONSTRAINT staff_shifts_time_order CHECK (end_time > start_time),
  CONSTRAINT staff_shifts_unique_slot UNIQUE (staff_membership_id, shift_date, start_time)
);

CREATE TABLE public.staff_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  staff_membership_id uuid NOT NULL REFERENCES public.restaurant_users(id) ON DELETE CASCADE,
  shift_id uuid NOT NULL REFERENCES public.staff_shifts(id) ON DELETE CASCADE,
  check_in_at timestamptz,
  check_out_at timestamptz,
  status text NOT NULL DEFAULT 'checked_in',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_attendance_status_check CHECK (status IN ('checked_in','completed','late','absent','missing_checkout')),
  CONSTRAINT staff_attendance_unique_shift_member UNIQUE (shift_id, staff_membership_id)
);

CREATE TABLE public.staff_table_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  restaurant_table_id uuid NOT NULL REFERENCES public.restaurant_tables(id) ON DELETE CASCADE,
  staff_membership_id uuid NOT NULL REFERENCES public.restaurant_users(id) ON DELETE CASCADE,
  shift_id uuid NOT NULL REFERENCES public.staff_shifts(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_table_assignments_unique UNIQUE (shift_id, restaurant_table_id)
);

CREATE TABLE public.inventory_stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  movement_type text NOT NULL,
  quantity numeric(14,3) NOT NULL,
  unit_id uuid NOT NULL REFERENCES public.inventory_units(id),
  unit_cost numeric(12,2),
  reason text,
  balance_after numeric(14,3),
  created_by_staff_membership_id uuid REFERENCES public.restaurant_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_movements_type_check CHECK (movement_type IN (
    'opening_balance','purchase_received','usage','waste','loss',
    'adjustment_in','adjustment_out','stocktake_adjustment'
  )),
  CONSTRAINT inventory_movements_quantity_nonzero CHECK (quantity <> 0)
);

CREATE TABLE public.restaurant_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  contact_name text,
  email text,
  phone text,
  address text,
  tax_id text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_by_staff_membership_id uuid REFERENCES public.restaurant_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.restaurant_suppliers(id) ON DELETE RESTRICT,
  po_number text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  order_date date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  expected_delivery_date date,
  notes text,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  created_by_staff_membership_id uuid REFERENCES public.restaurant_users(id) ON DELETE SET NULL,
  ordered_by_staff_membership_id uuid REFERENCES public.restaurant_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_orders_status_check CHECK (status IN ('draft','ordered','partially_received','received','cancelled'))
);

CREATE TABLE public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  item_name_snapshot text NOT NULL,
  unit_id uuid NOT NULL REFERENCES public.inventory_units(id),
  ordered_quantity numeric(14,3) NOT NULL,
  received_quantity numeric(14,3) NOT NULL DEFAULT 0,
  unit_cost numeric(12,2) NOT NULL DEFAULT 0,
  line_total numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_order_items_qty_check CHECK (ordered_quantity > 0),
  CONSTRAINT purchase_order_items_received_check CHECK (received_quantity >= 0 AND received_quantity <= ordered_quantity)
);

CREATE TABLE public.purchase_order_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  previous_values jsonb,
  new_values jsonb,
  notes text,
  created_by_staff_membership_id uuid REFERENCES public.restaurant_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_order_history_event_check CHECK (event_type IN (
    'po_created','po_updated','po_ordered','goods_received',
    'po_partially_received','po_received','po_cancelled'
  ))
);

CREATE TABLE public.restaurant_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  asset_type text NOT NULL CHECK (asset_type IN ('operating_asset','equipment')),
  name text NOT NULL,
  asset_code text,
  quantity numeric(14,2) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  condition text NOT NULL DEFAULT 'good' CHECK (condition IN ('excellent','good','fair','damaged')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','under_maintenance','out_of_service','disposed')),
  location text,
  purchase_date date,
  purchase_cost numeric(14,2) CHECK (purchase_cost IS NULL OR purchase_cost >= 0),
  serial_number text,
  warranty_expiry date,
  notes text,
  created_by_staff_membership_id uuid REFERENCES public.restaurant_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.restaurant_asset_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.restaurant_assets(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('asset_created','asset_updated','condition_changed','status_changed','location_changed','quantity_changed','disposed')),
  previous_values jsonb,
  new_values jsonb,
  notes text,
  created_by_staff_membership_id uuid REFERENCES public.restaurant_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.room_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  max_occupancy integer NOT NULL DEFAULT 2,
  adult_capacity integer NOT NULL DEFAULT 2,
  child_capacity integer NOT NULL DEFAULT 0,
  bed_type text,
  bed_count integer,
  room_size text,
  room_view text,
  sellable boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_by_staff_membership_id uuid REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT room_types_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT room_types_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT room_types_capacity_check CHECK (max_occupancy > 0 AND adult_capacity >= 0 AND child_capacity >= 0)
);

CREATE TABLE public.hotel_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  room_type_id uuid NOT NULL,
  room_number text NOT NULL,
  floor text,
  building text,
  wing text,
  smoking boolean NOT NULL DEFAULT false,
  accessible boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'available',
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_by_staff_membership_id uuid REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_rooms_number_unique UNIQUE (restaurant_id, room_number),
  CONSTRAINT hotel_rooms_status_check CHECK (status IN ('available','out_of_order','out_of_service')),
  CONSTRAINT hotel_rooms_type_same_property FOREIGN KEY (room_type_id, restaurant_id)
    REFERENCES public.room_types(id, restaurant_id),
  CONSTRAINT hotel_rooms_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT hotel_rooms_id_restaurant_type_unique UNIQUE (id, restaurant_id, room_type_id)
);

CREATE TABLE public.room_amenities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT room_amenities_name_unique UNIQUE (restaurant_id, name),
  CONSTRAINT room_amenities_id_restaurant_unique UNIQUE (id, restaurant_id)
);

CREATE TABLE public.room_type_amenities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  room_type_id uuid NOT NULL,
  amenity_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT room_type_amenities_unique UNIQUE (room_type_id, amenity_id),
  CONSTRAINT room_type_amenities_type_fk FOREIGN KEY (room_type_id, restaurant_id)
    REFERENCES public.room_types(id, restaurant_id) ON DELETE CASCADE,
  CONSTRAINT room_type_amenities_amenity_fk FOREIGN KEY (amenity_id, restaurant_id)
    REFERENCES public.room_amenities(id, restaurant_id) ON DELETE CASCADE
);

CREATE TABLE public.room_type_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  room_type_id uuid NOT NULL,
  storage_path text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_cover boolean NOT NULL DEFAULT false,
  alt_text text,
  uploaded_by_staff_membership_id uuid REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT room_type_images_path_unique UNIQUE (storage_path),
  CONSTRAINT room_type_images_type_fk FOREIGN KEY (room_type_id, restaurant_id)
    REFERENCES public.room_types(id, restaurant_id) ON DELETE CASCADE
);

CREATE TABLE public.guest_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text,
  phone text,
  email text,
  email_normalized text,
  phone_normalized text,
  nationality text,
  language text,
  date_of_birth date,
  address_line1 text,
  address_line2 text,
  city text,
  region text,
  country text,
  postal_code text,
  guest_status text NOT NULL DEFAULT 'active',
  vip_status boolean NOT NULL DEFAULT false,
  notes text,
  linked_customer_user_id uuid,
  created_by_staff_membership_id uuid REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guest_profiles_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT guest_profiles_first_name_check CHECK (btrim(first_name) <> ''),
  CONSTRAINT guest_profiles_status_check CHECK (guest_status IN ('active','inactive'))
);

CREATE TABLE public.guest_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  guest_id uuid NOT NULL,
  room_preference text,
  bed_preference text,
  floor_preference text,
  view_preference text,
  food_preference text,
  communication_preference text,
  accessibility_requirements text,
  special_requests text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guest_preferences_guest_unique UNIQUE (guest_id),
  CONSTRAINT guest_preferences_same_property FOREIGN KEY (guest_id, restaurant_id)
    REFERENCES public.guest_profiles(id, restaurant_id) ON DELETE CASCADE
);

CREATE TABLE public.guest_profile_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  guest_id uuid NOT NULL,
  event_type text NOT NULL,
  previous_values jsonb,
  new_values jsonb,
  notes text,
  actor_membership_id uuid REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guest_profile_history_same_property FOREIGN KEY (guest_id, restaurant_id)
    REFERENCES public.guest_profiles(id, restaurant_id) ON DELETE CASCADE,
  CONSTRAINT guest_profile_history_event_check CHECK (
    event_type IN ('created','profile_updated','vip_changed','status_changed','preference_updated','note_added')
  )
);

CREATE TABLE public.hotel_rate_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_by_membership_id uuid REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_rate_categories_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT hotel_rate_categories_code_unique UNIQUE (restaurant_id, code)
);

CREATE TABLE public.hotel_rate_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  rate_category_id uuid NOT NULL,
  room_type_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  currency text NOT NULL,
  base_rate numeric(12,2) NOT NULL,
  valid_from date,
  valid_to date,
  active boolean NOT NULL DEFAULT true,
  created_by_membership_id uuid REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_rate_plans_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT hotel_rate_plans_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT hotel_rate_plans_base_rate_check CHECK (base_rate >= 0),
  CONSTRAINT hotel_rate_plans_validity_check CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_to >= valid_from),
  CONSTRAINT hotel_rate_plans_category_same_property FOREIGN KEY (rate_category_id, restaurant_id)
    REFERENCES public.hotel_rate_categories(id, restaurant_id),
  CONSTRAINT hotel_rate_plans_type_same_property FOREIGN KEY (room_type_id, restaurant_id)
    REFERENCES public.room_types(id, restaurant_id)
);

CREATE TABLE public.hotel_rate_calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  rate_plan_id uuid NOT NULL,
  rate_date date NOT NULL,
  nightly_rate numeric(12,2) NOT NULL,
  created_by_membership_id uuid REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_rate_calendar_unique UNIQUE (rate_plan_id, rate_date),
  CONSTRAINT hotel_rate_calendar_rate_check CHECK (nightly_rate >= 0),
  CONSTRAINT hotel_rate_calendar_plan_same_property FOREIGN KEY (rate_plan_id, restaurant_id)
    REFERENCES public.hotel_rate_plans(id, restaurant_id) ON DELETE CASCADE
);

CREATE TABLE public.hotel_rate_restrictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  rate_plan_id uuid NOT NULL,
  restriction_date date NOT NULL,
  min_stay integer,
  max_stay integer,
  closed_to_arrival boolean NOT NULL DEFAULT false,
  closed_to_departure boolean NOT NULL DEFAULT false,
  stop_sell boolean NOT NULL DEFAULT false,
  created_by_membership_id uuid REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_rate_restrictions_unique UNIQUE (rate_plan_id, restriction_date),
  CONSTRAINT hotel_rate_restrictions_stay_check CHECK (
    (min_stay IS NULL OR min_stay >= 1)
    AND (max_stay IS NULL OR max_stay >= 1)
    AND (min_stay IS NULL OR max_stay IS NULL OR max_stay >= min_stay)
  ),
  CONSTRAINT hotel_rate_restrictions_plan_same_property FOREIGN KEY (rate_plan_id, restaurant_id)
    REFERENCES public.hotel_rate_plans(id, restaurant_id) ON DELETE CASCADE
);

CREATE TABLE public.hotel_reservation_counters (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  last_number bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.hotel_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  guest_id uuid NOT NULL,
  confirmation_number text NOT NULL,
  arrival_date date NOT NULL,
  departure_date date NOT NULL,
  adults integer NOT NULL DEFAULT 1,
  children integer NOT NULL DEFAULT 0,
  room_type_id uuid NOT NULL,
  room_id uuid,
  status text NOT NULL DEFAULT 'pending',
  source text NOT NULL DEFAULT 'staff',
  special_requests text,
  notes text,
  cancellation_reason text,
  created_by_staff_membership_id uuid REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_reservations_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT hotel_reservations_confirmation_unique UNIQUE (restaurant_id, confirmation_number),
  CONSTRAINT hotel_reservations_dates_check CHECK (departure_date > arrival_date),
  CONSTRAINT hotel_reservations_occupancy_check CHECK (adults >= 1 AND children >= 0),
  CONSTRAINT hotel_reservations_status_check CHECK (status IN ('pending','confirmed','cancelled')),
  CONSTRAINT hotel_reservations_source_check CHECK (source IN ('staff','future_online')),
  CONSTRAINT hotel_reservations_guest_same_property FOREIGN KEY (guest_id, restaurant_id)
    REFERENCES public.guest_profiles(id, restaurant_id),
  CONSTRAINT hotel_reservations_type_same_property FOREIGN KEY (room_type_id, restaurant_id)
    REFERENCES public.room_types(id, restaurant_id),
  CONSTRAINT hotel_reservations_room_same_type FOREIGN KEY (room_id, restaurant_id, room_type_id)
    REFERENCES public.hotel_rooms(id, restaurant_id, room_type_id)
);

CREATE TABLE public.hotel_reservation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  reservation_id uuid NOT NULL,
  event_type text NOT NULL,
  previous_values jsonb,
  new_values jsonb,
  notes text,
  actor_membership_id uuid REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_reservation_history_same_property FOREIGN KEY (reservation_id, restaurant_id)
    REFERENCES public.hotel_reservations(id, restaurant_id) ON DELETE CASCADE,
  CONSTRAINT hotel_reservation_history_event_check CHECK (
    event_type IN ('created','confirmed','amended','cancelled','room_assigned','room_changed','status_changed')
  )
);

CREATE TABLE public.distribution_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  channel_type text NOT NULL DEFAULT 'direct',
  code text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'not_connected',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT distribution_channels_code_unique UNIQUE (restaurant_id, code),
  CONSTRAINT distribution_channels_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT distribution_channels_type_check CHECK (channel_type IN ('direct','ota')),
  CONSTRAINT distribution_channels_status_check CHECK (status IN ('active','inactive','not_connected'))
);

CREATE TABLE public.distribution_room_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL,
  room_type_id uuid NOT NULL,
  external_room_code text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT distribution_room_mappings_unique UNIQUE (channel_id, room_type_id),
  CONSTRAINT distribution_room_mappings_channel_fk FOREIGN KEY (channel_id, restaurant_id)
    REFERENCES public.distribution_channels(id, restaurant_id) ON DELETE CASCADE,
  CONSTRAINT distribution_room_mappings_type_fk FOREIGN KEY (room_type_id, restaurant_id)
    REFERENCES public.room_types(id, restaurant_id) ON DELETE CASCADE
);

CREATE TABLE public.distribution_rate_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL,
  rate_plan_id uuid NOT NULL,
  external_rate_code text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT distribution_rate_mappings_unique UNIQUE (channel_id, rate_plan_id),
  CONSTRAINT distribution_rate_mappings_channel_fk FOREIGN KEY (channel_id, restaurant_id)
    REFERENCES public.distribution_channels(id, restaurant_id) ON DELETE CASCADE,
  CONSTRAINT distribution_rate_mappings_plan_fk FOREIGN KEY (rate_plan_id, restaurant_id)
    REFERENCES public.hotel_rate_plans(id, restaurant_id) ON DELETE CASCADE
);

CREATE TABLE public.distribution_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  channel_id uuid,
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'success',
  message text,
  reference_type text,
  reference_id uuid,
  payload_summary jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT distribution_logs_status_check CHECK (status IN ('success','failed','info')),
  CONSTRAINT distribution_logs_channel_fk FOREIGN KEY (channel_id, restaurant_id)
    REFERENCES public.distribution_channels(id, restaurant_id) ON DELETE SET NULL
);

CREATE TABLE public.housekeeping_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  room_id uuid NULL,
  event_type text NOT NULL CHECK (event_type = ANY (ARRAY[
    'room_dirty','cleaning_task_created','task_assigned','cleaning_started','cleaning_completed',
    'task_cancelled','inspection_passed','inspection_failed','room_reclean_required',
    'room_ooo','room_oos','room_released','discrepancy_created','discrepancy_resolved',
    'maintenance_created','maintenance_updated','maintenance_resolved'
  ])),
  previous_values jsonb NULL,
  new_values jsonb NULL,
  notes text NULL,
  actor_membership_id uuid NULL REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT housekeeping_history_room_same_property
    FOREIGN KEY (room_id, restaurant_id) REFERENCES public.hotel_rooms(id, restaurant_id)
);

CREATE TABLE public.housekeeping_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  room_id uuid NOT NULL,
  task_type text NOT NULL CHECK (task_type = ANY (ARRAY[
    'departure_cleaning','stayover_cleaning','touch_up','deep_cleaning','re_clean'
  ])),
  status text NOT NULL DEFAULT 'pending' CHECK (status = ANY (ARRAY[
    'pending','assigned','in_progress','completed','cancelled'
  ])),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority = ANY (ARRAY['normal','high','urgent'])),
  assigned_membership_id uuid NULL REFERENCES public.restaurant_users(id),
  notes text NULL,
  created_by_membership_id uuid NULL REFERENCES public.restaurant_users(id),
  started_at timestamptz NULL,
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT housekeeping_tasks_room_same_property
    FOREIGN KEY (room_id, restaurant_id) REFERENCES public.hotel_rooms(id, restaurant_id)
);

CREATE TABLE public.housekeeping_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  room_id uuid NOT NULL,
  task_id uuid NULL REFERENCES public.housekeeping_tasks(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status = ANY (ARRAY['pending','passed','failed'])),
  inspector_membership_id uuid NULL REFERENCES public.restaurant_users(id),
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  CONSTRAINT housekeeping_inspections_room_same_property
    FOREIGN KEY (room_id, restaurant_id) REFERENCES public.hotel_rooms(id, restaurant_id)
);

CREATE TABLE public.housekeeping_discrepancies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  room_id uuid NOT NULL,
  reported_occupancy text NULL CHECK (reported_occupancy IS NULL OR reported_occupancy = ANY (ARRAY['vacant','occupied'])),
  actual_occupancy text NULL CHECK (actual_occupancy IS NULL OR actual_occupancy = ANY (ARRAY['vacant','occupied'])),
  reported_hk_status text NULL,
  actual_hk_status text NULL,
  reason text NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status = ANY (ARRAY['open','resolved'])),
  reported_by_membership_id uuid NULL REFERENCES public.restaurant_users(id),
  resolved_by_membership_id uuid NULL REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL,
  CONSTRAINT housekeeping_discrepancies_room_same_property
    FOREIGN KEY (room_id, restaurant_id) REFERENCES public.hotel_rooms(id, restaurant_id)
);

CREATE TABLE public.housekeeping_maintenance_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  room_id uuid NOT NULL,
  category text NOT NULL CHECK (category = ANY (ARRAY['plumbing','electrical','furniture','equipment','other'])),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority = ANY (ARRAY['normal','high','urgent'])),
  description text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status = ANY (ARRAY['open','in_progress','resolved'])),
  created_by_membership_id uuid NULL REFERENCES public.restaurant_users(id),
  resolved_by_membership_id uuid NULL REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL,
  CONSTRAINT housekeeping_maintenance_room_same_property
    FOREIGN KEY (room_id, restaurant_id) REFERENCES public.hotel_rooms(id, restaurant_id)
);

CREATE TABLE public.guest_folio_counters (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  last_number bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.guest_folios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  guest_id uuid NOT NULL,
  reservation_id uuid,
  folio_number text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  currency text NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_by_membership_id uuid REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guest_folios_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT guest_folios_number_unique UNIQUE (restaurant_id, folio_number),
  CONSTRAINT guest_folios_status_check CHECK (status IN ('open','closed')),
  CONSTRAINT guest_folios_guest_same_property FOREIGN KEY (guest_id, restaurant_id)
    REFERENCES public.guest_profiles(id, restaurant_id),
  CONSTRAINT guest_folios_reservation_same_property FOREIGN KEY (reservation_id, restaurant_id)
    REFERENCES public.hotel_reservations(id, restaurant_id)
);

CREATE TABLE public.folio_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  folio_id uuid NOT NULL,
  transaction_type text NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  amount numeric(12,2) NOT NULL,
  reference_type text,
  reference_id uuid,
  posted_by_membership_id uuid REFERENCES public.restaurant_users(id),
  posted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT folio_transactions_type_check CHECK (
    transaction_type IN ('charge','payment','deposit','refund','adjustment','discount')
  ),
  CONSTRAINT folio_transactions_category_check CHECK (
    category IN ('room','manual','payment','deposit','refund','adjustment','discount','future_restaurant')
  ),
  CONSTRAINT folio_transactions_amount_check CHECK (amount <> 0),
  CONSTRAINT folio_transactions_folio_same_property FOREIGN KEY (folio_id, restaurant_id)
    REFERENCES public.guest_folios(id, restaurant_id)
);

CREATE TABLE public.cashier_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  opening_cash numeric(12,2),
  closing_cash numeric(12,2),
  status text NOT NULL DEFAULT 'open',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cashier_shifts_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT cashier_shifts_status_check CHECK (status IN ('open','closed')),
  CONSTRAINT cashier_shifts_membership_same_property FOREIGN KEY (membership_id, restaurant_id)
    REFERENCES public.restaurant_users(id, restaurant_id)
);

CREATE TABLE public.folio_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  folio_id uuid,
  cashier_shift_id uuid,
  event_type text NOT NULL,
  previous_values jsonb,
  new_values jsonb,
  notes text,
  actor_membership_id uuid REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT folio_history_event_check CHECK (event_type IN (
    'folio_opened','room_charge_posted','manual_charge_posted','payment_received','deposit_received',
    'refund_posted','adjustment_posted','discount_posted','folio_closed',
    'cashier_shift_opened','cashier_shift_closed'
  )),
  CONSTRAINT folio_history_folio_same_property FOREIGN KEY (folio_id, restaurant_id)
    REFERENCES public.guest_folios(id, restaurant_id),
  CONSTRAINT folio_history_shift_same_property FOREIGN KEY (cashier_shift_id, restaurant_id)
    REFERENCES public.cashier_shifts(id, restaurant_id)
);

CREATE TABLE public.night_audit_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  business_date date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','ready','closed','failed')),
  started_by_membership_id uuid REFERENCES public.restaurant_users(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  closed_by_membership_id uuid REFERENCES public.restaurant_users(id) ON DELETE SET NULL,
  closed_at timestamptz,
  summary jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, business_date)
);

CREATE TABLE public.night_audit_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  night_audit_run_id uuid NOT NULL REFERENCES public.night_audit_runs(id) ON DELETE CASCADE,
  exception_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('warning','blocking')),
  reference_type text,
  reference_id uuid,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','ignored')),
  resolved_by_membership_id uuid REFERENCES public.restaurant_users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  cashier_shift_id uuid REFERENCES public.cashier_shifts(id) ON DELETE SET NULL,
  method text NOT NULL CHECK (method = ANY (ARRAY['cash'::text, 'card'::text])),
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  tendered_amount numeric(10,2),
  change_amount numeric(10,2) NOT NULL DEFAULT 0,
  reference text,
  membership_id uuid REFERENCES public.restaurant_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.pos_settings (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  default_tax_rate numeric(5,2) NOT NULL DEFAULT 0,
  tax_inclusive boolean NOT NULL DEFAULT false,
  receipt_header text,
  receipt_footer text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_settings_tax_rate_check CHECK (default_tax_rate >= 0 AND default_tax_rate <= 100)
);

CREATE TABLE public.pos_registers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  location_label text,
  active boolean NOT NULL DEFAULT true,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_registers_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pos_registers_name_unique UNIQUE (restaurant_id, name)
);

CREATE TABLE public.pos_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_categories_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pos_categories_name_unique UNIQUE (restaurant_id, name)
);

CREATE TABLE public.pos_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  category_id uuid,
  name text NOT NULL,
  sku text,
  barcode text,
  description text,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  tax_rate numeric(5,2),
  cost_price numeric(12,2),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_products_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pos_products_price_check CHECK (unit_price >= 0),
  CONSTRAINT pos_products_tax_rate_check CHECK (tax_rate IS NULL OR (tax_rate >= 0 AND tax_rate <= 100)),
  CONSTRAINT pos_products_category_same_property FOREIGN KEY (category_id, restaurant_id)
    REFERENCES public.pos_categories(id, restaurant_id) ON DELETE SET NULL
);

CREATE TABLE public.pos_cashier_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  register_id uuid NOT NULL,
  business_date date NOT NULL,
  status text NOT NULL DEFAULT 'open',
  opening_float numeric(12,2) NOT NULL DEFAULT 0,
  opened_by_membership_id uuid NOT NULL REFERENCES public.restaurant_users(id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_by_membership_id uuid REFERENCES public.restaurant_users(id),
  closed_at timestamptz,
  closing_cash numeric(12,2),
  expected_cash numeric(12,2),
  variance numeric(12,2),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_shifts_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pos_shifts_status_check CHECK (status IN ('open','closed')),
  CONSTRAINT pos_shifts_register_same_property FOREIGN KEY (register_id, restaurant_id)
    REFERENCES public.pos_registers(id, restaurant_id)
);

CREATE TABLE public.pos_sale_counters (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  last_number bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.pos_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  register_id uuid NOT NULL,
  shift_id uuid,
  sale_number bigint,
  sale_reference text,
  status text NOT NULL DEFAULT 'open',
  business_date date NOT NULL,
  currency_code text NOT NULL,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  discount_reason text,
  tax_amount numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  refunded_amount numeric(12,2) NOT NULL DEFAULT 0,
  customer_reference text,
  note text,
  opened_by_membership_id uuid NOT NULL REFERENCES public.restaurant_users(id),
  completed_by_membership_id uuid REFERENCES public.restaurant_users(id),
  cashier_name_snapshot text,
  completed_at timestamptz,
  voided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_sales_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pos_sales_status_check CHECK (status IN ('open','completed','voided','partially_refunded','refunded')),
  CONSTRAINT pos_sales_number_unique UNIQUE (restaurant_id, sale_number),
  CONSTRAINT pos_sales_register_same_property FOREIGN KEY (register_id, restaurant_id)
    REFERENCES public.pos_registers(id, restaurant_id),
  CONSTRAINT pos_sales_shift_same_property FOREIGN KEY (shift_id, restaurant_id)
    REFERENCES public.pos_cashier_shifts(id, restaurant_id)
);

CREATE TABLE public.pos_sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  sale_id uuid NOT NULL,
  product_id uuid,
  product_name_snapshot text NOT NULL,
  sku_snapshot text,
  quantity numeric(10,3) NOT NULL,
  unit_price_snapshot numeric(12,2) NOT NULL,
  tax_rate_snapshot numeric(5,2) NOT NULL DEFAULT 0,
  tax_amount numeric(12,2) NOT NULL DEFAULT 0,
  discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  line_subtotal numeric(12,2) NOT NULL DEFAULT 0,
  line_total numeric(12,2) NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_sale_items_quantity_check CHECK (quantity > 0),
  CONSTRAINT pos_sale_items_sale_same_property FOREIGN KEY (sale_id, restaurant_id)
    REFERENCES public.pos_sales(id, restaurant_id) ON DELETE CASCADE,
  CONSTRAINT pos_sale_items_product_same_property FOREIGN KEY (product_id, restaurant_id)
    REFERENCES public.pos_products(id, restaurant_id) ON DELETE SET NULL
);

CREATE TABLE public.pos_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  sale_id uuid NOT NULL,
  shift_id uuid,
  payment_method text NOT NULL,
  amount numeric(12,2) NOT NULL,
  tendered_amount numeric(12,2),
  change_amount numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'captured',
  reference text,
  received_by_membership_id uuid NOT NULL REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_payments_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pos_payments_amount_check CHECK (amount > 0),
  CONSTRAINT pos_payments_method_check CHECK (payment_method IN ('cash','card','voucher','other')),
  CONSTRAINT pos_payments_status_check CHECK (status IN ('captured','voided')),
  CONSTRAINT pos_payments_sale_same_property FOREIGN KEY (sale_id, restaurant_id)
    REFERENCES public.pos_sales(id, restaurant_id),
  CONSTRAINT pos_payments_shift_same_property FOREIGN KEY (shift_id, restaurant_id)
    REFERENCES public.pos_cashier_shifts(id, restaurant_id)
);

CREATE TABLE public.pos_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  sale_id uuid NOT NULL,
  payment_id uuid,
  shift_id uuid,
  amount numeric(12,2) NOT NULL,
  method text NOT NULL,
  reason text,
  line_detail jsonb,
  authorized_by_membership_id uuid REFERENCES public.restaurant_users(id),
  processed_by_membership_id uuid NOT NULL REFERENCES public.restaurant_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_refunds_amount_check CHECK (amount > 0),
  CONSTRAINT pos_refunds_method_check CHECK (method IN ('cash','card','voucher','other')),
  CONSTRAINT pos_refunds_sale_same_property FOREIGN KEY (sale_id, restaurant_id)
    REFERENCES public.pos_sales(id, restaurant_id),
  CONSTRAINT pos_refunds_payment_same_property FOREIGN KEY (payment_id, restaurant_id)
    REFERENCES public.pos_payments(id, restaurant_id),
  CONSTRAINT pos_refunds_shift_same_property FOREIGN KEY (shift_id, restaurant_id)
    REFERENCES public.pos_cashier_shifts(id, restaurant_id)
);

-- 4. Surviving ALTER TABLE overlays (columns, constraints, replica identity, RLS enable)

-- from 20260813184557_7bc6eb3a-a48e-42af-ba86-c737fdfdd059.sql
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

-- from 20260813184557_7bc6eb3a-a48e-42af-ba86-c737fdfdd059.sql
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- from 20260813184557_7bc6eb3a-a48e-42af-ba86-c737fdfdd059.sql
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- from 20260813184557_7bc6eb3a-a48e-42af-ba86-c737fdfdd059.sql
ALTER TABLE public.orders REPLICA IDENTITY FULL;

-- from 20260814003113_eb733d19-efd3-49b5-9870-e4838d7dc988.sql
ALTER TABLE public.order_items REPLICA IDENTITY FULL;

-- from 20260814103630_5a7b009d-29cf-4fc4-8cf6-91226bd2a62b.sql
alter table public.profiles enable row level security;

-- from 20260814103630_5a7b009d-29cf-4fc4-8cf6-91226bd2a62b.sql
alter table public.restaurants enable row level security;

-- from 20260814103630_5a7b009d-29cf-4fc4-8cf6-91226bd2a62b.sql
alter table public.restaurant_users enable row level security;

-- from 20260814103630_5a7b009d-29cf-4fc4-8cf6-91226bd2a62b.sql
alter table public.restaurant_tables enable row level security;

-- from 20260814103630_5a7b009d-29cf-4fc4-8cf6-91226bd2a62b.sql
alter table public.menu_categories enable row level security;

-- from 20260814103630_5a7b009d-29cf-4fc4-8cf6-91226bd2a62b.sql
alter table public.menu_items
  add column if not exists restaurant_id uuid references public.restaurants(id) on delete cascade,
  add column if not exists category_id uuid references public.menu_categories(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

-- from 20260814103630_5a7b009d-29cf-4fc4-8cf6-91226bd2a62b.sql
alter table public.orders
  add column if not exists restaurant_id uuid references public.restaurants(id) on delete restrict,
  add column if not exists customer_id uuid references auth.users(id) on delete set null,
  add column if not exists restaurant_table_id uuid references public.restaurant_tables(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

-- from 20260814103630_5a7b009d-29cf-4fc4-8cf6-91226bd2a62b.sql
alter table public.orders drop constraint if exists orders_status_check;

-- from 20260814103630_5a7b009d-29cf-4fc4-8cf6-91226bd2a62b.sql
alter table public.orders add constraint orders_status_check
  check (status in ('new','placed','accepted','preparing','ready','served','cancelled'));

-- from 20260814103630_5a7b009d-29cf-4fc4-8cf6-91226bd2a62b.sql
alter table public.order_items add column if not exists line_total numeric;

-- from 20260814103630_5a7b009d-29cf-4fc4-8cf6-91226bd2a62b.sql
alter table public.order_status_history enable row level security;

-- from 20260814233716_335f2c61-9890-4f39-983d-bf7454603893.sql
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS suspension_reason text,
  ADD COLUMN IF NOT EXISTS status_updated_at timestamptz;

-- from 20260814233716_335f2c61-9890-4f39-983d-bf7454603893.sql
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- from 20260819122901_0acd76ea-943a-41df-b298-422d1bd20112.sql
ALTER TABLE public.menu_categories ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- from 20260819132937_16285d12-8e87-4a2d-981e-25abad55d1cc.sql
ALTER TABLE public.restaurant_tables
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

-- from 20260819133056_857c5e21-166e-4ee9-9d62-614fd4bb6fd5.sql
ALTER TABLE public.orders
  ALTER COLUMN table_number TYPE text USING table_number::text;

-- from 20260820221648_e7df0d54-9ed5-47d3-ac22-ca3dd1b9241b.sql
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS guest_token_hash text;

-- from 0000_staff_audit_log_and_membership_updated_at.sql
ALTER TABLE public.restaurant_users ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- from 0000_staff_audit_log_and_membership_updated_at.sql
ALTER TABLE public.restaurant_staff_audit_log ENABLE ROW LEVEL SECURITY;

-- from 0001_create_workforce_core.sql
ALTER TABLE public.staff_shifts ENABLE ROW LEVEL SECURITY;

-- from 0001_create_workforce_core.sql
ALTER TABLE public.staff_attendance ENABLE ROW LEVEL SECURITY;

-- from 0001_create_workforce_core.sql
ALTER TABLE public.staff_table_assignments ENABLE ROW LEVEL SECURITY;

-- from 0002_order_waiter_attribution.sql
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_source text NOT NULL DEFAULT 'customer_qr',
  ADD COLUMN IF NOT EXISTS assigned_waiter_membership_id uuid NULL REFERENCES public.restaurant_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by_staff_membership_id uuid NULL REFERENCES public.restaurant_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_waiter_name_snapshot text NULL,
  ADD COLUMN IF NOT EXISTS created_by_staff_name_snapshot text NULL;

-- from 0002_order_waiter_attribution.sql
ALTER TABLE public.orders
  ADD CONSTRAINT orders_order_source_check
  CHECK (order_source IN ('customer_qr', 'waiter_assisted'));

-- from 0002_order_waiter_attribution.sql
ALTER TABLE public.orders
  ADD CONSTRAINT orders_source_attribution_check
  CHECK (
    (order_source = 'customer_qr' AND created_by_staff_membership_id IS NULL)
    OR (order_source = 'waiter_assisted' AND created_by_staff_membership_id IS NOT NULL)
  );

-- from 0003_restaurant_settings_timezone.sql
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Europe/London',
  ADD COLUMN IF NOT EXISTS currency_code text NOT NULL DEFAULT 'GBP';

-- from 0003_restaurant_settings_timezone.sql
ALTER TABLE public.restaurant_opening_hours ENABLE ROW LEVEL SECURITY;

-- from 0005_create_inventory_core.sql
ALTER TABLE public.inventory_units ENABLE ROW LEVEL SECURITY;

-- from 0005_create_inventory_core.sql
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

-- from 0005_create_inventory_core.sql
ALTER TABLE public.inventory_stock_movements ENABLE ROW LEVEL SECURITY;

-- from 0006_create_restaurant_assets.sql
ALTER TABLE public.restaurant_assets ENABLE ROW LEVEL SECURITY;

-- from 0006_create_restaurant_assets.sql
ALTER TABLE public.restaurant_asset_history ENABLE ROW LEVEL SECURITY;

-- from 0008_create_purchasing_core.sql
ALTER TABLE public.restaurant_suppliers ENABLE ROW LEVEL SECURITY;

-- from 0008_create_purchasing_core.sql
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

-- from 0008_create_purchasing_core.sql
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

-- from 0008_create_purchasing_core.sql
ALTER TABLE public.purchase_order_history ENABLE ROW LEVEL SECURITY;

-- from 0008_create_purchasing_core.sql
ALTER TABLE public.inventory_stock_movements
  ADD COLUMN purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  ADD COLUMN purchase_order_item_id uuid REFERENCES public.purchase_order_items(id) ON DELETE SET NULL,
  ADD COLUMN supplier_id uuid REFERENCES public.restaurant_suppliers(id) ON DELETE SET NULL;

-- from 0009_create_recipe_components.sql
ALTER TABLE public.menu_item_recipe_components ENABLE ROW LEVEL SECURITY;

-- from 0010_create_room_foundation.sql
ALTER TABLE public.room_types ENABLE ROW LEVEL SECURITY;

-- from 0010_create_room_foundation.sql
ALTER TABLE public.hotel_rooms ENABLE ROW LEVEL SECURITY;

-- from 0010_create_room_foundation.sql
ALTER TABLE public.room_amenities ENABLE ROW LEVEL SECURITY;

-- from 0010_create_room_foundation.sql
ALTER TABLE public.room_type_amenities ENABLE ROW LEVEL SECURITY;

-- from 0010_create_room_foundation.sql
ALTER TABLE public.room_type_images ENABLE ROW LEVEL SECURITY;

-- from 0012_create_guest_profiles.sql
ALTER TABLE public.guest_profiles ENABLE ROW LEVEL SECURITY;

-- from 0012_create_guest_profiles.sql
ALTER TABLE public.guest_preferences ENABLE ROW LEVEL SECURITY;

-- from 0012_create_guest_profiles.sql
ALTER TABLE public.guest_profile_history ENABLE ROW LEVEL SECURITY;

-- hotel_rooms_id_restaurant_unique and hotel_rooms_id_restaurant_type_unique
-- are declared on CREATE TABLE public.hotel_rooms (required before composite FKs).

-- from 0013_create_hotel_reservations.sql
ALTER TABLE public.hotel_reservation_counters ENABLE ROW LEVEL SECURITY;

-- from 0013_create_hotel_reservations.sql
ALTER TABLE public.hotel_reservations ENABLE ROW LEVEL SECURITY;

-- from 0013_create_hotel_reservations.sql
ALTER TABLE public.hotel_reservation_history ENABLE ROW LEVEL SECURITY;

-- from 0014_front_office_operations.sql
ALTER TABLE public.hotel_reservations DROP CONSTRAINT hotel_reservations_status_check;

-- from 0014_front_office_operations.sql
ALTER TABLE public.hotel_reservations ADD CONSTRAINT hotel_reservations_status_check
  CHECK (status IN ('pending','confirmed','cancelled','checked_in','checked_out','no_show'));

-- from 0014_front_office_operations.sql
ALTER TABLE public.hotel_reservations DROP CONSTRAINT hotel_reservations_source_check;

-- from 0014_front_office_operations.sql
ALTER TABLE public.hotel_reservations ADD CONSTRAINT hotel_reservations_source_check
  CHECK (source IN ('staff','walk_in','future_online'));

-- from 0014_front_office_operations.sql
ALTER TABLE public.hotel_reservation_history DROP CONSTRAINT hotel_reservation_history_event_check;

-- from 0014_front_office_operations.sql
ALTER TABLE public.hotel_reservation_history ADD CONSTRAINT hotel_reservation_history_event_check
  CHECK (event_type IN (
    'created','confirmed','amended','cancelled','room_assigned','room_changed','status_changed',
    'check_in','check_out','room_moved','stay_extended','stay_shortened','no_show'
  ));

-- from 0015_housekeeping_operations.sql
ALTER TABLE public.restaurant_users DROP CONSTRAINT IF EXISTS restaurant_users_role_check;

-- from 0015_housekeeping_operations.sql
ALTER TABLE public.restaurant_users
  ADD CONSTRAINT restaurant_users_role_check
  CHECK (role = ANY (ARRAY['owner','manager','kitchen','waiter','housekeeping']));

-- from 0015_housekeeping_operations.sql
ALTER TABLE public.hotel_rooms
  ADD COLUMN IF NOT EXISTS housekeeping_status text NOT NULL DEFAULT 'dirty',
  ADD COLUMN IF NOT EXISTS restriction_reason text NULL,
  ADD COLUMN IF NOT EXISTS restriction_expected_return date NULL;

-- from 0015_housekeeping_operations.sql
ALTER TABLE public.hotel_rooms DROP CONSTRAINT IF EXISTS hotel_rooms_hk_status_check;

-- from 0015_housekeeping_operations.sql
ALTER TABLE public.hotel_rooms
  ADD CONSTRAINT hotel_rooms_hk_status_check
  CHECK (housekeeping_status = ANY (ARRAY['dirty','clean','inspected','pickup']));

-- from 0015_housekeeping_operations.sql
ALTER TABLE public.housekeeping_history ENABLE ROW LEVEL SECURITY;

-- from 0015_housekeeping_operations.sql
ALTER TABLE public.housekeeping_tasks ENABLE ROW LEVEL SECURITY;

-- from 0015_housekeeping_operations.sql
ALTER TABLE public.housekeeping_inspections ENABLE ROW LEVEL SECURITY;

-- from 0015_housekeeping_operations.sql
ALTER TABLE public.housekeeping_discrepancies ENABLE ROW LEVEL SECURITY;

-- from 0015_housekeeping_operations.sql
ALTER TABLE public.housekeeping_maintenance_requests ENABLE ROW LEVEL SECURITY;

-- from 0016_create_hotel_rates.sql
ALTER TABLE public.hotel_reservation_history DROP CONSTRAINT hotel_reservation_history_event_check;

-- from 0016_create_hotel_rates.sql
ALTER TABLE public.hotel_reservation_history ADD CONSTRAINT hotel_reservation_history_event_check
  CHECK (event_type IN (
    'created','confirmed','amended','cancelled','room_assigned','room_changed','status_changed',
    'check_in','check_out','room_moved','stay_extended','stay_shortened','no_show','repriced'
  ));

-- from 0016_create_hotel_rates.sql
ALTER TABLE public.hotel_rate_categories ENABLE ROW LEVEL SECURITY;

-- from 0016_create_hotel_rates.sql
ALTER TABLE public.hotel_rate_plans ENABLE ROW LEVEL SECURITY;

-- from 0016_create_hotel_rates.sql
ALTER TABLE public.hotel_rate_calendar ENABLE ROW LEVEL SECURITY;

-- from 0016_create_hotel_rates.sql
ALTER TABLE public.hotel_rate_restrictions ENABLE ROW LEVEL SECURITY;

-- from 0016_create_hotel_rates.sql
ALTER TABLE public.hotel_reservations
  ADD COLUMN rate_plan_id uuid,
  ADD COLUMN currency text,
  ADD COLUMN room_subtotal numeric(12,2),
  ADD COLUMN nightly_rate_snapshot jsonb,
  ADD COLUMN priced_at timestamptz;

-- from 0016_create_hotel_rates.sql
ALTER TABLE public.hotel_reservations
  ADD CONSTRAINT hotel_reservations_rate_plan_same_property FOREIGN KEY (rate_plan_id, restaurant_id)
    REFERENCES public.hotel_rate_plans(id, restaurant_id);

-- restaurant_users_id_restaurant_unique is declared on CREATE TABLE
-- public.restaurant_users (required before cashier_shifts composite FK).

-- from 0017_create_cashiering.sql
ALTER TABLE public.guest_folio_counters ENABLE ROW LEVEL SECURITY;

-- from 0017_create_cashiering.sql
ALTER TABLE public.guest_folios ENABLE ROW LEVEL SECURITY;

-- from 0017_create_cashiering.sql
ALTER TABLE public.folio_transactions ENABLE ROW LEVEL SECURITY;

-- from 0017_create_cashiering.sql
ALTER TABLE public.cashier_shifts ENABLE ROW LEVEL SECURITY;

-- from 0017_create_cashiering.sql
ALTER TABLE public.folio_history ENABLE ROW LEVEL SECURITY;

-- from 0018_night_audit.sql
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS business_date date;

-- from 0018_night_audit.sql
ALTER TABLE public.folio_transactions ADD COLUMN IF NOT EXISTS payment_method text;

-- from 0018_night_audit.sql
ALTER TABLE public.folio_transactions
  ADD CONSTRAINT folio_transactions_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('cash','card','bank_transfer','mobile_money','other'));

-- from 0018_night_audit.sql
ALTER TABLE public.night_audit_runs ENABLE ROW LEVEL SECURITY;

-- from 0018_night_audit.sql
ALTER TABLE public.night_audit_exceptions ENABLE ROW LEVEL SECURITY;

-- from 0019_direct_booking_distribution.sql
ALTER TABLE public.hotel_reservations DROP CONSTRAINT IF EXISTS hotel_reservations_source_check;

-- from 0019_direct_booking_distribution.sql
ALTER TABLE public.hotel_reservations ADD CONSTRAINT hotel_reservations_source_check
  CHECK (source IN ('staff','walk_in','direct_booking','future_online'));

-- from 0019_direct_booking_distribution.sql
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS direct_booking_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS booking_contact_email text,
  ADD COLUMN IF NOT EXISTS booking_contact_phone text,
  ADD COLUMN IF NOT EXISTS booking_message text;

-- from 0019_direct_booking_distribution.sql
ALTER TABLE public.distribution_channels ENABLE ROW LEVEL SECURITY;

-- from 0019_direct_booking_distribution.sql
ALTER TABLE public.distribution_room_mappings ENABLE ROW LEVEL SECURITY;

-- from 0019_direct_booking_distribution.sql
ALTER TABLE public.distribution_rate_mappings ENABLE ROW LEVEL SECURITY;

-- from 0019_direct_booking_distribution.sql
ALTER TABLE public.distribution_logs ENABLE ROW LEVEL SECURITY;

-- from 0020_room_charge.sql
ALTER TABLE public.orders
  ADD COLUMN billing_method text,
  ADD COLUMN room_charge_folio_id uuid,
  ADD COLUMN room_charge_reservation_id uuid,
  ADD COLUMN room_charge_posted_at timestamptz,
  ADD COLUMN room_charge_posted_by_membership_id uuid REFERENCES public.restaurant_users(id),
  ADD CONSTRAINT orders_billing_method_check CHECK (billing_method IS NULL OR billing_method IN ('direct','room_charge')),
  ADD CONSTRAINT orders_room_charge_folio_fkey FOREIGN KEY (room_charge_folio_id) REFERENCES public.guest_folios(id),
  ADD CONSTRAINT orders_room_charge_reservation_fkey FOREIGN KEY (room_charge_reservation_id) REFERENCES public.hotel_reservations(id);

-- from 0020_room_charge.sql
ALTER TABLE public.folio_transactions
  DROP CONSTRAINT folio_transactions_category_check;

-- from 0020_room_charge.sql
ALTER TABLE public.folio_transactions
  ADD CONSTRAINT folio_transactions_category_check CHECK (
    category IN ('room','manual','payment','deposit','refund','adjustment','discount','future_restaurant','restaurant')
  );

-- from 0021_room_charge_history_events.sql
ALTER TABLE public.folio_history DROP CONSTRAINT folio_history_event_check;

-- from 0021_room_charge_history_events.sql
ALTER TABLE public.folio_history ADD CONSTRAINT folio_history_event_check CHECK (
  event_type = ANY (ARRAY[
    'folio_opened','room_charge_posted','manual_charge_posted','payment_received',
    'deposit_received','refund_posted','adjustment_posted','discount_posted',
    'folio_closed','cashier_shift_opened','cashier_shift_closed',
    'restaurant_charge_posted','restaurant_charge_reversed'
  ])
);

-- from 0023_phase_7c_staff_roles_module_access.sql
ALTER TABLE public.restaurant_users DROP CONSTRAINT IF EXISTS restaurant_users_role_check;

-- from 0023_phase_7c_staff_roles_module_access.sql
ALTER TABLE public.restaurant_users ADD CONSTRAINT restaurant_users_role_check CHECK (
  role = ANY (ARRAY[
    'owner'::text,
    'manager'::text,
    'kitchen'::text,
    'waiter'::text,
    'housekeeping'::text,
    'receptionist'::text,
    'housekeeper'::text,
    'housekeeping_supervisor'::text,
    'cashier'::text,
    'storekeeper'::text,
    'accountant'::text,
    'maintenance'::text
  ])
);

-- from 0023_phase_7c_staff_roles_module_access.sql
ALTER TABLE public.staff_module_access ENABLE ROW LEVEL SECURITY;

-- from 0025_phase_7d_pos_sales.sql
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_order_source_check;

-- from 0025_phase_7d_pos_sales.sql
ALTER TABLE public.orders ADD CONSTRAINT orders_order_source_check
  CHECK (order_source = ANY (ARRAY['customer_qr'::text, 'waiter_assisted'::text, 'pos_counter'::text]));

-- from 0025_phase_7d_pos_sales.sql
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_source_attribution_check;

-- from 0025_phase_7d_pos_sales.sql
ALTER TABLE public.orders ADD CONSTRAINT orders_source_attribution_check
  CHECK (
    (order_source = 'customer_qr' AND created_by_staff_membership_id IS NULL)
    OR (order_source IN ('waiter_assisted', 'pos_counter') AND created_by_staff_membership_id IS NOT NULL)
  );

-- from 0025_phase_7d_pos_sales.sql
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_type text;

-- from 0025_phase_7d_pos_sales.sql
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_order_type_check;

-- from 0025_phase_7d_pos_sales.sql
ALTER TABLE public.orders ADD CONSTRAINT orders_order_type_check
  CHECK (order_type IS NULL OR order_type = ANY (ARRAY['counter'::text, 'takeaway'::text, 'dine_in'::text]));

-- from 0025_phase_7d_pos_sales.sql
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- from 0025_phase_7d_pos_sales.sql
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cashier_shift_id uuid REFERENCES public.cashier_shifts(id) ON DELETE SET NULL;

-- from 0025_phase_7d_pos_sales.sql
ALTER TABLE public.order_payments ENABLE ROW LEVEL SECURITY;

-- from 0027_package_entitlements.sql
ALTER TABLE public.restaurant_package_entitlements ENABLE ROW LEVEL SECURITY;

-- from 0030_standalone_pos_foundation.sql
ALTER TABLE public.staff_module_access DROP CONSTRAINT IF EXISTS staff_module_access_module_key_check;

-- from 0030_standalone_pos_foundation.sql
ALTER TABLE public.staff_module_access ADD CONSTRAINT staff_module_access_module_key_check CHECK (
  module_key = ANY (ARRAY[
    'food_and_beverage'::text,
    'front_office'::text,
    'housekeeping'::text,
    'pos'::text,
    'standalone_pos'::text,
    'inventory'::text,
    'procurement'::text,
    'human_resources'::text,
    'accounting_finance'::text,
    'reports_analytics'::text,
    'configuration'::text,
    'property_settings'::text
  ])
);

-- from 0030_standalone_pos_foundation.sql
ALTER TABLE public.pos_settings ENABLE ROW LEVEL SECURITY;

-- from 0030_standalone_pos_foundation.sql
ALTER TABLE public.pos_registers ENABLE ROW LEVEL SECURITY;

-- from 0030_standalone_pos_foundation.sql
ALTER TABLE public.pos_categories ENABLE ROW LEVEL SECURITY;

-- from 0030_standalone_pos_foundation.sql
ALTER TABLE public.pos_products ENABLE ROW LEVEL SECURITY;

-- from 0030_standalone_pos_foundation.sql
ALTER TABLE public.pos_cashier_shifts ENABLE ROW LEVEL SECURITY;

-- from 0030_standalone_pos_foundation.sql
ALTER TABLE public.pos_sale_counters ENABLE ROW LEVEL SECURITY;

-- from 0030_standalone_pos_foundation.sql
ALTER TABLE public.pos_sales ENABLE ROW LEVEL SECURITY;

-- from 0030_standalone_pos_foundation.sql
ALTER TABLE public.pos_sale_items ENABLE ROW LEVEL SECURITY;

-- from 0030_standalone_pos_foundation.sql
ALTER TABLE public.pos_payments ENABLE ROW LEVEL SECURITY;

-- from 0030_standalone_pos_foundation.sql
ALTER TABLE public.pos_refunds ENABLE ROW LEVEL SECURITY;


-- 5. Indexes (last definition per index name)

CREATE INDEX IF NOT EXISTS admin_audit_log_created_at_idx ON public.admin_audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS admin_audit_log_restaurant_idx ON public.admin_audit_log (restaurant_id);

CREATE UNIQUE INDEX cashier_shifts_one_open
  ON public.cashier_shifts(restaurant_id, membership_id)
  WHERE status = 'open';

CREATE INDEX distribution_logs_restaurant_idx ON public.distribution_logs(restaurant_id, created_at DESC);

CREATE INDEX distribution_rate_mappings_channel_idx ON public.distribution_rate_mappings(channel_id);

CREATE INDEX distribution_room_mappings_channel_idx ON public.distribution_room_mappings(channel_id);

CREATE INDEX folio_history_property_idx ON public.folio_history(restaurant_id, created_at DESC);

CREATE INDEX folio_transactions_folio_idx ON public.folio_transactions(folio_id, posted_at);

CREATE INDEX folio_transactions_property_date_idx ON public.folio_transactions(restaurant_id, posted_at);

CREATE UNIQUE INDEX folio_transactions_restaurant_order_once
  ON public.folio_transactions(restaurant_id, reference_type, reference_id)
  WHERE reference_type = 'restaurant_order';

CREATE UNIQUE INDEX folio_transactions_room_charge_once
  ON public.folio_transactions(restaurant_id, reference_type, reference_id)
  WHERE reference_type = 'reservation_room_charge';

CREATE UNIQUE INDEX guest_folios_one_per_reservation
  ON public.guest_folios(restaurant_id, reservation_id)
  WHERE reservation_id IS NOT NULL;

CREATE INDEX guest_folios_status_idx ON public.guest_folios(restaurant_id, status);

CREATE INDEX guest_preferences_restaurant_idx ON public.guest_preferences(restaurant_id);

CREATE INDEX guest_profile_history_guest_idx ON public.guest_profile_history(guest_id, created_at DESC);

CREATE INDEX guest_profiles_email_idx ON public.guest_profiles(restaurant_id, email_normalized);

CREATE INDEX guest_profiles_phone_idx ON public.guest_profiles(restaurant_id, phone_normalized);

CREATE INDEX guest_profiles_restaurant_idx ON public.guest_profiles(restaurant_id);

CREATE INDEX hotel_rate_calendar_lookup_idx ON public.hotel_rate_calendar(restaurant_id, rate_plan_id, rate_date);

CREATE INDEX hotel_rate_plans_type_idx ON public.hotel_rate_plans(restaurant_id, room_type_id, active);

CREATE INDEX hotel_rate_restrictions_lookup_idx
  ON public.hotel_rate_restrictions(restaurant_id, rate_plan_id, restriction_date);

CREATE INDEX hotel_reservation_history_reservation_idx
  ON public.hotel_reservation_history(reservation_id, created_at DESC);

CREATE INDEX hotel_reservations_arrival_idx ON public.hotel_reservations(restaurant_id, arrival_date);

CREATE INDEX hotel_reservations_departure_idx ON public.hotel_reservations(restaurant_id, departure_date);

CREATE INDEX hotel_reservations_guest_idx ON public.hotel_reservations(restaurant_id, guest_id);

CREATE INDEX hotel_reservations_room_idx ON public.hotel_reservations(restaurant_id, room_id, arrival_date);

CREATE INDEX hotel_reservations_status_idx ON public.hotel_reservations(restaurant_id, status);

CREATE INDEX hotel_reservations_type_idx ON public.hotel_reservations(restaurant_id, room_type_id, arrival_date);

CREATE INDEX hotel_rooms_restaurant_idx ON public.hotel_rooms(restaurant_id);

CREATE INDEX hotel_rooms_type_idx ON public.hotel_rooms(room_type_id);

CREATE INDEX housekeeping_discrepancies_open_idx
  ON public.housekeeping_discrepancies (restaurant_id, status, created_at DESC);

CREATE INDEX housekeeping_history_room_idx ON public.housekeeping_history (restaurant_id, room_id, created_at DESC);

CREATE INDEX housekeeping_inspections_room_idx
  ON public.housekeeping_inspections (restaurant_id, room_id, created_at DESC);

CREATE INDEX housekeeping_maintenance_status_idx
  ON public.housekeeping_maintenance_requests (restaurant_id, status, created_at DESC);

CREATE INDEX housekeeping_tasks_board_idx ON public.housekeeping_tasks (restaurant_id, status, created_at DESC);

CREATE UNIQUE INDEX housekeeping_tasks_one_open_per_room
  ON public.housekeeping_tasks (restaurant_id, room_id)
  WHERE status IN ('pending','assigned','in_progress');

create index if not exists idx_menu_categories_restaurant_id on public.menu_categories(restaurant_id);

create index if not exists idx_menu_items_category_id on public.menu_items(category_id);

create index if not exists idx_menu_items_restaurant_id on public.menu_items(restaurant_id);

create index if not exists idx_order_items_order_id on public.order_items(order_id);

create index if not exists idx_order_status_history_order_id on public.order_status_history(order_id);

CREATE INDEX IF NOT EXISTS idx_orders_assigned_waiter ON public.orders (assigned_waiter_membership_id);

create index if not exists idx_orders_created_at on public.orders(created_at);

create index if not exists idx_orders_customer_id on public.orders(customer_id);

CREATE INDEX IF NOT EXISTS idx_orders_order_source ON public.orders (order_source);

create index if not exists idx_orders_restaurant_id on public.orders(restaurant_id);

create index if not exists idx_orders_restaurant_table_id on public.orders(restaurant_table_id);

create index if not exists idx_orders_status on public.orders(status);

CREATE INDEX idx_restaurant_opening_hours_restaurant ON public.restaurant_opening_hours(restaurant_id);

create index if not exists idx_restaurant_tables_restaurant_id on public.restaurant_tables(restaurant_id);

create index if not exists idx_restaurant_users_restaurant_id on public.restaurant_users(restaurant_id);

create index if not exists idx_restaurant_users_user_id on public.restaurant_users(user_id);

CREATE INDEX inventory_items_restaurant_idx ON public.inventory_items (restaurant_id, inventory_type);

CREATE UNIQUE INDEX inventory_items_unique_name_idx
  ON public.inventory_items (restaurant_id, lower(btrim(name)), inventory_type);

CREATE INDEX inventory_movements_item_idx
  ON public.inventory_stock_movements (inventory_item_id, created_at DESC);

CREATE INDEX inventory_movements_po_idx ON public.inventory_stock_movements (purchase_order_id);

CREATE INDEX inventory_movements_restaurant_idx
  ON public.inventory_stock_movements (restaurant_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS menu_categories_restaurant_active_name_key
  ON public.menu_categories (restaurant_id, lower(name)) WHERE active;

CREATE INDEX menu_item_recipe_components_ingredient_idx
  ON public.menu_item_recipe_components (restaurant_id, inventory_item_id);

CREATE INDEX menu_item_recipe_components_restaurant_idx
  ON public.menu_item_recipe_components (restaurant_id, menu_item_id);

CREATE UNIQUE INDEX menu_item_recipe_components_unique_idx
  ON public.menu_item_recipe_components (menu_item_id, inventory_item_id);

CREATE INDEX night_audit_exceptions_run_idx ON public.night_audit_exceptions (night_audit_run_id, status);

CREATE UNIQUE INDEX night_audit_exceptions_unique_key
  ON public.night_audit_exceptions (night_audit_run_id, exception_type, coalesce(reference_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS order_payments_order_idx ON public.order_payments(order_id);

CREATE INDEX IF NOT EXISTS order_payments_restaurant_idx ON public.order_payments(restaurant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS order_payments_shift_idx ON public.order_payments(cashier_shift_id);

CREATE INDEX IF NOT EXISTS orders_customer_id_created_at_idx
  ON public.orders (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS orders_guest_token_hash_idx ON public.orders (guest_token_hash) WHERE guest_token_hash IS NOT NULL;

CREATE INDEX orders_room_charge_folio_idx ON public.orders(room_charge_folio_id) WHERE room_charge_folio_id IS NOT NULL;

CREATE INDEX pos_categories_active_idx ON public.pos_categories (restaurant_id, active);

CREATE INDEX pos_payments_sale_idx ON public.pos_payments (sale_id);

CREATE INDEX pos_payments_shift_idx ON public.pos_payments (shift_id);

CREATE INDEX pos_products_active_idx ON public.pos_products (restaurant_id, active);

CREATE UNIQUE INDEX pos_products_barcode_unique ON public.pos_products (restaurant_id, barcode) WHERE barcode IS NOT NULL;

CREATE INDEX pos_products_category_idx ON public.pos_products (restaurant_id, category_id);

CREATE UNIQUE INDEX pos_products_sku_unique ON public.pos_products (restaurant_id, sku) WHERE sku IS NOT NULL;

CREATE INDEX pos_refunds_sale_idx ON public.pos_refunds (sale_id);

CREATE INDEX pos_registers_active_idx ON public.pos_registers (restaurant_id, active);

CREATE INDEX pos_sale_items_product_idx ON public.pos_sale_items (restaurant_id, product_id);

CREATE INDEX pos_sale_items_sale_idx ON public.pos_sale_items (sale_id);

CREATE INDEX pos_sales_business_date_idx ON public.pos_sales (restaurant_id, business_date);

CREATE INDEX pos_sales_register_idx ON public.pos_sales (restaurant_id, register_id);

CREATE INDEX pos_sales_shift_idx ON public.pos_sales (shift_id);

CREATE INDEX pos_sales_status_idx ON public.pos_sales (restaurant_id, status);

CREATE INDEX pos_shifts_business_date_idx ON public.pos_cashier_shifts (restaurant_id, business_date);

CREATE UNIQUE INDEX pos_shifts_one_open_per_register
  ON public.pos_cashier_shifts (restaurant_id, register_id) WHERE status = 'open';

CREATE INDEX purchase_order_history_po_idx ON public.purchase_order_history (purchase_order_id, created_at DESC);

CREATE INDEX purchase_order_items_item_idx ON public.purchase_order_items (inventory_item_id);

CREATE INDEX purchase_order_items_po_idx ON public.purchase_order_items (purchase_order_id);

CREATE INDEX purchase_orders_restaurant_idx ON public.purchase_orders (restaurant_id, status, order_date DESC);

CREATE INDEX purchase_orders_supplier_idx ON public.purchase_orders (supplier_id, order_date DESC);

CREATE UNIQUE INDEX purchase_orders_unique_number_idx
  ON public.purchase_orders (restaurant_id, lower(btrim(po_number)));

CREATE INDEX restaurant_asset_history_asset_idx
  ON public.restaurant_asset_history (asset_id, created_at DESC);

CREATE UNIQUE INDEX restaurant_assets_code_unique
  ON public.restaurant_assets (restaurant_id, lower(asset_code))
  WHERE asset_code IS NOT NULL;

CREATE INDEX restaurant_assets_tenant_idx
  ON public.restaurant_assets (restaurant_id, asset_type, status);

CREATE INDEX restaurant_package_entitlements_restaurant_idx
  ON public.restaurant_package_entitlements (restaurant_id);

CREATE INDEX IF NOT EXISTS restaurant_staff_audit_log_restaurant_created_idx
  ON public.restaurant_staff_audit_log (restaurant_id, created_at DESC);

CREATE INDEX restaurant_suppliers_restaurant_idx ON public.restaurant_suppliers (restaurant_id, active);

CREATE UNIQUE INDEX restaurant_suppliers_unique_name_idx
  ON public.restaurant_suppliers (restaurant_id, lower(btrim(name)));

CREATE UNIQUE INDEX IF NOT EXISTS restaurant_tables_restaurant_lower_number_key
  ON public.restaurant_tables (restaurant_id, lower(table_number));

CREATE INDEX room_type_images_type_idx ON public.room_type_images(room_type_id, display_order);

CREATE INDEX staff_attendance_membership_idx ON public.staff_attendance (staff_membership_id);

CREATE INDEX staff_attendance_shift_idx ON public.staff_attendance (shift_id);

CREATE INDEX staff_module_access_membership_idx ON public.staff_module_access (restaurant_id, membership_id);

CREATE INDEX staff_shifts_membership_date_idx ON public.staff_shifts (staff_membership_id, shift_date);

CREATE INDEX staff_shifts_restaurant_date_idx ON public.staff_shifts (restaurant_id, shift_date);

CREATE INDEX staff_table_assignments_shift_idx ON public.staff_table_assignments (shift_id);

CREATE INDEX staff_table_assignments_table_idx ON public.staff_table_assignments (restaurant_table_id);


-- 5b. RLS helper functions (require restaurant_users / profiles)

CREATE OR REPLACE FUNCTION public.can_manage_restaurant_storage(_path text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select exists (
    select 1 from public.restaurant_users ru
    where ru.user_id = auth.uid()
      and ru.active = true
      and ru.role in ('owner','manager')
      and ru.restaurant_id::text = split_part(_path, '/', 1)
  );
$$;

CREATE OR REPLACE FUNCTION public.has_any_restaurant_role(_restaurant_id uuid, _roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.restaurant_users ru
    WHERE ru.restaurant_id = _restaurant_id
      AND ru.user_id = auth.uid()
      AND ru.active
      AND ru.role = ANY(_roles)
  )
$$;

CREATE OR REPLACE FUNCTION public.has_kitchen_access(_restaurant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select exists (
    select 1 from public.restaurant_users
    where user_id = auth.uid()
      and restaurant_id = _restaurant_id
      and active = true
      and role in ('owner', 'manager', 'kitchen')
  );
$$;

create or replace function public.has_restaurant_role(_restaurant_id uuid, _role text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.restaurant_users
    where user_id = auth.uid() and restaurant_id = _restaurant_id
      and active = true and role = _role
  );
$$;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and account_type = 'platform_admin'
  );
$$;

create or replace function public.is_restaurant_member(_restaurant_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.restaurant_users
    where user_id = auth.uid() and restaurant_id = _restaurant_id and active = true
  );
$$;


-- 6. Trigger functions

CREATE OR REPLACE FUNCTION public.enforce_profile_account_type()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  raw_claims text := NULLIF(current_setting('request.jwt.claims', true), '');
  jwt_role text := COALESCE(raw_claims::jsonb ->> 'role', '');
  -- No JWT claims at all means this is a direct/trusted database session
  -- (migration, service connection), not a browser request through the API.
  trusted boolean := raw_claims IS NULL OR jwt_role = 'service_role';
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT trusted AND NEW.account_type IS DISTINCT FROM 'customer' THEN
      NEW.account_type := 'customer';
    END IF;
    IF NEW.account_type IS NULL THEN
      NEW.account_type := 'customer';
    END IF;
  ELSE
    IF NEW.account_type IS DISTINCT FROM OLD.account_type
       AND NOT trusted
       AND NOT public.is_platform_admin() THEN
      NEW.account_type := OLD.account_type;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_restaurant_protected_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  jwt_role text := COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
BEGIN
  IF jwt_role <> 'service_role' AND NOT public.is_platform_admin() THEN
    NEW.approved := OLD.approved;
    NEW.active := OLD.active;
    NEW.slug := OLD.slug;
    NEW.id := OLD.id;
    NEW.approved_at := OLD.approved_at;
    NEW.approved_by := OLD.approved_by;
    NEW.rejection_reason := OLD.rejection_reason;
    NEW.suspension_reason := OLD.suspension_reason;
    NEW.status_updated_at := OLD.status_updated_at;
  END IF;
  RETURN NEW;
END;
$function$;

create or replace function public.log_order_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.order_status_history (order_id, status, changed_by)
    values (new.id, new.status, auth.uid());
  end if;
  return new;
end; $$;

CREATE OR REPLACE FUNCTION public.normalize_guest_contact()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.email := NULLIF(btrim(COALESCE(NEW.email, '')), '');
  NEW.phone := NULLIF(btrim(COALESCE(NEW.phone, '')), '');
  NEW.email_normalized := lower(NEW.email);
  NEW.phone_normalized := NULLIF(regexp_replace(COALESCE(NEW.phone, ''), '[^0-9]', '', 'g'), '');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.pos_protect_completed_sale()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('completed','partially_refunded','refunded') THEN
      RAISE EXCEPTION 'POS_SALE_IMMUTABLE';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status IN ('completed','partially_refunded','refunded') THEN
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id
      OR NEW.register_id IS DISTINCT FROM OLD.register_id
      OR NEW.shift_id IS DISTINCT FROM OLD.shift_id
      OR NEW.sale_number IS DISTINCT FROM OLD.sale_number
      OR NEW.business_date IS DISTINCT FROM OLD.business_date
      OR NEW.currency_code IS DISTINCT FROM OLD.currency_code
      OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
      OR NEW.discount_amount IS DISTINCT FROM OLD.discount_amount
      OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
      OR NEW.total IS DISTINCT FROM OLD.total
      OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
      OR NEW.completed_by_membership_id IS DISTINCT FROM OLD.completed_by_membership_id
    THEN
      RAISE EXCEPTION 'POS_SALE_IMMUTABLE';
    END IF;
    IF NEW.status NOT IN ('completed','partially_refunded','refunded') THEN
      RAISE EXCEPTION 'POS_SALE_IMMUTABLE';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.pos_protect_completed_sale_items()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _status text;
  _sale uuid;
BEGIN
  _sale := COALESCE(NEW.sale_id, OLD.sale_id);
  SELECT status INTO _status FROM public.pos_sales WHERE id = _sale;
  IF _status IS NOT NULL AND _status IN ('completed','partially_refunded','refunded') THEN
    RAISE EXCEPTION 'POS_SALE_IMMUTABLE';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;


-- 7. Triggers

CREATE TRIGGER set_distribution_channels_updated_at BEFORE UPDATE ON public.distribution_channels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_distribution_rate_mappings_updated_at BEFORE UPDATE ON public.distribution_rate_mappings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_distribution_room_mappings_updated_at BEFORE UPDATE ON public.distribution_room_mappings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_guest_folios_updated_at BEFORE UPDATE ON public.guest_folios
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_guest_preferences_updated_at BEFORE UPDATE ON public.guest_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER normalize_guest_contact_ins BEFORE INSERT ON public.guest_profiles
  FOR EACH ROW EXECUTE FUNCTION public.normalize_guest_contact();

CREATE TRIGGER normalize_guest_contact_upd BEFORE UPDATE ON public.guest_profiles
  FOR EACH ROW EXECUTE FUNCTION public.normalize_guest_contact();

CREATE TRIGGER set_guest_profiles_updated_at BEFORE UPDATE ON public.guest_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_hotel_rate_calendar_updated_at BEFORE UPDATE ON public.hotel_rate_calendar
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_hotel_rate_categories_updated_at BEFORE UPDATE ON public.hotel_rate_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_hotel_rate_plans_updated_at BEFORE UPDATE ON public.hotel_rate_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_hotel_rate_restrictions_updated_at BEFORE UPDATE ON public.hotel_rate_restrictions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_hotel_reservations_updated_at BEFORE UPDATE ON public.hotel_reservations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_hotel_rooms_updated_at BEFORE UPDATE ON public.hotel_rooms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_housekeeping_tasks_updated_at
  BEFORE UPDATE ON public.housekeeping_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_inventory_items_updated_at
BEFORE UPDATE ON public.inventory_items
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_menu_categories_updated_at BEFORE UPDATE ON public.menu_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_menu_item_recipe_components_updated_at
BEFORE UPDATE ON public.menu_item_recipe_components
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

create trigger set_menu_items_updated_at before update on public.menu_items for each row execute function public.set_updated_at();

CREATE TRIGGER night_audit_runs_set_updated_at
  BEFORE UPDATE ON public.night_audit_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER order_payments_set_updated_at
  BEFORE UPDATE ON public.order_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

create trigger log_order_status_insert after insert on public.orders for each row execute function public.log_order_status();

create trigger log_order_status_update after update of status on public.orders for each row execute function public.log_order_status();

create trigger set_orders_updated_at before update on public.orders for each row execute function public.set_updated_at();

CREATE TRIGGER pos_shifts_set_updated_at BEFORE UPDATE ON public.pos_cashier_shifts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER pos_categories_set_updated_at BEFORE UPDATE ON public.pos_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER pos_products_set_updated_at BEFORE UPDATE ON public.pos_products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER pos_registers_set_updated_at BEFORE UPDATE ON public.pos_registers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER pos_sale_items_protect_completed
BEFORE INSERT OR UPDATE OR DELETE ON public.pos_sale_items
FOR EACH ROW EXECUTE FUNCTION public.pos_protect_completed_sale_items();

CREATE TRIGGER pos_sales_protect_completed
BEFORE UPDATE OR DELETE ON public.pos_sales
FOR EACH ROW EXECUTE FUNCTION public.pos_protect_completed_sale();

CREATE TRIGGER pos_sales_set_updated_at BEFORE UPDATE ON public.pos_sales
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER pos_settings_set_updated_at BEFORE UPDATE ON public.pos_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER enforce_profile_account_type_ins
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_account_type();

CREATE TRIGGER enforce_profile_account_type_upd
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_account_type();

create trigger set_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();

CREATE TRIGGER set_purchase_order_items_updated_at
BEFORE UPDATE ON public.purchase_order_items
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_purchase_orders_updated_at
BEFORE UPDATE ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_restaurant_assets_updated_at
  BEFORE UPDATE ON public.restaurant_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_restaurant_opening_hours_updated_at
  BEFORE UPDATE ON public.restaurant_opening_hours
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_restaurant_suppliers_updated_at
BEFORE UPDATE ON public.restaurant_suppliers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_restaurant_tables_updated_at
BEFORE UPDATE ON public.restaurant_tables
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER enforce_restaurant_protected_fields_upd
BEFORE UPDATE ON public.restaurants
FOR EACH ROW EXECUTE FUNCTION public.enforce_restaurant_protected_fields();

create trigger set_restaurants_updated_at before update on public.restaurants for each row execute function public.set_updated_at();

CREATE TRIGGER set_room_types_updated_at BEFORE UPDATE ON public.room_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_staff_attendance_updated_at
BEFORE UPDATE ON public.staff_attendance
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER staff_module_access_set_updated_at
BEFORE UPDATE ON public.staff_module_access
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_staff_shifts_updated_at
BEFORE UPDATE ON public.staff_shifts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- 8. RPC / business functions (last CREATE OR REPLACE body each)

CREATE OR REPLACE FUNCTION public.amend_hotel_reservation(
  _restaurant_id uuid,
  _reservation_id uuid,
  _room_type_id uuid,
  _room_id uuid,
  _arrival date,
  _departure date,
  _adults integer,
  _children integer,
  _special_requests text,
  _notes text,
  _membership_id uuid
)
RETURNS public.hotel_reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  existing public.hotel_reservations%ROWTYPE;
  updated public.hotel_reservations%ROWTYPE;
BEGIN
  INSERT INTO public.hotel_reservation_counters (restaurant_id, last_number)
  VALUES (_restaurant_id, 0)
  ON CONFLICT (restaurant_id) DO NOTHING;

  PERFORM 1 FROM public.hotel_reservation_counters
  WHERE restaurant_id = _restaurant_id FOR UPDATE;

  SELECT * INTO existing FROM public.hotel_reservations
  WHERE id = _reservation_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  IF existing.status = 'cancelled' THEN
    RAISE EXCEPTION 'RESERVATION_CANCELLED';
  END IF;

  PERFORM public.assert_reservation_capacity(
    _restaurant_id, _room_type_id, _room_id, _arrival, _departure, existing.id
  );

  UPDATE public.hotel_reservations
  SET room_type_id = _room_type_id,
      room_id = _room_id,
      arrival_date = _arrival,
      departure_date = _departure,
      adults = _adults,
      children = _children,
      special_requests = _special_requests,
      notes = _notes
  WHERE id = existing.id
  RETURNING * INTO updated;

  INSERT INTO public.hotel_reservation_history (
    restaurant_id, reservation_id, event_type, previous_values, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id, existing.id,
    CASE
      WHEN existing.room_id IS DISTINCT FROM updated.room_id AND existing.room_id IS NULL THEN 'room_assigned'
      WHEN existing.room_id IS DISTINCT FROM updated.room_id THEN 'room_changed'
      ELSE 'amended'
    END,
    jsonb_build_object(
      'arrival_date', existing.arrival_date, 'departure_date', existing.departure_date,
      'adults', existing.adults, 'children', existing.children,
      'room_type_id', existing.room_type_id, 'room_id', existing.room_id,
      'special_requests', existing.special_requests, 'notes', existing.notes
    ),
    jsonb_build_object(
      'arrival_date', updated.arrival_date, 'departure_date', updated.departure_date,
      'adults', updated.adults, 'children', updated.children,
      'room_type_id', updated.room_type_id, 'room_id', updated.room_id,
      'special_requests', updated.special_requests, 'notes', updated.notes
    ),
    _membership_id
  );

  RETURN updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.amend_hotel_reservation_priced(
  _restaurant_id uuid,
  _reservation_id uuid,
  _room_type_id uuid,
  _room_id uuid,
  _arrival date,
  _departure date,
  _adults integer,
  _children integer,
  _special_requests text,
  _notes text,
  _rate_plan_id uuid,
  _membership_id uuid
)
RETURNS public.hotel_reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  before_row public.hotel_reservations%ROWTYPE;
  updated public.hotel_reservations%ROWTYPE;
  pricing jsonb;
  stay_changed boolean;
BEGIN
  SELECT * INTO before_row FROM public.hotel_reservations
  WHERE id = _reservation_id AND restaurant_id = _restaurant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  updated := public.amend_hotel_reservation(
    _restaurant_id, _reservation_id, _room_type_id, _room_id, _arrival, _departure,
    _adults, _children, _special_requests, _notes, _membership_id
  );

  stay_changed := before_row.arrival_date IS DISTINCT FROM updated.arrival_date
    OR before_row.departure_date IS DISTINCT FROM updated.departure_date
    OR before_row.room_type_id IS DISTINCT FROM updated.room_type_id
    OR before_row.rate_plan_id IS DISTINCT FROM _rate_plan_id;

  IF _rate_plan_id IS NOT NULL AND stay_changed THEN
    pricing := public.price_hotel_stay(_restaurant_id, _rate_plan_id, updated.room_type_id, updated.arrival_date, updated.departure_date);

    UPDATE public.hotel_reservations
    SET rate_plan_id = _rate_plan_id,
        currency = pricing->>'currency',
        room_subtotal = (pricing->>'subtotal')::numeric,
        nightly_rate_snapshot = pricing->'nightly',
        priced_at = now()
    WHERE id = updated.id
    RETURNING * INTO updated;

    INSERT INTO public.hotel_reservation_history (
      restaurant_id, reservation_id, event_type, previous_values, new_values, actor_membership_id
    ) VALUES (
      _restaurant_id, updated.id, 'repriced',
      jsonb_build_object('rate_plan_id', before_row.rate_plan_id, 'room_subtotal', before_row.room_subtotal,
                         'currency', before_row.currency),
      jsonb_build_object('rate_plan_id', updated.rate_plan_id, 'room_subtotal', updated.room_subtotal,
                         'currency', updated.currency),
      _membership_id
    );
  END IF;

  RETURN updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_inventory_movement(
  _restaurant_id uuid,
  _item_id uuid,
  _movement_type text,
  _signed_quantity numeric,
  _unit_cost numeric,
  _reason text,
  _membership_id uuid,
  _allow_negative boolean DEFAULT false
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  item public.inventory_items%ROWTYPE;
  new_balance numeric(14,3);
BEGIN
  IF _signed_quantity = 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero.';
  END IF;

  SELECT * INTO item
  FROM public.inventory_items
  WHERE id = _item_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item not found for this restaurant.';
  END IF;

  new_balance := item.current_quantity + _signed_quantity;

  IF new_balance < 0 AND NOT _allow_negative THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK';
  END IF;

  INSERT INTO public.inventory_stock_movements (
    restaurant_id, inventory_item_id, movement_type, quantity, unit_id,
    unit_cost, reason, balance_after, created_by_staff_membership_id
  ) VALUES (
    _restaurant_id, _item_id, _movement_type, _signed_quantity, item.base_unit_id,
    _unit_cost, _reason, new_balance, _membership_id
  );

  UPDATE public.inventory_items
  SET current_quantity = new_balance
  WHERE id = _item_id;

  RETURN new_balance;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assert_reservation_capacity(
  _restaurant_id uuid,
  _room_type_id uuid,
  _room_id uuid,
  _arrival date,
  _departure date,
  _exclude_reservation_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  sellable integer;
  reserved integer;
  room_ok boolean;
  room_clash integer;
BEGIN
  IF _departure <= _arrival THEN
    RAISE EXCEPTION 'INVALID_DATES';
  END IF;

  sellable := public.count_sellable_rooms(_restaurant_id, _room_type_id);
  reserved := public.count_reserved_rooms(_restaurant_id, _room_type_id, _arrival, _departure, _exclude_reservation_id);

  IF sellable - reserved <= 0 THEN
    RAISE EXCEPTION 'NO_AVAILABILITY';
  END IF;

  IF _room_id IS NOT NULL THEN
    SELECT true INTO room_ok
    FROM public.hotel_rooms r
    WHERE r.id = _room_id
      AND r.restaurant_id = _restaurant_id
      AND r.room_type_id = _room_type_id
      AND r.active = true
      AND r.status = 'available';

    IF room_ok IS NOT TRUE THEN
      RAISE EXCEPTION 'ROOM_NOT_ASSIGNABLE';
    END IF;

    SELECT count(*) INTO room_clash
    FROM public.hotel_reservations res
    WHERE res.restaurant_id = _restaurant_id
      AND res.room_id = _room_id
      AND res.status IN ('pending','confirmed','checked_in')
      AND (_exclude_reservation_id IS NULL OR res.id <> _exclude_reservation_id)
      AND res.arrival_date < _departure
      AND res.departure_date > _arrival;

    IF room_clash > 0 THEN
      RAISE EXCEPTION 'ROOM_ALREADY_BOOKED';
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_room_assignable(
  _restaurant_id uuid,
  _room_id uuid,
  _room_type_id uuid,
  _arrival date,
  _departure date,
  _exclude_reservation_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  room public.hotel_rooms%ROWTYPE;
  clash integer;
BEGIN
  SELECT * INTO room FROM public.hotel_rooms
  WHERE id = _room_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND
     OR room.room_type_id <> _room_type_id
     OR room.active IS NOT TRUE
     OR room.status <> 'available' THEN
    RAISE EXCEPTION 'ROOM_NOT_ASSIGNABLE';
  END IF;

  SELECT count(*) INTO clash
  FROM public.hotel_reservations res
  WHERE res.restaurant_id = _restaurant_id
    AND res.room_id = _room_id
    AND res.status IN ('pending','confirmed','checked_in')
    AND (_exclude_reservation_id IS NULL OR res.id <> _exclude_reservation_id)
    AND res.arrival_date < _departure
    AND res.departure_date > _arrival;

  IF clash > 0 THEN
    RAISE EXCEPTION 'ROOM_ALREADY_BOOKED';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.change_hotel_stay_dates(
  _restaurant_id uuid,
  _reservation_id uuid,
  _departure date,
  _membership_id uuid
)
RETURNS public.hotel_reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  existing public.hotel_reservations%ROWTYPE;
  updated public.hotel_reservations%ROWTYPE;
BEGIN
  SELECT * INTO existing FROM public.hotel_reservations
  WHERE id = _reservation_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  IF existing.status <> 'checked_in' THEN
    RAISE EXCEPTION 'INVALID_TRANSITION';
  END IF;

  IF _departure <= existing.arrival_date THEN
    RAISE EXCEPTION 'INVALID_DATES';
  END IF;

  IF _departure = existing.departure_date THEN
    RAISE EXCEPTION 'DATES_UNCHANGED';
  END IF;

  PERFORM public.assert_reservation_capacity(
    _restaurant_id, existing.room_type_id, existing.room_id,
    existing.arrival_date, _departure, existing.id
  );

  IF existing.room_id IS NOT NULL THEN
    PERFORM public.assert_room_assignable(
      _restaurant_id, existing.room_id, existing.room_type_id,
      existing.arrival_date, _departure, existing.id
    );
  END IF;

  UPDATE public.hotel_reservations
  SET departure_date = _departure
  WHERE id = existing.id
  RETURNING * INTO updated;

  INSERT INTO public.hotel_reservation_history (
    restaurant_id, reservation_id, event_type, previous_values, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id, existing.id,
    CASE WHEN _departure > existing.departure_date THEN 'stay_extended' ELSE 'stay_shortened' END,
    jsonb_build_object('departure_date', existing.departure_date),
    jsonb_build_object('departure_date', _departure),
    _membership_id
  );

  RETURN updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_in_hotel_reservation(_restaurant_id uuid, _reservation_id uuid, _room_id uuid, _membership_id uuid)
 RETURNS hotel_reservations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  existing public.hotel_reservations%ROWTYPE;
  updated public.hotel_reservations%ROWTYPE;
  target_room uuid;
BEGIN
  SELECT * INTO existing FROM public.hotel_reservations
  WHERE id = _reservation_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  IF existing.status <> 'confirmed' THEN
    RAISE EXCEPTION 'INVALID_TRANSITION';
  END IF;

  IF existing.departure_date <= existing.arrival_date THEN
    RAISE EXCEPTION 'INVALID_DATES';
  END IF;

  target_room := COALESCE(_room_id, existing.room_id);
  IF target_room IS NULL THEN
    RAISE EXCEPTION 'ROOM_REQUIRED';
  END IF;

  PERFORM public.assert_room_assignable(
    _restaurant_id, target_room, existing.room_type_id,
    existing.arrival_date, existing.departure_date, existing.id
  );

  UPDATE public.hotel_reservations
  SET room_id = target_room, status = 'checked_in'
  WHERE id = existing.id
  RETURNING * INTO updated;

  IF existing.room_id IS DISTINCT FROM target_room THEN
    INSERT INTO public.hotel_reservation_history (
      restaurant_id, reservation_id, event_type, previous_values, new_values, actor_membership_id
    ) VALUES (
      _restaurant_id, existing.id,
      CASE WHEN existing.room_id IS NULL THEN 'room_assigned' ELSE 'room_changed' END,
      jsonb_build_object('room_id', existing.room_id),
      jsonb_build_object('room_id', target_room),
      _membership_id
    );
  END IF;

  INSERT INTO public.hotel_reservation_history (
    restaurant_id, reservation_id, event_type, previous_values, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id, existing.id, 'check_in',
    jsonb_build_object('status', existing.status),
    jsonb_build_object('status', 'checked_in', 'room_id', target_room),
    _membership_id
  );

  PERFORM public.open_folio_for_reservation(_restaurant_id, existing.id, _membership_id);

  RETURN updated;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_out_hotel_reservation(
  _restaurant_id uuid,
  _reservation_id uuid,
  _membership_id uuid
)
RETURNS public.hotel_reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  existing public.hotel_reservations%ROWTYPE;
  updated public.hotel_reservations%ROWTYPE;
  room public.hotel_rooms%ROWTYPE;
  task_id uuid;
BEGIN
  SELECT * INTO existing FROM public.hotel_reservations
  WHERE id = _reservation_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  IF existing.status <> 'checked_in' THEN
    RAISE EXCEPTION 'INVALID_TRANSITION';
  END IF;

  UPDATE public.hotel_reservations
  SET status = 'checked_out'
  WHERE id = existing.id
  RETURNING * INTO updated;

  INSERT INTO public.hotel_reservation_history (
    restaurant_id, reservation_id, event_type, previous_values, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id, existing.id, 'check_out',
    jsonb_build_object('status', existing.status, 'room_id', existing.room_id),
    jsonb_build_object('status', 'checked_out'),
    _membership_id
  );

  IF existing.room_id IS NOT NULL THEN
    SELECT * INTO room FROM public.hotel_rooms
    WHERE id = existing.room_id AND restaurant_id = _restaurant_id
    FOR UPDATE;

    IF FOUND THEN
      IF room.housekeeping_status <> 'dirty' THEN
        UPDATE public.hotel_rooms SET housekeeping_status = 'dirty' WHERE id = room.id;

        INSERT INTO public.housekeeping_history (
          restaurant_id, room_id, event_type, previous_values, new_values, actor_membership_id
        ) VALUES (
          _restaurant_id, room.id, 'room_dirty',
          jsonb_build_object('housekeeping_status', room.housekeeping_status),
          jsonb_build_object('housekeeping_status', 'dirty', 'reservation_id', existing.id),
          _membership_id
        );
      END IF;

      task_id := public.housekeeping_create_task(
        _restaurant_id, room.id, 'departure_cleaning', 'normal', NULL, _membership_id
      );
    END IF;
  END IF;

  RETURN updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_business_date(
  _restaurant_id uuid,
  _run_id uuid,
  _summary jsonb,
  _membership_id uuid
) RETURNS public.night_audit_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _run public.night_audit_runs;
  _blocking integer;
BEGIN
  PERFORM 1 FROM public.restaurants WHERE id = _restaurant_id FOR UPDATE;

  SELECT * INTO _run FROM public.night_audit_runs
   WHERE id = _run_id AND restaurant_id = _restaurant_id
   FOR UPDATE;

  IF _run.id IS NULL THEN
    RAISE EXCEPTION 'AUDIT_RUN_NOT_FOUND';
  END IF;

  -- Idempotent: an already closed date returns its stored result untouched.
  IF _run.status = 'closed' THEN
    RETURN _run;
  END IF;

  SELECT count(*) INTO _blocking
    FROM public.night_audit_exceptions
   WHERE night_audit_run_id = _run.id
     AND severity = 'blocking'
     AND status = 'open';

  IF _blocking > 0 THEN
    RAISE EXCEPTION 'BLOCKING_EXCEPTIONS_OPEN';
  END IF;

  UPDATE public.night_audit_runs
     SET status = 'closed',
         summary = _summary,
         closed_by_membership_id = _membership_id,
         closed_at = now()
   WHERE id = _run.id
  RETURNING * INTO _run;

  UPDATE public.restaurants
     SET business_date = _run.business_date + 1
   WHERE id = _restaurant_id;

  RETURN _run;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_cashier_shift(
  _restaurant_id uuid, _shift_id uuid, _closing_cash numeric, _notes text, _membership_id uuid
) RETURNS cashier_shifts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  shift public.cashier_shifts%ROWTYPE;
BEGIN
  SELECT * INTO shift FROM public.cashier_shifts
  WHERE id = _shift_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SHIFT_NOT_FOUND';
  END IF;

  IF shift.status = 'closed' THEN
    RAISE EXCEPTION 'SHIFT_ALREADY_CLOSED';
  END IF;

  UPDATE public.cashier_shifts
  SET status = 'closed', closed_at = now(), closing_cash = _closing_cash,
      notes = COALESCE(NULLIF(btrim(COALESCE(_notes, '')), ''), notes)
  WHERE id = shift.id
  RETURNING * INTO shift;

  INSERT INTO public.folio_history (
    restaurant_id, cashier_shift_id, event_type, previous_values, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id, shift.id, 'cashier_shift_closed',
    jsonb_build_object('status', 'open'),
    jsonb_build_object('status', 'closed', 'closing_cash', _closing_cash),
    _membership_id
  );

  RETURN shift;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_guest_folio(
  _restaurant_id uuid, _folio_id uuid, _membership_id uuid
) RETURNS guest_folios
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  folio public.guest_folios%ROWTYPE;
  balance numeric(12,2);
BEGIN
  SELECT * INTO folio FROM public.guest_folios
  WHERE id = _folio_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FOLIO_NOT_FOUND';
  END IF;

  IF folio.status = 'closed' THEN
    RETURN folio;
  END IF;

  SELECT COALESCE(sum(amount), 0) INTO balance
  FROM public.folio_transactions WHERE folio_id = folio.id;

  IF abs(balance) >= 0.01 THEN
    RAISE EXCEPTION 'BALANCE_NOT_ZERO';
  END IF;

  UPDATE public.guest_folios
  SET status = 'closed', closed_at = now()
  WHERE id = folio.id
  RETURNING * INTO folio;

  INSERT INTO public.folio_history (
    restaurant_id, folio_id, event_type, previous_values, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id, folio.id, 'folio_closed',
    jsonb_build_object('status', 'open'),
    jsonb_build_object('status', 'closed', 'balance', balance),
    _membership_id
  );

  RETURN folio;
END;
$$;

CREATE OR REPLACE FUNCTION public.count_reserved_rooms(
  _restaurant_id uuid,
  _room_type_id uuid,
  _arrival date,
  _departure date,
  _exclude_reservation_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT count(*)::int
  FROM public.hotel_reservations res
  WHERE res.restaurant_id = _restaurant_id
    AND res.room_type_id = _room_type_id
    AND res.status IN ('pending','confirmed','checked_in')
    AND (_exclude_reservation_id IS NULL OR res.id <> _exclude_reservation_id)
    AND res.arrival_date < _departure
    AND res.departure_date > _arrival;
$$;

CREATE OR REPLACE FUNCTION public.count_sellable_rooms(_restaurant_id uuid, _room_type_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT count(*)::int
  FROM public.hotel_rooms r
  JOIN public.room_types t ON t.id = r.room_type_id AND t.restaurant_id = r.restaurant_id
  WHERE r.restaurant_id = _restaurant_id
    AND r.room_type_id = _room_type_id
    AND r.active = true
    AND r.status = 'available'
    AND t.active = true
    AND t.sellable = true;
$$;

CREATE OR REPLACE FUNCTION public.create_direct_booking(
  _restaurant_id uuid,
  _guest_id uuid,
  _room_type_id uuid,
  _arrival date,
  _departure date,
  _adults integer,
  _children integer,
  _special_requests text,
  _rate_plan_id uuid
)
RETURNS public.hotel_reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  created public.hotel_reservations;
BEGIN
  created := public.create_hotel_reservation_priced(
    _restaurant_id, _guest_id, _room_type_id, NULL,
    _arrival, _departure, _adults, _children,
    _special_requests, NULL, 'confirmed', _rate_plan_id, NULL
  );

  UPDATE public.hotel_reservations
  SET source = 'direct_booking'
  WHERE id = created.id AND restaurant_id = _restaurant_id
  RETURNING * INTO created;

  RETURN created;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_hotel_reservation(
  _restaurant_id uuid,
  _guest_id uuid,
  _room_type_id uuid,
  _room_id uuid,
  _arrival date,
  _departure date,
  _adults integer,
  _children integer,
  _special_requests text,
  _notes text,
  _status text,
  _membership_id uuid
)
RETURNS public.hotel_reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  next_number bigint;
  created public.hotel_reservations%ROWTYPE;
BEGIN
  IF _status NOT IN ('pending','confirmed') THEN
    RAISE EXCEPTION 'INVALID_STATUS';
  END IF;

  INSERT INTO public.hotel_reservation_counters (restaurant_id, last_number)
  VALUES (_restaurant_id, 0)
  ON CONFLICT (restaurant_id) DO NOTHING;

  SELECT last_number INTO next_number
  FROM public.hotel_reservation_counters
  WHERE restaurant_id = _restaurant_id
  FOR UPDATE;

  PERFORM public.assert_reservation_capacity(
    _restaurant_id, _room_type_id, _room_id, _arrival, _departure, NULL
  );

  next_number := next_number + 1;
  UPDATE public.hotel_reservation_counters
  SET last_number = next_number, updated_at = now()
  WHERE restaurant_id = _restaurant_id;

  INSERT INTO public.hotel_reservations (
    restaurant_id, guest_id, confirmation_number, arrival_date, departure_date,
    adults, children, room_type_id, room_id, status, source,
    special_requests, notes, created_by_staff_membership_id
  ) VALUES (
    _restaurant_id, _guest_id, 'NR-' || lpad(next_number::text, 6, '0'), _arrival, _departure,
    _adults, _children, _room_type_id, _room_id, _status, 'staff',
    _special_requests, _notes, _membership_id
  )
  RETURNING * INTO created;

  INSERT INTO public.hotel_reservation_history (
    restaurant_id, reservation_id, event_type, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id, created.id, 'created',
    jsonb_build_object(
      'confirmation_number', created.confirmation_number,
      'arrival_date', created.arrival_date,
      'departure_date', created.departure_date,
      'adults', created.adults,
      'children', created.children,
      'room_type_id', created.room_type_id,
      'room_id', created.room_id,
      'status', created.status
    ),
    _membership_id
  );

  RETURN created;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_hotel_reservation_priced(
  _restaurant_id uuid,
  _guest_id uuid,
  _room_type_id uuid,
  _room_id uuid,
  _arrival date,
  _departure date,
  _adults integer,
  _children integer,
  _special_requests text,
  _notes text,
  _status text,
  _rate_plan_id uuid,
  _membership_id uuid
)
RETURNS public.hotel_reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  created public.hotel_reservations%ROWTYPE;
  pricing jsonb;
BEGIN
  created := public.create_hotel_reservation(
    _restaurant_id, _guest_id, _room_type_id, _room_id, _arrival, _departure,
    _adults, _children, _special_requests, _notes, _status, _membership_id
  );

  IF _rate_plan_id IS NOT NULL THEN
    pricing := public.price_hotel_stay(_restaurant_id, _rate_plan_id, _room_type_id, _arrival, _departure);

    UPDATE public.hotel_reservations
    SET rate_plan_id = _rate_plan_id,
        currency = pricing->>'currency',
        room_subtotal = (pricing->>'subtotal')::numeric,
        nightly_rate_snapshot = pricing->'nightly',
        priced_at = now()
    WHERE id = created.id
    RETURNING * INTO created;
  END IF;

  RETURN created;
END;
$$;

CREATE OR REPLACE FUNCTION public.folio_balance(_folio_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(sum(amount), 0)::numeric(12,2)
  FROM public.folio_transactions WHERE folio_id = _folio_id;
$$;

CREATE OR REPLACE FUNCTION public.housekeeping_complete_task(
  _restaurant_id uuid,
  _task_id uuid,
  _membership_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  task public.housekeeping_tasks%ROWTYPE;
  room public.hotel_rooms%ROWTYPE;
BEGIN
  SELECT * INTO task FROM public.housekeeping_tasks
  WHERE id = _task_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TASK_NOT_FOUND';
  END IF;

  IF task.status = 'completed' THEN
    RETURN;
  END IF;

  IF task.status = 'cancelled' THEN
    RAISE EXCEPTION 'INVALID_TASK_TRANSITION';
  END IF;

  SELECT * INTO room FROM public.hotel_rooms
  WHERE id = task.room_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  UPDATE public.housekeeping_tasks
  SET status = 'completed',
      completed_at = now(),
      started_at = COALESCE(started_at, now())
  WHERE id = task.id;

  UPDATE public.hotel_rooms
  SET housekeeping_status = 'clean'
  WHERE id = room.id;

  INSERT INTO public.housekeeping_history (
    restaurant_id, room_id, event_type, previous_values, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id, room.id, 'cleaning_completed',
    jsonb_build_object('task_status', task.status, 'housekeeping_status', room.housekeeping_status),
    jsonb_build_object('task_id', task.id, 'housekeeping_status', 'clean'),
    _membership_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.housekeeping_create_task(
  _restaurant_id uuid,
  _room_id uuid,
  _task_type text,
  _priority text,
  _notes text,
  _membership_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  room public.hotel_rooms%ROWTYPE;
  existing_id uuid;
  new_id uuid;
BEGIN
  SELECT * INTO room FROM public.hotel_rooms
  WHERE id = _room_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND';
  END IF;

  SELECT id INTO existing_id FROM public.housekeeping_tasks
  WHERE restaurant_id = _restaurant_id
    AND room_id = _room_id
    AND status IN ('pending','assigned','in_progress')
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    RETURN existing_id;
  END IF;

  INSERT INTO public.housekeeping_tasks (
    restaurant_id, room_id, task_type, status, priority, notes, created_by_membership_id
  ) VALUES (
    _restaurant_id, _room_id, _task_type, 'pending', COALESCE(_priority, 'normal'),
    NULLIF(btrim(COALESCE(_notes, '')), ''), _membership_id
  )
  RETURNING id INTO new_id;

  INSERT INTO public.housekeeping_history (
    restaurant_id, room_id, event_type, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id, _room_id, 'cleaning_task_created',
    jsonb_build_object('task_id', new_id, 'task_type', _task_type, 'priority', COALESCE(_priority,'normal')),
    _membership_id
  );

  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.housekeeping_inspect_room(
  _restaurant_id uuid,
  _room_id uuid,
  _task_id uuid,
  _result text,
  _notes text,
  _membership_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  room public.hotel_rooms%ROWTYPE;
  inspection_id uuid;
  reclean_id uuid;
BEGIN
  IF _result NOT IN ('passed','failed') THEN
    RAISE EXCEPTION 'INVALID_INSPECTION_RESULT';
  END IF;

  SELECT * INTO room FROM public.hotel_rooms
  WHERE id = _room_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND';
  END IF;

  IF room.housekeeping_status NOT IN ('clean','pickup','inspected') THEN
    RAISE EXCEPTION 'ROOM_NOT_INSPECTABLE';
  END IF;

  IF _task_id IS NOT NULL THEN
    PERFORM 1 FROM public.housekeeping_tasks
    WHERE id = _task_id AND restaurant_id = _restaurant_id AND room_id = _room_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'TASK_NOT_FOUND';
    END IF;
  END IF;

  INSERT INTO public.housekeeping_inspections (
    restaurant_id, room_id, task_id, status, inspector_membership_id, notes, completed_at
  ) VALUES (
    _restaurant_id, _room_id, _task_id, _result, _membership_id,
    NULLIF(btrim(COALESCE(_notes, '')), ''), now()
  )
  RETURNING id INTO inspection_id;

  IF _result = 'passed' THEN
    UPDATE public.hotel_rooms SET housekeeping_status = 'inspected' WHERE id = room.id;

    INSERT INTO public.housekeeping_history (
      restaurant_id, room_id, event_type, previous_values, new_values, notes, actor_membership_id
    ) VALUES (
      _restaurant_id, room.id, 'inspection_passed',
      jsonb_build_object('housekeeping_status', room.housekeeping_status),
      jsonb_build_object('housekeeping_status', 'inspected', 'inspection_id', inspection_id),
      NULLIF(btrim(COALESCE(_notes, '')), ''), _membership_id
    );
  ELSE
    UPDATE public.hotel_rooms SET housekeeping_status = 'dirty' WHERE id = room.id;

    INSERT INTO public.housekeeping_history (
      restaurant_id, room_id, event_type, previous_values, new_values, notes, actor_membership_id
    ) VALUES (
      _restaurant_id, room.id, 'inspection_failed',
      jsonb_build_object('housekeeping_status', room.housekeeping_status),
      jsonb_build_object('housekeeping_status', 'dirty', 'inspection_id', inspection_id),
      NULLIF(btrim(COALESCE(_notes, '')), ''), _membership_id
    );

    reclean_id := public.housekeeping_create_task(
      _restaurant_id, room.id, 're_clean', 'high', 'Re-clean after failed inspection', _membership_id
    );

    INSERT INTO public.housekeeping_history (
      restaurant_id, room_id, event_type, new_values, actor_membership_id
    ) VALUES (
      _restaurant_id, room.id, 'room_reclean_required',
      jsonb_build_object('task_id', reclean_id), _membership_id
    );
  END IF;

  RETURN inspection_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.housekeeping_set_room_restriction(
  _restaurant_id uuid,
  _room_id uuid,
  _status text,
  _reason text,
  _expected_return date,
  _membership_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  room public.hotel_rooms%ROWTYPE;
  clean_reason text := NULLIF(btrim(COALESCE(_reason, '')), '');
BEGIN
  IF _status NOT IN ('available','out_of_order','out_of_service') THEN
    RAISE EXCEPTION 'INVALID_ROOM_STATUS';
  END IF;

  SELECT * INTO room FROM public.hotel_rooms
  WHERE id = _room_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND';
  END IF;

  IF _status <> 'available' AND clean_reason IS NULL THEN
    RAISE EXCEPTION 'REASON_REQUIRED';
  END IF;

  IF room.status = _status THEN
    RETURN;
  END IF;

  UPDATE public.hotel_rooms
  SET status = _status,
      restriction_reason = CASE WHEN _status = 'available' THEN NULL ELSE clean_reason END,
      restriction_expected_return = CASE WHEN _status = 'available' THEN NULL ELSE _expected_return END
  WHERE id = room.id;

  INSERT INTO public.housekeeping_history (
    restaurant_id, room_id, event_type, previous_values, new_values, notes, actor_membership_id
  ) VALUES (
    _restaurant_id, room.id,
    CASE _status
      WHEN 'out_of_order' THEN 'room_ooo'
      WHEN 'out_of_service' THEN 'room_oos'
      ELSE 'room_released'
    END,
    jsonb_build_object('status', room.status),
    jsonb_build_object('status', _status, 'expected_return', _expected_return),
    clean_reason, _membership_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_hotel_reservation_no_show(
  _restaurant_id uuid,
  _reservation_id uuid,
  _business_date date,
  _membership_id uuid
)
RETURNS public.hotel_reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  existing public.hotel_reservations%ROWTYPE;
  updated public.hotel_reservations%ROWTYPE;
BEGIN
  SELECT * INTO existing FROM public.hotel_reservations
  WHERE id = _reservation_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  IF existing.status <> 'confirmed' THEN
    RAISE EXCEPTION 'INVALID_TRANSITION';
  END IF;

  IF existing.arrival_date >= _business_date THEN
    RAISE EXCEPTION 'NOT_PAST_DUE';
  END IF;

  UPDATE public.hotel_reservations
  SET status = 'no_show'
  WHERE id = existing.id
  RETURNING * INTO updated;

  INSERT INTO public.hotel_reservation_history (
    restaurant_id, reservation_id, event_type, previous_values, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id, existing.id, 'no_show',
    jsonb_build_object('status', existing.status),
    jsonb_build_object('status', 'no_show'),
    _membership_id
  );

  RETURN updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.move_hotel_reservation_room(
  _restaurant_id uuid,
  _reservation_id uuid,
  _room_id uuid,
  _reason text,
  _membership_id uuid
)
RETURNS public.hotel_reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  existing public.hotel_reservations%ROWTYPE;
  updated public.hotel_reservations%ROWTYPE;
BEGIN
  IF _room_id IS NULL THEN
    RAISE EXCEPTION 'ROOM_REQUIRED';
  END IF;

  IF COALESCE(btrim(_reason), '') = '' THEN
    RAISE EXCEPTION 'REASON_REQUIRED';
  END IF;

  SELECT * INTO existing FROM public.hotel_reservations
  WHERE id = _reservation_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  IF existing.status <> 'checked_in' THEN
    RAISE EXCEPTION 'INVALID_TRANSITION';
  END IF;

  IF existing.room_id = _room_id THEN
    RAISE EXCEPTION 'SAME_ROOM';
  END IF;

  -- Same room type only in this phase: a type change would affect pricing.
  PERFORM public.assert_room_assignable(
    _restaurant_id, _room_id, existing.room_type_id,
    existing.arrival_date, existing.departure_date, existing.id
  );

  UPDATE public.hotel_reservations
  SET room_id = _room_id
  WHERE id = existing.id
  RETURNING * INTO updated;

  INSERT INTO public.hotel_reservation_history (
    restaurant_id, reservation_id, event_type, previous_values, new_values, notes, actor_membership_id
  ) VALUES (
    _restaurant_id, existing.id, 'room_moved',
    jsonb_build_object('room_id', existing.room_id),
    jsonb_build_object('room_id', _room_id),
    btrim(_reason),
    _membership_id
  );

  RETURN updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.open_cashier_shift(
  _restaurant_id uuid, _membership_id uuid, _opening_cash numeric, _notes text
) RETURNS cashier_shifts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  shift public.cashier_shifts%ROWTYPE;
BEGIN
  SELECT * INTO shift FROM public.cashier_shifts
  WHERE restaurant_id = _restaurant_id AND membership_id = _membership_id AND status = 'open'
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'SHIFT_ALREADY_OPEN';
  END IF;

  INSERT INTO public.cashier_shifts (restaurant_id, membership_id, opening_cash, notes)
  VALUES (_restaurant_id, _membership_id, _opening_cash, NULLIF(btrim(COALESCE(_notes, '')), ''))
  RETURNING * INTO shift;

  INSERT INTO public.folio_history (
    restaurant_id, cashier_shift_id, event_type, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id, shift.id, 'cashier_shift_opened',
    jsonb_build_object('opening_cash', _opening_cash), _membership_id
  );

  RETURN shift;
END;
$$;

CREATE OR REPLACE FUNCTION public.open_folio_for_reservation(
  _restaurant_id uuid, _reservation_id uuid, _membership_id uuid
) RETURNS guest_folios
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  res public.hotel_reservations%ROWTYPE;
  folio public.guest_folios%ROWTYPE;
  next_number bigint;
  prop_currency text;
  charge_amount numeric(12,2);
BEGIN
  SELECT * INTO res FROM public.hotel_reservations
  WHERE id = _reservation_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  IF res.status IN ('cancelled','no_show') THEN
    RAISE EXCEPTION 'RESERVATION_NOT_BILLABLE';
  END IF;

  SELECT currency_code INTO prop_currency FROM public.restaurants WHERE id = _restaurant_id;

  SELECT * INTO folio FROM public.guest_folios
  WHERE restaurant_id = _restaurant_id AND reservation_id = res.id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.guest_folio_counters (restaurant_id, last_number)
    VALUES (_restaurant_id, 0) ON CONFLICT (restaurant_id) DO NOTHING;

    SELECT last_number INTO next_number FROM public.guest_folio_counters
    WHERE restaurant_id = _restaurant_id FOR UPDATE;

    next_number := next_number + 1;
    UPDATE public.guest_folio_counters
    SET last_number = next_number, updated_at = now() WHERE restaurant_id = _restaurant_id;

    INSERT INTO public.guest_folios (
      restaurant_id, guest_id, reservation_id, folio_number, status, currency, created_by_membership_id
    ) VALUES (
      _restaurant_id, res.guest_id, res.id, 'FL-' || lpad(next_number::text, 6, '0'), 'open',
      COALESCE(res.currency, prop_currency, 'GBP'), _membership_id
    ) RETURNING * INTO folio;

    INSERT INTO public.folio_history (
      restaurant_id, folio_id, event_type, new_values, actor_membership_id
    ) VALUES (
      _restaurant_id, folio.id, 'folio_opened',
      jsonb_build_object('folio_number', folio.folio_number, 'reservation_id', res.id,
                         'confirmation_number', res.confirmation_number, 'currency', folio.currency),
      _membership_id
    );
  END IF;

  charge_amount := COALESCE(res.room_subtotal, 0);

  IF charge_amount > 0 AND NOT EXISTS (
    SELECT 1 FROM public.folio_transactions
    WHERE restaurant_id = _restaurant_id
      AND reference_type = 'reservation_room_charge'
      AND reference_id = res.id
  ) THEN
    INSERT INTO public.folio_transactions (
      restaurant_id, folio_id, transaction_type, category, description, amount,
      reference_type, reference_id, posted_by_membership_id
    ) VALUES (
      _restaurant_id, folio.id, 'charge', 'room',
      'Room charge — reservation ' || res.confirmation_number, charge_amount,
      'reservation_room_charge', res.id, _membership_id
    );

    INSERT INTO public.folio_history (
      restaurant_id, folio_id, event_type, new_values, actor_membership_id
    ) VALUES (
      _restaurant_id, folio.id, 'room_charge_posted',
      jsonb_build_object('reservation_id', res.id, 'amount', charge_amount,
                         'currency', folio.currency, 'nightly', res.nightly_rate_snapshot),
      _membership_id
    );
  END IF;

  RETURN folio;
END;
$$;

CREATE OR REPLACE FUNCTION public.pos_complete_sale(
  _restaurant_id uuid,
  _sale_id uuid,
  _membership_id uuid
)
RETURNS public.pos_sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sale public.pos_sales;
  _subtotal numeric(12,2);
  _tax numeric(12,2);
  _discount numeric(12,2);
  _total numeric(12,2);
  _paid numeric(12,2);
  _number bigint;
  _name text;
BEGIN
  SELECT * INTO _sale FROM public.pos_sales
    WHERE id = _sale_id AND restaurant_id = _restaurant_id FOR UPDATE;
  IF _sale.id IS NULL THEN RAISE EXCEPTION 'POS_SALE_NOT_FOUND'; END IF;
  IF _sale.status <> 'open' THEN RAISE EXCEPTION 'POS_SALE_NOT_OPEN'; END IF;
  IF _sale.shift_id IS NULL THEN RAISE EXCEPTION 'POS_SHIFT_REQUIRED'; END IF;

  PERFORM 1 FROM public.pos_cashier_shifts
    WHERE id = _sale.shift_id AND restaurant_id = _restaurant_id AND status = 'open';
  IF NOT FOUND THEN RAISE EXCEPTION 'POS_SHIFT_NOT_OPEN'; END IF;

  SELECT COALESCE(SUM(line_subtotal), 0), COALESCE(SUM(tax_amount), 0),
         COALESCE(SUM(discount_amount), 0), COALESCE(SUM(line_total), 0)
    INTO _subtotal, _tax, _discount, _total
    FROM public.pos_sale_items WHERE sale_id = _sale_id;

  IF _total <= 0 THEN RAISE EXCEPTION 'POS_SALE_EMPTY'; END IF;

  SELECT COALESCE(SUM(amount), 0) INTO _paid FROM public.pos_payments
    WHERE sale_id = _sale_id AND status = 'captured';
  IF _paid + 0.001 < _total THEN RAISE EXCEPTION 'POS_PAYMENT_INSUFFICIENT'; END IF;

  INSERT INTO public.pos_sale_counters (restaurant_id, last_number)
    VALUES (_restaurant_id, 1)
    ON CONFLICT (restaurant_id) DO UPDATE
      SET last_number = public.pos_sale_counters.last_number + 1, updated_at = now()
    RETURNING last_number INTO _number;

  SELECT NULLIF(trim(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), '')
    INTO _name
    FROM public.restaurant_users ru
    LEFT JOIN public.profiles p ON p.id = ru.user_id
    WHERE ru.id = _membership_id;

  UPDATE public.pos_sales SET
    status = 'completed',
    subtotal = _subtotal,
    discount_amount = _discount,
    tax_amount = _tax,
    total = _total,
    sale_number = _number,
    sale_reference = 'POS-' || lpad(_number::text, 6, '0'),
    completed_at = now(),
    completed_by_membership_id = _membership_id,
    cashier_name_snapshot = COALESCE(_sale.cashier_name_snapshot, _name)
  WHERE id = _sale_id AND restaurant_id = _restaurant_id AND status = 'open'
  RETURNING * INTO _sale;

  IF _sale.id IS NULL THEN RAISE EXCEPTION 'POS_SALE_NOT_OPEN'; END IF;

  UPDATE public.pos_payments SET shift_id = COALESCE(shift_id, _sale.shift_id)
    WHERE sale_id = _sale_id AND restaurant_id = _restaurant_id;

  RETURN _sale;
END;
$$;

CREATE OR REPLACE FUNCTION public.pos_refund_sale_allocated(
  _restaurant_id uuid,
  _sale_id uuid,
  _payment_id uuid,
  _amount numeric,
  _reason text,
  _shift_id uuid,
  _membership_id uuid
)
RETURNS public.pos_sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sale public.pos_sales;
  _payment public.pos_payments;
  _payment_refunded numeric(12,2);
  _remaining numeric(12,2);
  _new_refunded numeric(12,2);
  _status text;
  _shift public.pos_cashier_shifts;
  _use_shift uuid;
BEGIN
  SELECT * INTO _sale FROM public.pos_sales
    WHERE id = _sale_id AND restaurant_id = _restaurant_id FOR UPDATE;
  IF _sale.id IS NULL THEN RAISE EXCEPTION 'POS_SALE_NOT_FOUND'; END IF;
  IF _sale.status NOT IN ('completed','partially_refunded') THEN RAISE EXCEPTION 'POS_SALE_NOT_REFUNDABLE'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'POS_INVALID_AMOUNT'; END IF;

  SELECT * INTO _payment FROM public.pos_payments
    WHERE id = _payment_id AND sale_id = _sale_id AND restaurant_id = _restaurant_id;
  IF _payment.id IS NULL OR _payment.status <> 'captured' THEN
    RAISE EXCEPTION 'POS_REFUND_PAYMENT_MISMATCH';
  END IF;

  SELECT COALESCE(sum(amount), 0) INTO _payment_refunded
    FROM public.pos_refunds WHERE payment_id = _payment_id AND restaurant_id = _restaurant_id;
  IF _amount > (_payment.amount - _payment_refunded) + 0.001 THEN
    RAISE EXCEPTION 'POS_REFUND_EXCEEDS_PAYMENT';
  END IF;

  _remaining := _sale.total - _sale.refunded_amount;
  IF _amount > _remaining + 0.001 THEN RAISE EXCEPTION 'POS_REFUND_EXCEEDS_REMAINING'; END IF;

  -- Cash leaves a real drawer: it must be the drawer open right now.
  IF _payment.payment_method = 'cash' THEN
    IF _shift_id IS NULL THEN RAISE EXCEPTION 'POS_REFUND_SHIFT_REQUIRED'; END IF;
    SELECT * INTO _shift FROM public.pos_cashier_shifts
      WHERE id = _shift_id AND restaurant_id = _restaurant_id AND status = 'open';
    IF _shift.id IS NULL THEN RAISE EXCEPTION 'POS_REFUND_SHIFT_REQUIRED'; END IF;
    _use_shift := _shift.id;
  ELSE
    _use_shift := NULL;
  END IF;

  INSERT INTO public.pos_refunds (
    restaurant_id, sale_id, payment_id, shift_id, amount, method, reason,
    authorized_by_membership_id, processed_by_membership_id
  ) VALUES (
    _restaurant_id, _sale_id, _payment_id, _use_shift, round(_amount, 2),
    _payment.payment_method, _reason, _membership_id, _membership_id
  );

  _new_refunded := round(_sale.refunded_amount + _amount, 2);
  _status := CASE WHEN _new_refunded + 0.001 >= _sale.total THEN 'refunded' ELSE 'partially_refunded' END;

  UPDATE public.pos_sales SET refunded_amount = _new_refunded, status = _status
    WHERE id = _sale_id AND restaurant_id = _restaurant_id
    RETURNING * INTO _sale;

  RETURN _sale;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_folio_transaction(
  _restaurant_id uuid, _folio_id uuid, _type text, _category text,
  _description text, _amount numeric, _reference_type text, _reference_id uuid,
  _membership_id uuid
) RETURNS folio_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  folio public.guest_folios%ROWTYPE;
  signed numeric(12,2);
  txn public.folio_transactions%ROWTYPE;
  settled numeric(12,2);
  clean_desc text := NULLIF(btrim(COALESCE(_description, '')), '');
BEGIN
  IF _type NOT IN ('charge','payment','deposit','refund','adjustment','discount') THEN
    RAISE EXCEPTION 'INVALID_TRANSACTION_TYPE';
  END IF;

  IF clean_desc IS NULL THEN
    RAISE EXCEPTION 'DESCRIPTION_REQUIRED';
  END IF;

  SELECT * INTO folio FROM public.guest_folios
  WHERE id = _folio_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FOLIO_NOT_FOUND';
  END IF;

  IF folio.status <> 'open' THEN
    RAISE EXCEPTION 'FOLIO_CLOSED';
  END IF;

  IF _type = 'adjustment' THEN
    IF _amount = 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
    signed := _amount;
  ELSE
    IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
    signed := CASE _type
      WHEN 'charge' THEN _amount
      WHEN 'refund' THEN _amount
      ELSE -_amount
    END;
  END IF;

  IF _type = 'refund' THEN
    SELECT COALESCE(-sum(amount), 0) INTO settled
    FROM public.folio_transactions
    WHERE folio_id = folio.id AND transaction_type IN ('payment','deposit','refund');

    IF _amount > settled THEN
      RAISE EXCEPTION 'REFUND_EXCEEDS_SETTLED';
    END IF;
  END IF;

  INSERT INTO public.folio_transactions (
    restaurant_id, folio_id, transaction_type, category, description, amount,
    reference_type, reference_id, posted_by_membership_id
  ) VALUES (
    _restaurant_id, folio.id, _type, _category, clean_desc, signed,
    _reference_type, _reference_id, _membership_id
  ) RETURNING * INTO txn;

  INSERT INTO public.folio_history (
    restaurant_id, folio_id, event_type, new_values, notes, actor_membership_id
  ) VALUES (
    _restaurant_id, folio.id,
    CASE _type
      WHEN 'charge' THEN 'manual_charge_posted'
      WHEN 'payment' THEN 'payment_received'
      WHEN 'deposit' THEN 'deposit_received'
      WHEN 'refund' THEN 'refund_posted'
      WHEN 'discount' THEN 'discount_posted'
      ELSE 'adjustment_posted'
    END,
    jsonb_build_object('transaction_id', txn.id, 'amount', signed, 'category', _category,
                       'reference_type', _reference_type),
    clean_desc, _membership_id
  );

  RETURN txn;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_order_room_charge(
  _restaurant_id uuid, _order_id uuid, _folio_id uuid, _membership_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  ord public.orders%ROWTYPE;
  folio public.guest_folios%ROWTYPE;
  res public.hotel_reservations%ROWTYPE;
  prop_currency text;
  txn public.folio_transactions%ROWTYPE;
BEGIN
  SELECT * INTO ord FROM public.orders
  WHERE id = _order_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;

  IF ord.room_charge_folio_id IS NOT NULL AND ord.room_charge_posted_at IS NOT NULL THEN
    RETURN jsonb_build_object('already', true, 'folio_id', ord.room_charge_folio_id,
                              'order_id', ord.id, 'amount', ord.total);
  END IF;

  IF ord.status = 'cancelled' THEN RAISE EXCEPTION 'ORDER_CANCELLED'; END IF;
  IF ord.status <> 'served' THEN RAISE EXCEPTION 'ORDER_NOT_ELIGIBLE'; END IF;
  IF ord.total IS NULL OR ord.total <= 0 THEN RAISE EXCEPTION 'ORDER_NOT_ELIGIBLE'; END IF;

  SELECT * INTO folio FROM public.guest_folios
  WHERE id = _folio_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FOLIO_NOT_FOUND'; END IF;
  IF folio.status <> 'open' THEN RAISE EXCEPTION 'FOLIO_CLOSED'; END IF;
  IF folio.reservation_id IS NULL THEN RAISE EXCEPTION 'RESERVATION_NOT_CHECKED_IN'; END IF;

  SELECT * INTO res FROM public.hotel_reservations
  WHERE id = folio.reservation_id AND restaurant_id = _restaurant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESERVATION_NOT_CHECKED_IN'; END IF;
  IF res.status <> 'checked_in' OR res.room_id IS NULL THEN RAISE EXCEPTION 'RESERVATION_NOT_CHECKED_IN'; END IF;
  IF res.guest_id <> folio.guest_id THEN RAISE EXCEPTION 'FOLIO_NOT_FOUND'; END IF;

  SELECT COALESCE(currency_code, 'GBP') INTO prop_currency FROM public.restaurants WHERE id = _restaurant_id;
  IF prop_currency IS DISTINCT FROM folio.currency THEN RAISE EXCEPTION 'CURRENCY_MISMATCH'; END IF;

  INSERT INTO public.folio_transactions (
    restaurant_id, folio_id, transaction_type, category, description, amount,
    reference_type, reference_id, posted_by_membership_id
  ) VALUES (
    _restaurant_id, folio.id, 'charge', 'restaurant',
    'Restaurant Order #' || ord.order_number, ord.total,
    'restaurant_order', ord.id, _membership_id
  ) RETURNING * INTO txn;

  UPDATE public.orders SET
    billing_method = 'room_charge',
    room_charge_folio_id = folio.id,
    room_charge_reservation_id = res.id,
    room_charge_posted_at = now(),
    room_charge_posted_by_membership_id = _membership_id,
    updated_at = now()
  WHERE id = ord.id;

  INSERT INTO public.folio_history (
    restaurant_id, folio_id, event_type, previous_values, new_values, notes, actor_membership_id
  ) VALUES (
    _restaurant_id, folio.id, 'restaurant_charge_posted', NULL,
    jsonb_build_object('order_id', ord.id, 'order_number', ord.order_number, 'amount', ord.total,
                       'reservation_id', res.id, 'room_id', res.room_id, 'guest_id', folio.guest_id,
                       'transaction_id', txn.id),
    'Restaurant Order #' || ord.order_number || ' charged to room.', _membership_id
  );

  RETURN jsonb_build_object('already', false, 'folio_id', folio.id, 'order_id', ord.id,
                            'transaction_id', txn.id, 'amount', ord.total);
END;
$$;

CREATE OR REPLACE FUNCTION public.price_hotel_stay(
  _restaurant_id uuid,
  _rate_plan_id uuid,
  _room_type_id uuid,
  _arrival date,
  _departure date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  plan public.hotel_rate_plans%ROWTYPE;
  night date;
  rate numeric(12,2);
  subtotal numeric(12,2) := 0;
  nights integer;
  lines jsonb := '[]'::jsonb;
  restriction public.hotel_rate_restrictions%ROWTYPE;
BEGIN
  IF _departure <= _arrival THEN
    RAISE EXCEPTION 'INVALID_DATES';
  END IF;

  SELECT * INTO plan FROM public.hotel_rate_plans
  WHERE id = _rate_plan_id AND restaurant_id = _restaurant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RATE_PLAN_NOT_FOUND';
  END IF;
  IF plan.active IS NOT TRUE THEN
    RAISE EXCEPTION 'RATE_PLAN_INACTIVE';
  END IF;
  IF _room_type_id IS NOT NULL AND plan.room_type_id <> _room_type_id THEN
    RAISE EXCEPTION 'RATE_PLAN_TYPE_MISMATCH';
  END IF;
  IF (plan.valid_from IS NOT NULL AND _arrival < plan.valid_from)
     OR (plan.valid_to IS NOT NULL AND (_departure - 1) > plan.valid_to) THEN
    RAISE EXCEPTION 'RATE_PLAN_OUT_OF_RANGE';
  END IF;

  nights := (_departure - _arrival);

  SELECT * INTO restriction FROM public.hotel_rate_restrictions
  WHERE rate_plan_id = plan.id AND restriction_date = _arrival;
  IF FOUND THEN
    IF restriction.closed_to_arrival THEN
      RAISE EXCEPTION 'CLOSED_TO_ARRIVAL';
    END IF;
    IF restriction.min_stay IS NOT NULL AND nights < restriction.min_stay THEN
      RAISE EXCEPTION 'MIN_STAY_%', restriction.min_stay;
    END IF;
    IF restriction.max_stay IS NOT NULL AND nights > restriction.max_stay THEN
      RAISE EXCEPTION 'MAX_STAY_%', restriction.max_stay;
    END IF;
  END IF;

  SELECT * INTO restriction FROM public.hotel_rate_restrictions
  WHERE rate_plan_id = plan.id AND restriction_date = _departure;
  IF FOUND AND restriction.closed_to_departure THEN
    RAISE EXCEPTION 'CLOSED_TO_DEPARTURE';
  END IF;

  night := _arrival;
  WHILE night < _departure LOOP
    SELECT * INTO restriction FROM public.hotel_rate_restrictions
    WHERE rate_plan_id = plan.id AND restriction_date = night;
    IF FOUND AND restriction.stop_sell THEN
      RAISE EXCEPTION 'STOP_SELL';
    END IF;

    SELECT c.nightly_rate INTO rate FROM public.hotel_rate_calendar c
    WHERE c.rate_plan_id = plan.id AND c.rate_date = night;
    IF rate IS NULL THEN
      rate := plan.base_rate;
    END IF;

    subtotal := subtotal + rate;
    lines := lines || jsonb_build_object('date', to_char(night, 'YYYY-MM-DD'), 'rate', rate);
    rate := NULL;
    night := night + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'rate_plan_id', plan.id,
    'rate_plan_code', plan.code,
    'rate_plan_name', plan.name,
    'currency', plan.currency,
    'nights', nights,
    'subtotal', subtotal,
    'nightly', lines
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.receive_purchase_order_goods(
  _restaurant_id uuid,
  _purchase_order_id uuid,
  _lines jsonb,
  _membership_id uuid,
  _notes text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  po public.purchase_orders%ROWTYPE;
  line jsonb;
  po_line public.purchase_order_items%ROWTYPE;
  qty numeric(14,3);
  received_any boolean := false;
  outstanding integer;
  new_status text;
  movement_id uuid;
BEGIN
  SELECT * INTO po FROM public.purchase_orders
  WHERE id = _purchase_order_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO_NOT_FOUND';
  END IF;

  IF po.status NOT IN ('ordered','partially_received') THEN
    RAISE EXCEPTION 'PO_NOT_RECEIVABLE';
  END IF;

  FOR line IN SELECT * FROM jsonb_array_elements(_lines)
  LOOP
    qty := (line ->> 'quantity')::numeric;
    CONTINUE WHEN qty IS NULL OR qty = 0;

    IF qty < 0 THEN
      RAISE EXCEPTION 'INVALID_QUANTITY';
    END IF;

    SELECT * INTO po_line FROM public.purchase_order_items
    WHERE id = (line ->> 'lineId')::uuid
      AND purchase_order_id = po.id
      AND restaurant_id = _restaurant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'LINE_NOT_FOUND';
    END IF;

    IF po_line.received_quantity + qty > po_line.ordered_quantity THEN
      RAISE EXCEPTION 'EXCEEDS_REMAINING';
    END IF;

    PERFORM public.apply_inventory_movement(
      _restaurant_id,
      po_line.inventory_item_id,
      'purchase_received',
      qty,
      po_line.unit_cost,
      COALESCE(_notes, 'Goods received on ' || po.po_number),
      _membership_id,
      false
    );

    SELECT id INTO movement_id FROM public.inventory_stock_movements
    WHERE restaurant_id = _restaurant_id
      AND inventory_item_id = po_line.inventory_item_id
    ORDER BY created_at DESC
    LIMIT 1;

    UPDATE public.inventory_stock_movements
    SET purchase_order_id = po.id,
        purchase_order_item_id = po_line.id,
        supplier_id = po.supplier_id
    WHERE id = movement_id;

    UPDATE public.purchase_order_items
    SET received_quantity = po_line.received_quantity + qty
    WHERE id = po_line.id;

    -- MVP costing: latest received cost becomes the item's current unit cost.
    UPDATE public.inventory_items
    SET unit_cost = po_line.unit_cost
    WHERE id = po_line.inventory_item_id AND restaurant_id = _restaurant_id;

    received_any := true;
  END LOOP;

  IF NOT received_any THEN
    RAISE EXCEPTION 'NOTHING_TO_RECEIVE';
  END IF;

  SELECT count(*) INTO outstanding FROM public.purchase_order_items
  WHERE purchase_order_id = po.id AND received_quantity < ordered_quantity;

  new_status := CASE WHEN outstanding = 0 THEN 'received' ELSE 'partially_received' END;

  UPDATE public.purchase_orders SET status = new_status WHERE id = po.id;

  INSERT INTO public.purchase_order_history (
    restaurant_id, purchase_order_id, event_type, previous_values, new_values,
    notes, created_by_staff_membership_id
  ) VALUES (
    _restaurant_id, po.id, 'goods_received',
    jsonb_build_object('status', po.status),
    jsonb_build_object('status', new_status, 'lines', _lines),
    _notes, _membership_id
  );

  INSERT INTO public.purchase_order_history (
    restaurant_id, purchase_order_id, event_type, new_values, created_by_staff_membership_id
  ) VALUES (
    _restaurant_id, po.id,
    CASE WHEN new_status = 'received' THEN 'po_received' ELSE 'po_partially_received' END,
    jsonb_build_object('status', new_status), _membership_id
  );

  RETURN new_status;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_pos_order_payment(
  _restaurant_id uuid,
  _order_id uuid,
  _shift_id uuid,
  _method text,
  _amount numeric,
  _tendered numeric,
  _reference text,
  _membership_id uuid
) RETURNS public.order_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _order public.orders%ROWTYPE;
  _shift public.cashier_shifts%ROWTYPE;
  _change numeric(10,2) := 0;
  _row public.order_payments%ROWTYPE;
BEGIN
  SELECT * INTO _order FROM public.orders
    WHERE id = _order_id AND restaurant_id = _restaurant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF _order.paid_at IS NOT NULL THEN RAISE EXCEPTION 'ORDER_ALREADY_PAID'; END IF;
  IF _order.billing_method = 'room_charge' THEN RAISE EXCEPTION 'ORDER_ALREADY_PAID'; END IF;
  IF _method NOT IN ('cash','card') THEN RAISE EXCEPTION 'INVALID_PAYMENT_METHOD'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;

  SELECT * INTO _shift FROM public.cashier_shifts
    WHERE id = _shift_id AND restaurant_id = _restaurant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SHIFT_NOT_FOUND'; END IF;
  IF _shift.status <> 'open' THEN RAISE EXCEPTION 'SHIFT_ALREADY_CLOSED'; END IF;

  IF _method = 'cash' THEN
    IF _tendered IS NULL OR _tendered < _amount THEN RAISE EXCEPTION 'INSUFFICIENT_TENDER'; END IF;
    _change := round(_tendered - _amount, 2);
  END IF;

  INSERT INTO public.order_payments (
    restaurant_id, order_id, cashier_shift_id, method, amount,
    tendered_amount, change_amount, reference, membership_id
  ) VALUES (
    _restaurant_id, _order_id, _shift_id, _method, round(_amount, 2),
    CASE WHEN _method = 'cash' THEN round(_tendered, 2) ELSE NULL END,
    _change, nullif(btrim(coalesce(_reference, '')), ''), _membership_id
  ) RETURNING * INTO _row;

  UPDATE public.orders
    SET paid_at = now(),
        billing_method = 'direct',
        cashier_shift_id = _shift_id,
        updated_at = now()
    WHERE id = _order_id;

  RETURN _row;
END;
$$;

CREATE OR REPLACE FUNCTION public.reprice_hotel_reservation(
  _restaurant_id uuid,
  _reservation_id uuid,
  _rate_plan_id uuid,
  _membership_id uuid
)
RETURNS public.hotel_reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  existing public.hotel_reservations%ROWTYPE;
  updated public.hotel_reservations%ROWTYPE;
  pricing jsonb;
BEGIN
  SELECT * INTO existing FROM public.hotel_reservations
  WHERE id = _reservation_id AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;

  pricing := public.price_hotel_stay(
    _restaurant_id, _rate_plan_id, existing.room_type_id, existing.arrival_date, existing.departure_date
  );

  UPDATE public.hotel_reservations
  SET rate_plan_id = _rate_plan_id,
      currency = pricing->>'currency',
      room_subtotal = (pricing->>'subtotal')::numeric,
      nightly_rate_snapshot = pricing->'nightly',
      priced_at = now()
  WHERE id = existing.id
  RETURNING * INTO updated;

  INSERT INTO public.hotel_reservation_history (
    restaurant_id, reservation_id, event_type, previous_values, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id, existing.id, 'repriced',
    jsonb_build_object('rate_plan_id', existing.rate_plan_id, 'room_subtotal', existing.room_subtotal,
                       'currency', existing.currency),
    jsonb_build_object('rate_plan_id', updated.rate_plan_id, 'room_subtotal', updated.room_subtotal,
                       'currency', updated.currency),
    _membership_id
  );

  RETURN updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_order_room_charge(
  _restaurant_id uuid, _order_id uuid, _reason text, _membership_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  ord public.orders%ROWTYPE;
  folio public.guest_folios%ROWTYPE;
  original public.folio_transactions%ROWTYPE;
  reversal public.folio_transactions%ROWTYPE;
  clean_reason text := NULLIF(btrim(COALESCE(_reason, '')), '');
BEGIN
  IF clean_reason IS NULL THEN RAISE EXCEPTION 'REVERSAL_REASON_REQUIRED'; END IF;

  SELECT * INTO ord FROM public.orders
  WHERE id = _order_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF ord.room_charge_folio_id IS NULL THEN RAISE EXCEPTION 'CHARGE_NOT_FOUND'; END IF;

  SELECT * INTO original FROM public.folio_transactions
  WHERE restaurant_id = _restaurant_id AND reference_type = 'restaurant_order' AND reference_id = ord.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHARGE_NOT_FOUND'; END IF;

  IF EXISTS (SELECT 1 FROM public.folio_transactions
             WHERE restaurant_id = _restaurant_id
               AND reference_type = 'restaurant_order_reversal' AND reference_id = ord.id) THEN
    RAISE EXCEPTION 'CHARGE_ALREADY_REVERSED';
  END IF;

  SELECT * INTO folio FROM public.guest_folios
  WHERE id = ord.room_charge_folio_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FOLIO_NOT_FOUND'; END IF;
  IF folio.status <> 'open' THEN RAISE EXCEPTION 'FOLIO_CLOSED'; END IF;

  INSERT INTO public.folio_transactions (
    restaurant_id, folio_id, transaction_type, category, description, amount,
    reference_type, reference_id, posted_by_membership_id
  ) VALUES (
    _restaurant_id, folio.id, 'adjustment', 'restaurant',
    'Reversal — Restaurant Order #' || ord.order_number || ' (' || clean_reason || ')',
    -original.amount, 'restaurant_order_reversal', ord.id, _membership_id
  ) RETURNING * INTO reversal;

  UPDATE public.orders SET
    billing_method = 'direct',
    room_charge_folio_id = NULL,
    room_charge_reservation_id = NULL,
    room_charge_posted_at = NULL,
    room_charge_posted_by_membership_id = NULL,
    updated_at = now()
  WHERE id = ord.id;

  INSERT INTO public.folio_history (
    restaurant_id, folio_id, event_type, previous_values, new_values, notes, actor_membership_id
  ) VALUES (
    _restaurant_id, folio.id, 'restaurant_charge_reversed',
    jsonb_build_object('transaction_id', original.id, 'amount', original.amount),
    jsonb_build_object('order_id', ord.id, 'order_number', ord.order_number,
                       'reversal_transaction_id', reversal.id, 'amount', reversal.amount),
    clean_reason, _membership_id
  );

  RETURN jsonb_build_object('order_id', ord.id, 'reversal_transaction_id', reversal.id, 'amount', reversal.amount);
END;
$$;


-- 9. RLS enablement is included in section 4 ALTER TABLE overlays for every application table.


-- 10. Final RLS policies (obsolete open order policies omitted; see header)

CREATE POLICY "Platform admins can read audit log" ON public.admin_audit_log
  FOR SELECT TO authenticated USING (public.is_platform_admin());

CREATE POLICY "Cashiers read cashier shifts" ON public.cashier_shifts FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['cashier','accountant']));

CREATE POLICY "Managers insert cashier shifts" ON public.cashier_shifts
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Managers read cashier shifts" ON public.cashier_shifts
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Managers update cashier shifts" ON public.cashier_shifts
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Managers read channels" ON public.distribution_channels
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Managers write channels" ON public.distribution_channels
  FOR ALL TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Managers read distribution logs" ON public.distribution_logs
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Managers read rate mappings" ON public.distribution_rate_mappings
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Managers write rate mappings" ON public.distribution_rate_mappings
  FOR ALL TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Managers read room mappings" ON public.distribution_room_mappings
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Managers write room mappings" ON public.distribution_room_mappings
  FOR ALL TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Cashiers read folio history" ON public.folio_history FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['cashier','accountant']));

CREATE POLICY "Managers read folio history" ON public.folio_history
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Cashiers read folio transactions" ON public.folio_transactions FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['cashier','accountant']));

CREATE POLICY "Managers read folio transactions" ON public.folio_transactions
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Cashiers read folio counters" ON public.guest_folio_counters FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['cashier','accountant']));

CREATE POLICY "Managers read folio counters" ON public.guest_folio_counters
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Cashiers read folios" ON public.guest_folios FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['cashier','accountant']));

CREATE POLICY "Managers insert folios" ON public.guest_folios
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Managers read folios" ON public.guest_folios
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Managers update folios" ON public.guest_folios
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Front office read guest preferences" ON public.guest_preferences FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));

CREATE POLICY "Managers insert guest preferences" ON public.guest_preferences
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Managers read guest preferences" ON public.guest_preferences
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Managers update guest preferences" ON public.guest_preferences
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Front office read guest history" ON public.guest_profile_history FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));

CREATE POLICY "Managers read guest history" ON public.guest_profile_history
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Front office insert guests" ON public.guest_profiles FOR INSERT TO authenticated
  WITH CHECK (has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));

CREATE POLICY "Front office read guests" ON public.guest_profiles FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['receptionist','cashier']));

CREATE POLICY "Front office update guests" ON public.guest_profiles FOR UPDATE TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));

CREATE POLICY "Managers insert guests" ON public.guest_profiles
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Managers read guests" ON public.guest_profiles
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Managers update guests" ON public.guest_profiles
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Front office read rate calendar" ON public.hotel_rate_calendar FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['receptionist','cashier','accountant']));

CREATE POLICY "Managers delete rate calendar" ON public.hotel_rate_calendar
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Managers read rate calendar" ON public.hotel_rate_calendar
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Managers update rate calendar" ON public.hotel_rate_calendar
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Managers write rate calendar" ON public.hotel_rate_calendar
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Front office read rate categories" ON public.hotel_rate_categories FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['receptionist','cashier','accountant']));

CREATE POLICY "Managers insert rate categories" ON public.hotel_rate_categories
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Managers read rate categories" ON public.hotel_rate_categories
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Managers update rate categories" ON public.hotel_rate_categories
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Front office read rate plans" ON public.hotel_rate_plans FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['receptionist','cashier','accountant']));

CREATE POLICY "Managers insert rate plans" ON public.hotel_rate_plans
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Managers read rate plans" ON public.hotel_rate_plans
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Managers update rate plans" ON public.hotel_rate_plans
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Front office read rate restrictions" ON public.hotel_rate_restrictions FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['receptionist','cashier','accountant']));

CREATE POLICY "Managers delete rate restrictions" ON public.hotel_rate_restrictions
  FOR DELETE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Managers insert rate restrictions" ON public.hotel_rate_restrictions
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Managers read rate restrictions" ON public.hotel_rate_restrictions
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Managers update rate restrictions" ON public.hotel_rate_restrictions
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Front office read reservation counters" ON public.hotel_reservation_counters FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));

CREATE POLICY "Managers read reservation counters" ON public.hotel_reservation_counters
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Front office read reservation history" ON public.hotel_reservation_history FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));

CREATE POLICY "Managers read reservation history" ON public.hotel_reservation_history
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Cashiers read reservations" ON public.hotel_reservations FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['cashier','accountant']));

CREATE POLICY "Front office insert reservations" ON public.hotel_reservations FOR INSERT TO authenticated
  WITH CHECK (has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));

CREATE POLICY "Front office read reservations" ON public.hotel_reservations FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));

CREATE POLICY "Front office update reservations"
ON public.hotel_reservations FOR UPDATE TO authenticated
USING (public.has_any_restaurant_role(restaurant_id, ARRAY['receptionist']))
WITH CHECK (public.has_any_restaurant_role(restaurant_id, ARRAY['receptionist']));

CREATE POLICY "Housekeeping read hk reservations" ON public.hotel_reservations FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['housekeeping','housekeeper','housekeeping_supervisor']));

CREATE POLICY "Managers insert reservations" ON public.hotel_reservations
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Managers read reservations" ON public.hotel_reservations
  FOR SELECT TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Managers update reservations" ON public.hotel_reservations
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Managers insert rooms" ON public.hotel_rooms
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Managers update rooms" ON public.hotel_rooms
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Members read rooms" ON public.hotel_rooms
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));

CREATE POLICY "Housekeeping read discrepancies" ON public.housekeeping_discrepancies FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['housekeeping','housekeeper','housekeeping_supervisor']));

CREATE POLICY "hk discrepancies readable by managers" ON public.housekeeping_discrepancies
  FOR SELECT TO authenticated
  USING (public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager'));

CREATE POLICY "Housekeeping read history" ON public.housekeeping_history FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['housekeeping','housekeeping_supervisor']));

CREATE POLICY "hk history readable by managers" ON public.housekeeping_history
  FOR SELECT TO authenticated
  USING (public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager'));

CREATE POLICY "Housekeeping read inspections" ON public.housekeeping_inspections FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['housekeeping','housekeeping_supervisor']));

CREATE POLICY "hk inspections readable by managers" ON public.housekeeping_inspections
  FOR SELECT TO authenticated
  USING (public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager'));

CREATE POLICY "Housekeeping read maintenance" ON public.housekeeping_maintenance_requests FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['housekeeping','housekeeper','housekeeping_supervisor','maintenance']));

CREATE POLICY "Housekeeping update maintenance" ON public.housekeeping_maintenance_requests FOR UPDATE TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['housekeeping','housekeeping_supervisor','maintenance']));

CREATE POLICY "hk maintenance readable by managers" ON public.housekeeping_maintenance_requests
  FOR SELECT TO authenticated
  USING (public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager'));

CREATE POLICY "Housekeeping insert tasks" ON public.housekeeping_tasks FOR INSERT TO authenticated
  WITH CHECK (has_any_restaurant_role(restaurant_id, ARRAY['housekeeping','housekeeping_supervisor']));

CREATE POLICY "Housekeeping read tasks" ON public.housekeeping_tasks FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['housekeeping','housekeeper','housekeeping_supervisor']));

CREATE POLICY "Housekeeping update tasks" ON public.housekeeping_tasks FOR UPDATE TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['housekeeping','housekeeper','housekeeping_supervisor']));

CREATE POLICY "hk tasks readable by managers" ON public.housekeeping_tasks
  FOR SELECT TO authenticated
  USING (public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager'));

CREATE POLICY "Restaurant members can view inventory items"
ON public.inventory_items FOR SELECT TO authenticated
USING (public.is_restaurant_member(restaurant_id));

CREATE POLICY "Restaurant members can view stock movements"
ON public.inventory_stock_movements FOR SELECT TO authenticated
USING (public.is_restaurant_member(restaurant_id));

CREATE POLICY "Restaurant staff can read units"
ON public.inventory_units
FOR SELECT
TO authenticated
USING (
  is_active = true
  AND EXISTS (
    SELECT 1 FROM public.restaurant_users ru
    WHERE ru.user_id = auth.uid()
      AND ru.active = true
  )
);

create policy "Managers can manage categories" on public.menu_categories
  for all to authenticated
  using (public.has_restaurant_role(restaurant_id,'owner') or public.has_restaurant_role(restaurant_id,'manager'))
  with check (public.has_restaurant_role(restaurant_id,'owner') or public.has_restaurant_role(restaurant_id,'manager'));

create policy "Members can view their categories" on public.menu_categories
  for select to authenticated using (public.is_restaurant_member(restaurant_id));

create policy "Public can view active categories of live restaurants" on public.menu_categories
  for select to anon, authenticated using (
    active = true and exists (
      select 1 from public.restaurants r
      where r.id = restaurant_id and r.approved = true and r.active = true
    )
  );

CREATE POLICY "Restaurant members can view recipe components"
ON public.menu_item_recipe_components FOR SELECT TO authenticated
USING (public.is_restaurant_member(restaurant_id));

create policy "Managers can manage menu items" on public.menu_items
  for all to authenticated
  using (public.has_restaurant_role(restaurant_id,'owner') or public.has_restaurant_role(restaurant_id,'manager'))
  with check (public.has_restaurant_role(restaurant_id,'owner') or public.has_restaurant_role(restaurant_id,'manager'));

create policy "Members can view their menu items" on public.menu_items
  for select to authenticated using (public.is_restaurant_member(restaurant_id));

CREATE POLICY "Public can view items of live restaurants" ON public.menu_items
  FOR SELECT TO anon, authenticated
  USING (
    available = true
    AND EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = menu_items.restaurant_id AND r.approved = true AND r.active = true
    )
  );

CREATE POLICY "Accountants read night audit exceptions" ON public.night_audit_exceptions FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['cashier','accountant']));

CREATE POLICY "Managers read night audit exceptions" ON public.night_audit_exceptions
  FOR SELECT TO authenticated
  USING (public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager'));

CREATE POLICY "Accountants read night audit runs" ON public.night_audit_runs FOR SELECT TO authenticated
  USING (has_any_restaurant_role(restaurant_id, ARRAY['cashier','accountant']));

CREATE POLICY "Managers read night audit runs" ON public.night_audit_runs
  FOR SELECT TO authenticated
  USING (public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager'));

create policy "Customers can view their own order items" on public.order_items
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid())
  );

create policy "Members can view their restaurant order items" on public.order_items
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id = order_id and public.is_restaurant_member(o.restaurant_id))
  );

CREATE POLICY "Cash-handling staff read order payments"
  ON public.order_payments FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['owner','manager','cashier','accountant','waiter']));

create policy "Customers can view their own order history" on public.order_status_history
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid())
  );

create policy "Staff can view their restaurant order history" on public.order_status_history
  for select to authenticated using (
    exists (select 1 from public.orders o where o.id = order_id and public.is_restaurant_member(o.restaurant_id))
  );

create policy "Customers can view their own orders" on public.orders
  for select to authenticated using (customer_id = auth.uid());

CREATE POLICY "Kitchen staff can update their restaurant orders"
ON public.orders
FOR UPDATE
TO authenticated
USING (public.has_kitchen_access(restaurant_id))
WITH CHECK (public.has_kitchen_access(restaurant_id));

create policy "Members can view their restaurant orders" on public.orders
  for select to authenticated using (public.is_restaurant_member(restaurant_id));

CREATE POLICY "POS staff read shifts" ON public.pos_cashier_shifts
  FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['owner','manager','cashier','accountant']));

CREATE POLICY "POS staff read categories" ON public.pos_categories
  FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['owner','manager','cashier','accountant']));

CREATE POLICY "POS staff read payments" ON public.pos_payments
  FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['owner','manager','cashier','accountant']));

CREATE POLICY "POS staff read products" ON public.pos_products
  FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['owner','manager','cashier','accountant']));

CREATE POLICY "POS staff read refunds" ON public.pos_refunds
  FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['owner','manager','cashier','accountant']));

CREATE POLICY "POS staff read registers" ON public.pos_registers
  FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['owner','manager','cashier','accountant']));

CREATE POLICY "POS managers read sale counters" ON public.pos_sale_counters
  FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['owner','manager']));

CREATE POLICY "POS staff read sale items" ON public.pos_sale_items
  FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['owner','manager','cashier','accountant']));

CREATE POLICY "POS staff read sales" ON public.pos_sales
  FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['owner','manager','cashier','accountant']));

CREATE POLICY "POS staff read pos settings" ON public.pos_settings
  FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['owner','manager','cashier','accountant']));

CREATE POLICY "Platform admins can view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.is_platform_admin());

create policy "Users can insert their own profile" on public.profiles for insert to authenticated with check (id = auth.uid());

create policy "Users can update their own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid() and account_type <> 'platform_admin');

create policy "Users can view their own profile" on public.profiles for select to authenticated using (id = auth.uid());

CREATE POLICY "Restaurant members can view purchase order history"
ON public.purchase_order_history FOR SELECT TO authenticated
USING (public.is_restaurant_member(restaurant_id));

CREATE POLICY "Restaurant members can view purchase order items"
ON public.purchase_order_items FOR SELECT TO authenticated
USING (public.is_restaurant_member(restaurant_id));

CREATE POLICY "Restaurant members can view purchase orders"
ON public.purchase_orders FOR SELECT TO authenticated
USING (public.is_restaurant_member(restaurant_id));

CREATE POLICY "Members read restaurant asset history"
  ON public.restaurant_asset_history FOR SELECT TO authenticated
  USING (public.is_restaurant_member(restaurant_id));

CREATE POLICY "Members read restaurant assets"
  ON public.restaurant_assets FOR SELECT TO authenticated
  USING (public.is_restaurant_member(restaurant_id));

CREATE POLICY "opening hours are publicly readable"
ON public.restaurant_opening_hours
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = restaurant_opening_hours.restaurant_id
      AND r.approved = true
      AND r.active = true
  )
  OR public.is_restaurant_member(restaurant_id)
);

CREATE POLICY "owners and managers delete opening hours"
  ON public.restaurant_opening_hours FOR DELETE
  TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "owners and managers insert opening hours"
  ON public.restaurant_opening_hours FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "owners and managers update opening hours"
  ON public.restaurant_opening_hours FOR UPDATE
  TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  )
  WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Members read own property package entitlements"
ON public.restaurant_package_entitlements
FOR SELECT
TO authenticated
USING (public.is_restaurant_member(restaurant_id));

CREATE POLICY "Owners and managers can read staff audit log"
ON public.restaurant_staff_audit_log
FOR SELECT
TO authenticated
USING (
  public.has_restaurant_role(restaurant_id, 'owner')
  OR public.has_restaurant_role(restaurant_id, 'manager')
);

CREATE POLICY "Restaurant members can view suppliers"
ON public.restaurant_suppliers FOR SELECT TO authenticated
USING (public.is_restaurant_member(restaurant_id));

create policy "Managers can manage their restaurant tables" on public.restaurant_tables
  for all to authenticated
  using (public.has_restaurant_role(restaurant_id,'owner') or public.has_restaurant_role(restaurant_id,'manager'))
  with check (public.has_restaurant_role(restaurant_id,'owner') or public.has_restaurant_role(restaurant_id,'manager'));

create policy "Members can view their restaurant tables" on public.restaurant_tables
  for select to authenticated using (public.is_restaurant_member(restaurant_id));

create policy "Members can view their restaurant team" on public.restaurant_users
  for select to authenticated using (user_id = auth.uid() or public.is_restaurant_member(restaurant_id));

CREATE POLICY "Platform admins can view all memberships" ON public.restaurant_users
  FOR SELECT TO authenticated USING (public.is_platform_admin());

create policy "Members can view their restaurant" on public.restaurants
  for select to authenticated using (public.is_restaurant_member(id));

create policy "Owners can update their restaurant" on public.restaurants
  for update to authenticated using (public.has_restaurant_role(id, 'owner'))
  with check (public.has_restaurant_role(id, 'owner'));

CREATE POLICY "Platform admins can view all restaurants" ON public.restaurants
  FOR SELECT TO authenticated USING (public.is_platform_admin());

create policy "Public can view approved active restaurants" on public.restaurants
  for select to anon, authenticated using (approved = true and active = true);

CREATE POLICY "Managers write amenities" ON public.room_amenities
  FOR ALL TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Members read amenities" ON public.room_amenities
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));

CREATE POLICY "Managers write room type amenities" ON public.room_type_amenities
  FOR ALL TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Members read room type amenities" ON public.room_type_amenities
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));

CREATE POLICY "Managers write room type images" ON public.room_type_images
  FOR ALL TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Members read room type images" ON public.room_type_images
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));

CREATE POLICY "Managers insert room types" ON public.room_types
  FOR INSERT TO authenticated WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Managers update room types" ON public.room_types
  FOR UPDATE TO authenticated USING (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  ) WITH CHECK (
    public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE POLICY "Members read room types" ON public.room_types
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));

CREATE POLICY "Owners and managers can view attendance"
ON public.staff_attendance FOR SELECT TO authenticated
USING (public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager'));

CREATE POLICY "Staff can view their own attendance"
ON public.staff_attendance FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.restaurant_users ru
  WHERE ru.id = staff_attendance.staff_membership_id
    AND ru.user_id = auth.uid()
    AND ru.active = true
));

CREATE POLICY "Owners and managers read module access"
ON public.staff_module_access
FOR SELECT
TO authenticated
USING (
  public.has_restaurant_role(restaurant_id, 'owner')
  OR public.has_restaurant_role(restaurant_id, 'manager')
);

CREATE POLICY "Staff read their own module access"
ON public.staff_module_access
FOR SELECT
TO authenticated
USING (
  membership_id IN (
    SELECT ru.id FROM public.restaurant_users ru
    WHERE ru.user_id = auth.uid() AND ru.restaurant_id = staff_module_access.restaurant_id AND ru.active
  )
);

CREATE POLICY "Owners and managers can view shifts"
ON public.staff_shifts FOR SELECT TO authenticated
USING (public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager'));

CREATE POLICY "Staff can view their own shifts"
ON public.staff_shifts FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.restaurant_users ru
  WHERE ru.id = staff_shifts.staff_membership_id
    AND ru.user_id = auth.uid()
    AND ru.active = true
));

CREATE POLICY "Owners and managers can view table assignments"
ON public.staff_table_assignments FOR SELECT TO authenticated
USING (public.has_restaurant_role(restaurant_id, 'owner') OR public.has_restaurant_role(restaurant_id, 'manager'));

CREATE POLICY "Staff can view their own table assignments"
ON public.staff_table_assignments FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.restaurant_users ru
  WHERE ru.id = staff_table_assignments.staff_membership_id
    AND ru.user_id = auth.uid()
    AND ru.active = true
));

CREATE POLICY "Managers can delete their menu images" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'menu-images' AND public.can_manage_restaurant_storage(name));

CREATE POLICY "Managers can read their menu images" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'menu-images' AND public.can_manage_restaurant_storage(name));

CREATE POLICY "Managers can update their menu images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'menu-images' AND public.can_manage_restaurant_storage(name))
  WITH CHECK (bucket_id = 'menu-images' AND public.can_manage_restaurant_storage(name));

CREATE POLICY "Managers can upload their menu images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'menu-images' AND public.can_manage_restaurant_storage(name));

CREATE POLICY "Managers delete their property images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'property-images' AND public.can_manage_restaurant_storage(name));

CREATE POLICY "Managers read their property images"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'property-images' AND public.can_manage_restaurant_storage(name));

CREATE POLICY "Managers update their property images"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'property-images' AND public.can_manage_restaurant_storage(name))
WITH CHECK (bucket_id = 'property-images' AND public.can_manage_restaurant_storage(name));

CREATE POLICY "Managers upload their property images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'property-images' AND public.can_manage_restaurant_storage(name));


-- 11. GRANT / REVOKE (historical privilege statements, last state wins)

GRANT SELECT ON public.menu_items TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_items TO authenticated;

GRANT ALL ON public.menu_items TO service_role;

-- Guest checkout/tracking is service-role. Kitchen + signed-in customers use
-- the authenticated role (SELECT; kitchen UPDATE via user-JWT server fn).
GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;

GRANT ALL ON public.orders TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.order_items TO authenticated;

GRANT ALL ON public.order_items TO service_role;

REVOKE ALL ON public.orders FROM anon;

REVOKE ALL ON public.order_items FROM anon;

grant select, insert, update on public.profiles to authenticated;

grant all on public.profiles to service_role;

grant select on public.restaurants to anon;

grant select, update on public.restaurants to authenticated;

grant all on public.restaurants to service_role;

grant select on public.restaurant_users to authenticated;

grant all on public.restaurant_users to service_role;

grant select on public.restaurant_tables to authenticated;

grant all on public.restaurant_tables to service_role;

grant select on public.menu_categories to anon, authenticated;

grant insert, update, delete on public.menu_categories to authenticated;

grant all on public.menu_categories to service_role;

grant insert, update, delete on public.menu_items to authenticated;

grant all on public.menu_items to service_role;

grant select on public.order_status_history to authenticated;

grant all on public.order_status_history to service_role;

GRANT SELECT ON public.admin_audit_log TO authenticated;

GRANT ALL ON public.admin_audit_log TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_tables TO authenticated;

GRANT ALL ON public.restaurant_tables TO service_role;

REVOKE SELECT ON public.restaurants FROM anon, authenticated;

GRANT SELECT (
  id, name, slug, address, city, postcode, country, logo_url,
  approved, active, approved_at, approved_by, rejection_reason,
  suspension_reason, status_updated_at, created_at, updated_at
) ON public.restaurants TO anon, authenticated;

GRANT UPDATE ON public.restaurants TO authenticated;

GRANT ALL ON public.restaurants TO service_role;

REVOKE ALL ON FUNCTION public.enforce_profile_account_type() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.enforce_restaurant_protected_fields() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.log_order_status() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.is_restaurant_member(uuid) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.has_restaurant_role(uuid, text) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.has_kitchen_access(uuid) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.can_manage_restaurant_storage(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

GRANT EXECUTE ON FUNCTION public.is_restaurant_member(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.has_restaurant_role(uuid, text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.has_kitchen_access(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.can_manage_restaurant_storage(text) TO authenticated;

REVOKE SELECT (guest_token_hash) ON public.orders FROM anon, authenticated;

REVOKE UPDATE (guest_token_hash) ON public.orders FROM anon, authenticated;

GRANT SELECT ON public.restaurant_staff_audit_log TO authenticated;

GRANT ALL ON public.restaurant_staff_audit_log TO service_role;

GRANT SELECT ON public.staff_shifts TO authenticated;

GRANT ALL ON public.staff_shifts TO service_role;

GRANT SELECT ON public.staff_attendance TO authenticated;

GRANT ALL ON public.staff_attendance TO service_role;

GRANT SELECT ON public.staff_table_assignments TO authenticated;

GRANT ALL ON public.staff_table_assignments TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_opening_hours TO authenticated;

GRANT SELECT ON public.restaurant_opening_hours TO anon;

GRANT ALL ON public.restaurant_opening_hours TO service_role;

GRANT SELECT (timezone, currency_code) ON public.restaurants TO anon, authenticated;

GRANT SELECT ON public.inventory_units TO authenticated;

GRANT ALL ON public.inventory_units TO service_role;

GRANT SELECT ON public.inventory_items TO authenticated;

GRANT ALL ON public.inventory_items TO service_role;

GRANT SELECT ON public.inventory_stock_movements TO authenticated;

GRANT ALL ON public.inventory_stock_movements TO service_role;

REVOKE EXECUTE ON FUNCTION public.apply_inventory_movement(uuid,uuid,text,numeric,numeric,text,uuid,boolean) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.apply_inventory_movement(uuid,uuid,text,numeric,numeric,text,uuid,boolean) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.apply_inventory_movement(uuid,uuid,text,numeric,numeric,text,uuid,boolean) TO service_role;

GRANT SELECT ON public.restaurant_assets TO authenticated;

GRANT ALL ON public.restaurant_assets TO service_role;

GRANT SELECT ON public.restaurant_asset_history TO authenticated;

GRANT ALL ON public.restaurant_asset_history TO service_role;

GRANT SELECT ON public.restaurant_suppliers TO authenticated;

GRANT ALL ON public.restaurant_suppliers TO service_role;

GRANT SELECT ON public.purchase_orders TO authenticated;

GRANT ALL ON public.purchase_orders TO service_role;

GRANT SELECT ON public.purchase_order_items TO authenticated;

GRANT ALL ON public.purchase_order_items TO service_role;

GRANT SELECT ON public.purchase_order_history TO authenticated;

GRANT ALL ON public.purchase_order_history TO service_role;

REVOKE EXECUTE ON FUNCTION public.receive_purchase_order_goods(uuid,uuid,jsonb,uuid,text) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.receive_purchase_order_goods(uuid,uuid,jsonb,uuid,text) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.receive_purchase_order_goods(uuid,uuid,jsonb,uuid,text) TO service_role;

GRANT SELECT ON public.menu_item_recipe_components TO authenticated;

GRANT ALL ON public.menu_item_recipe_components TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_types TO authenticated;

GRANT ALL ON public.room_types TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hotel_rooms TO authenticated;

GRANT ALL ON public.hotel_rooms TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_amenities TO authenticated;

GRANT ALL ON public.room_amenities TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_type_amenities TO authenticated;

GRANT ALL ON public.room_type_amenities TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_type_images TO authenticated;

GRANT ALL ON public.room_type_images TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.guest_profiles TO authenticated;

GRANT ALL ON public.guest_profiles TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.guest_preferences TO authenticated;

GRANT ALL ON public.guest_preferences TO service_role;

GRANT SELECT ON public.guest_profile_history TO authenticated;

GRANT ALL ON public.guest_profile_history TO service_role;

GRANT SELECT ON public.hotel_reservation_counters TO authenticated;

GRANT ALL ON public.hotel_reservation_counters TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.hotel_reservations TO authenticated;

GRANT ALL ON public.hotel_reservations TO service_role;

GRANT SELECT ON public.hotel_reservation_history TO authenticated;

GRANT ALL ON public.hotel_reservation_history TO service_role;

REVOKE ALL ON FUNCTION public.count_sellable_rooms(uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.count_reserved_rooms(uuid, uuid, date, date, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.count_sellable_rooms(uuid, uuid) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.count_reserved_rooms(uuid, uuid, date, date, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.assert_reservation_capacity(uuid, uuid, uuid, date, date, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.create_hotel_reservation(uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.amend_hotel_reservation(uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.assert_reservation_capacity(uuid, uuid, uuid, date, date, uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.create_hotel_reservation(uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.amend_hotel_reservation(uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.assert_room_assignable(uuid, uuid, uuid, date, date, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.check_in_hotel_reservation(uuid, uuid, uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.check_out_hotel_reservation(uuid, uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.move_hotel_reservation_room(uuid, uuid, uuid, text, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.change_hotel_stay_dates(uuid, uuid, date, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.mark_hotel_reservation_no_show(uuid, uuid, date, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.assert_room_assignable(uuid, uuid, uuid, date, date, uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.check_in_hotel_reservation(uuid, uuid, uuid, uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.check_out_hotel_reservation(uuid, uuid, uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.move_hotel_reservation_room(uuid, uuid, uuid, text, uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.change_hotel_stay_dates(uuid, uuid, date, uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.mark_hotel_reservation_no_show(uuid, uuid, date, uuid) TO service_role;

GRANT SELECT ON public.housekeeping_history TO authenticated;

GRANT ALL ON public.housekeeping_history TO service_role;

GRANT SELECT ON public.housekeeping_tasks TO authenticated;

GRANT ALL ON public.housekeeping_tasks TO service_role;

GRANT SELECT ON public.housekeeping_inspections TO authenticated;

GRANT ALL ON public.housekeeping_inspections TO service_role;

GRANT SELECT ON public.housekeeping_discrepancies TO authenticated;

GRANT ALL ON public.housekeeping_discrepancies TO service_role;

GRANT SELECT ON public.housekeeping_maintenance_requests TO authenticated;

GRANT ALL ON public.housekeeping_maintenance_requests TO service_role;

REVOKE ALL ON FUNCTION public.housekeeping_create_task(uuid, uuid, text, text, text, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.housekeeping_complete_task(uuid, uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.housekeeping_inspect_room(uuid, uuid, uuid, text, text, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.housekeeping_set_room_restriction(uuid, uuid, text, text, date, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.check_out_hotel_reservation(uuid, uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.housekeeping_create_task(uuid, uuid, text, text, text, uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.housekeeping_complete_task(uuid, uuid, uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.housekeeping_inspect_room(uuid, uuid, uuid, text, text, uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.housekeeping_set_room_restriction(uuid, uuid, text, text, date, uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.check_out_hotel_reservation(uuid, uuid, uuid) TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.hotel_rate_categories TO authenticated;

GRANT ALL ON public.hotel_rate_categories TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.hotel_rate_plans TO authenticated;

GRANT ALL ON public.hotel_rate_plans TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hotel_rate_calendar TO authenticated;

GRANT ALL ON public.hotel_rate_calendar TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hotel_rate_restrictions TO authenticated;

GRANT ALL ON public.hotel_rate_restrictions TO service_role;

REVOKE ALL ON FUNCTION public.price_hotel_stay(uuid, uuid, uuid, date, date) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.create_hotel_reservation_priced(uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.amend_hotel_reservation_priced(uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.reprice_hotel_reservation(uuid, uuid, uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.price_hotel_stay(uuid, uuid, uuid, date, date) TO service_role;

GRANT EXECUTE ON FUNCTION public.create_hotel_reservation_priced(uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, text, uuid, uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.amend_hotel_reservation_priced(uuid, uuid, uuid, uuid, date, date, integer, integer, text, text, uuid, uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.reprice_hotel_reservation(uuid, uuid, uuid, uuid) TO service_role;

GRANT SELECT ON public.guest_folio_counters TO authenticated;

GRANT ALL ON public.guest_folio_counters TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.guest_folios TO authenticated;

GRANT ALL ON public.guest_folios TO service_role;

GRANT SELECT, INSERT ON public.folio_transactions TO authenticated;

GRANT ALL ON public.folio_transactions TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.cashier_shifts TO authenticated;

GRANT ALL ON public.cashier_shifts TO service_role;

GRANT SELECT ON public.folio_history TO authenticated;

GRANT ALL ON public.folio_history TO service_role;

GRANT SELECT ON public.night_audit_runs TO authenticated;

GRANT ALL ON public.night_audit_runs TO service_role;

GRANT SELECT ON public.night_audit_exceptions TO authenticated;

GRANT ALL ON public.night_audit_exceptions TO service_role;

REVOKE ALL ON FUNCTION public.close_business_date(uuid, uuid, jsonb, uuid) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.close_business_date(uuid, uuid, jsonb, uuid) TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.distribution_channels TO authenticated;

GRANT ALL ON public.distribution_channels TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.distribution_room_mappings TO authenticated;

GRANT ALL ON public.distribution_room_mappings TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.distribution_rate_mappings TO authenticated;

GRANT ALL ON public.distribution_rate_mappings TO service_role;

GRANT SELECT ON public.distribution_logs TO authenticated;

GRANT ALL ON public.distribution_logs TO service_role;

REVOKE ALL ON FUNCTION public.create_direct_booking(uuid, uuid, uuid, date, date, integer, integer, text, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_direct_booking(uuid, uuid, uuid, date, date, integer, integer, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.post_order_room_charge(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.post_order_room_charge(uuid, uuid, uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.reverse_order_room_charge(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reverse_order_room_charge(uuid, uuid, text, uuid) TO service_role;

GRANT SELECT ON public.staff_module_access TO authenticated;

GRANT ALL ON public.staff_module_access TO service_role;

GRANT EXECUTE ON FUNCTION public.has_any_restaurant_role(uuid, text[]) TO authenticated;

GRANT SELECT, INSERT ON public.order_payments TO authenticated;

GRANT ALL ON public.order_payments TO service_role;

REVOKE ALL ON FUNCTION public.record_pos_order_payment(uuid, uuid, uuid, text, numeric, numeric, text, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.record_pos_order_payment(uuid, uuid, uuid, text, numeric, numeric, text, uuid) TO service_role;

DO $$
DECLARE
  fn record;
  keep_authenticated text[] := ARRAY[
    'has_restaurant_role','has_any_restaurant_role','has_kitchen_access',
    'is_restaurant_member','is_platform_admin',
    'can_manage_restaurant_storage','count_sellable_rooms','count_reserved_rooms',
    'folio_balance'
  ];
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated;', fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role;', fn.sig);
    IF fn.proname = ANY (keep_authenticated) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated;', fn.sig);
    END IF;
  END LOOP;
END $$;

GRANT SELECT ON public.restaurant_package_entitlements TO authenticated;

GRANT ALL ON public.restaurant_package_entitlements TO service_role;

REVOKE ALL ON public.restaurant_package_entitlements FROM anon;

REVOKE ALL ON public.restaurant_package_entitlements FROM authenticated;

GRANT SELECT ON public.restaurant_package_entitlements TO authenticated;

GRANT ALL ON public.restaurant_package_entitlements TO service_role;

GRANT SELECT ON public.pos_settings TO authenticated;

GRANT ALL ON public.pos_settings TO service_role;

GRANT SELECT ON public.pos_registers TO authenticated;

GRANT ALL ON public.pos_registers TO service_role;

GRANT SELECT ON public.pos_categories TO authenticated;

GRANT ALL ON public.pos_categories TO service_role;

GRANT SELECT ON public.pos_products TO authenticated;

GRANT ALL ON public.pos_products TO service_role;

GRANT SELECT ON public.pos_cashier_shifts TO authenticated;

GRANT ALL ON public.pos_cashier_shifts TO service_role;

GRANT SELECT ON public.pos_sale_counters TO authenticated;

GRANT ALL ON public.pos_sale_counters TO service_role;

GRANT SELECT ON public.pos_sales TO authenticated;

GRANT ALL ON public.pos_sales TO service_role;

GRANT SELECT ON public.pos_sale_items TO authenticated;

GRANT ALL ON public.pos_sale_items TO service_role;

GRANT SELECT ON public.pos_payments TO authenticated;

GRANT ALL ON public.pos_payments TO service_role;

GRANT SELECT ON public.pos_refunds TO authenticated;

GRANT ALL ON public.pos_refunds TO service_role;

REVOKE ALL ON FUNCTION public.pos_complete_sale(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.pos_complete_sale(uuid, uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.pos_protect_completed_sale() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.pos_protect_completed_sale_items() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.pos_complete_sale(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.pos_complete_sale(uuid, uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.pos_refund_sale_allocated(uuid, uuid, uuid, numeric, text, uuid, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.pos_refund_sale_allocated(uuid, uuid, uuid, numeric, text, uuid, uuid) TO service_role;


-- 12. Realtime publication (application-required tables only)

ALTER TABLE public.orders REPLICA IDENTITY FULL;

ALTER TABLE public.order_items REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;

ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;


-- 13. Storage buckets (private catalog rows, not tenant data)

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('menu-images', 'menu-images', false),
  ('property-images', 'property-images', false)
ON CONFLICT (id) DO NOTHING;


-- 14. Storage object RLS policies are included in section 10 (storage.objects).
