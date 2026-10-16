-- AIOS-02: provider-neutral external reservation identity.
-- Unique key: restaurant_id + provider + hotel_code + channel + external_booking_id.
-- cm_booking_id is optional and is not part of the key.
-- hotel_reservations.external_reference stays free text and is not this key.
-- The reservation foreign key includes restaurant_id, so a mapping cannot point
-- at another property's reservation.
-- distribution_logs is unchanged. It has no direction, provider, text booking id,
-- attempt count, or retry flag, and its payload_summary could hold a webhook body.
-- pms_distribution_sync_events is the narrow technical log. It has no payload,
-- credential, or card column.
-- OTA amount and sell-rate snapshot stays deferred to AIOS-05.
-- Dual-lane: byte-identical copies. Do not apply from an agent.

CREATE TABLE public.pms_external_reservation_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  provider text NOT NULL,
  hotel_code text NOT NULL,
  channel text NOT NULL,
  external_booking_id text NOT NULL,
  cm_booking_id text,
  reservation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_external_reservation_mappings_provider_check
    CHECK (provider = 'aiosell'),
  CONSTRAINT pms_external_reservation_mappings_hotel_code_check
    CHECK (char_length(hotel_code) > 0),
  CONSTRAINT pms_external_reservation_mappings_channel_check
    CHECK (char_length(channel) > 0),
  CONSTRAINT pms_external_reservation_mappings_booking_id_check
    CHECK (char_length(external_booking_id) > 0),
  CONSTRAINT pms_external_reservation_mappings_id_restaurant_unique
    UNIQUE (id, restaurant_id),
  CONSTRAINT pms_external_reservation_mappings_identity_unique
    UNIQUE (restaurant_id, provider, hotel_code, channel, external_booking_id),
  CONSTRAINT pms_external_reservation_mappings_reservation_same_property
    FOREIGN KEY (reservation_id, restaurant_id)
    REFERENCES public.hotel_reservations (id, restaurant_id)
    ON DELETE CASCADE
);

CREATE INDEX pms_external_reservation_mappings_reservation_idx
  ON public.pms_external_reservation_mappings (reservation_id);

CREATE INDEX pms_external_reservation_mappings_property_provider_idx
  ON public.pms_external_reservation_mappings (restaurant_id, provider);

COMMENT ON TABLE public.pms_external_reservation_mappings IS
  'External OTA booking identity. Not hotel_reservations.external_reference. Does not own reservation state.';

GRANT SELECT ON public.pms_external_reservation_mappings TO authenticated;
GRANT ALL ON public.pms_external_reservation_mappings TO service_role;
ALTER TABLE public.pms_external_reservation_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read external reservation mappings"
  ON public.pms_external_reservation_mappings
  FOR SELECT TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );

CREATE TRIGGER set_pms_external_reservation_mappings_updated_at
  BEFORE UPDATE ON public.pms_external_reservation_mappings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.create_external_reservation_mapping(
  _restaurant_id uuid,
  _provider text,
  _hotel_code text,
  _channel text,
  _external_booking_id text,
  _reservation_id uuid,
  _cm_booking_id text DEFAULT NULL
)
RETURNS public.pms_external_reservation_mappings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner uuid;
  created public.pms_external_reservation_mappings;
  existing public.pms_external_reservation_mappings;
BEGIN
  IF _provider IS DISTINCT FROM 'aiosell' THEN
    RAISE EXCEPTION 'UNKNOWN_DISTRIBUTION_PROVIDER';
  END IF;
  IF _hotel_code IS NULL OR _hotel_code = ''
     OR _channel IS NULL OR _channel = ''
     OR _external_booking_id IS NULL OR _external_booking_id = '' THEN
    RAISE EXCEPTION 'EXTERNAL_RESERVATION_IDENTITY_INCOMPLETE';
  END IF;

  SELECT reservation.restaurant_id INTO owner
  FROM public.hotel_reservations AS reservation
  WHERE reservation.id = _reservation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND';
  END IF;
  IF owner IS DISTINCT FROM _restaurant_id THEN
    RAISE EXCEPTION 'EXTERNAL_RESERVATION_PROPERTY_MISMATCH';
  END IF;

  INSERT INTO public.pms_external_reservation_mappings (
    restaurant_id, provider, hotel_code, channel, external_booking_id, cm_booking_id, reservation_id
  ) VALUES (
    _restaurant_id, _provider, _hotel_code, _channel, _external_booking_id, _cm_booking_id, _reservation_id
  )
  ON CONFLICT ON CONSTRAINT pms_external_reservation_mappings_identity_unique DO NOTHING
  RETURNING * INTO created;

  IF created.id IS NOT NULL THEN
    RETURN created;
  END IF;

  SELECT * INTO existing
  FROM public.pms_external_reservation_mappings
  WHERE restaurant_id = _restaurant_id
    AND provider = _provider
    AND hotel_code = _hotel_code
    AND channel = _channel
    AND external_booking_id = _external_booking_id;

  IF existing.reservation_id IS DISTINCT FROM _reservation_id THEN
    RAISE EXCEPTION 'EXTERNAL_RESERVATION_CONFLICT';
  END IF;

  RETURN existing;
END;
$$;

REVOKE ALL ON FUNCTION public.create_external_reservation_mapping(uuid, text, text, text, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_external_reservation_mapping(uuid, text, text, text, text, uuid, text) TO service_role;

CREATE TABLE public.pms_distribution_sync_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  provider text NOT NULL,
  direction text NOT NULL,
  channel text,
  external_booking_id text,
  operation text NOT NULL,
  status text NOT NULL,
  response_success boolean,
  response_message text,
  attempt_count integer NOT NULL DEFAULT 1,
  retry_eligible boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_distribution_sync_events_provider_check
    CHECK (provider = 'aiosell'),
  CONSTRAINT pms_distribution_sync_events_direction_check
    CHECK (direction IN ('inbound', 'outbound')),
  CONSTRAINT pms_distribution_sync_events_status_check
    CHECK (status IN ('success', 'failed', 'info')),
  CONSTRAINT pms_distribution_sync_events_attempt_check
    CHECK (attempt_count >= 1),
  CONSTRAINT pms_distribution_sync_events_operation_check
    CHECK (char_length(operation) > 0)
);

CREATE INDEX pms_distribution_sync_events_property_idx
  ON public.pms_distribution_sync_events (restaurant_id, created_at DESC);

COMMENT ON TABLE public.pms_distribution_sync_events IS
  'Technical distribution sync log. No request body, Basic Auth, partner secret, or card material.';

GRANT SELECT ON public.pms_distribution_sync_events TO authenticated;
GRANT ALL ON public.pms_distribution_sync_events TO service_role;
ALTER TABLE public.pms_distribution_sync_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers read distribution sync events"
  ON public.pms_distribution_sync_events
  FOR SELECT TO authenticated
  USING (
    public.has_restaurant_role(restaurant_id, 'owner')
    OR public.has_restaurant_role(restaurant_id, 'manager')
  );
