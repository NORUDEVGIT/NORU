-- PMS Room & Inventory — operational foundation.
--
-- Proposed byte-identical migration:
--   drizzle/migrations/0095_pms_room_inventory_operational_foundation.sql
--   supabase/migrations/0095_pms_room_inventory_operational_foundation.sql
--
-- PROPOSAL ONLY. DO NOT APPLY FROM AN AGENT.
-- Does not regenerate types.ts. Does not enable overbooking.
-- Housekeeping readiness is not part of type-level availability.
-- OOO/OOS is point-in-time; dated blocks own future inventory restrictions.

-- ---------------------------------------------------------------------------
-- 0. Migration preflight and dedicated NOLOGIN capability role

DO $$
DECLARE
  migration_role_can_create_roles boolean;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '0095_MIGRATION_MUST_RUN_AS_POSTGRES';
  END IF;

  SELECT role_row.rolcreaterole
  INTO migration_role_can_create_roles
  FROM pg_roles role_row
  WHERE role_row.rolname = current_user;

  IF migration_role_can_create_roles IS NOT TRUE THEN
    RAISE EXCEPTION '0095_MIGRATION_ROLE_REQUIRES_CREATEROLE';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_roles role_row
    WHERE role_row.rolname = 'pms_room_operational_writer'
  ) THEN
    CREATE ROLE pms_room_operational_writer
      NOLOGIN
      NOINHERIT
      NOCREATEDB
      NOCREATEROLE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_roles role_row
    WHERE role_row.rolname = 'pms_room_operational_writer'
      AND (
        role_row.rolsuper
        OR role_row.rolreplication
        OR role_row.rolbypassrls
      )
  ) THEN
    RAISE EXCEPTION '0095_WRITER_ROLE_HAS_UNSAFE_ATTRIBUTES';
  END IF;
END;
$$;

ALTER ROLE pms_room_operational_writer
  NOLOGIN
  NOINHERIT
  NOCREATEDB
  NOCREATEROLE;

REVOKE pms_room_operational_writer
  FROM anon, authenticated, service_role, authenticator;
GRANT pms_room_operational_writer TO postgres;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_auth_members membership
    JOIN pg_roles granted_role
      ON granted_role.oid = membership.roleid
    JOIN pg_roles member_role
      ON member_role.oid = membership.member
    WHERE granted_role.rolname = 'pms_room_operational_writer'
      AND member_role.rolname <> 'postgres'
  ) THEN
    RAISE EXCEPTION '0095_WRITER_ROLE_HAS_UNEXPECTED_MEMBER';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. Tenant-safe supporting constraints and hotel_rooms metadata

ALTER TABLE public.housekeeping_maintenance_requests
  ADD CONSTRAINT housekeeping_maintenance_requests_id_restaurant_unique
  UNIQUE (id, restaurant_id);

ALTER TABLE public.hotel_rooms
  ADD COLUMN restriction_maintenance_request_id uuid,
  ADD COLUMN restriction_placed_at timestamptz,
  ADD COLUMN restriction_placed_by_membership_id uuid,
  ADD COLUMN restriction_approved_by_membership_id uuid,
  ADD CONSTRAINT hotel_rooms_restriction_maintenance_request_fk
    FOREIGN KEY (restriction_maintenance_request_id, restaurant_id)
    REFERENCES public.housekeeping_maintenance_requests(id, restaurant_id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT hotel_rooms_restriction_placed_by_fk
    FOREIGN KEY (restriction_placed_by_membership_id, restaurant_id)
    REFERENCES public.restaurant_users(id, restaurant_id),
  ADD CONSTRAINT hotel_rooms_restriction_approved_by_fk
    FOREIGN KEY (restriction_approved_by_membership_id, restaurant_id)
    REFERENCES public.restaurant_users(id, restaurant_id);

COMMENT ON COLUMN public.hotel_rooms.restriction_maintenance_request_id IS
  'Optional maintenance request required by current OOO policy.';
COMMENT ON COLUMN public.hotel_rooms.restriction_placed_by_membership_id IS
  'Actor that placed the current point-in-time OOO/OOS restriction.';
COMMENT ON COLUMN public.hotel_rooms.restriction_approved_by_membership_id IS
  'Validated approver when current policy required approval; otherwise NULL.';

-- ---------------------------------------------------------------------------
-- 2. Dated operational blocks

CREATE TABLE public.pms_operational_inventory_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  target_kind text NOT NULL,
  room_id uuid,
  room_type_id uuid NOT NULL,
  quantity integer,
  group_id uuid,
  block_type text NOT NULL,
  inventory_impact text NOT NULL,
  approval_required boolean NOT NULL,
  status text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text NOT NULL,
  notes text,
  release_reason text,
  created_by_membership_id uuid NOT NULL,
  approved_by_membership_id uuid,
  activated_by_membership_id uuid,
  released_by_membership_id uuid,
  cancelled_by_membership_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  activated_at timestamptz,
  released_at timestamptz,
  cancelled_at timestamptz,
  CONSTRAINT pms_operational_inventory_blocks_id_restaurant_unique
    UNIQUE (id, restaurant_id),
  CONSTRAINT pms_operational_inventory_blocks_target_kind_check
    CHECK (target_kind IN ('room', 'room_type', 'quantity')),
  CONSTRAINT pms_operational_inventory_blocks_target_shape_check CHECK (
    (
      target_kind = 'room'
      AND room_id IS NOT NULL
      AND quantity IS NULL
    )
    OR (
      target_kind = 'room_type'
      AND room_id IS NULL
      AND quantity IS NULL
    )
    OR (
      target_kind = 'quantity'
      AND room_id IS NULL
      AND quantity >= 1
    )
  ),
  CONSTRAINT pms_operational_inventory_blocks_quantity_impact_check CHECK (
    target_kind <> 'quantity' OR inventory_impact <> 'assignment_only'
  ),
  CONSTRAINT pms_operational_inventory_blocks_block_type_check CHECK (
    block_type IN (
      'temporary', 'permanent', 'maintenance', 'vip', 'group',
      'owner', 'internal_use', 'inspection', 'renovation'
    )
  ),
  CONSTRAINT pms_operational_inventory_blocks_inventory_impact_check CHECK (
    inventory_impact IN (
      'remove_from_inventory',
      'assignment_only',
      'warning_only',
      'no_inventory_impact'
    )
  ),
  CONSTRAINT pms_operational_inventory_blocks_status_check CHECK (
    status IN ('draft', 'pending_approval', 'active', 'released', 'cancelled')
  ),
  CONSTRAINT pms_operational_inventory_blocks_pending_approval_check CHECK (
    status <> 'pending_approval' OR approval_required
  ),
  CONSTRAINT pms_operational_inventory_blocks_approval_shape_check CHECK (
    (
      approval_required
      AND (
        status NOT IN ('active', 'released')
        OR (
          approved_at IS NOT NULL
          AND approved_by_membership_id IS NOT NULL
        )
      )
    )
    OR
    (
      NOT approval_required
      AND approved_at IS NULL
      AND approved_by_membership_id IS NULL
    )
  ),
  CONSTRAINT pms_operational_inventory_blocks_dates_check
    CHECK (end_date > start_date),
  CONSTRAINT pms_operational_inventory_blocks_reason_check
    CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
  CONSTRAINT pms_operational_inventory_blocks_release_shape_check CHECK (
    (status = 'released'
      AND released_at IS NOT NULL
      AND released_by_membership_id IS NOT NULL)
    OR
    (status <> 'released'
      AND released_at IS NULL
      AND released_by_membership_id IS NULL
      AND release_reason IS NULL)
  ),
  CONSTRAINT pms_operational_inventory_blocks_cancel_shape_check CHECK (
    (status = 'cancelled'
      AND cancelled_at IS NOT NULL
      AND cancelled_by_membership_id IS NOT NULL)
    OR
    (status <> 'cancelled'
      AND cancelled_at IS NULL
      AND cancelled_by_membership_id IS NULL)
  ),
  CONSTRAINT pms_operational_inventory_blocks_activation_shape_check CHECK (
    (
      status IN ('active', 'released')
      AND activated_at IS NOT NULL
      AND activated_by_membership_id IS NOT NULL
    )
    OR
    (
      status NOT IN ('active', 'released')
      AND activated_at IS NULL
      AND activated_by_membership_id IS NULL
    )
  ),
  CONSTRAINT pms_operational_inventory_blocks_room_fk
    FOREIGN KEY (room_id, restaurant_id)
    REFERENCES public.hotel_rooms(id, restaurant_id),
  CONSTRAINT pms_operational_inventory_blocks_type_fk
    FOREIGN KEY (room_type_id, restaurant_id)
    REFERENCES public.room_types(id, restaurant_id),
  CONSTRAINT pms_operational_inventory_blocks_created_by_fk
    FOREIGN KEY (created_by_membership_id, restaurant_id)
    REFERENCES public.restaurant_users(id, restaurant_id),
  CONSTRAINT pms_operational_inventory_blocks_approved_by_fk
    FOREIGN KEY (approved_by_membership_id, restaurant_id)
    REFERENCES public.restaurant_users(id, restaurant_id),
  CONSTRAINT pms_operational_inventory_blocks_activated_by_fk
    FOREIGN KEY (activated_by_membership_id, restaurant_id)
    REFERENCES public.restaurant_users(id, restaurant_id),
  CONSTRAINT pms_operational_inventory_blocks_released_by_fk
    FOREIGN KEY (released_by_membership_id, restaurant_id)
    REFERENCES public.restaurant_users(id, restaurant_id),
  CONSTRAINT pms_operational_inventory_blocks_cancelled_by_fk
    FOREIGN KEY (cancelled_by_membership_id, restaurant_id)
    REFERENCES public.restaurant_users(id, restaurant_id)
);

