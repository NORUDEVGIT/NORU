-- 0212: Reservation room pairs for connecting-room stays.
--
-- A pair says that two reservation room units should be assigned rooms that
-- connect to each other. It records staff intent only. Candidate filtering and
-- final enforcement of the pair are not part of this migration. The physical
-- link between rooms stays on hotel_room_links and is not touched here.
--
-- Rules:
--   * One table row per pair, kind 'connecting' only, stored with
--     unit_a_id < unit_b_id so a pair has one spelling.
--   * Both units belong to the same property (composite foreign keys).
--   * One active partner per unit. An active pair has ended_at IS NULL.
--     Partial unique indexes cover each column; the guard trigger covers a
--     unit that would appear as unit_a in one pair and unit_b in another. The
--     guard locks both unit rows first, so two concurrent saves on the same
--     unit run one after the other.
--   * Both units of an active pair keep connecting_room_required = true.
--     The pair RPC sets them, and a unit in an active pair cannot turn it off.
--   * Allowed business relationship: both units on the same reservation, or
--     on two reservations of the same group (same pms_group_id, or same
--     group_account_master_id). Unrelated reservations cannot be paired.
--   * Neither unit is cancelled, no-show or checked out, and the stays overlap.
--   * Pairs are never deleted to end them. Removing, replacing, cancelling or
--     marking a unit no-show sets ended_at and ended_reason. Deleting a unit
--     (only possible when its reservation is deleted) cascades to its pairs.
--
-- Group rooming lists keep pairing intent on pms_group_rooming_rows, set on
-- both rows together. The application turns it into a reservation pair once
-- both rows have reservations.
--
-- Every new function is SECURITY DEFINER with a fixed search_path. The project
-- default privileges grant EXECUTE to anon and authenticated on new public
-- functions, so each one revokes them explicitly and grants service_role only.

-- ------------------------------------------------------------------ history

ALTER TABLE public.hotel_reservation_history
  DROP CONSTRAINT IF EXISTS hotel_reservation_history_event_check;
ALTER TABLE public.hotel_reservation_history
  ADD CONSTRAINT hotel_reservation_history_event_check
    CHECK (event_type IN (
      'created','confirmed','amended','cancelled','room_assigned','room_changed','status_changed',
      'check_in','check_out','room_moved','stay_extended','stay_shortened','stay_dates_changed',
      'no_show','repriced','expected_arrival_updated','late_checkout_updated',
      'room_guest_added','room_guest_removed','room_primary_guest_changed',
      'external_reservation_created','external_reservation_modified','external_reservation_cancelled',
      'package_applied','package_removed','promotion_applied','promotion_removed',
      'note_pinned','trace_created','trace_updated',
      'assignment_notes_updated','rate_notes_updated',
      'room_pair_created','room_pair_changed','room_pair_removed'
    ));

-- ------------------------------------------------------------------ table

