-- A one-room stay posts its room charge against the reservation, not the room
-- unit. Night and rate amendments already reprice the room, then ask
-- reconcile_reservation_unit_room_charge to replace the live folio line.
-- That lookup only saw a charge tagged with the room unit, so the original
-- line stayed at the old amount.
--
-- The live line is now the room-unit charge, or the reservation-wide charge
-- when this is the only active room. The old line is reversed and the new
-- room total is posted with its tax and service lines. A closed or invoiced
-- folio is still refused before any ledger row is written.

CREATE OR REPLACE FUNCTION public.reservation_unit_live_room_charge(
  _restaurant_id uuid,
  _reservation_id uuid,
  _reservation_room_id uuid
) RETURNS public.folio_transactions
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  target_folio uuid;
  candidate public.folio_transactions%ROWTYPE;
BEGIN
  SELECT id INTO target_folio
  FROM public.guest_folios
  WHERE restaurant_id = _restaurant_id
    AND reservation_id = _reservation_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  FOR candidate IN
    SELECT *
    FROM public.folio_transactions
    WHERE restaurant_id = _restaurant_id
      AND folio_transactions.folio_id = target_folio
      AND transaction_type = 'charge'
      AND category = 'room'
      AND reference_type = 'reservation_room_charge'
      AND (
        reference_id = _reservation_room_id
        OR reservation_room_id = _reservation_room_id
        OR (
          reservation_room_id IS NULL
          AND reference_id = _reservation_id
          AND NOT EXISTS (
            SELECT 1
            FROM public.hotel_reservation_rooms other
            WHERE other.restaurant_id = _restaurant_id
              AND other.reservation_id = _reservation_id
              AND other.id <> _reservation_room_id
              AND COALESCE(other.status, '') NOT IN ('cancelled', 'no_show', 'checked_out')
          )
        )
      )
    ORDER BY
      CASE
        WHEN reference_id = _reservation_room_id OR reservation_room_id = _reservation_room_id THEN 0
        ELSE 1
      END,
      posted_at DESC,
      id DESC
  LOOP
    IF COALESCE(public.correctable_charge_remainder(_restaurant_id, candidate.id), 0) > 0 THEN
      RETURN candidate;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_reservation_unit_room_charge_reconcilable(
  _restaurant_id uuid,
  _reservation_id uuid,
  _reservation_room_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  folio public.guest_folios%ROWTYPE;
  charge public.folio_transactions%ROWTYPE;
BEGIN
  SELECT * INTO folio
  FROM public.guest_folios
  WHERE restaurant_id = _restaurant_id
    AND reservation_id = _reservation_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  charge := public.reservation_unit_live_room_charge(
    _restaurant_id, _reservation_id, _reservation_room_id
  );
  IF charge.id IS NULL THEN
    RETURN;
  END IF;
  IF folio.status <> 'open' THEN
    RAISE EXCEPTION 'FOLIO_CLOSED';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.guest_folio_invoices
    WHERE restaurant_id = _restaurant_id
      AND folio_id = folio.id
  ) THEN
    RAISE EXCEPTION 'CORRECTION_INVOICED';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_reservation_unit_room_charge(
  _restaurant_id uuid,
  _reservation_id uuid,
  _reservation_room_id uuid,
  _membership_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  folio public.guest_folios%ROWTYPE;
  unit public.hotel_reservation_rooms%ROWTYPE;
  charge public.folio_transactions%ROWTYPE;
  remainder numeric(12,2);
  next_amount numeric(12,2);
  previous_room text;
  window_id uuid;
BEGIN
  SELECT * INTO unit
  FROM public.hotel_reservation_rooms
  WHERE id = _reservation_room_id
    AND restaurant_id = _restaurant_id
    AND reservation_id = _reservation_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  next_amount := round(COALESCE(unit.room_subtotal, 0), 2);

  SELECT * INTO folio
  FROM public.guest_folios
  WHERE restaurant_id = _restaurant_id
    AND reservation_id = _reservation_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  charge := public.reservation_unit_live_room_charge(
    _restaurant_id, _reservation_id, _reservation_room_id
  );
  IF charge.id IS NULL THEN
    RETURN;
  END IF;
  remainder := COALESCE(public.correctable_charge_remainder(_restaurant_id, charge.id), 0);
  IF round(remainder, 2) = next_amount THEN
    RETURN;
  END IF;

  PERFORM public.assert_reservation_unit_room_charge_reconcilable(
    _restaurant_id, _reservation_id, _reservation_room_id
  );

  PERFORM public.post_folio_charge_correction(
    _restaurant_id,
    charge.id,
    'reverse_remaining',
    NULL,
    'Reverse room charge',
    _membership_id,
    'rmrev' || replace(charge.id::text, '-', '')
  );

  IF next_amount <= 0 THEN
    RETURN;
  END IF;

  window_id := COALESCE(
    charge.folio_window_id,
    public.ensure_primary_folio_window(_restaurant_id, folio.id)
  );
  previous_room := current_setting('noru.reservation_room_id', true);
  PERFORM set_config('noru.reservation_room_id', _reservation_room_id::text, true);
  BEGIN
    PERFORM public.post_folio_charge_with_tax(
      _restaurant_id,
      folio.id,
      'room',
      'Room charge',
      next_amount,
      'room',
      'reservation_room_charge',
      _reservation_room_id,
      _membership_id,
      window_id,
      'rmrpl' || replace(charge.id::text, '-', ''),
      NULL
    );
    PERFORM set_config('noru.reservation_room_id', COALESCE(previous_room, ''), true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('noru.reservation_room_id', COALESCE(previous_room, ''), true);
    RAISE;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.reservation_unit_live_room_charge(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_reservation_unit_room_charge_reconcilable(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_reservation_unit_room_charge(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservation_unit_live_room_charge(uuid, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.assert_reservation_unit_room_charge_reconcilable(uuid, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_reservation_unit_room_charge(uuid, uuid, uuid, uuid)
  TO service_role;
