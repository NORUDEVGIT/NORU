-- Shared property snapshot for cashiering documents (logo, legal entity, address).

CREATE OR REPLACE FUNCTION public.pms_cashiering_property_snapshot(_restaurant_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'currencyCode', COALESCE(r.currency_code, 'GBP'),
    'legalEntityName', r.legal_entity_name,
    'legalName', r.legal_name,
    'brandName', r.brand_name,
    'tradingName', r.trading_name,
    'vatNumber', r.vat_number,
    'vatRegistered', r.vat_registered,
    'tinNumber', r.tin_number,
    'fullAddress', COALESCE(
      NULLIF(btrim(r.full_address), ''),
      NULLIF(btrim(concat_ws(', ', r.address, r.city, r.postcode, r.country)), '')
    ),
    'phone', r.phone,
    'email', r.email,
    'logoUrl', r.logo_url,
    'displayName', COALESCE(
      NULLIF(btrim(r.trading_name), ''),
      NULLIF(btrim(r.brand_name), ''),
      NULLIF(btrim(r.legal_entity_name), ''),
      NULLIF(btrim(r.legal_name), ''),
      NULLIF(btrim(r.name), ''),
      'Property'
    )
  )
  FROM public.restaurants r
  WHERE r.id = _restaurant_id;
$$;

CREATE OR REPLACE FUNCTION public.pms_merge_invoice_property_snapshot(
  frozen jsonb,
  _restaurant_id uuid
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(frozen, '{}'::jsonb) || (
    SELECT jsonb_build_object(
      'currencyCode', COALESCE(NULLIF(frozen->>'currencyCode', ''), live.currency_code),
      'legalEntityName', COALESCE(frozen->'legalEntityName', to_jsonb(live.legal_entity_name)),
      'legalName', COALESCE(frozen->'legalName', to_jsonb(live.legal_name)),
      'brandName', COALESCE(frozen->'brandName', to_jsonb(live.brand_name)),
      'tradingName', COALESCE(frozen->'tradingName', to_jsonb(live.trading_name)),
      'vatNumber', COALESCE(frozen->'vatNumber', to_jsonb(live.vat_number)),
      'vatRegistered', COALESCE(frozen->'vatRegistered', to_jsonb(live.vat_registered)),
      'tinNumber', COALESCE(frozen->'tinNumber', to_jsonb(live.tin_number)),
      'fullAddress', COALESCE(
        NULLIF(frozen->>'fullAddress', ''),
        NULLIF(btrim(live.full_address), ''),
        NULLIF(btrim(concat_ws(', ', live.address, live.city, live.postcode, live.country)), '')
      ),
      'phone', COALESCE(NULLIF(frozen->>'phone', ''), live.phone),
      'email', COALESCE(NULLIF(frozen->>'email', ''), live.email),
      'logoUrl', COALESCE(NULLIF(frozen->>'logoUrl', ''), live.logo_url),
      'displayName', COALESCE(
        NULLIF(frozen->>'displayName', ''),
        NULLIF(btrim(live.trading_name), ''),
        NULLIF(btrim(live.brand_name), ''),
        NULLIF(btrim(live.legal_entity_name), ''),
        NULLIF(btrim(live.legal_name), ''),
        NULLIF(btrim(live.name), ''),
        'Property'
      )
    )
    FROM public.restaurants live
    WHERE live.id = _restaurant_id
  );
$$;
