-- Channel bookings open a folio shell in 0164 and leave the price on the reservation.
-- Post that room price onto the folio when the snapshot is saved.
-- pah false is prepaid on the channel, so the same amount is posted as a payment.
-- pah true stays due for collection at the hotel. A missing pah is not treated as prepaid.
-- An existing room charge is left in place. Check-in will not post that charge again.

CREATE OR REPLACE FUNCTION public.post_channel_reservation_folio(
  _restaurant_id uuid,
  _reservation_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  stay public.hotel_reservations%ROWTYPE;
  folio public.guest_folios%ROWTYPE;
  pay_at_hotel boolean;
  window_id uuid;
  default_group uuid;
  parent public.folio_transactions%ROWTYPE;
  posted numeric(12,2);
  charge_amount numeric(12,2);
  posted_charge boolean := false;
BEGIN
  SELECT * INTO stay
  FROM public.hotel_reservations
  WHERE id = _reservation_id
    AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND OR stay.status IN ('cancelled', 'no_show') THEN
    RETURN;
  END IF;

  SELECT * INTO folio
  FROM public.guest_folios
  WHERE restaurant_id = _restaurant_id
    AND reservation_id = stay.id
  FOR UPDATE;
  IF NOT FOUND OR folio.status <> 'open' THEN
    RETURN;
  END IF;

  SELECT snapshot.pah INTO pay_at_hotel
  FROM public.pms_external_reservation_snapshots AS snapshot
  WHERE snapshot.restaurant_id = _restaurant_id
    AND snapshot.reservation_id = stay.id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.folio_transactions AS line
    WHERE line.restaurant_id = _restaurant_id
      AND line.folio_id = folio.id
      AND line.reference_type = 'reservation_room_charge'
  ) THEN
    charge_amount := COALESCE(stay.room_subtotal, 0);
    IF charge_amount > 0 THEN
      SELECT property.default_room_tax_group_id INTO default_group
      FROM public.restaurants AS property
      WHERE property.id = _restaurant_id;
      window_id := public.ensure_primary_folio_window(_restaurant_id, folio.id);
      parent := public.post_folio_charge_with_tax(
        _restaurant_id,
        folio.id,
        'room',
        'Room charge — reservation ' || stay.confirmation_number,
        charge_amount,
        'room',
        'reservation_room_charge',
        stay.id,
        NULL,
        window_id,
        NULL,
        default_group
      );
      posted_charge := true;
    END IF;
  END IF;

  IF pay_at_hotel IS DISTINCT FROM false OR NOT posted_charge THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.folio_transactions AS line
    WHERE line.restaurant_id = _restaurant_id
      AND line.folio_id = folio.id
      AND line.reference_type = 'external_prepaid'
      AND line.reference_id = stay.id
  ) THEN
    RETURN;
  END IF;

  SELECT COALESCE(sum(line.amount), 0) INTO posted
  FROM public.folio_transactions AS line
  WHERE line.restaurant_id = _restaurant_id
    AND line.folio_id = folio.id
    AND (line.id = parent.id OR line.original_transaction_id = parent.id);

  IF posted <= 0 THEN
    RETURN;
  END IF;

  PERFORM public.post_folio_transaction(
    _restaurant_id,
    folio.id,
    'payment',
    'payment',
    'Prepaid on channel — ' || stay.confirmation_number,
    posted,
    'external_prepaid',
    stay.id,
    NULL,
    'other',
    NULL,
    NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.post_channel_reservation_folio(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_channel_reservation_folio(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.post_channel_folio_from_external_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.post_channel_reservation_folio(NEW.restaurant_id, NEW.reservation_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS post_channel_folio_from_external_snapshot
  ON public.pms_external_reservation_snapshots;

CREATE TRIGGER post_channel_folio_from_external_snapshot
  AFTER INSERT OR UPDATE ON public.pms_external_reservation_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.post_channel_folio_from_external_snapshot();

DO $$
DECLARE
  snapshot_row record;
BEGIN
  FOR snapshot_row IN
    SELECT snapshot.restaurant_id, snapshot.reservation_id
    FROM public.pms_external_reservation_snapshots AS snapshot
    JOIN public.hotel_reservations AS stay
      ON stay.id = snapshot.reservation_id
     AND stay.restaurant_id = snapshot.restaurant_id
    WHERE stay.status NOT IN ('cancelled', 'no_show')
  LOOP
    PERFORM public.post_channel_reservation_folio(
      snapshot_row.restaurant_id,
      snapshot_row.reservation_id
    );
  END LOOP;
END;
$$;
