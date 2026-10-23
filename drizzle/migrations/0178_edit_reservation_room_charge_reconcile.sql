-- Edit Reservation commercial changes must not leave a posted room charge
-- at the previous amount. When an open folio already has a room charge for
-- the unit, reverse the remaining amount and post the unit room subtotal
-- through post_folio_transaction. A closed or invoiced folio is refused
-- before any ledger row is written.
--
-- folio_transactions_room_charge_once blocked that second post because the
-- reversed row stays in the ledger. Folio open still skips a charge that is
-- already present. This index is only a lookup.

DROP INDEX IF EXISTS public.folio_transactions_room_charge_once;

CREATE INDEX IF NOT EXISTS folio_transactions_room_charge_lookup
  ON public.folio_transactions (restaurant_id, reference_id)
  WHERE reference_type = 'reservation_room_charge'
    AND transaction_type = 'charge';

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
  candidate public.folio_transactions%ROWTYPE;
BEGIN
  SELECT * INTO folio
  FROM public.guest_folios
  WHERE restaurant_id = _restaurant_id
    AND reservation_id = _reservation_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  FOR candidate IN
    SELECT *
    FROM public.folio_transactions
    WHERE restaurant_id = _restaurant_id
      AND folio_id = folio.id
      AND transaction_type = 'charge'
      AND reference_type = 'reservation_room_charge'
      AND (
        reference_id = _reservation_room_id
        OR reservation_room_id = _reservation_room_id
      )
    ORDER BY posted_at DESC, id DESC
  LOOP
    IF COALESCE(public.correctable_charge_remainder(_restaurant_id, candidate.id), 0) > 0 THEN
      charge := candidate;
      EXIT;
    END IF;
  END LOOP;
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
  candidate public.folio_transactions%ROWTYPE;
  remainder numeric(12,2);
  next_amount numeric(12,2);
  previous_room text;
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

  FOR candidate IN
    SELECT *
    FROM public.folio_transactions
    WHERE restaurant_id = _restaurant_id
      AND folio_id = folio.id
      AND transaction_type = 'charge'
      AND reference_type = 'reservation_room_charge'
      AND (
        reference_id = _reservation_room_id
        OR reservation_room_id = _reservation_room_id
      )
    ORDER BY posted_at DESC, id DESC
  LOOP
    remainder := COALESCE(public.correctable_charge_remainder(_restaurant_id, candidate.id), 0);
    IF remainder > 0 THEN
      charge := candidate;
      EXIT;
    END IF;
  END LOOP;

  IF charge.id IS NULL THEN
    RETURN;
  END IF;
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

  previous_room := current_setting('noru.reservation_room_id', true);
  PERFORM set_config('noru.reservation_room_id', _reservation_room_id::text, true);
  BEGIN
    PERFORM public.post_folio_transaction(
      _restaurant_id,
      folio.id,
      'charge',
      'room',
      'Room charge',
      next_amount,
      'reservation_room_charge',
      _reservation_room_id,
      _membership_id,
      NULL,
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

REVOKE ALL ON FUNCTION public.assert_reservation_unit_room_charge_reconcilable(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_reservation_unit_room_charge(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_reservation_unit_room_charge_reconcilable(uuid, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_reservation_unit_room_charge(uuid, uuid, uuid, uuid)
  TO service_role;