CREATE TABLE IF NOT EXISTS public.hotel_reservation_room_pairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  unit_a_id uuid NOT NULL,
  unit_b_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'connecting',
  created_by uuid NULL REFERENCES public.restaurant_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz NULL,
  ended_reason text NULL,
  ended_by uuid NULL REFERENCES public.restaurant_users(id) ON DELETE SET NULL,
  CONSTRAINT hotel_reservation_room_pairs_kind_check CHECK (kind = 'connecting'),
  CONSTRAINT hotel_reservation_room_pairs_order_check CHECK (unit_a_id < unit_b_id),
  CONSTRAINT hotel_reservation_room_pairs_end_check CHECK (
    (ended_at IS NULL AND ended_reason IS NULL AND ended_by IS NULL)
    OR (
      ended_at IS NOT NULL
      AND ended_reason IN ('removed', 'changed', 'unit_cancelled', 'unit_no_show')
    )
  ),
  CONSTRAINT hotel_reservation_room_pairs_unit_a_same_property
    FOREIGN KEY (unit_a_id, restaurant_id)
    REFERENCES public.hotel_reservation_rooms(id, restaurant_id) ON DELETE CASCADE,
  CONSTRAINT hotel_reservation_room_pairs_unit_b_same_property
    FOREIGN KEY (unit_b_id, restaurant_id)
    REFERENCES public.hotel_reservation_rooms(id, restaurant_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS hotel_reservation_room_pairs_unit_a_idx
  ON public.hotel_reservation_room_pairs (unit_a_id);
CREATE INDEX IF NOT EXISTS hotel_reservation_room_pairs_unit_b_idx
  ON public.hotel_reservation_room_pairs (unit_b_id);
CREATE UNIQUE INDEX IF NOT EXISTS hotel_reservation_room_pairs_active_pair_unique
  ON public.hotel_reservation_room_pairs (unit_a_id, unit_b_id) WHERE ended_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS hotel_reservation_room_pairs_active_unit_a_unique
  ON public.hotel_reservation_room_pairs (unit_a_id) WHERE ended_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS hotel_reservation_room_pairs_active_unit_b_unique
  ON public.hotel_reservation_room_pairs (unit_b_id) WHERE ended_at IS NULL;

COMMENT ON TABLE public.hotel_reservation_room_pairs IS
  'Staff intent that two reservation room units take rooms that connect to each other. One active partner per unit; ended pairs are kept as history. Written only by save_hotel_reservation_room_pair and remove_hotel_reservation_room_pair.';

ALTER TABLE public.hotel_reservation_room_pairs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.hotel_reservation_room_pairs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.hotel_reservation_room_pairs TO service_role;

-- ------------------------------------------------------------------ rooming list intent

ALTER TABLE public.pms_group_rooming_rows
  ADD COLUMN IF NOT EXISTS connecting_partner_row_id uuid NULL
    REFERENCES public.pms_group_rooming_rows(id) ON DELETE SET NULL;

ALTER TABLE public.pms_group_rooming_rows
  DROP CONSTRAINT IF EXISTS pms_group_rooming_rows_partner_not_self;
ALTER TABLE public.pms_group_rooming_rows
  ADD CONSTRAINT pms_group_rooming_rows_partner_not_self
    CHECK (connecting_partner_row_id IS NULL OR connecting_partner_row_id <> id);

COMMENT ON COLUMN public.pms_group_rooming_rows.connecting_partner_row_id IS
  'Rooming row this row should be paired with for connecting rooms. Set on both rows by save_pms_group_rooming_pair.';

-- ------------------------------------------------------------------ label

CREATE OR REPLACE FUNCTION public.pms_reservation_room_pair_label(_unit_a_id uuid, _unit_b_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN a.reservation_id = b.reservation_id
      THEN 'Room ' || a.unit_sequence || ' ↔ Room ' || b.unit_sequence
    ELSE 'Room ' || a.unit_sequence || ' (' || COALESCE(ra.confirmation_number, 'reservation')
      || ') ↔ Room ' || b.unit_sequence || ' (' || COALESCE(rb.confirmation_number, 'reservation') || ')'
  END
  FROM public.hotel_reservation_rooms a
  JOIN public.hotel_reservation_rooms b ON b.id = _unit_b_id
  JOIN public.hotel_reservations ra ON ra.id = a.reservation_id
  JOIN public.hotel_reservations rb ON rb.id = b.reservation_id
  WHERE a.id = _unit_a_id;
$$;

REVOKE ALL ON FUNCTION public.pms_reservation_room_pair_label(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pms_reservation_room_pair_label(uuid, uuid)
  TO service_role;

-- One history row on each reservation the pair touches.
CREATE OR REPLACE FUNCTION public.pms_record_room_pair_event(
  _pair_id uuid,
  _event_type text,
  _notes text,
  _actor_membership_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  pair public.hotel_reservation_room_pairs%ROWTYPE;
  pair_label text;
BEGIN
  SELECT * INTO pair FROM public.hotel_reservation_room_pairs WHERE id = _pair_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  pair_label := public.pms_reservation_room_pair_label(pair.unit_a_id, pair.unit_b_id);
  INSERT INTO public.hotel_reservation_history (
    restaurant_id, reservation_id, event_type, previous_values, new_values, notes, actor_membership_id
  )
  SELECT DISTINCT
    pair.restaurant_id,
    unit.reservation_id,
    _event_type,
    NULL::jsonb,
    jsonb_build_object('connecting_pair', pair_label),
    _notes || ': ' || pair_label,
    _actor_membership_id
  FROM public.hotel_reservation_rooms unit
  WHERE unit.id IN (pair.unit_a_id, pair.unit_b_id);
END;
$$;

REVOKE ALL ON FUNCTION public.pms_record_room_pair_event(uuid, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pms_record_room_pair_event(uuid, text, text, uuid)
  TO service_role;

-- ------------------------------------------------------------------ pair guard

CREATE OR REPLACE FUNCTION public.pms_guard_reservation_room_pair()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  unit_a public.hotel_reservation_rooms%ROWTYPE;
  unit_b public.hotel_reservation_rooms%ROWTYPE;
  res_a public.hotel_reservations%ROWTYPE;
  res_b public.hotel_reservations%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.ended_at IS NOT NULL THEN
      RAISE EXCEPTION 'ROOM_PAIR_ENDED';
    END IF;
    IF NEW.unit_a_id IS DISTINCT FROM OLD.unit_a_id
       OR NEW.unit_b_id IS DISTINCT FROM OLD.unit_b_id
       OR NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id
       OR NEW.kind IS DISTINCT FROM OLD.kind
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'ROOM_PAIR_IMMUTABLE';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'ROOM_PAIR_INVALID';
  END IF;

  -- Lock both units in a fixed order. Every writer of an active pair passes here,
  -- so the one-partner check below cannot race.
  PERFORM 1 FROM public.hotel_reservation_rooms
  WHERE id IN (NEW.unit_a_id, NEW.unit_b_id)
  ORDER BY id
  FOR UPDATE;

  SELECT * INTO unit_a FROM public.hotel_reservation_rooms
  WHERE id = NEW.unit_a_id AND restaurant_id = NEW.restaurant_id;
  SELECT * INTO unit_b FROM public.hotel_reservation_rooms
  WHERE id = NEW.unit_b_id AND restaurant_id = NEW.restaurant_id;
  IF unit_a.id IS NULL OR unit_b.id IS NULL THEN
    RAISE EXCEPTION 'ROOM_UNIT_NOT_FOUND';
  END IF;

  IF unit_a.status IN ('cancelled', 'no_show', 'checked_out')
     OR unit_b.status IN ('cancelled', 'no_show', 'checked_out') THEN
    RAISE EXCEPTION 'ROOM_PAIR_UNIT_NOT_ACTIVE';
  END IF;

  IF NOT (unit_a.arrival_date < unit_b.departure_date
          AND unit_b.arrival_date < unit_a.departure_date) THEN
    RAISE EXCEPTION 'ROOM_PAIR_STAYS_DO_NOT_OVERLAP';
  END IF;

  IF unit_a.reservation_id <> unit_b.reservation_id THEN
    SELECT * INTO res_a FROM public.hotel_reservations WHERE id = unit_a.reservation_id;
    SELECT * INTO res_b FROM public.hotel_reservations WHERE id = unit_b.reservation_id;
    IF NOT (
      (res_a.pms_group_id IS NOT NULL AND res_a.pms_group_id = res_b.pms_group_id)
      OR (res_a.group_account_master_id IS NOT NULL
          AND res_a.group_account_master_id = res_b.group_account_master_id)
    ) THEN
      RAISE EXCEPTION 'ROOM_PAIR_NOT_RELATED';
    END IF;
  END IF;

  IF unit_a.connecting_room_required IS NOT TRUE OR unit_b.connecting_room_required IS NOT TRUE THEN
    RAISE EXCEPTION 'ROOM_PAIR_REQUIRES_CONNECTING';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.hotel_reservation_room_pairs pair
    WHERE pair.ended_at IS NULL
      AND pair.unit_a_id = NEW.unit_a_id
      AND pair.unit_b_id = NEW.unit_b_id
  ) THEN
    RAISE EXCEPTION 'ROOM_PAIR_EXISTS';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.hotel_reservation_room_pairs pair
    WHERE pair.ended_at IS NULL
      AND (pair.unit_a_id IN (NEW.unit_a_id, NEW.unit_b_id)
           OR pair.unit_b_id IN (NEW.unit_a_id, NEW.unit_b_id))
  ) THEN
    RAISE EXCEPTION 'ROOM_PAIR_UNIT_ALREADY_PAIRED';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.pms_guard_reservation_room_pair()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_hotel_reservation_room_pairs_guard
  ON public.hotel_reservation_room_pairs;
CREATE TRIGGER trg_hotel_reservation_room_pairs_guard
  BEFORE INSERT OR UPDATE ON public.hotel_reservation_room_pairs
  FOR EACH ROW
  EXECUTE FUNCTION public.pms_guard_reservation_room_pair();

-- ------------------------------------------------------------------ unit guard

-- A cancelled or no-show unit ends its pair. A unit in an active pair keeps
-- its connecting requirement until the pair is removed.
CREATE OR REPLACE FUNCTION public.pms_reservation_room_pair_unit_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  pair_row record;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('cancelled', 'no_show') THEN
    FOR pair_row IN
      SELECT id FROM public.hotel_reservation_room_pairs
      WHERE ended_at IS NULL AND (unit_a_id = NEW.id OR unit_b_id = NEW.id)
      FOR UPDATE
    LOOP
      UPDATE public.hotel_reservation_room_pairs
      SET ended_at = now(),
          ended_reason = CASE WHEN NEW.status = 'no_show' THEN 'unit_no_show' ELSE 'unit_cancelled' END
      WHERE id = pair_row.id;
      PERFORM public.pms_record_room_pair_event(
        pair_row.id,
        'room_pair_removed',
        CASE WHEN NEW.status = 'no_show'
          THEN 'Connecting-room pair ended because Room ' || NEW.unit_sequence || ' is a no-show'
          ELSE 'Connecting-room pair ended because Room ' || NEW.unit_sequence || ' was cancelled'
        END,
        NULL
      );
    END LOOP;
  END IF;

  IF NEW.connecting_room_required IS NOT TRUE AND OLD.connecting_room_required IS TRUE THEN
    IF EXISTS (
      SELECT 1 FROM public.hotel_reservation_room_pairs
      WHERE ended_at IS NULL AND (unit_a_id = NEW.id OR unit_b_id = NEW.id)
    ) THEN
      RAISE EXCEPTION 'ROOM_PAIR_REQUIRES_CONNECTING';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.pms_reservation_room_pair_unit_guard()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_hotel_reservation_rooms_pair_guard
  ON public.hotel_reservation_rooms;
CREATE TRIGGER trg_hotel_reservation_rooms_pair_guard
  AFTER UPDATE OF status, connecting_room_required ON public.hotel_reservation_rooms
  FOR EACH ROW
  EXECUTE FUNCTION public.pms_reservation_room_pair_unit_guard();

-- ------------------------------------------------------------------ save

-- Create a pair, or replace the unit's current pair with a new partner.
-- Saving a pair that is already active is a no-op that returns it.
CREATE OR REPLACE FUNCTION public.save_hotel_reservation_room_pair(
  _restaurant_id uuid,
  _unit_id uuid,
  _partner_unit_id uuid,
  _actor_membership_id uuid,
  _replace_existing boolean DEFAULT false,
  _keep_replaced_partner_requirement boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  first_id uuid;
  second_id uuid;
  locked_count integer;
  existing public.hotel_reservation_room_pairs%ROWTYPE;
  replaced public.hotel_reservation_room_pairs%ROWTYPE;
  replaced_partner uuid;
  new_pair_id uuid;
BEGIN
  IF _restaurant_id IS NULL OR _unit_id IS NULL OR _partner_unit_id IS NULL THEN
    RAISE EXCEPTION 'ROOM_PAIR_INVALID';
  END IF;
  IF _unit_id = _partner_unit_id THEN
    RAISE EXCEPTION 'ROOM_PAIR_SELF';
  END IF;
  IF _actor_membership_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.restaurant_users
    WHERE id = _actor_membership_id AND restaurant_id = _restaurant_id
  ) THEN
    RAISE EXCEPTION 'ROOM_PAIR_INVALID';
  END IF;

  first_id := LEAST(_unit_id, _partner_unit_id);
  second_id := GREATEST(_unit_id, _partner_unit_id);

  SELECT count(*) INTO locked_count FROM (
    SELECT id FROM public.hotel_reservation_rooms
    WHERE restaurant_id = _restaurant_id AND id IN (first_id, second_id)
    ORDER BY id
    FOR UPDATE
  ) locked;
  IF locked_count <> 2 THEN
    RAISE EXCEPTION 'ROOM_UNIT_NOT_FOUND';
  END IF;

  SELECT * INTO existing FROM public.hotel_reservation_room_pairs
  WHERE ended_at IS NULL AND unit_a_id = first_id AND unit_b_id = second_id
  FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'pair_id', existing.id, 'unit_a_id', existing.unit_a_id,
      'unit_b_id', existing.unit_b_id, 'created', false
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.hotel_reservation_room_pairs
    WHERE ended_at IS NULL AND (unit_a_id = _partner_unit_id OR unit_b_id = _partner_unit_id)
  ) THEN
    RAISE EXCEPTION 'ROOM_PAIR_PARTNER_ALREADY_PAIRED';
  END IF;

  SELECT * INTO replaced FROM public.hotel_reservation_room_pairs
  WHERE ended_at IS NULL AND (unit_a_id = _unit_id OR unit_b_id = _unit_id)
  FOR UPDATE;
  IF FOUND THEN
    IF _replace_existing IS NOT TRUE THEN
      RAISE EXCEPTION 'ROOM_PAIR_UNIT_ALREADY_PAIRED';
    END IF;
    replaced_partner := CASE WHEN replaced.unit_a_id = _unit_id THEN replaced.unit_b_id ELSE replaced.unit_a_id END;
    PERFORM 1 FROM public.hotel_reservation_rooms WHERE id = replaced_partner FOR UPDATE;
    UPDATE public.hotel_reservation_room_pairs
    SET ended_at = now(), ended_reason = 'changed', ended_by = _actor_membership_id
    WHERE id = replaced.id;
    IF _keep_replaced_partner_requirement IS NOT TRUE THEN
      UPDATE public.hotel_reservation_rooms
      SET connecting_room_required = false
      WHERE id = replaced_partner AND connecting_room_required IS TRUE;
    END IF;
    PERFORM public.pms_record_room_pair_event(
      replaced.id, 'room_pair_changed', 'Connecting-room pair changed. Previous pair', _actor_membership_id
    );
  END IF;

  -- The 0210 requirement trigger checks any room already assigned to these
  -- units. A room that cannot meet the requirement aborts the whole call.
  UPDATE public.hotel_reservation_rooms
  SET connecting_room_required = true
  WHERE id IN (first_id, second_id) AND connecting_room_required IS NOT TRUE;

  INSERT INTO public.hotel_reservation_room_pairs (restaurant_id, unit_a_id, unit_b_id, kind, created_by)
  VALUES (_restaurant_id, first_id, second_id, 'connecting', _actor_membership_id)
  RETURNING id INTO new_pair_id;

  PERFORM public.pms_record_room_pair_event(
    new_pair_id, 'room_pair_created', 'Connecting-room pair created', _actor_membership_id
  );

  RETURN jsonb_build_object(
    'pair_id', new_pair_id, 'unit_a_id', first_id, 'unit_b_id', second_id, 'created', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_hotel_reservation_room_pair(uuid, uuid, uuid, uuid, boolean, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_hotel_reservation_room_pair(uuid, uuid, uuid, uuid, boolean, boolean)
  TO service_role;

-- ------------------------------------------------------------------ remove

-- End an active pair. The caller decides, per unit, whether its connecting
-- requirement stays on. Both decisions are required.
CREATE OR REPLACE FUNCTION public.remove_hotel_reservation_room_pair(
  _restaurant_id uuid,
  _pair_id uuid,
  _keep_unit_a_requirement boolean,
  _keep_unit_b_requirement boolean,
  _actor_membership_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  pair public.hotel_reservation_room_pairs%ROWTYPE;
BEGIN
  IF _restaurant_id IS NULL OR _pair_id IS NULL THEN
    RAISE EXCEPTION 'ROOM_PAIR_INVALID';
  END IF;
  IF _keep_unit_a_requirement IS NULL OR _keep_unit_b_requirement IS NULL THEN
    RAISE EXCEPTION 'ROOM_PAIR_DECISION_REQUIRED';
  END IF;
  IF _actor_membership_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.restaurant_users
    WHERE id = _actor_membership_id AND restaurant_id = _restaurant_id
  ) THEN
    RAISE EXCEPTION 'ROOM_PAIR_INVALID';
  END IF;

  SELECT * INTO pair FROM public.hotel_reservation_room_pairs
  WHERE id = _pair_id AND restaurant_id = _restaurant_id AND ended_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOM_PAIR_NOT_FOUND';
  END IF;

  PERFORM 1 FROM public.hotel_reservation_rooms
  WHERE id IN (pair.unit_a_id, pair.unit_b_id)
  ORDER BY id
  FOR UPDATE;

  UPDATE public.hotel_reservation_room_pairs
  SET ended_at = now(), ended_reason = 'removed', ended_by = _actor_membership_id
  WHERE id = pair.id;

  UPDATE public.hotel_reservation_rooms
  SET connecting_room_required = false
  WHERE connecting_room_required IS TRUE
    AND (
      (id = pair.unit_a_id AND _keep_unit_a_requirement IS FALSE)
      OR (id = pair.unit_b_id AND _keep_unit_b_requirement IS FALSE)
    );

  PERFORM public.pms_record_room_pair_event(
    pair.id, 'room_pair_removed', 'Connecting-room pair removed', _actor_membership_id
  );

  RETURN jsonb_build_object(
    'pair_id', pair.id,
    'unit_a_id', pair.unit_a_id,
    'unit_b_id', pair.unit_b_id,
    'unit_a_requirement_kept', _keep_unit_a_requirement,
    'unit_b_requirement_kept', _keep_unit_b_requirement
  );
END;
$$;

REVOKE ALL ON FUNCTION public.remove_hotel_reservation_room_pair(uuid, uuid, boolean, boolean, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remove_hotel_reservation_room_pair(uuid, uuid, boolean, boolean, uuid)
  TO service_role;

-- ------------------------------------------------------------------ rooming list

-- Set or clear the pairing intent between two rooming rows of one group.
-- A null partner clears the row and its current partner. Pairing with a new
-- partner clears the row's previous partner first.
CREATE OR REPLACE FUNCTION public.save_pms_group_rooming_pair(
  _restaurant_id uuid,
  _group_id uuid,
  _row_id uuid,
  _partner_row_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  row_rec public.pms_group_rooming_rows%ROWTYPE;
  partner public.pms_group_rooming_rows%ROWTYPE;
BEGIN
  IF _restaurant_id IS NULL OR _group_id IS NULL OR _row_id IS NULL THEN
    RAISE EXCEPTION 'ROOMING_PAIR_INVALID';
  END IF;

  PERFORM 1 FROM public.pms_group_rooming_rows
  WHERE restaurant_id = _restaurant_id AND group_id = _group_id
    AND (id IN (_row_id, _partner_row_id)
         OR connecting_partner_row_id IN (_row_id, _partner_row_id))
  ORDER BY id
  FOR UPDATE;

  SELECT * INTO row_rec FROM public.pms_group_rooming_rows
  WHERE id = _row_id AND restaurant_id = _restaurant_id AND group_id = _group_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOMING_ROW_NOT_FOUND';
  END IF;

  IF _partner_row_id IS NULL THEN
    UPDATE public.pms_group_rooming_rows
    SET connecting_partner_row_id = NULL
    WHERE restaurant_id = _restaurant_id
      AND (id = _row_id OR connecting_partner_row_id = _row_id);
    RETURN jsonb_build_object('row_id', _row_id, 'partner_row_id', NULL);
  END IF;

  IF _partner_row_id = _row_id THEN
    RAISE EXCEPTION 'ROOMING_PAIR_SELF';
  END IF;

  SELECT * INTO partner FROM public.pms_group_rooming_rows
  WHERE id = _partner_row_id AND restaurant_id = _restaurant_id AND group_id = _group_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROOMING_ROW_NOT_FOUND';
  END IF;

  IF partner.connecting_partner_row_id IS NOT NULL AND partner.connecting_partner_row_id <> _row_id THEN
    RAISE EXCEPTION 'ROOMING_PAIR_PARTNER_ALREADY_PAIRED';
  END IF;

  IF NOT (row_rec.arrival_date < partner.departure_date
          AND partner.arrival_date < row_rec.departure_date) THEN
    RAISE EXCEPTION 'ROOM_PAIR_STAYS_DO_NOT_OVERLAP';
  END IF;

  UPDATE public.pms_group_rooming_rows
  SET connecting_partner_row_id = NULL
  WHERE restaurant_id = _restaurant_id
    AND connecting_partner_row_id = _row_id
    AND id <> _partner_row_id;

  UPDATE public.pms_group_rooming_rows
  SET connecting_partner_row_id = CASE WHEN id = _row_id THEN _partner_row_id ELSE _row_id END
  WHERE restaurant_id = _restaurant_id AND id IN (_row_id, _partner_row_id);

  RETURN jsonb_build_object('row_id', _row_id, 'partner_row_id', _partner_row_id);
END;
$$;

REVOKE ALL ON FUNCTION public.save_pms_group_rooming_pair(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_pms_group_rooming_pair(uuid, uuid, uuid, uuid)
  TO service_role;