CREATE INDEX pms_operational_inventory_blocks_type_dates_idx
  ON public.pms_operational_inventory_blocks
  (restaurant_id, room_type_id, status, start_date, end_date);
CREATE INDEX pms_operational_inventory_blocks_room_dates_idx
  ON public.pms_operational_inventory_blocks
  (restaurant_id, room_id, status, start_date, end_date)
  WHERE room_id IS NOT NULL;
CREATE INDEX pms_operational_inventory_blocks_group_idx
  ON public.pms_operational_inventory_blocks (restaurant_id, group_id)
  WHERE group_id IS NOT NULL;

GRANT SELECT ON public.pms_operational_inventory_blocks
  TO authenticated, service_role;
ALTER TABLE public.pms_operational_inventory_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read operational inventory blocks"
  ON public.pms_operational_inventory_blocks
  FOR SELECT TO authenticated
  USING (public.is_restaurant_member(restaurant_id));

CREATE TRIGGER set_pms_operational_inventory_blocks_updated_at
  BEFORE UPDATE ON public.pms_operational_inventory_blocks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.pms_operational_inventory_blocks IS
  'Dated operational blocks. start_date inclusive, end_date exclusive. Card 2 block-type policy is write-authority.';

-- ---------------------------------------------------------------------------
-- 3. Room & Inventory events

CREATE TABLE public.pms_room_inventory_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  room_id uuid,
  block_id uuid,
  actor_membership_id uuid NOT NULL,
  previous_values jsonb,
  new_values jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_room_inventory_events_type_check CHECK (
    event_type IN (
      'room_ooo', 'room_oos', 'room_released',
      'block_created', 'block_approved', 'block_activated',
      'block_released', 'block_cancelled',
      'sellability_override', 'bulk_operational_action'
    )
  ),
  CONSTRAINT pms_room_inventory_events_room_fk
    FOREIGN KEY (room_id, restaurant_id)
    REFERENCES public.hotel_rooms(id, restaurant_id),
  CONSTRAINT pms_room_inventory_events_block_fk
    FOREIGN KEY (block_id, restaurant_id)
    REFERENCES public.pms_operational_inventory_blocks(id, restaurant_id),
  CONSTRAINT pms_room_inventory_events_actor_fk
    FOREIGN KEY (actor_membership_id, restaurant_id)
    REFERENCES public.restaurant_users(id, restaurant_id)
);

CREATE INDEX pms_room_inventory_events_restaurant_created_idx
  ON public.pms_room_inventory_events (restaurant_id, created_at DESC);
CREATE INDEX pms_room_inventory_events_room_idx
  ON public.pms_room_inventory_events (restaurant_id, room_id, created_at DESC)
  WHERE room_id IS NOT NULL;
CREATE INDEX pms_room_inventory_events_block_idx
  ON public.pms_room_inventory_events (restaurant_id, block_id, created_at DESC)
  WHERE block_id IS NOT NULL;

GRANT SELECT ON public.pms_room_inventory_events
  TO authenticated, service_role;
ALTER TABLE public.pms_room_inventory_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read room inventory events"
  ON public.pms_room_inventory_events
  FOR SELECT TO authenticated
  USING (public.is_restaurant_member(restaurant_id));

-- ---------------------------------------------------------------------------
-- 4. Dedicated role minimum privileges and RLS

GRANT USAGE ON SCHEMA public TO pms_room_operational_writer;

GRANT SELECT ON public.hotel_rooms
  TO pms_room_operational_writer;
GRANT UPDATE (
  status,
  restriction_reason,
  restriction_expected_return,
  restriction_maintenance_request_id,
  restriction_placed_at,
  restriction_placed_by_membership_id,
  restriction_approved_by_membership_id,
  updated_at
) ON public.hotel_rooms TO pms_room_operational_writer;

GRANT SELECT ON public.restaurant_users
  TO pms_room_operational_writer;
GRANT SELECT ON public.pms_maintenance_rules
  TO pms_room_operational_writer;
GRANT SELECT ON public.restaurants
  TO pms_room_operational_writer;
GRANT SELECT ON public.housekeeping_maintenance_requests
  TO pms_room_operational_writer;
GRANT SELECT ON public.housekeeping_inspections
  TO pms_room_operational_writer;

GRANT INSERT (
  restaurant_id,
  event_type,
  room_id,
  block_id,
  actor_membership_id,
  previous_values,
  new_values,
  notes
) ON public.pms_room_inventory_events
  TO pms_room_operational_writer;

GRANT INSERT (
  restaurant_id,
  room_id,
  event_type,
  previous_values,
  new_values,
  notes,
  actor_membership_id
) ON public.housekeeping_history
  TO pms_room_operational_writer;

CREATE POLICY "Operational writer reads hotel rooms"
  ON public.hotel_rooms
  FOR SELECT TO pms_room_operational_writer
  USING (true);
CREATE POLICY "Operational writer updates hotel rooms"
  ON public.hotel_rooms
  FOR UPDATE TO pms_room_operational_writer
  USING (true)
  WITH CHECK (true);
CREATE POLICY "Operational writer reads memberships"
  ON public.restaurant_users
  FOR SELECT TO pms_room_operational_writer
  USING (true);
CREATE POLICY "Operational writer reads maintenance rules"
  ON public.pms_maintenance_rules
  FOR SELECT TO pms_room_operational_writer
  USING (true);
CREATE POLICY "Operational writer reads properties"
  ON public.restaurants
  FOR SELECT TO pms_room_operational_writer
  USING (true);
CREATE POLICY "Operational writer reads maintenance requests"
  ON public.housekeeping_maintenance_requests
  FOR SELECT TO pms_room_operational_writer
  USING (true);
CREATE POLICY "Operational writer reads inspections"
  ON public.housekeeping_inspections
  FOR SELECT TO pms_room_operational_writer
  USING (true);
CREATE POLICY "Operational writer inserts room inventory events"
  ON public.pms_room_inventory_events
  FOR INSERT TO pms_room_operational_writer
  WITH CHECK (true);
CREATE POLICY "Operational writer inserts housekeeping history"
  ON public.housekeeping_history
  FOR INSERT TO pms_room_operational_writer
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 5. Exclusive operational status-write guard

CREATE OR REPLACE FUNCTION public.pms_hotel_rooms_operational_status_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'available'
       OR NEW.restriction_reason IS NOT NULL
       OR NEW.restriction_expected_return IS NOT NULL
       OR NEW.restriction_maintenance_request_id IS NOT NULL
       OR NEW.restriction_placed_at IS NOT NULL
       OR NEW.restriction_placed_by_membership_id IS NOT NULL
       OR NEW.restriction_approved_by_membership_id IS NOT NULL THEN
      RAISE EXCEPTION 'OPERATIONAL_STATUS_READONLY';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.restriction_reason IS DISTINCT FROM OLD.restriction_reason
     OR NEW.restriction_expected_return IS DISTINCT FROM OLD.restriction_expected_return
     OR NEW.restriction_maintenance_request_id IS DISTINCT FROM OLD.restriction_maintenance_request_id
     OR NEW.restriction_placed_at IS DISTINCT FROM OLD.restriction_placed_at
     OR NEW.restriction_placed_by_membership_id IS DISTINCT FROM OLD.restriction_placed_by_membership_id
     OR NEW.restriction_approved_by_membership_id IS DISTINCT FROM OLD.restriction_approved_by_membership_id THEN
    IF current_user <> 'pms_room_operational_writer' THEN
      RAISE EXCEPTION 'OPERATIONAL_STATUS_READONLY';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.pms_hotel_rooms_operational_status_guard()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER pms_hotel_rooms_operational_status_guard
  BEFORE INSERT OR UPDATE ON public.hotel_rooms
  FOR EACH ROW
  EXECUTE FUNCTION public.pms_hotel_rooms_operational_status_guard();

