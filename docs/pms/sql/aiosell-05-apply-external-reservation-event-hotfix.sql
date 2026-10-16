-- AIOS-05 hotfix: replace apply_external_reservation_event only.
-- 0164 is already applied. Do not rerun that migration.
-- Run this file once in the Supabase SQL editor.

CREATE OR REPLACE FUNCTION public.apply_external_reservation_event(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  action text := _payload->>'action';
  property uuid := NULLIF(_payload->>'restaurantId', '')::uuid;
  hotel text := _payload->>'hotelCode';
  channel_key text := _payload->>'channel';
  booking text := _payload->>'bookingId';
  existing_map public.pms_external_reservation_mappings%ROWTYPE;
  reservation public.hotel_reservations%ROWTYPE;
  unit public.hotel_reservation_rooms%ROWTYPE;
  guest_id uuid;
  profile_origin text;
  room jsonb;
  sequence integer := 0;
  nights jsonb;
  room_total numeric(12,2);
  next_number bigint;
  folio_id uuid;
  prop_currency text;
  blocked integer;
BEGIN
  IF _payload ? 'creditCard' OR _payload ? 'cardNumber' OR _payload ? 'cvv' THEN
    RAISE EXCEPTION 'CARD_PAYLOAD_REJECTED';
  END IF;
  IF action NOT IN ('book', 'modify', 'cancel') THEN
    RAISE EXCEPTION 'AIOSELL_ACTION_UNKNOWN';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(property::text || '|' || hotel || '|' || channel_key || '|' || booking));

  SELECT m.* INTO existing_map
  FROM public.pms_external_reservation_mappings AS m
  WHERE m.restaurant_id = property
    AND m.provider = 'aiosell'
    AND m.hotel_code = hotel
    AND m.channel = channel_key
    AND m.external_booking_id = booking;

  IF action = 'book' AND existing_map.id IS NOT NULL THEN
    SELECT stay.* INTO reservation
    FROM public.hotel_reservations AS stay
    WHERE stay.id = existing_map.reservation_id;
    SELECT folio.id INTO folio_id
    FROM public.guest_folios AS folio
    WHERE folio.restaurant_id = property
      AND folio.reservation_id = reservation.id;
    RETURN jsonb_build_object(
      'outcome', 'duplicate',
      'reservationId', reservation.id,
      'confirmationNumber', reservation.confirmation_number,
      'folioId', folio_id
    );
  END IF;

  IF action <> 'book' AND existing_map.id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'not_found', 'reservationId', NULL, 'confirmationNumber', NULL, 'folioId', NULL);
  END IF;

  IF action <> 'book' THEN
    SELECT stay.* INTO reservation
    FROM public.hotel_reservations AS stay
    WHERE stay.id = existing_map.reservation_id
      AND stay.restaurant_id = property
    FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('outcome', 'not_found', 'reservationId', NULL, 'confirmationNumber', NULL, 'folioId', NULL);
    END IF;
    SELECT folio.id INTO folio_id
    FROM public.guest_folios AS folio
    WHERE folio.restaurant_id = property
      AND folio.reservation_id = reservation.id;
  END IF;

  IF action = 'cancel' THEN
    IF reservation.status = 'cancelled' THEN
      RETURN jsonb_build_object(
        'outcome', 'cancel_idempotent',
        'reservationId', reservation.id,
        'confirmationNumber', reservation.confirmation_number,
        'folioId', folio_id
      );
    END IF;
    IF reservation.status NOT IN ('pending', 'confirmed') THEN
      RETURN jsonb_build_object(
        'outcome', 'status_conflict',
        'reservationId', reservation.id,
        'confirmationNumber', reservation.confirmation_number,
        'folioId', folio_id
      );
    END IF;
    SELECT count(*) INTO blocked
    FROM public.hotel_reservation_rooms AS room_row
    WHERE room_row.reservation_id = reservation.id
      AND room_row.status IN ('checked_in', 'checked_out', 'no_show');
    IF blocked > 0 THEN
      RETURN jsonb_build_object(
        'outcome', 'status_conflict',
        'reservationId', reservation.id,
        'confirmationNumber', reservation.confirmation_number,
        'folioId', folio_id
      );
    END IF;
    FOR unit IN
      SELECT room_row.*
      FROM public.hotel_reservation_rooms AS room_row
      WHERE room_row.reservation_id = reservation.id
        AND room_row.status IN ('pending', 'confirmed')
      ORDER BY room_row.unit_sequence
    LOOP
      PERFORM public.cancel_hotel_reservation_unit(
        property, reservation.id, 'Cancelled by OTA via Aiosell', NULL, unit.id
      );
    END LOOP;
    INSERT INTO public.hotel_reservation_history (
      restaurant_id, reservation_id, event_type, new_values
    ) VALUES (
      property, reservation.id, 'external_reservation_cancelled',
      jsonb_build_object('provider', 'aiosell', 'channel', channel_key, 'bookingId', booking, 'action', 'cancel')
    );
    RETURN jsonb_build_object(
      'outcome', 'cancelled',
      'reservationId', reservation.id,
      'confirmationNumber', reservation.confirmation_number,
      'folioId', folio_id
    );
  END IF;

  IF action = 'modify' THEN
    IF reservation.status NOT IN ('pending', 'confirmed') THEN
      RETURN jsonb_build_object(
        'outcome', 'status_conflict',
        'reservationId', reservation.id,
        'confirmationNumber', reservation.confirmation_number,
        'folioId', folio_id
      );
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.pms_external_reservation_snapshots snapshot
      WHERE snapshot.reservation_id = reservation.id
        AND snapshot.state_fingerprint = _payload->>'fingerprint'
    ) THEN
      RETURN jsonb_build_object(
        'outcome', 'modify_idempotent',
        'reservationId', reservation.id,
        'confirmationNumber', reservation.confirmation_number,
        'folioId', folio_id
      );
    END IF;
    SELECT guest.profile_origin INTO profile_origin
    FROM public.guest_profiles guest
    WHERE guest.id = reservation.guest_id;
    IF profile_origin = 'external_provisional' AND NULLIF(_payload #>> '{guest,firstName}', '') IS NOT NULL THEN
      UPDATE public.guest_profiles AS guest
      SET first_name = _payload #>> '{guest,firstName}',
          last_name = COALESCE(NULLIF(_payload #>> '{guest,lastName}', ''), guest.last_name),
          email = COALESCE(NULLIF(_payload #>> '{guest,email}', ''), guest.email),
          phone = COALESCE(NULLIF(_payload #>> '{guest,phone}', ''), guest.phone)
      WHERE guest.id = reservation.guest_id;
    END IF;
    DELETE FROM public.hotel_reservation_rooms AS room_row
    WHERE room_row.reservation_id = reservation.id;
    guest_id := reservation.guest_id;
  ELSE
    INSERT INTO public.guest_profiles (
      restaurant_id, first_name, last_name, email, phone,
      address_line1, city, region, country, postal_code, profile_origin
    ) VALUES (
      property,
      COALESCE(NULLIF(_payload #>> '{guest,firstName}', ''), 'External guest'),
      NULLIF(_payload #>> '{guest,lastName}', ''),
      NULLIF(_payload #>> '{guest,email}', ''),
      NULLIF(_payload #>> '{guest,phone}', ''),
      NULLIF(_payload #>> '{guest,line1}', ''),
      NULLIF(_payload #>> '{guest,city}', ''),
      NULLIF(_payload #>> '{guest,state}', ''),
      NULLIF(_payload #>> '{guest,country}', ''),
      NULLIF(_payload #>> '{guest,zipCode}', ''),
      'external_provisional'
    ) RETURNING id INTO guest_id;

    INSERT INTO public.hotel_reservation_counters (restaurant_id, last_number)
    VALUES (property, 0) ON CONFLICT (restaurant_id) DO NOTHING;
    SELECT counter.last_number INTO next_number
    FROM public.hotel_reservation_counters AS counter
    WHERE counter.restaurant_id = property
    FOR UPDATE;
    next_number := next_number + 1;
    UPDATE public.hotel_reservation_counters AS counter
    SET last_number = next_number, updated_at = now()
    WHERE counter.restaurant_id = property;

    INSERT INTO public.hotel_reservations (
      restaurant_id, guest_id, confirmation_number, arrival_date, departure_date,
      adults, children, room_type_id, status, source, special_requests, currency, reservation_mode
    ) VALUES (
      property, guest_id, 'NR-' || lpad(next_number::text, 6, '0'),
      (_payload->>'checkin')::date, (_payload->>'checkout')::date,
      1, 0, ((_payload->'rooms')->0->>'roomTypeId')::uuid,
      'confirmed', 'future_online', _payload->>'specialRequests',
      _payload #>> '{amount,currency}',
      CASE WHEN jsonb_array_length(_payload->'rooms') > 1 THEN 'group' ELSE 'single' END
    ) RETURNING * INTO reservation;
  END IF;

  IF action = 'modify' THEN
    UPDATE public.hotel_reservations AS stay
    SET arrival_date = (_payload->>'checkin')::date,
        departure_date = (_payload->>'checkout')::date,
        special_requests = _payload->>'specialRequests',
        reservation_mode = CASE WHEN jsonb_array_length(_payload->'rooms') > 1 THEN 'group' ELSE 'single' END,
        currency = _payload #>> '{amount,currency}'
    WHERE stay.id = reservation.id;
  END IF;

  FOR room IN SELECT value FROM jsonb_array_elements(_payload->'rooms')
  LOOP
    sequence := sequence + 1;
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object('date', price->>'date', 'rate', (price->>'sellRate')::numeric, 'source', 'external')
      ORDER BY price->>'date'
    ), '[]'::jsonb)
    INTO nights
    FROM jsonb_array_elements(room->'nights') AS price;
    SELECT COALESCE(sum((price->>'sellRate')::numeric), 0) INTO room_total
    FROM jsonb_array_elements(room->'nights') AS price;
    PERFORM public.assert_reservation_capacity(
      property, (room->>'roomTypeId')::uuid, NULL,
      (_payload->>'checkin')::date, (_payload->>'checkout')::date, NULL
    );
    INSERT INTO public.hotel_reservation_rooms (
      restaurant_id, reservation_id, unit_sequence, room_type_id, room_id,
      arrival_date, departure_date, adults, children, infants, rate_plan_id,
      currency, nightly_rate_snapshot, room_subtotal, priced_at, status
    ) VALUES (
      property, reservation.id, sequence, (room->>'roomTypeId')::uuid, NULL,
      (_payload->>'checkin')::date, (_payload->>'checkout')::date,
      (room->>'adults')::integer, (room->>'children')::integer, 0,
      (room->>'ratePlanId')::uuid, _payload #>> '{amount,currency}',
      nights, room_total, now(), 'confirmed'
    ) RETURNING * INTO unit;
    IF NULLIF(room->>'guestName', '') IS NOT NULL
       AND room->>'guestName' IS DISTINCT FROM COALESCE(NULLIF(_payload #>> '{guest,firstName}', ''), 'External guest') THEN
      INSERT INTO public.guest_profiles (restaurant_id, first_name, profile_origin)
      VALUES (property, room->>'guestName', 'external_provisional')
      RETURNING id INTO guest_id;
      INSERT INTO public.hotel_reservation_room_guests (
        restaurant_id, reservation_id, reservation_room_id, guest_id, is_primary
      ) VALUES (property, reservation.id, unit.id, guest_id, false);
    END IF;
  END LOOP;

  PERFORM public.sync_reservation_room_total(property, reservation.id);
  PERFORM public.assign_reservation_room_guests(property, reservation.id, NULL);

  SELECT property_row.currency_code INTO prop_currency
  FROM public.restaurants AS property_row
  WHERE property_row.id = property;
  IF action = 'book' THEN
    INSERT INTO public.guest_folio_counters (restaurant_id, last_number)
    VALUES (property, 0) ON CONFLICT (restaurant_id) DO NOTHING;
    SELECT counter.last_number INTO next_number
    FROM public.guest_folio_counters AS counter
    WHERE counter.restaurant_id = property
    FOR UPDATE;
    next_number := next_number + 1;
    UPDATE public.guest_folio_counters AS counter
    SET last_number = next_number, updated_at = now()
    WHERE counter.restaurant_id = property;
    INSERT INTO public.guest_folios (
      restaurant_id, guest_id, reservation_id, folio_number, status, currency
    ) VALUES (
      property, reservation.guest_id, reservation.id,
      'FL-' || lpad(next_number::text, 6, '0'), 'open',
      COALESCE(_payload #>> '{amount,currency}', prop_currency, 'GBP')
    ) RETURNING id INTO folio_id;
  END IF;

  INSERT INTO public.pms_external_reservation_snapshots (
    restaurant_id, reservation_id, provider, hotel_code, channel, external_booking_id,
    cm_booking_id, booked_on, segment, special_requests, pah, credit_card_present,
    amount_after_tax, amount_before_tax, tax, currency, commission, tcs, tds,
    guest_first_name, guest_last_name, guest_email, guest_phone,
    guest_address_line1, guest_city, guest_state, guest_country, guest_zip,
    state_fingerprint
  ) VALUES (
    property, reservation.id, 'aiosell', hotel, channel_key, booking,
    NULLIF(_payload->>'cmBookingId', ''), _payload->>'bookedOn', _payload->>'segment',
    _payload->>'specialRequests', (_payload->>'pah')::boolean, COALESCE((_payload->>'creditCardPresent')::boolean, false),
    NULLIF(_payload #>> '{amount,amountAfterTax}', '')::numeric,
    NULLIF(_payload #>> '{amount,amountBeforeTax}', '')::numeric,
    NULLIF(_payload #>> '{amount,tax}', '')::numeric,
    _payload #>> '{amount,currency}',
    NULLIF(_payload #>> '{amount,commission}', '')::numeric,
    NULLIF(_payload #>> '{amount,tcs}', '')::numeric,
    NULLIF(_payload #>> '{amount,tds}', '')::numeric,
    NULLIF(_payload #>> '{guest,firstName}', ''),
    NULLIF(_payload #>> '{guest,lastName}', ''),
    NULLIF(_payload #>> '{guest,email}', ''),
    NULLIF(_payload #>> '{guest,phone}', ''),
    NULLIF(_payload #>> '{guest,line1}', ''),
    NULLIF(_payload #>> '{guest,city}', ''),
    NULLIF(_payload #>> '{guest,state}', ''),
    NULLIF(_payload #>> '{guest,country}', ''),
    NULLIF(_payload #>> '{guest,zipCode}', ''),
    COALESCE(_payload->>'fingerprint', '')
  )
  ON CONFLICT (reservation_id) DO UPDATE SET
    cm_booking_id = COALESCE(EXCLUDED.cm_booking_id, pms_external_reservation_snapshots.cm_booking_id),
    booked_on = EXCLUDED.booked_on,
    segment = EXCLUDED.segment,
    special_requests = EXCLUDED.special_requests,
    pah = EXCLUDED.pah,
    credit_card_present = EXCLUDED.credit_card_present,
    amount_after_tax = EXCLUDED.amount_after_tax,
    amount_before_tax = EXCLUDED.amount_before_tax,
    tax = EXCLUDED.tax,
    currency = EXCLUDED.currency,
    commission = EXCLUDED.commission,
    tcs = EXCLUDED.tcs,
    tds = EXCLUDED.tds,
    guest_first_name = EXCLUDED.guest_first_name,
    guest_last_name = EXCLUDED.guest_last_name,
    guest_email = EXCLUDED.guest_email,
    guest_phone = EXCLUDED.guest_phone,
    guest_address_line1 = EXCLUDED.guest_address_line1,
    guest_city = EXCLUDED.guest_city,
    guest_state = EXCLUDED.guest_state,
    guest_country = EXCLUDED.guest_country,
    guest_zip = EXCLUDED.guest_zip,
    state_fingerprint = EXCLUDED.state_fingerprint,
    updated_at = now();

  IF action = 'book' THEN
    INSERT INTO public.pms_external_reservation_mappings (
      restaurant_id, provider, hotel_code, channel, external_booking_id, cm_booking_id, reservation_id
    ) VALUES (
      property, 'aiosell', hotel, channel_key, booking, NULLIF(_payload->>'cmBookingId', ''), reservation.id
    );
    INSERT INTO public.hotel_reservation_history (
      restaurant_id, reservation_id, event_type, new_values
    ) VALUES (
      property, reservation.id, 'external_reservation_created',
      jsonb_build_object('provider', 'aiosell', 'channel', channel_key, 'bookingId', booking, 'action', 'book')
    );
    RETURN jsonb_build_object(
      'outcome', 'created',
      'reservationId', reservation.id,
      'confirmationNumber', reservation.confirmation_number,
      'folioId', folio_id
    );
  END IF;

  IF NULLIF(_payload->>'cmBookingId', '') IS NOT NULL THEN
    UPDATE public.pms_external_reservation_mappings AS m
    SET cm_booking_id = _payload->>'cmBookingId'
    WHERE m.id = existing_map.id;
  END IF;
  INSERT INTO public.hotel_reservation_history (
    restaurant_id, reservation_id, event_type, new_values
  ) VALUES (
    property, reservation.id, 'external_reservation_modified',
    jsonb_build_object('provider', 'aiosell', 'channel', channel_key, 'bookingId', booking, 'action', 'modify')
  );
  RETURN jsonb_build_object(
    'outcome', 'modified',
    'reservationId', reservation.id,
    'confirmationNumber', reservation.confirmation_number,
    'folioId', folio_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_external_reservation_event(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_external_reservation_event(jsonb) TO service_role;
