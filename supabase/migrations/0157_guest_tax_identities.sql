-- Reusable fiscal tax identities for an individual guest.
-- A guest may have zero, one, or many identities. This does not create a
-- company profile, a financial account, a company invoice, or a corporate
-- relationship. Buyer details are copied into a fiscal request when that
-- request is first queued. Later edits do not change a stored request.

CREATE TABLE public.guest_tax_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  guest_profile_id uuid NOT NULL,
  legal_name text NOT NULL,
  tin text NOT NULL,
  registration_number text,
  phone text,
  email text,
  city text,
  region text,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by_membership_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guest_tax_identities_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT guest_tax_identities_guest_property
    FOREIGN KEY (guest_profile_id, restaurant_id)
    REFERENCES public.guest_profiles (id, restaurant_id),
  CONSTRAINT guest_tax_identities_membership_property
    FOREIGN KEY (created_by_membership_id, restaurant_id)
    REFERENCES public.restaurant_users (id, restaurant_id),
  CONSTRAINT guest_tax_identities_legal_name_present CHECK (char_length(btrim(legal_name)) > 0),
  CONSTRAINT guest_tax_identities_legal_name_length CHECK (char_length(legal_name) <= 200),
  CONSTRAINT guest_tax_identities_tin_present CHECK (char_length(tin) > 0),
  CONSTRAINT guest_tax_identities_tin_length CHECK (char_length(tin) <= 40),
  CONSTRAINT guest_tax_identities_tin_no_space CHECK (position(' ' in tin) = 0),
  CONSTRAINT guest_tax_identities_registration_length CHECK (
    registration_number IS NULL OR char_length(registration_number) <= 80
  ),
  CONSTRAINT guest_tax_identities_phone_length CHECK (
    phone IS NULL OR char_length(phone) <= 40
  ),
  CONSTRAINT guest_tax_identities_email_length CHECK (
    email IS NULL OR char_length(email) <= 200
  ),
  CONSTRAINT guest_tax_identities_city_length CHECK (
    city IS NULL OR char_length(city) <= 120
  ),
  CONSTRAINT guest_tax_identities_region_length CHECK (
    region IS NULL OR char_length(region) <= 120
  ),
  CONSTRAINT guest_tax_identities_default_is_active CHECK (NOT is_default OR is_active)
);

CREATE UNIQUE INDEX guest_tax_identities_guest_tin_unique
  ON public.guest_tax_identities (restaurant_id, guest_profile_id, tin);
CREATE UNIQUE INDEX guest_tax_identities_one_active_default
  ON public.guest_tax_identities (restaurant_id, guest_profile_id)
  WHERE is_default AND is_active;
CREATE INDEX guest_tax_identities_guest_idx
  ON public.guest_tax_identities (restaurant_id, guest_profile_id, is_active);

CREATE OR REPLACE FUNCTION public.guest_tax_identities_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER guest_tax_identities_set_updated_at
  BEFORE UPDATE ON public.guest_tax_identities
  FOR EACH ROW
  EXECUTE FUNCTION public.guest_tax_identities_touch_updated_at();