-- ---------------------------------------------------------------------------
-- 6. Event helper: internal only, SECURITY INVOKER

CREATE OR REPLACE FUNCTION public.pms_write_room_inventory_event(
  _restaurant_id uuid,
  _event_type text,
  _room_id uuid,
  _block_id uuid,
  _actor_membership_id uuid,
  _previous_values jsonb,
  _new_values jsonb,
  _notes text
)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  INSERT INTO public.pms_room_inventory_events (
    restaurant_id,
    event_type,
    room_id,
    block_id,
    actor_membership_id,
    previous_values,
    new_values,
    notes
  )
  VALUES (
    _restaurant_id,
    _event_type,
    _room_id,
    _block_id,
    _actor_membership_id,
    _previous_values,
    _new_values,
    _notes
  );
$$;

REVOKE ALL ON FUNCTION public.pms_write_room_inventory_event(
  uuid, text, uuid, uuid, uuid, jsonb, jsonb, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pms_write_room_inventory_event(
  uuid, text, uuid, uuid, uuid, jsonb, jsonb, text
) TO postgres, pms_room_operational_writer;

-- ---------------------------------------------------------------------------
-- 7. Availability read engine

CREATE OR REPLACE FUNCTION public.count_sellable_rooms(
  _restaurant_id uuid,
  _room_type_id uuid
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result_count integer;
BEGIN
  SELECT count(*)::integer
  INTO result_count
  FROM public.hotel_rooms room
  JOIN public.room_types room_type
    ON room_type.id = room.room_type_id
   AND room_type.restaurant_id = room.restaurant_id
  WHERE room.restaurant_id = _restaurant_id
    AND room.room_type_id = _room_type_id
    AND room.active
    AND room_type.active
    AND room_type.sellable
    AND room.status = 'available';

  RETURN COALESCE(result_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.count_sellable_rooms(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.count_sellable_rooms(uuid, uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pms_room_type_availability(
  _restaurant_id uuid,
  _room_type_id uuid,
  _arrival date,
  _departure date,
  _exclude_reservation_id uuid DEFAULT NULL
)
RETURNS TABLE (
  room_type_id uuid,
  arrival date,
  departure date,
  business_date date,
  physical_capacity integer,
  available integer,
  limiting_date date,
  overbooking_allowance integer,
  nightly jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  property_business_date date;
  capacity_count integer;
  available_count integer;
  limiting_night date;
  nightly_rows jsonb;
BEGIN
  IF _departure <= _arrival THEN
    RAISE EXCEPTION 'INVALID_DATES';
  END IF;

  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT public.is_restaurant_member(_restaurant_id) THEN
    RAISE EXCEPTION 'INSUFFICIENT_PRIVILEGE';
  END IF;

  SELECT COALESCE(
    property.business_date,
    (now() AT TIME ZONE COALESCE(property.timezone, 'Europe/London'))::date
  )
  INTO property_business_date
  FROM public.restaurants property
  WHERE property.id = _restaurant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROPERTY_NOT_FOUND';
  END IF;

  WITH policy AS (
    SELECT
      COALESCE((
        SELECT rules.sellable_status_required
        FROM public.pms_inventory_rules rules
        WHERE rules.restaurant_id = _restaurant_id
      ), true) AS sellable_required,
      COALESCE((
        SELECT rules.maintenance_affects_availability
        FROM public.pms_inventory_rules rules
        WHERE rules.restaurant_id = _restaurant_id
      ), false) AS maintenance_affects
  ),
  pool AS (
    SELECT room.id, room.status
    FROM public.hotel_rooms room
    JOIN public.room_types room_type
      ON room_type.id = room.room_type_id
     AND room_type.restaurant_id = room.restaurant_id
    CROSS JOIN policy
    WHERE room.restaurant_id = _restaurant_id
      AND room.room_type_id = _room_type_id
      AND room.active
      AND room_type.active
      AND room_type.sellable
      AND (NOT policy.sellable_required OR room.sellable)
      AND (
        NOT policy.maintenance_affects
        OR room.maintenance_status = 'normal'
      )
  ),
  nights AS (
    SELECT day_value::date AS night
    FROM generate_series(
      _arrival::timestamp,
      (_departure - 1)::timestamp,
      interval '1 day'
    ) AS day_value
  ),
  claims AS (
    SELECT
      nights.night,
      (SELECT count(*)::integer FROM pool) AS capacity,
      (
        SELECT count(*)::integer
        FROM pool
        WHERE (
          nights.night = property_business_date
          AND pool.status IN ('out_of_order', 'out_of_service')
        )
        OR EXISTS (
          SELECT 1
          FROM public.pms_operational_inventory_blocks block
          WHERE block.restaurant_id = _restaurant_id
            AND block.room_type_id = _room_type_id
            AND block.room_id = pool.id
            AND block.target_kind = 'room'
            AND block.status = 'active'
            AND block.inventory_impact = 'remove_from_inventory'
            AND block.start_date <= nights.night
            AND block.end_date > nights.night
        )
        OR EXISTS (
          SELECT 1
          FROM public.hotel_reservations reservation
          WHERE reservation.restaurant_id = _restaurant_id
            AND reservation.room_type_id = _room_type_id
            AND reservation.room_id = pool.id
            AND reservation.status IN ('pending', 'confirmed', 'checked_in')
            AND (
              _exclude_reservation_id IS NULL
              OR reservation.id <> _exclude_reservation_id
            )
            AND reservation.arrival_date <= nights.night
            AND reservation.departure_date > nights.night
        )
      ) AS pinned_room_claims,
      EXISTS (
        SELECT 1
        FROM public.pms_operational_inventory_blocks block
        WHERE block.restaurant_id = _restaurant_id
          AND block.room_type_id = _room_type_id
          AND block.target_kind = 'room_type'
          AND block.status = 'active'
          AND block.inventory_impact = 'remove_from_inventory'
          AND block.start_date <= nights.night
          AND block.end_date > nights.night
      ) AS type_hold,
      COALESCE((
        SELECT sum(block.quantity)::integer
        FROM public.pms_operational_inventory_blocks block
        WHERE block.restaurant_id = _restaurant_id
          AND block.room_type_id = _room_type_id
          AND block.target_kind = 'quantity'
          AND block.status = 'active'
          AND block.inventory_impact = 'remove_from_inventory'
          AND block.start_date <= nights.night
          AND block.end_date > nights.night
      ), 0) AS quantity_hold,
      (
        SELECT count(*)::integer
        FROM public.hotel_reservations reservation
        WHERE reservation.restaurant_id = _restaurant_id
          AND reservation.room_type_id = _room_type_id
          AND (
            reservation.room_id IS NULL
            OR NOT EXISTS (
              SELECT 1
              FROM pool pooled_room
              WHERE pooled_room.id = reservation.room_id
            )
          )
          AND reservation.status IN ('pending', 'confirmed', 'checked_in')
          AND (
            _exclude_reservation_id IS NULL
            OR reservation.id <> _exclude_reservation_id
          )
          AND reservation.arrival_date <= nights.night
          AND reservation.departure_date > nights.night
      ) AS unrepresented_reservation_demand
    FROM nights
  ),
  after_pinned AS (
    SELECT
      claims.*,
      GREATEST(claims.capacity - claims.pinned_room_claims, 0) AS free_after_pinned
    FROM claims
  ),
  after_holds AS (
    SELECT
      after_pinned.*,
      CASE
        WHEN after_pinned.type_hold THEN 0
        ELSE GREATEST(
          after_pinned.free_after_pinned
          - LEAST(
              after_pinned.quantity_hold,
              after_pinned.free_after_pinned
            ),
          0
        )
      END AS free_after_holds
    FROM after_pinned
  ),
  calculated AS (
    SELECT
      after_holds.*,
      GREATEST(
        after_holds.free_after_holds
        - after_holds.unrepresented_reservation_demand,
        0
      ) AS nightly_available
    FROM after_holds
  )
  SELECT
    COALESCE(max(calculated.capacity), 0)::integer,
    COALESCE(min(calculated.nightly_available), 0)::integer,
    (
      array_agg(
        calculated.night
        ORDER BY calculated.nightly_available, calculated.night
      )
    )[1],
    jsonb_agg(
      jsonb_build_object(
        'date', calculated.night,
        'physicalCapacity', calculated.capacity,
        'pinnedRoomClaims', calculated.pinned_room_claims,
        'typeHold', calculated.type_hold,
        'quantityHoldApplied',
          LEAST(calculated.quantity_hold, calculated.free_after_pinned),
        'unrepresentedReservationDemand',
          calculated.unrepresented_reservation_demand,
        'available', calculated.nightly_available
      )
      ORDER BY calculated.night
    )
  INTO capacity_count, available_count, limiting_night, nightly_rows
  FROM calculated;

  RETURN QUERY SELECT
    _room_type_id,
    _arrival,
    _departure,
    property_business_date,
    capacity_count,
    available_count,
    limiting_night,
    0,
    COALESCE(nightly_rows, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.pms_room_type_availability(
  uuid, uuid, date, date, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pms_room_type_availability(
  uuid, uuid, date, date, uuid
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pms_count_available_inventory(
  _restaurant_id uuid,
  _room_type_id uuid,
  _arrival date,
  _departure date,
  _exclude_reservation_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT availability.available
  FROM public.pms_room_type_availability(
    _restaurant_id,
    _room_type_id,
    _arrival,
    _departure,
    _exclude_reservation_id
  ) AS availability;
$$;

REVOKE ALL ON FUNCTION public.pms_count_available_inventory(
  uuid, uuid, date, date, uuid
) FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Write assertions

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
  property_business_date date;
  sellable_required boolean;
  require_type_match boolean;
  require_maintenance boolean;
  maintenance_prevents boolean;
BEGIN
  IF _departure <= _arrival THEN
    RAISE EXCEPTION 'INVALID_DATES';
  END IF;

  SELECT *
  INTO room
  FROM public.hotel_rooms
  WHERE id = _room_id
    AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_NOT_ASSIGNABLE';
  END IF;

  SELECT COALESCE(
    property.business_date,
    (now() AT TIME ZONE COALESCE(property.timezone, 'Europe/London'))::date
  )
  INTO property_business_date
  FROM public.restaurants property
  WHERE property.id = _restaurant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROPERTY_NOT_FOUND';
  END IF;

  SELECT
    COALESCE((
      SELECT rules.sellable_status_required
      FROM public.pms_inventory_rules rules
      WHERE rules.restaurant_id = _restaurant_id
    ), true),
    COALESCE((
      SELECT rules.require_room_type_match
      FROM public.pms_inventory_rules rules
      WHERE rules.restaurant_id = _restaurant_id
    ), true),
    COALESCE((
      SELECT rules.require_maintenance_availability
      FROM public.pms_inventory_rules rules
      WHERE rules.restaurant_id = _restaurant_id
    ), false)
  INTO sellable_required, require_type_match, require_maintenance;

  IF room.active IS NOT TRUE
     OR (require_type_match AND room.room_type_id <> _room_type_id)
     OR (
       _arrival <= property_business_date
       AND _departure > property_business_date
       AND room.status <> 'available'
     )
     OR (sellable_required AND room.sellable IS NOT TRUE) THEN
    RAISE EXCEPTION 'ROOM_NOT_ASSIGNABLE';
  END IF;

  IF require_maintenance THEN
    SELECT COALESCE((
      SELECT status_rule.prevents_room_assignment
      FROM public.pms_maintenance_status_rules status_rule
      WHERE status_rule.restaurant_id = _restaurant_id
        AND status_rule.maintenance_status = room.maintenance_status
        AND status_rule.active
    ), false)
    INTO maintenance_prevents;

    IF maintenance_prevents THEN
      RAISE EXCEPTION 'ROOM_NOT_ASSIGNABLE';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.hotel_reservations reservation
    WHERE reservation.restaurant_id = _restaurant_id
      AND reservation.room_id = _room_id
      AND reservation.status IN ('pending', 'confirmed', 'checked_in')
      AND (
        _exclude_reservation_id IS NULL
        OR reservation.id <> _exclude_reservation_id
      )
      AND reservation.arrival_date < _departure
      AND reservation.departure_date > _arrival
  ) THEN
    RAISE EXCEPTION 'ROOM_ALREADY_BOOKED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pms_operational_inventory_blocks block
    WHERE block.restaurant_id = _restaurant_id
      AND block.status = 'active'
      AND block.inventory_impact IN (
        'remove_from_inventory',
        'assignment_only'
      )
      AND block.start_date < _departure
      AND block.end_date > _arrival
      AND (
        (block.target_kind = 'room' AND block.room_id = _room_id)
        OR
        (
          block.target_kind = 'room_type'
          AND block.room_type_id = room.room_type_id
        )
      )
  ) THEN
    RAISE EXCEPTION 'ROOM_NOT_ASSIGNABLE';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_room_assignable(
  uuid, uuid, uuid, date, date, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_room_assignable(
  uuid, uuid, uuid, date, date, uuid
) TO service_role;

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
  available_count integer;
BEGIN
  IF _departure <= _arrival THEN
    RAISE EXCEPTION 'INVALID_DATES';
  END IF;

  PERFORM 1
  FROM public.room_types
  WHERE id = _room_type_id
    AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_TYPE_NOT_FOUND';
  END IF;

  available_count := public.pms_count_available_inventory(
    _restaurant_id,
    _room_type_id,
    _arrival,
    _departure,
    _exclude_reservation_id
  );

  IF available_count <= 0 THEN
    RAISE EXCEPTION 'NO_AVAILABILITY';
  END IF;

  IF _room_id IS NOT NULL THEN
    PERFORM public.assert_room_assignable(
      _restaurant_id,
      _room_id,
      _room_type_id,
      _arrival,
      _departure,
      _exclude_reservation_id
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_reservation_capacity(
  uuid, uuid, uuid, date, date, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_reservation_capacity(
  uuid, uuid, uuid, date, date, uuid
) TO service_role;

-- ---------------------------------------------------------------------------
-- 8. Canonical OOO/OOS lifecycle

CREATE OR REPLACE FUNCTION public.pms_set_room_operational_restriction(
  _restaurant_id uuid,
  _room_id uuid,
  _status text,
  _reason text,
  _expected_return date,
  _membership_id uuid,
  _maintenance_request_id uuid DEFAULT NULL,
  _approver_membership_id uuid DEFAULT NULL,
  _reopening_inspection_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  room public.hotel_rooms%ROWTYPE;
  actor public.restaurant_users%ROWTYPE;
  approver public.restaurant_users%ROWTYPE;
  maintenance_request public.housekeeping_maintenance_requests%ROWTYPE;
  inspection public.housekeeping_inspections%ROWTYPE;
  clean_reason text := NULLIF(btrim(COALESCE(_reason, '')), '');
  posture jsonb;
  posture_saved boolean;
  posture_expected_required boolean;
  ooo_enabled boolean;
  ooo_ticket_required boolean;
  ooo_approval_required boolean;
  ooo_clearance_required boolean;
  ooo_inspection_required boolean;
  oos_enabled boolean;
  oos_approval_required boolean;
  oos_expected_required boolean;
  oos_clearance_required boolean;
  oos_inspection_required boolean;
  approval_required boolean := false;
  approved_membership_id uuid := NULL;
  event_name text;
BEGIN
  IF _status NOT IN ('available', 'out_of_order', 'out_of_service') THEN
    RAISE EXCEPTION 'INVALID_ROOM_STATUS';
  END IF;

  SELECT *
  INTO actor
  FROM public.restaurant_users membership
  WHERE membership.id = _membership_id
    AND membership.restaurant_id = _restaurant_id
    AND membership.active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_ACTOR_MEMBERSHIP';
  END IF;

  IF actor.role NOT IN (
    'owner',
    'manager',
    'housekeeping',
    'housekeeping_supervisor',
    'maintenance'
  ) THEN
    RAISE EXCEPTION 'INVALID_ACTOR_MEMBERSHIP';
  END IF;

  SELECT *
  INTO room
  FROM public.hotel_rooms
  WHERE id = _room_id
    AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND';
  END IF;

  SELECT
    COALESCE((
      SELECT rules.operational_ooo_enabled
      FROM public.pms_maintenance_rules rules
      WHERE rules.restaurant_id = _restaurant_id
    ), true),
    COALESCE((
      SELECT rules.operational_ooo_maintenance_ticket_required
      FROM public.pms_maintenance_rules rules
      WHERE rules.restaurant_id = _restaurant_id
    ), false),
    COALESCE((
      SELECT
        rules.operational_ooo_approval_required
        OR rules.operational_ooo_manager_approval_required
      FROM public.pms_maintenance_rules rules
      WHERE rules.restaurant_id = _restaurant_id
    ), false),
    COALESCE((
      SELECT rules.operational_ooo_maintenance_clearance_required
      FROM public.pms_maintenance_rules rules
      WHERE rules.restaurant_id = _restaurant_id
    ), false),
    COALESCE((
      SELECT rules.operational_ooo_reopening_inspection_required
      FROM public.pms_maintenance_rules rules
      WHERE rules.restaurant_id = _restaurant_id
    ), false),
    COALESCE((
      SELECT rules.operational_oos_enabled
      FROM public.pms_maintenance_rules rules
      WHERE rules.restaurant_id = _restaurant_id
    ), true),
    COALESCE((
      SELECT
        rules.operational_oos_approval_required
        OR rules.operational_oos_supervisor_approval_required
      FROM public.pms_maintenance_rules rules
      WHERE rules.restaurant_id = _restaurant_id
    ), false),
    COALESCE((
      SELECT rules.operational_oos_expected_completion_required
      FROM public.pms_maintenance_rules rules
      WHERE rules.restaurant_id = _restaurant_id
    ), false),
    COALESCE((
      SELECT rules.operational_oos_maintenance_clearance_required
      FROM public.pms_maintenance_rules rules
      WHERE rules.restaurant_id = _restaurant_id
    ), false),
    COALESCE((
      SELECT rules.operational_oos_reopening_inspection_required
      FROM public.pms_maintenance_rules rules
      WHERE rules.restaurant_id = _restaurant_id
    ), false)
  INTO
    ooo_enabled,
    ooo_ticket_required,
    ooo_approval_required,
    ooo_clearance_required,
    ooo_inspection_required,
    oos_enabled,
    oos_approval_required,
    oos_expected_required,
    oos_clearance_required,
    oos_inspection_required
  ;

  SELECT property.pms_ooo_oos_posture
  INTO posture
  FROM public.restaurants property
  WHERE property.id = _restaurant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROPERTY_NOT_FOUND';
  END IF;

  posture_saved := COALESCE(posture->>'savedAt', '') <> '';
  posture_expected_required :=
    posture_saved
    AND COALESCE((posture->>'expectedReturnRequired')::boolean, false);

  IF _status <> 'available' AND clean_reason IS NULL THEN
    RAISE EXCEPTION 'REASON_REQUIRED';
  END IF;

  IF _status = 'out_of_order' THEN
    IF NOT ooo_enabled THEN
      RAISE EXCEPTION 'OOO_DISABLED';
    END IF;

    IF posture_expected_required AND _expected_return IS NULL THEN
      RAISE EXCEPTION 'EXPECTED_RETURN_REQUIRED';
    END IF;

    IF ooo_ticket_required THEN
      IF _maintenance_request_id IS NULL THEN
        RAISE EXCEPTION 'MAINTENANCE_TICKET_REQUIRED';
      END IF;

      SELECT *
      INTO maintenance_request
      FROM public.housekeeping_maintenance_requests request
      WHERE request.id = _maintenance_request_id
        AND request.restaurant_id = _restaurant_id
        AND request.room_id = _room_id
        AND request.status IN ('open', 'in_progress');

      IF NOT FOUND THEN
        RAISE EXCEPTION 'MAINTENANCE_TICKET_REQUIRED';
      END IF;
    END IF;

    approval_required := ooo_approval_required;
  ELSIF _status = 'out_of_service' THEN
    IF NOT oos_enabled THEN
      RAISE EXCEPTION 'OOS_DISABLED';
    END IF;

    IF (posture_expected_required OR oos_expected_required)
       AND _expected_return IS NULL THEN
      RAISE EXCEPTION 'EXPECTED_RETURN_REQUIRED';
    END IF;

    approval_required := oos_approval_required;
  END IF;

  IF approval_required THEN
    IF _approver_membership_id IS NULL THEN
      RAISE EXCEPTION 'APPROVAL_REQUIRED';
    END IF;

    SELECT *
    INTO approver
    FROM public.restaurant_users membership
    WHERE membership.id = _approver_membership_id
      AND membership.restaurant_id = _restaurant_id
      AND membership.active
      AND membership.role IN ('owner', 'manager');

    IF NOT FOUND THEN
      RAISE EXCEPTION 'APPROVAL_REQUIRED';
    END IF;

    approved_membership_id := approver.id;
  END IF;

  IF _status = 'available' AND room.status = 'out_of_order' THEN
    IF ooo_clearance_required
       AND room.maintenance_status IS DISTINCT FROM 'normal' THEN
      RAISE EXCEPTION 'MAINTENANCE_CLEARANCE_REQUIRED';
    END IF;

    IF ooo_inspection_required THEN
      IF _reopening_inspection_id IS NULL THEN
        RAISE EXCEPTION 'REOPENING_INSPECTION_REQUIRED';
      END IF;

      SELECT *
      INTO inspection
      FROM public.housekeeping_inspections inspection_row
      WHERE inspection_row.id = _reopening_inspection_id
        AND inspection_row.restaurant_id = _restaurant_id
        AND inspection_row.room_id = _room_id
        AND inspection_row.status = 'passed'
        AND inspection_row.completed_at IS NOT NULL
        AND (
          room.restriction_placed_at IS NULL
          OR inspection_row.completed_at >= room.restriction_placed_at
        );

      IF NOT FOUND THEN
        RAISE EXCEPTION 'REOPENING_INSPECTION_REQUIRED';
      END IF;
    END IF;
  ELSIF _status = 'available' AND room.status = 'out_of_service' THEN
    IF oos_clearance_required
       AND room.maintenance_status IS DISTINCT FROM 'normal' THEN
      RAISE EXCEPTION 'MAINTENANCE_CLEARANCE_REQUIRED';
    END IF;

    IF oos_inspection_required THEN
      IF _reopening_inspection_id IS NULL THEN
        RAISE EXCEPTION 'REOPENING_INSPECTION_REQUIRED';
      END IF;

      SELECT *
      INTO inspection
      FROM public.housekeeping_inspections inspection_row
      WHERE inspection_row.id = _reopening_inspection_id
        AND inspection_row.restaurant_id = _restaurant_id
        AND inspection_row.room_id = _room_id
        AND inspection_row.status = 'passed'
        AND inspection_row.completed_at IS NOT NULL
        AND (
          room.restriction_placed_at IS NULL
          OR inspection_row.completed_at >= room.restriction_placed_at
        );

      IF NOT FOUND THEN
        RAISE EXCEPTION 'REOPENING_INSPECTION_REQUIRED';
      END IF;
    END IF;
  END IF;

  IF room.status = _status THEN
    RETURN;
  END IF;

  UPDATE public.hotel_rooms
  SET
    status = _status,
    restriction_reason = CASE
      WHEN _status = 'available' THEN NULL
      ELSE clean_reason
    END,
    restriction_expected_return = CASE
      WHEN _status = 'available' THEN NULL
      ELSE _expected_return
    END,
    restriction_maintenance_request_id = CASE
      WHEN _status = 'available' THEN NULL
      ELSE _maintenance_request_id
    END,
    restriction_placed_at = CASE
      WHEN _status = 'available' THEN NULL
      ELSE now()
    END,
    restriction_placed_by_membership_id = CASE
      WHEN _status = 'available' THEN NULL
      ELSE actor.id
    END,
    restriction_approved_by_membership_id = CASE
      WHEN _status = 'available' THEN NULL
      ELSE approved_membership_id
    END
  WHERE id = room.id;

  event_name := CASE _status
    WHEN 'out_of_order' THEN 'room_ooo'
    WHEN 'out_of_service' THEN 'room_oos'
    ELSE 'room_released'
  END;

  PERFORM public.pms_write_room_inventory_event(
    _restaurant_id,
    event_name,
    room.id,
    NULL,
    actor.id,
    jsonb_build_object(
      'status', room.status,
      'reason', room.restriction_reason,
      'expectedReturn', room.restriction_expected_return
    ),
    jsonb_build_object(
      'status', _status,
      'reason', clean_reason,
      'expectedReturn', _expected_return,
      'maintenanceRequestId', _maintenance_request_id,
      'approvedByMembershipId', approved_membership_id
    ),
    clean_reason
  );

  INSERT INTO public.housekeeping_history (
    restaurant_id,
    room_id,
    event_type,
    previous_values,
    new_values,
    notes,
    actor_membership_id
  )
  VALUES (
    _restaurant_id,
    room.id,
    event_name,
    jsonb_build_object('status', room.status),
    jsonb_build_object(
      'status', _status,
      'expected_return', _expected_return
    ),
    clean_reason,
    actor.id
  );
END;
$$;

ALTER FUNCTION public.pms_set_room_operational_restriction(
  uuid, uuid, text, text, date, uuid, uuid, uuid, uuid
) OWNER TO pms_room_operational_writer;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc function_row
    JOIN pg_roles owner_role
      ON owner_role.oid = function_row.proowner
    WHERE owner_role.rolname = 'pms_room_operational_writer'
      AND function_row.oid <> to_regprocedure(
        'public.pms_set_room_operational_restriction(uuid,uuid,text,text,date,uuid,uuid,uuid,uuid)'
      )
  ) THEN
    RAISE EXCEPTION '0095_WRITER_ROLE_OWNS_UNEXPECTED_FUNCTION';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.pms_set_room_operational_restriction(
  uuid, uuid, text, text, date, uuid, uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pms_set_room_operational_restriction(
  uuid, uuid, text, text, date, uuid, uuid, uuid, uuid
) TO postgres, service_role;

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
BEGIN
  PERFORM public.pms_set_room_operational_restriction(
    _restaurant_id,
    _room_id,
    _status,
    _reason,
    _expected_return,
    _membership_id,
    NULL,
    NULL,
    NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.housekeeping_set_room_restriction(
  uuid, uuid, text, text, date, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.housekeeping_set_room_restriction(
  uuid, uuid, text, text, date, uuid
) TO service_role;

-- ---------------------------------------------------------------------------
-- 9. Block activation helper and lifecycle

CREATE OR REPLACE FUNCTION public.pms_assert_operational_block_activatable(
  _restaurant_id uuid,
  _block_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  block public.pms_operational_inventory_blocks%ROWTYPE;
  type_policy public.pms_inventory_block_type_rules%ROWTYPE;
BEGIN
  SELECT *
  INTO block
  FROM public.pms_operational_inventory_blocks
  WHERE id = _block_id
    AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BLOCK_NOT_FOUND';
  END IF;

  PERFORM 1
  FROM public.room_types
  WHERE id = block.room_type_id
    AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_TYPE_NOT_FOUND';
  END IF;

  SELECT *
  INTO type_policy
  FROM public.pms_inventory_block_type_rules
  WHERE restaurant_id = _restaurant_id
    AND block_type = block.block_type;

  IF NOT FOUND
     OR type_policy.enabled IS NOT TRUE
     OR type_policy.inventory_impact <> block.inventory_impact
     OR type_policy.approval_required <> block.approval_required THEN
    RAISE EXCEPTION 'BLOCK_POLICY_CHANGED';
  END IF;

  IF block.target_kind = 'room' THEN
    PERFORM 1
    FROM public.hotel_rooms
    WHERE id = block.room_id
      AND restaurant_id = _restaurant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ROOM_NOT_FOUND';
    END IF;

    IF block.inventory_impact IN (
      'remove_from_inventory',
      'assignment_only'
    )
    AND EXISTS (
      SELECT 1
      FROM public.hotel_reservations reservation
      WHERE reservation.restaurant_id = _restaurant_id
        AND reservation.room_id = block.room_id
        AND reservation.status IN ('pending', 'confirmed', 'checked_in')
        AND reservation.arrival_date < block.end_date
        AND reservation.departure_date > block.start_date
    ) THEN
      RAISE EXCEPTION 'BLOCK_CONFLICTS_WITH_RESERVATION';
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.pms_assert_operational_block_activatable(
  uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pms_create_operational_block(
  _restaurant_id uuid,
  _target_kind text,
  _room_id uuid,
  _room_type_id uuid,
  _quantity integer,
  _group_id uuid,
  _block_type text,
  _start_date date,
  _end_date date,
  _reason text,
  _notes text,
  _membership_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  actor public.restaurant_users%ROWTYPE;
  room public.hotel_rooms%ROWTYPE;
  type_policy public.pms_inventory_block_type_rules%ROWTYPE;
  clean_reason text := NULLIF(btrim(COALESCE(_reason, '')), '');
  new_status text;
  new_id uuid;
BEGIN
  IF _end_date <= _start_date THEN
    RAISE EXCEPTION 'INVALID_DATES';
  END IF;

  IF clean_reason IS NULL THEN
    RAISE EXCEPTION 'REASON_REQUIRED';
  END IF;

  SELECT *
  INTO actor
  FROM public.restaurant_users membership
  WHERE membership.id = _membership_id
    AND membership.restaurant_id = _restaurant_id
    AND membership.active
    AND membership.role IN ('owner', 'manager');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_ACTOR_MEMBERSHIP';
  END IF;

  SELECT *
  INTO type_policy
  FROM public.pms_inventory_block_type_rules
  WHERE restaurant_id = _restaurant_id
    AND block_type = _block_type
    AND enabled;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BLOCK_TYPE_DISABLED';
  END IF;

  IF _target_kind = 'room' THEN
    SELECT *
    INTO room
    FROM public.hotel_rooms
    WHERE id = _room_id
      AND restaurant_id = _restaurant_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ROOM_NOT_FOUND';
    END IF;

    _room_type_id := room.room_type_id;
    _quantity := NULL;
  ELSIF _target_kind = 'room_type' THEN
    _room_id := NULL;
    _quantity := NULL;
  ELSIF _target_kind = 'quantity' THEN
    _room_id := NULL;
    IF COALESCE(_quantity, 0) < 1 THEN
      RAISE EXCEPTION 'INVALID_BLOCK_TARGET';
    END IF;
  ELSE
    RAISE EXCEPTION 'INVALID_BLOCK_TARGET';
  END IF;

  IF _target_kind = 'quantity'
     AND type_policy.inventory_impact = 'assignment_only' THEN
    RAISE EXCEPTION 'INVALID_BLOCK_TARGET';
  END IF;

  PERFORM 1
  FROM public.room_types
  WHERE id = _room_type_id
    AND restaurant_id = _restaurant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_TYPE_NOT_FOUND';
  END IF;

  new_status := CASE
    WHEN type_policy.approval_required THEN 'pending_approval'
    ELSE 'draft'
  END;

  INSERT INTO public.pms_operational_inventory_blocks (
    restaurant_id,
    target_kind,
    room_id,
    room_type_id,
    quantity,
    group_id,
    block_type,
    inventory_impact,
    approval_required,
    status,
    start_date,
    end_date,
    reason,
    notes,
    created_by_membership_id
  )
  VALUES (
    _restaurant_id,
    _target_kind,
    _room_id,
    _room_type_id,
    _quantity,
    _group_id,
    _block_type,
    type_policy.inventory_impact,
    type_policy.approval_required,
    new_status,
    _start_date,
    _end_date,
    clean_reason,
    _notes,
    actor.id
  )
  RETURNING id INTO new_id;

  PERFORM public.pms_write_room_inventory_event(
    _restaurant_id,
    'block_created',
    _room_id,
    new_id,
    actor.id,
    NULL,
    jsonb_build_object(
      'status', new_status,
      'targetKind', _target_kind,
      'blockType', _block_type,
      'inventoryImpact', type_policy.inventory_impact,
      'approvalRequired', type_policy.approval_required
    ),
    clean_reason
  );

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.pms_create_operational_block(
  uuid, text, uuid, uuid, integer, uuid, text, date, date, text, text, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pms_create_operational_block(
  uuid, text, uuid, uuid, integer, uuid, text, date, date, text, text, uuid
) TO service_role;

CREATE OR REPLACE FUNCTION public.pms_activate_operational_block(
  _restaurant_id uuid,
  _block_id uuid,
  _membership_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  block public.pms_operational_inventory_blocks%ROWTYPE;
  actor public.restaurant_users%ROWTYPE;
BEGIN
  SELECT *
  INTO actor
  FROM public.restaurant_users membership
  WHERE membership.id = _membership_id
    AND membership.restaurant_id = _restaurant_id
    AND membership.active
    AND membership.role IN ('owner', 'manager');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_ACTOR_MEMBERSHIP';
  END IF;

  SELECT *
  INTO block
  FROM public.pms_operational_inventory_blocks
  WHERE id = _block_id
    AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BLOCK_NOT_FOUND';
  END IF;

  IF block.status <> 'draft' THEN
    RAISE EXCEPTION 'INVALID_BLOCK_STATUS';
  END IF;

  PERFORM public.pms_assert_operational_block_activatable(
    _restaurant_id,
    block.id
  );

  UPDATE public.pms_operational_inventory_blocks
  SET
    status = 'active',
    activated_at = now(),
    activated_by_membership_id = actor.id
  WHERE id = block.id;

  PERFORM public.pms_write_room_inventory_event(
    _restaurant_id,
    'block_activated',
    block.room_id,
    block.id,
    actor.id,
    jsonb_build_object('status', block.status),
    jsonb_build_object('status', 'active'),
    NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pms_activate_operational_block(
  uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pms_activate_operational_block(
  uuid, uuid, uuid
) TO service_role;

CREATE OR REPLACE FUNCTION public.pms_approve_operational_block(
  _restaurant_id uuid,
  _block_id uuid,
  _approver_membership_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  block public.pms_operational_inventory_blocks%ROWTYPE;
  approver public.restaurant_users%ROWTYPE;
BEGIN
  SELECT *
  INTO approver
  FROM public.restaurant_users membership
  WHERE membership.id = _approver_membership_id
    AND membership.restaurant_id = _restaurant_id
    AND membership.active
    AND membership.role IN ('owner', 'manager');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'APPROVAL_REQUIRED';
  END IF;

  SELECT *
  INTO block
  FROM public.pms_operational_inventory_blocks
  WHERE id = _block_id
    AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BLOCK_NOT_FOUND';
  END IF;

  IF block.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'INVALID_BLOCK_STATUS';
  END IF;

  PERFORM public.pms_assert_operational_block_activatable(
    _restaurant_id,
    block.id
  );

  UPDATE public.pms_operational_inventory_blocks
  SET
    status = 'active',
    approved_at = now(),
    approved_by_membership_id = approver.id,
    activated_at = now(),
    activated_by_membership_id = approver.id
  WHERE id = block.id;

  PERFORM public.pms_write_room_inventory_event(
    _restaurant_id,
    'block_approved',
    block.room_id,
    block.id,
    approver.id,
    jsonb_build_object('status', block.status),
    jsonb_build_object('status', 'active'),
    NULL
  );

  PERFORM public.pms_write_room_inventory_event(
    _restaurant_id,
    'block_activated',
    block.room_id,
    block.id,
    approver.id,
    jsonb_build_object('status', block.status),
    jsonb_build_object('status', 'active'),
    NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pms_approve_operational_block(
  uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pms_approve_operational_block(
  uuid, uuid, uuid
) TO service_role;

CREATE OR REPLACE FUNCTION public.pms_release_operational_block(
  _restaurant_id uuid,
  _block_id uuid,
  _membership_id uuid,
  _release_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  block public.pms_operational_inventory_blocks%ROWTYPE;
  actor public.restaurant_users%ROWTYPE;
  clean_reason text := NULLIF(btrim(COALESCE(_release_reason, '')), '');
BEGIN
  IF clean_reason IS NULL THEN
    RAISE EXCEPTION 'RELEASE_REASON_REQUIRED';
  END IF;

  SELECT *
  INTO actor
  FROM public.restaurant_users membership
  WHERE membership.id = _membership_id
    AND membership.restaurant_id = _restaurant_id
    AND membership.active
    AND membership.role IN ('owner', 'manager');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_ACTOR_MEMBERSHIP';
  END IF;

  SELECT *
  INTO block
  FROM public.pms_operational_inventory_blocks
  WHERE id = _block_id
    AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BLOCK_NOT_FOUND';
  END IF;

  IF block.status <> 'active' THEN
    RAISE EXCEPTION 'INVALID_BLOCK_STATUS';
  END IF;

  UPDATE public.pms_operational_inventory_blocks
  SET
    status = 'released',
    release_reason = clean_reason,
    released_at = now(),
    released_by_membership_id = actor.id
  WHERE id = block.id;

  PERFORM public.pms_write_room_inventory_event(
    _restaurant_id,
    'block_released',
    block.room_id,
    block.id,
    actor.id,
    jsonb_build_object('status', block.status),
    jsonb_build_object('status', 'released'),
    clean_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pms_release_operational_block(
  uuid, uuid, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pms_release_operational_block(
  uuid, uuid, uuid, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.pms_cancel_operational_block(
  _restaurant_id uuid,
  _block_id uuid,
  _membership_id uuid,
  _notes text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  block public.pms_operational_inventory_blocks%ROWTYPE;
  actor public.restaurant_users%ROWTYPE;
BEGIN
  SELECT *
  INTO actor
  FROM public.restaurant_users membership
  WHERE membership.id = _membership_id
    AND membership.restaurant_id = _restaurant_id
    AND membership.active
    AND membership.role IN ('owner', 'manager');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_ACTOR_MEMBERSHIP';
  END IF;

  SELECT *
  INTO block
  FROM public.pms_operational_inventory_blocks
  WHERE id = _block_id
    AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BLOCK_NOT_FOUND';
  END IF;

  IF block.status NOT IN ('draft', 'pending_approval') THEN
    RAISE EXCEPTION 'INVALID_BLOCK_STATUS';
  END IF;

  UPDATE public.pms_operational_inventory_blocks
  SET
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_by_membership_id = actor.id
  WHERE id = block.id;

  PERFORM public.pms_write_room_inventory_event(
    _restaurant_id,
    'block_cancelled',
    block.room_id,
    block.id,
    actor.id,
    jsonb_build_object('status', block.status),
    jsonb_build_object('status', 'cancelled'),
    _notes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pms_cancel_operational_block(
  uuid, uuid, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pms_cancel_operational_block(
  uuid, uuid, uuid, text
) TO service_role;

-- ---------------------------------------------------------------------------
-- 10. Separate assignment eligibility read RPC

CREATE OR REPLACE FUNCTION public.pms_evaluate_room_assignment(
  _restaurant_id uuid,
  _room_id uuid,
  _room_type_id uuid,
  _arrival date,
  _departure date,
  _exclude_reservation_id uuid DEFAULT NULL,
  _adults integer DEFAULT NULL,
  _children integer DEFAULT NULL,
  _required_bed_type text DEFAULT NULL,
  _accessible_required boolean DEFAULT false,
  _connecting_required boolean DEFAULT false,
  _preferred_building_id uuid DEFAULT NULL,
  _preferred_floor_id uuid DEFAULT NULL,
  _guest_preference_matched boolean DEFAULT false,
  _for_check_in boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  room public.hotel_rooms%ROWTYPE;
  room_type public.room_types%ROWTYPE;
  property_business_date date;
  blockers jsonb := '[]'::jsonb;
  warnings jsonb := '[]'::jsonb;
  preference_score integer := 0;
  preference_reasons text[] := ARRAY[]::text[];
  sellable_required boolean;
  require_type_match boolean;
  require_occupancy_match boolean;
  require_bed_match boolean;
  require_accessibility_match boolean;
  require_connecting_match boolean;
  require_maintenance boolean;
  require_housekeeping boolean;
  housekeeping_affects boolean;
  use_building boolean;
  use_floor boolean;
  use_guest boolean;
  maintenance_prevents boolean;
  housekeeping_ready boolean := true;
BEGIN
  IF _departure <= _arrival THEN
    RAISE EXCEPTION 'INVALID_DATES';
  END IF;

  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT public.is_restaurant_member(_restaurant_id) THEN
    RAISE EXCEPTION 'INSUFFICIENT_PRIVILEGE';
  END IF;

  SELECT *
  INTO room
  FROM public.hotel_rooms
  WHERE id = _room_id
    AND restaurant_id = _restaurant_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'blockers', jsonb_build_array(
        jsonb_build_object('code', 'ROOM_NOT_FOUND')
      ),
      'warnings', '[]'::jsonb,
      'preferenceScore', 0,
      'preferenceReasons', '[]'::jsonb
    );
  END IF;

  SELECT *
  INTO room_type
  FROM public.room_types
  WHERE id = room.room_type_id
    AND restaurant_id = _restaurant_id;

  IF NOT FOUND THEN
    blockers := blockers || jsonb_build_array(
      jsonb_build_object('code', 'ROOM_TYPE_NOT_FOUND')
    );
  END IF;

  SELECT COALESCE(
    property.business_date,
    (now() AT TIME ZONE COALESCE(property.timezone, 'Europe/London'))::date
  )
  INTO property_business_date
  FROM public.restaurants property
  WHERE property.id = _restaurant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROPERTY_NOT_FOUND';
  END IF;

  SELECT
    COALESCE((SELECT sellable_status_required FROM public.pms_inventory_rules WHERE restaurant_id = _restaurant_id), true),
    COALESCE((SELECT require_room_type_match FROM public.pms_inventory_rules WHERE restaurant_id = _restaurant_id), true),
    COALESCE((SELECT require_occupancy_match FROM public.pms_inventory_rules WHERE restaurant_id = _restaurant_id), false),
    COALESCE((SELECT require_bed_type_match FROM public.pms_inventory_rules WHERE restaurant_id = _restaurant_id), false),
    COALESCE((SELECT require_accessibility_match FROM public.pms_inventory_rules WHERE restaurant_id = _restaurant_id), false),
    COALESCE((SELECT require_connecting_room_match FROM public.pms_inventory_rules WHERE restaurant_id = _restaurant_id), false),
    COALESCE((SELECT require_maintenance_availability FROM public.pms_inventory_rules WHERE restaurant_id = _restaurant_id), false),
    COALESCE((SELECT require_housekeeping_readiness FROM public.pms_inventory_rules WHERE restaurant_id = _restaurant_id), false),
    COALESCE((SELECT housekeeping_affects_assignment FROM public.pms_inventory_rules WHERE restaurant_id = _restaurant_id), false),
    COALESCE((SELECT use_building_preference FROM public.pms_inventory_rules WHERE restaurant_id = _restaurant_id), false),
    COALESCE((SELECT use_floor_preference FROM public.pms_inventory_rules WHERE restaurant_id = _restaurant_id), false),
    COALESCE((SELECT use_guest_preference FROM public.pms_inventory_rules WHERE restaurant_id = _restaurant_id), false)
  INTO
    sellable_required,
    require_type_match,
    require_occupancy_match,
    require_bed_match,
    require_accessibility_match,
    require_connecting_match,
    require_maintenance,
    require_housekeeping,
    housekeeping_affects,
    use_building,
    use_floor,
    use_guest;

  IF NOT room.active THEN
    blockers := blockers || jsonb_build_array(
      jsonb_build_object('code', 'ROOM_INACTIVE')
    );
  END IF;

  IF _arrival <= property_business_date
     AND _departure > property_business_date
     AND room.status <> 'available' THEN
    blockers := blockers || jsonb_build_array(
      jsonb_build_object(
        'code', 'ROOM_OPERATIONALLY_UNAVAILABLE',
        'status', room.status
      )
    );
  END IF;

  IF require_type_match AND room.room_type_id <> _room_type_id THEN
    blockers := blockers || jsonb_build_array(
      jsonb_build_object('code', 'ROOM_TYPE_MISMATCH')
    );
  END IF;

  IF sellable_required AND NOT room.sellable THEN
    blockers := blockers || jsonb_build_array(
      jsonb_build_object('code', 'ROOM_NOT_SELLABLE')
    );
  END IF;

  IF require_occupancy_match
     AND COALESCE(_adults, 0) + COALESCE(_children, 0)
         > COALESCE(room_type.max_occupancy, 0) THEN
    blockers := blockers || jsonb_build_array(
      jsonb_build_object('code', 'OCCUPANCY_EXCEEDED')
    );
  END IF;

  IF require_bed_match
     AND _required_bed_type IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.room_type_beds bed
       WHERE bed.restaurant_id = _restaurant_id
         AND bed.room_type_id = room.room_type_id
         AND bed.bed_type = _required_bed_type
     ) THEN
    blockers := blockers || jsonb_build_array(
      jsonb_build_object('code', 'BED_TYPE_MISMATCH')
    );
  END IF;

  IF require_accessibility_match
     AND _accessible_required
     AND NOT room.accessible THEN
    blockers := blockers || jsonb_build_array(
      jsonb_build_object('code', 'ACCESSIBILITY_MISMATCH')
    );
  END IF;

  IF require_connecting_match
     AND _connecting_required
     AND NOT EXISTS (
       SELECT 1
       FROM public.hotel_room_links link
       WHERE link.restaurant_id = _restaurant_id
         AND link.kind = 'connecting'
         AND (link.room_id = room.id OR link.other_room_id = room.id)
     ) THEN
    blockers := blockers || jsonb_build_array(
      jsonb_build_object('code', 'CONNECTING_ROOM_REQUIRED')
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.hotel_reservations reservation
    WHERE reservation.restaurant_id = _restaurant_id
      AND reservation.room_id = room.id
      AND reservation.status IN ('pending', 'confirmed', 'checked_in')
      AND (
        _exclude_reservation_id IS NULL
        OR reservation.id <> _exclude_reservation_id
      )
      AND reservation.arrival_date < _departure
      AND reservation.departure_date > _arrival
  ) THEN
    blockers := blockers || jsonb_build_array(
      jsonb_build_object('code', 'ROOM_ALREADY_BOOKED')
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pms_operational_inventory_blocks block
    WHERE block.restaurant_id = _restaurant_id
      AND block.status = 'active'
      AND block.inventory_impact IN (
        'remove_from_inventory',
        'assignment_only'
      )
      AND block.start_date < _departure
      AND block.end_date > _arrival
      AND (
        (block.target_kind = 'room' AND block.room_id = room.id)
        OR
        (
          block.target_kind = 'room_type'
          AND block.room_type_id = room.room_type_id
        )
      )
  ) THEN
    blockers := blockers || jsonb_build_array(
      jsonb_build_object('code', 'ROOM_BLOCKED')
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.pms_operational_inventory_blocks block
    WHERE block.restaurant_id = _restaurant_id
      AND block.status = 'active'
      AND block.inventory_impact = 'warning_only'
      AND block.start_date < _departure
      AND block.end_date > _arrival
      AND (
        (block.target_kind = 'room' AND block.room_id = room.id)
        OR
        (
          block.target_kind = 'room_type'
          AND block.room_type_id = room.room_type_id
        )
      )
  ) THEN
    warnings := warnings || jsonb_build_array(
      jsonb_build_object('code', 'WARNING_BLOCK')
    );
  END IF;

  IF require_maintenance THEN
    SELECT COALESCE((
      SELECT status_rule.prevents_room_assignment
      FROM public.pms_maintenance_status_rules status_rule
      WHERE status_rule.restaurant_id = _restaurant_id
        AND status_rule.maintenance_status = room.maintenance_status
        AND status_rule.active
    ), false)
    INTO maintenance_prevents;

    IF maintenance_prevents THEN
      blockers := blockers || jsonb_build_array(
        jsonb_build_object('code', 'MAINTENANCE_NOT_CLEAR')
      );
    END IF;
  END IF;

  IF _for_check_in OR require_housekeeping OR housekeeping_affects THEN
    housekeeping_ready := true;

    IF COALESCE((
      SELECT settings.clean_required
      FROM public.pms_housekeeping_settings settings
      WHERE settings.restaurant_id = _restaurant_id
    ), true)
    AND room.housekeeping_status NOT IN ('clean', 'inspected') THEN
      housekeeping_ready := false;
    END IF;

    IF COALESCE((
      SELECT settings.inspection_required
      FROM public.pms_housekeeping_settings settings
      WHERE settings.restaurant_id = _restaurant_id
    ), true)
    AND room.housekeeping_status <> 'inspected' THEN
      housekeeping_ready := false;
    END IF;

    IF COALESCE((
      SELECT settings.maintenance_clear_required
      FROM public.pms_housekeeping_settings settings
      WHERE settings.restaurant_id = _restaurant_id
    ), true)
    AND room.maintenance_status <> 'normal' THEN
      housekeeping_ready := false;
    END IF;

    IF NOT housekeeping_ready THEN
      blockers := blockers || jsonb_build_array(
        jsonb_build_object('code', 'HOUSEKEEPING_NOT_READY')
      );
    END IF;
  END IF;

  IF use_building AND _preferred_building_id IS NOT NULL THEN
    IF room.building_id = _preferred_building_id THEN
      preference_score := preference_score + 10;
      preference_reasons := array_append(
        preference_reasons,
        'building_match'
      );
    ELSE
      warnings := warnings || jsonb_build_array(
        jsonb_build_object('code', 'BUILDING_PREFERENCE_MISS')
      );
    END IF;
  END IF;

  IF use_floor AND _preferred_floor_id IS NOT NULL THEN
    IF room.floor_id = _preferred_floor_id THEN
      preference_score := preference_score + 10;
      preference_reasons := array_append(
        preference_reasons,
        'floor_match'
      );
    ELSE
      warnings := warnings || jsonb_build_array(
        jsonb_build_object('code', 'FLOOR_PREFERENCE_MISS')
      );
    END IF;
  END IF;

  IF use_guest THEN
    IF _guest_preference_matched THEN
      preference_score := preference_score + 5;
      preference_reasons := array_append(
        preference_reasons,
        'guest_preference_match'
      );
    ELSE
      warnings := warnings || jsonb_build_array(
        jsonb_build_object('code', 'GUEST_PREFERENCE_MISS')
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'eligible', jsonb_array_length(blockers) = 0,
    'blockers', blockers,
    'warnings', warnings,
    'preferenceScore', preference_score,
    'preferenceReasons', to_jsonb(preference_reasons)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pms_evaluate_room_assignment(
  uuid, uuid, uuid, date, date, uuid,
  integer, integer, text, boolean, boolean,
  uuid, uuid, boolean, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pms_evaluate_room_assignment(
  uuid, uuid, uuid, date, date, uuid,
  integer, integer, text, boolean, boolean,
  uuid, uuid, boolean, boolean
) TO authenticated, service_role;
