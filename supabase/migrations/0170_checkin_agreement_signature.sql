-- B04 — registration agreement versions and signed check-in instances.
-- Property Setup owns the version text. Front Office owns the signed instance.
-- A version's label and text freeze once an instance points at it.
-- A signed instance cannot be updated or deleted. Re-sign inserts a new row.
-- No signature backfill. Existing stays stay unsigned.
-- Dual-lane with drizzle/migrations/0170_checkin_agreement_signature.sql.
-- Do not apply from an agent.

CREATE TABLE IF NOT EXISTS public.pms_registration_agreement_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  version_label text NOT NULL,
  body text NOT NULL,
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_membership_id uuid,
  CONSTRAINT pms_registration_agreement_versions_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_registration_agreement_versions_label_unique UNIQUE (restaurant_id, version_label),
  CONSTRAINT pms_registration_agreement_versions_label_length CHECK (
    char_length(btrim(version_label)) BETWEEN 1 AND 80
  ),
  CONSTRAINT pms_registration_agreement_versions_body_length CHECK (
    char_length(body) BETWEEN 1 AND 20000
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS pms_registration_agreement_versions_one_active
  ON public.pms_registration_agreement_versions (restaurant_id)
  WHERE active;

CREATE TABLE IF NOT EXISTS public.fo_checkin_agreement_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  agreement_version_id uuid NOT NULL,
  reservation_id uuid NOT NULL,
  reservation_room_id uuid,
  guest_id uuid NOT NULL,
  acknowledgements jsonb NOT NULL DEFAULT '{}'::jsonb,
  signed_at timestamptz,
  captured_by_membership_id uuid,
  signature_storage_path text,
  signature_method text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_membership_id uuid,
  CONSTRAINT fo_checkin_agreement_instances_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT fo_checkin_agreement_instances_version_property
    FOREIGN KEY (agreement_version_id, restaurant_id)
    REFERENCES public.pms_registration_agreement_versions (id, restaurant_id),
  CONSTRAINT fo_checkin_agreement_instances_reservation_property
    FOREIGN KEY (reservation_id, restaurant_id)
    REFERENCES public.hotel_reservations (id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT fo_checkin_agreement_instances_room_property
    FOREIGN KEY (reservation_room_id, restaurant_id)
    REFERENCES public.hotel_reservation_rooms (id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT fo_checkin_agreement_instances_guest_property
    FOREIGN KEY (guest_id, restaurant_id)
    REFERENCES public.guest_profiles (id, restaurant_id),
  CONSTRAINT fo_checkin_agreement_instances_ack_object CHECK (
    jsonb_typeof(acknowledgements) = 'object'
  ),
  CONSTRAINT fo_checkin_agreement_instances_signature_pair CHECK (
    (
      signed_at IS NULL
      AND captured_by_membership_id IS NULL
      AND signature_storage_path IS NULL
      AND signature_method IS NULL
    )
    OR (
      signed_at IS NOT NULL
      AND captured_by_membership_id IS NOT NULL
      AND signature_storage_path IS NOT NULL
      AND signature_method = 'drawn'
    )
  ),
  CONSTRAINT fo_checkin_agreement_instances_path_length CHECK (
    signature_storage_path IS NULL OR char_length(signature_storage_path) BETWEEN 1 AND 500
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS fo_checkin_agreement_instances_one_open
  ON public.fo_checkin_agreement_instances (
    restaurant_id, reservation_id, reservation_room_id, agreement_version_id
  )
  NULLS NOT DISTINCT
  WHERE signed_at IS NULL;

CREATE INDEX IF NOT EXISTS fo_checkin_agreement_instances_signed_idx
  ON public.fo_checkin_agreement_instances (
    restaurant_id, reservation_id, reservation_room_id, signed_at DESC
  );

CREATE OR REPLACE FUNCTION public.pms_registration_agreement_versions_freeze()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.fo_checkin_agreement_instances
    WHERE agreement_version_id = OLD.id
      AND restaurant_id = OLD.restaurant_id
  ) THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'AGREEMENT_VERSION_IMMUTABLE';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id
    OR NEW.version_label IS DISTINCT FROM OLD.version_label
    OR NEW.body IS DISTINCT FROM OLD.body
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.created_by_membership_id IS DISTINCT FROM OLD.created_by_membership_id
  THEN
    RAISE EXCEPTION 'AGREEMENT_VERSION_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pms_registration_agreement_versions_freeze
  ON public.pms_registration_agreement_versions;

CREATE TRIGGER pms_registration_agreement_versions_freeze
  BEFORE UPDATE OR DELETE ON public.pms_registration_agreement_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.pms_registration_agreement_versions_freeze();

CREATE OR REPLACE FUNCTION public.fo_checkin_agreement_instances_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  unit_count integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.signed_at IS NOT NULL THEN
      RAISE EXCEPTION 'AGREEMENT_INSTANCE_IMMUTABLE';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.signed_at IS NOT NULL THEN
      RAISE EXCEPTION 'AGREEMENT_INSTANCE_IMMUTABLE';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id
      OR NEW.agreement_version_id IS DISTINCT FROM OLD.agreement_version_id
      OR NEW.reservation_id IS DISTINCT FROM OLD.reservation_id
      OR NEW.reservation_room_id IS DISTINCT FROM OLD.reservation_room_id
      OR NEW.guest_id IS DISTINCT FROM OLD.guest_id
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.created_by_membership_id IS DISTINCT FROM OLD.created_by_membership_id
    THEN
      RAISE EXCEPTION 'AGREEMENT_INSTANCE_IMMUTABLE';
    END IF;
  END IF;

  IF NEW.reservation_room_id IS NULL THEN
    SELECT count(*) INTO unit_count
    FROM public.hotel_reservation_rooms
    WHERE reservation_id = NEW.reservation_id
      AND restaurant_id = NEW.restaurant_id;
    IF unit_count > 0 THEN
      RAISE EXCEPTION 'CHECKIN_AGREEMENT_UNIT_REQUIRED';
    END IF;
  ELSIF NOT EXISTS (
    SELECT 1
    FROM public.hotel_reservation_rooms
    WHERE id = NEW.reservation_room_id
      AND reservation_id = NEW.reservation_id
      AND restaurant_id = NEW.restaurant_id
  ) THEN
    RAISE EXCEPTION 'ROOM_UNIT_NOT_FOUND';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fo_checkin_agreement_instances_guard
  ON public.fo_checkin_agreement_instances;

CREATE TRIGGER fo_checkin_agreement_instances_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.fo_checkin_agreement_instances
  FOR EACH ROW
  EXECUTE FUNCTION public.fo_checkin_agreement_instances_guard();

REVOKE ALL ON FUNCTION public.pms_registration_agreement_versions_freeze() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pms_registration_agreement_versions_freeze() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fo_checkin_agreement_instances_guard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fo_checkin_agreement_instances_guard() TO authenticated, service_role;

ALTER TABLE public.pms_registration_agreement_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Front Office reads registration agreement versions"
  ON public.pms_registration_agreement_versions;
CREATE POLICY "Front Office reads registration agreement versions"
  ON public.pms_registration_agreement_versions FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['owner','manager','receptionist']));

ALTER TABLE public.fo_checkin_agreement_instances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Front Office reads check-in agreement instances"
  ON public.fo_checkin_agreement_instances;
CREATE POLICY "Front Office reads check-in agreement instances"
  ON public.fo_checkin_agreement_instances FOR SELECT TO authenticated
  USING (public.has_any_restaurant_role(restaurant_id, ARRAY['owner','manager','receptionist']));

GRANT SELECT ON public.pms_registration_agreement_versions TO authenticated;
GRANT ALL ON public.pms_registration_agreement_versions TO service_role;
GRANT SELECT ON public.fo_checkin_agreement_instances TO authenticated;
GRANT ALL ON public.fo_checkin_agreement_instances TO service_role;

COMMENT ON TABLE public.pms_registration_agreement_versions IS
  'Property Setup registration agreement text. Label and body freeze once a check-in instance points at the row. A text change is a new version id.';

COMMENT ON TABLE public.fo_checkin_agreement_instances IS
  'Front Office signed registration instance for one room unit. Null reservation_room_id only when the stay has no units. A signed row is immutable. Re-sign inserts a new row.';
