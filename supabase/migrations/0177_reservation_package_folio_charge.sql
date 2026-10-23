-- Reservation package snapshot -> Cashiering package charge.
--
-- Posting trigger:
-- A per-stay reservation package is posted when its hotel_reservation_packages
-- row is inserted and the reservation already has an open guest folio.
-- If the folio does not exist yet, the same charge is posted when that folio
-- row is inserted. Retrying apply is an ON CONFLICT update, so the insert
-- trigger does not fire again. A closed folio rejects the apply or removal.
-- This migration does not open or reopen a folio and does not call
-- open_folio_for_reservation.
--
-- Cashiering tax-on-post applies only to room and manual charges. Category
-- package is posted as hotel_reservation_packages.applied_amount with no tax
-- or service charge.
--
-- The package charge is a folio_transactions row. The snapshot table is not
-- the ledger. room_subtotal is not changed.

ALTER TABLE public.folio_transactions
  DROP CONSTRAINT IF EXISTS folio_transactions_category_check;

ALTER TABLE public.folio_transactions
  ADD CONSTRAINT folio_transactions_category_check CHECK (
    category IN (
      'room','manual','payment','deposit','refund','adjustment','discount',
      'future_restaurant','transfer','tax','service_charge','package'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS folio_transactions_package_charge_once
  ON public.folio_transactions (restaurant_id, reference_id)
  WHERE reference_type = 'reservation_package_charge'
    AND transaction_type = 'charge';

COMMENT ON COLUMN public.folio_transactions.reservation_room_id IS
  'Optional room unit for a reservation_room_charge or reservation_package_charge line. Null means the line belongs to the reservation. Historical rows stay null.';

CREATE OR REPLACE FUNCTION public.folio_transactions_assign_room_unit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  raw text;
BEGIN
  IF NEW.reservation_room_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.reference_type IS DISTINCT FROM 'reservation_room_charge'
     AND NEW.reference_type IS DISTINCT FROM 'reservation_package_charge' THEN
    RETURN NEW;
  END IF;
  raw := current_setting('noru.reservation_room_id', true);
  IF raw IS NULL OR btrim(raw) = '' THEN
    RETURN NEW;
  END IF;
  NEW.reservation_room_id := raw::uuid;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_reservation_package_charge(
  _restaurant_id uuid,
  _package_row_id uuid,
  _membership_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  package_row public.hotel_reservation_packages%ROWTYPE;
  reservation public.hotel_reservations%ROWTYPE;
  folio public.guest_folios%ROWTYPE;
  existing public.folio_transactions%ROWTYPE;
  posted public.folio_transactions%ROWTYPE;
  actor uuid;
  previous_room text;
  charge_key text;
BEGIN
  SELECT * INTO package_row
  FROM public.hotel_reservation_packages
  WHERE id = _package_row_id
    AND restaurant_id = _restaurant_id;
  IF NOT FOUND OR package_row.applied_amount IS NULL OR package_row.applied_amount <= 0 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO existing
  FROM public.folio_transactions
  WHERE restaurant_id = _restaurant_id
    AND reference_type = 'reservation_package_charge'
    AND reference_id = package_row.id
    AND transaction_type = 'charge'
  LIMIT 1;
  IF FOUND THEN
    RETURN existing.id;
  END IF;

  SELECT * INTO folio
  FROM public.guest_folios
  WHERE restaurant_id = _restaurant_id
    AND reservation_id = package_row.reservation_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF folio.status <> 'open' THEN
    RAISE EXCEPTION 'FOLIO_CLOSED';
  END IF;

  SELECT * INTO reservation
  FROM public.hotel_reservations
  WHERE id = package_row.reservation_id
    AND restaurant_id = _restaurant_id;
  IF reservation.currency IS NOT NULL
     AND folio.currency IS NOT NULL
     AND reservation.currency IS DISTINCT FROM folio.currency THEN
    RAISE EXCEPTION 'PACKAGE_CURRENCY_MISMATCH';
  END IF;

  actor := COALESCE(
    NULLIF(btrim(COALESCE(current_setting('noru.package_actor_membership_id', true), '')), '')::uuid,
    NULLIF(btrim(COALESCE(package_row.snapshot ->> 'appliedByMembershipId', '')), '')::uuid,
    _membership_id
  );
  charge_key := 'pkgchg' || replace(package_row.id::text, '-', '');
  previous_room := current_setting('noru.reservation_room_id', true);
  -- Stay-scoped packages keep reservation_room_id null. Do not pick a room.
  PERFORM set_config(
    'noru.reservation_room_id',
    COALESCE(package_row.reservation_room_id::text, ''),
    true
  );

  BEGIN
    posted := public.post_folio_transaction(
      _restaurant_id,
      folio.id,
      'charge',
      'package',
      COALESCE(NULLIF(btrim(package_row.package_name), ''), 'Package') || ' package',
      package_row.applied_amount,
      'reservation_package_charge',
      package_row.id,
      actor,
      NULL,
      charge_key,
      NULL
    );
    PERFORM set_config('noru.reservation_room_id', COALESCE(previous_room, ''), true);
  EXCEPTION
    WHEN unique_violation THEN
      PERFORM set_config('noru.reservation_room_id', COALESCE(previous_room, ''), true);
      SELECT * INTO existing
      FROM public.folio_transactions
      WHERE restaurant_id = _restaurant_id
        AND reference_type = 'reservation_package_charge'
        AND reference_id = package_row.id
        AND transaction_type = 'charge'
      LIMIT 1;
      IF NOT FOUND THEN
        RAISE;
      END IF;
      RETURN existing.id;
    WHEN OTHERS THEN
      PERFORM set_config('noru.reservation_room_id', COALESCE(previous_room, ''), true);
      RAISE;
  END;

  RETURN posted.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_reservation_package_charge(
  _restaurant_id uuid,
  _package_row_id uuid,
  _membership_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  package_row public.hotel_reservation_packages%ROWTYPE;
  charge public.folio_transactions%ROWTYPE;
  folio public.guest_folios%ROWTYPE;
  actor uuid;
BEGIN
  SELECT * INTO charge
  FROM public.folio_transactions
  WHERE restaurant_id = _restaurant_id
    AND reference_type = 'reservation_package_charge'
    AND reference_id = _package_row_id
    AND transaction_type = 'charge'
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.folio_transactions AS reversal
    WHERE reversal.restaurant_id = _restaurant_id
      AND reversal.original_transaction_id = charge.id
      AND reversal.transaction_type = 'adjustment'
      AND reversal.reference_type = 'charge_reversal'
  ) THEN
    RETURN;
  END IF;

  SELECT * INTO folio
  FROM public.guest_folios
  WHERE id = charge.folio_id
    AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND OR folio.status <> 'open' THEN
    RAISE EXCEPTION 'FOLIO_CLOSED';
  END IF;

  SELECT * INTO package_row
  FROM public.hotel_reservation_packages
  WHERE id = _package_row_id
    AND restaurant_id = _restaurant_id;

  actor := COALESCE(
    _membership_id,
    NULLIF(btrim(COALESCE(current_setting('noru.package_actor_membership_id', true), '')), '')::uuid
  );

  PERFORM public.post_folio_charge_correction(
    _restaurant_id,
    charge.id,
    'reverse_remaining',
    charge.amount,
    'Reverse ' || COALESCE(NULLIF(btrim(package_row.package_name), ''), 'package') || ' package',
    actor,
    'pkgrev' || replace(_package_row_id::text, '-', '')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.hotel_reservation_packages_post_charge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.post_reservation_package_charge(NEW.restaurant_id, NEW.id, NULL);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.hotel_reservation_packages_reverse_charge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.reverse_reservation_package_charge(OLD.restaurant_id, OLD.id, NULL);
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.guest_folios_post_deferred_package_charges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  package_row public.hotel_reservation_packages%ROWTYPE;
BEGIN
  IF NEW.status IS DISTINCT FROM 'open' OR NEW.reservation_id IS NULL THEN
    RETURN NEW;
  END IF;

  FOR package_row IN
    SELECT *
    FROM public.hotel_reservation_packages
    WHERE restaurant_id = NEW.restaurant_id
      AND reservation_id = NEW.reservation_id
    ORDER BY created_at, id
  LOOP
    PERFORM public.post_reservation_package_charge(
      NEW.restaurant_id,
      package_row.id,
      NEW.created_by_membership_id
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hotel_reservation_packages_post_charge ON public.hotel_reservation_packages;
CREATE TRIGGER hotel_reservation_packages_post_charge
  AFTER INSERT ON public.hotel_reservation_packages
  FOR EACH ROW
  EXECUTE FUNCTION public.hotel_reservation_packages_post_charge();

DROP TRIGGER IF EXISTS hotel_reservation_packages_reverse_charge ON public.hotel_reservation_packages;
CREATE TRIGGER hotel_reservation_packages_reverse_charge
  BEFORE DELETE ON public.hotel_reservation_packages
  FOR EACH ROW
  EXECUTE FUNCTION public.hotel_reservation_packages_reverse_charge();

DROP TRIGGER IF EXISTS guest_folios_post_deferred_package_charges ON public.guest_folios;
CREATE TRIGGER guest_folios_post_deferred_package_charges
  AFTER INSERT ON public.guest_folios
  FOR EACH ROW
  EXECUTE FUNCTION public.guest_folios_post_deferred_package_charges();

-- Release still deletes the snapshot. The delete trigger reverses a posted
-- charge first and records the staff member on that reversal.
CREATE OR REPLACE FUNCTION public.release_hotel_reservation_room_package(
  _restaurant_id uuid,
  _reservation_id uuid,
  _package_row_id uuid,
  _membership_id uuid,
  _selected_reservation_room_id uuid DEFAULT NULL,
  _stay_scope boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  package_row public.hotel_reservation_packages%ROWTYPE;
  charge_id uuid;
BEGIN
  SELECT * INTO package_row
  FROM public.hotel_reservation_packages
  WHERE id = _package_row_id
    AND restaurant_id = _restaurant_id
    AND reservation_id = _reservation_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PACKAGE_NOT_FOUND';
  END IF;

  PERFORM public.assert_hotel_reservation_package_mutable(_restaurant_id, _reservation_id);

  IF _selected_reservation_room_id IS NOT NULL OR _stay_scope IS NOT NULL THEN
    IF _selected_reservation_room_id IS NULL THEN
      RAISE EXCEPTION 'ROOM_UNIT_REQUIRED';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.hotel_reservation_rooms AS selected_unit
      WHERE selected_unit.id = _selected_reservation_room_id
        AND selected_unit.restaurant_id = _restaurant_id
        AND selected_unit.reservation_id = _reservation_id
    ) THEN
      RAISE EXCEPTION 'ROOM_UNIT_NOT_FOUND';
    END IF;

    IF package_row.reservation_room_id IS NULL THEN
      IF _stay_scope IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'PACKAGE_STAY_SCOPE_REQUIRED';
      END IF;
    ELSIF package_row.reservation_room_id IS DISTINCT FROM _selected_reservation_room_id THEN
      RAISE EXCEPTION 'PACKAGE_SIBLING_UNIT';
    ELSIF _stay_scope IS TRUE THEN
      RAISE EXCEPTION 'PACKAGE_STAY_SCOPE_REQUIRED';
    END IF;
  END IF;

  SELECT charge.id INTO charge_id
  FROM public.folio_transactions AS charge
  WHERE charge.restaurant_id = _restaurant_id
    AND charge.reference_type = 'reservation_package_charge'
    AND charge.reference_id = package_row.id
    AND charge.transaction_type = 'charge'
  LIMIT 1;

  PERFORM set_config(
    'noru.package_actor_membership_id',
    COALESCE(_membership_id::text, ''),
    true
  );

  DELETE FROM public.hotel_reservation_packages
  WHERE id = package_row.id;

  PERFORM set_config('noru.package_actor_membership_id', '', true);

  INSERT INTO public.hotel_reservation_history (
    restaurant_id, reservation_id, event_type, previous_values, new_values, actor_membership_id
  ) VALUES (
    _restaurant_id,
    _reservation_id,
    'package_removed',
    jsonb_build_object(
      'package_id', package_row.package_id,
      'package_name', package_row.package_name,
      'reservation_room_id', package_row.reservation_room_id,
      'applied_amount', package_row.applied_amount,
      'folio_transaction_id', charge_id
    ),
    jsonb_build_object(
      'package_id', null,
      'reservation_room_id', package_row.reservation_room_id,
      'reversed', charge_id IS NOT NULL
    ),
    _membership_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.post_reservation_package_charge(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reverse_reservation_package_charge(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_reservation_package_charge(uuid, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.reverse_reservation_package_charge(uuid, uuid, uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.release_hotel_reservation_room_package(uuid, uuid, uuid, uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_hotel_reservation_room_package(uuid, uuid, uuid, uuid, uuid, boolean)
  TO service_role;

-- Snapshots saved before this migration have no ledger charge. Post them when
-- the folio is already open. Closed folios are left unchanged.
DO $$
DECLARE
  package_row public.hotel_reservation_packages%ROWTYPE;
BEGIN
  FOR package_row IN
    SELECT snapshot_row.*
    FROM public.hotel_reservation_packages AS snapshot_row
    JOIN public.guest_folios AS folio
      ON folio.restaurant_id = snapshot_row.restaurant_id
     AND folio.reservation_id = snapshot_row.reservation_id
     AND folio.status = 'open'
    WHERE snapshot_row.applied_amount > 0
      AND NOT EXISTS (
        SELECT 1
        FROM public.folio_transactions AS charge
        WHERE charge.restaurant_id = snapshot_row.restaurant_id
          AND charge.reference_type = 'reservation_package_charge'
          AND charge.reference_id = snapshot_row.id
          AND charge.transaction_type = 'charge'
      )
    ORDER BY snapshot_row.created_at, snapshot_row.id
  LOOP
    PERFORM public.post_reservation_package_charge(
      package_row.restaurant_id,
      package_row.id,
      NULL
    );
  END LOOP;
END $$;