CREATE OR REPLACE FUNCTION public.normalize_guest_tin(_tin text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT replace(btrim(COALESCE(_tin, '')), ' ', '');
$$;

CREATE OR REPLACE FUNCTION public.save_guest_tax_identity(
  _restaurant_id uuid,
  _guest_profile_id uuid,
  _identity_id uuid,
  _legal_name text,
  _tin text,
  _registration_number text,
  _phone text,
  _email text,
  _city text,
  _region text,
  _is_default boolean,
  _membership_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  normalized text;
  existing_id uuid;
  existing_active boolean;
  saved_id uuid;
  make_default boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.guest_profiles
    WHERE id = _guest_profile_id
      AND restaurant_id = _restaurant_id
  ) THEN
    RAISE EXCEPTION 'GUEST_NOT_FOUND';
  END IF;

  IF NULLIF(btrim(COALESCE(_legal_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'TAX_IDENTITY_NAME_REQUIRED';
  END IF;

  normalized := public.normalize_guest_tin(_tin);
  IF normalized = '' OR position(' ' in normalized) > 0 THEN
    RAISE EXCEPTION 'TAX_IDENTITY_TIN_REQUIRED';
  END IF;
  IF char_length(normalized) > 40 OR char_length(btrim(_legal_name)) > 200 THEN
    RAISE EXCEPTION 'TAX_IDENTITY_TOO_LONG';
  END IF;

  make_default := COALESCE(_is_default, false);

  PERFORM 1
  FROM public.guest_profiles
  WHERE id = _guest_profile_id
    AND restaurant_id = _restaurant_id
  FOR UPDATE;

  IF _identity_id IS NULL THEN
    SELECT id, is_active
    INTO existing_id, existing_active
    FROM public.guest_tax_identities
    WHERE restaurant_id = _restaurant_id
      AND guest_profile_id = _guest_profile_id
      AND tin = normalized
    FOR UPDATE;

    IF existing_id IS NOT NULL AND existing_active THEN
      RAISE EXCEPTION 'TAX_IDENTITY_TIN_REUSED';
    END IF;

    IF existing_id IS NOT NULL THEN
      UPDATE public.guest_tax_identities
      SET
        legal_name = btrim(_legal_name),
        tin = normalized,
        registration_number = NULLIF(btrim(COALESCE(_registration_number, '')), ''),
        phone = NULLIF(btrim(COALESCE(_phone, '')), ''),
        email = NULLIF(btrim(COALESCE(_email, '')), ''),
        city = NULLIF(btrim(COALESCE(_city, '')), ''),
        region = NULLIF(btrim(COALESCE(_region, '')), ''),
        is_active = true
      WHERE id = existing_id
      RETURNING id INTO saved_id;
    ELSE
      INSERT INTO public.guest_tax_identities (
        restaurant_id,
        guest_profile_id,
        legal_name,
        tin,
        registration_number,
        phone,
        email,
        city,
        region,
        is_default,
        is_active,
        created_by_membership_id
      )
      VALUES (
        _restaurant_id,
        _guest_profile_id,
        btrim(_legal_name),
        normalized,
        NULLIF(btrim(COALESCE(_registration_number, '')), ''),
        NULLIF(btrim(COALESCE(_phone, '')), ''),
        NULLIF(btrim(COALESCE(_email, '')), ''),
        NULLIF(btrim(COALESCE(_city, '')), ''),
        NULLIF(btrim(COALESCE(_region, '')), ''),
        false,
        true,
        _membership_id
      )
      RETURNING id INTO saved_id;
    END IF;
  ELSE
    SELECT id
    INTO existing_id
    FROM public.guest_tax_identities
    WHERE id = _identity_id
      AND restaurant_id = _restaurant_id
      AND guest_profile_id = _guest_profile_id
    FOR UPDATE;

    IF existing_id IS NULL THEN
      RAISE EXCEPTION 'TAX_IDENTITY_NOT_FOUND';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.guest_tax_identities
      WHERE restaurant_id = _restaurant_id
        AND guest_profile_id = _guest_profile_id
        AND tin = normalized
        AND id <> _identity_id
    ) THEN
      RAISE EXCEPTION 'TAX_IDENTITY_TIN_REUSED';
    END IF;

    UPDATE public.guest_tax_identities
    SET
      legal_name = btrim(_legal_name),
      tin = normalized,
      registration_number = NULLIF(btrim(COALESCE(_registration_number, '')), ''),
      phone = NULLIF(btrim(COALESCE(_phone, '')), ''),
      email = NULLIF(btrim(COALESCE(_email, '')), ''),
      city = NULLIF(btrim(COALESCE(_city, '')), ''),
      region = NULLIF(btrim(COALESCE(_region, '')), '')
    WHERE id = _identity_id
    RETURNING id INTO saved_id;
  END IF;

  IF make_default THEN
    UPDATE public.guest_tax_identities
    SET is_default = false
    WHERE restaurant_id = _restaurant_id
      AND guest_profile_id = _guest_profile_id
      AND id <> saved_id
      AND is_default;
    UPDATE public.guest_tax_identities
    SET is_default = true, is_active = true
    WHERE id = saved_id;
  ELSIF _identity_id IS NOT NULL THEN
    UPDATE public.guest_tax_identities
    SET is_default = false
    WHERE id = saved_id
      AND is_default
      AND NOT make_default;
  END IF;

  RETURN jsonb_build_object('id', saved_id);
EXCEPTION
  WHEN unique_violation THEN
    IF SQLERRM ILIKE '%guest_tax_identities_one_active_default%' THEN
      RAISE EXCEPTION 'TAX_IDENTITY_DEFAULT_CONFLICT';
    END IF;
    RAISE EXCEPTION 'TAX_IDENTITY_TIN_REUSED';
END;
$$;

CREATE OR REPLACE FUNCTION public.set_default_guest_tax_identity(
  _restaurant_id uuid,
  _guest_profile_id uuid,
  _identity_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  target_active boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.guest_profiles
    WHERE id = _guest_profile_id
      AND restaurant_id = _restaurant_id
  ) THEN
    RAISE EXCEPTION 'GUEST_NOT_FOUND';
  END IF;

  PERFORM 1
  FROM public.guest_profiles
  WHERE id = _guest_profile_id
    AND restaurant_id = _restaurant_id
  FOR UPDATE;

  SELECT is_active
  INTO target_active
  FROM public.guest_tax_identities
  WHERE id = _identity_id
    AND restaurant_id = _restaurant_id
    AND guest_profile_id = _guest_profile_id
  FOR UPDATE;

  IF target_active IS NULL THEN
    RAISE EXCEPTION 'TAX_IDENTITY_NOT_FOUND';
  END IF;
  IF NOT target_active THEN
    RAISE EXCEPTION 'TAX_IDENTITY_INACTIVE';
  END IF;

  UPDATE public.guest_tax_identities
  SET is_default = false
  WHERE restaurant_id = _restaurant_id
    AND guest_profile_id = _guest_profile_id
    AND id <> _identity_id
    AND is_default;

  UPDATE public.guest_tax_identities
  SET is_default = true
  WHERE id = _identity_id;

  RETURN jsonb_build_object('id', _identity_id);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'TAX_IDENTITY_DEFAULT_CONFLICT';
END;
$$;

CREATE OR REPLACE FUNCTION public.set_guest_tax_identity_active(
  _restaurant_id uuid,
  _guest_profile_id uuid,
  _identity_id uuid,
  _active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  found_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.guest_profiles
    WHERE id = _guest_profile_id
      AND restaurant_id = _restaurant_id
  ) THEN
    RAISE EXCEPTION 'GUEST_NOT_FOUND';
  END IF;

  PERFORM 1
  FROM public.guest_profiles
  WHERE id = _guest_profile_id
    AND restaurant_id = _restaurant_id
  FOR UPDATE;

  SELECT id
  INTO found_id
  FROM public.guest_tax_identities
  WHERE id = _identity_id
    AND restaurant_id = _restaurant_id
    AND guest_profile_id = _guest_profile_id
  FOR UPDATE;

  IF found_id IS NULL THEN
    RAISE EXCEPTION 'TAX_IDENTITY_NOT_FOUND';
  END IF;

  IF COALESCE(_active, false) THEN
    UPDATE public.guest_tax_identities
    SET is_active = true
    WHERE id = _identity_id;
  ELSE
    UPDATE public.guest_tax_identities
    SET is_active = false, is_default = false
    WHERE id = _identity_id;
  END IF;

  RETURN jsonb_build_object('id', _identity_id, 'isActive', COALESCE(_active, false));
END;
$$;

ALTER TABLE public.guest_tax_identities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Guest managers read tax identities" ON public.guest_tax_identities;
CREATE POLICY "Guest managers read tax identities" ON public.guest_tax_identities
  FOR SELECT TO authenticated
  USING (
    public.has_any_restaurant_role(
      restaurant_id,
      ARRAY['owner', 'manager', 'receptionist']
    )
  );

REVOKE ALL ON public.guest_tax_identities FROM PUBLIC, anon;
GRANT SELECT ON public.guest_tax_identities TO authenticated;
GRANT ALL ON public.guest_tax_identities TO service_role;

REVOKE ALL ON FUNCTION public.normalize_guest_tin(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_guest_tin(text) TO service_role;

REVOKE ALL ON FUNCTION public.save_guest_tax_identity(uuid, uuid, uuid, text, text, text, text, text, text, text, boolean, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_guest_tax_identity(uuid, uuid, uuid, text, text, text, text, text, text, text, boolean, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.set_default_guest_tax_identity(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_default_guest_tax_identity(uuid, uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.set_guest_tax_identity_active(uuid, uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_guest_tax_identity_active(uuid, uuid, uuid, boolean) TO service_role;
