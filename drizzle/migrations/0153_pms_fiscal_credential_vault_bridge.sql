-- The Data API does not expose the vault schema, so a direct
-- vault.create_secret call from the server client returns HTTP 406.
-- These functions run as the database owner and are executable by the
-- service role only. They never return the password to the browser.

CREATE OR REPLACE FUNCTION public.fiscal_store_api_credentials(
  _integration_id uuid,
  _restaurant_id uuid,
  _api_username text,
  _api_password text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault', 'pg_temp'
AS $$
DECLARE
  existing_id uuid;
  created_id uuid;
  payload text;
  username text;
BEGIN
  username := btrim(coalesce(_api_username, ''));
  IF username = '' OR _api_password IS NULL OR btrim(_api_password) = '' THEN
    RAISE EXCEPTION 'FISCAL_CREDENTIALS_MISSING';
  END IF;
  IF length(username) > 200 OR length(_api_password) > 200 THEN
    RAISE EXCEPTION 'FISCAL_MAPPING_INVALID';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.pms_integrations
    WHERE id = _integration_id
      AND restaurant_id = _restaurant_id
      AND category = 'fiscal'
      AND provider = 'erp_fiscal'
  ) THEN
    RAISE EXCEPTION 'FISCAL_CONFIG_MISSING';
  END IF;

  payload := json_build_object(
    'apiUsername', username,
    'apiPassword', _api_password
  )::text;

  SELECT vault_secret_id INTO existing_id
  FROM public.fiscal_credential_refs
  WHERE integration_id = _integration_id;

  IF existing_id IS NOT NULL THEN
    PERFORM vault.update_secret(
      existing_id,
      payload,
      'fiscal-credentials:' || _integration_id::text,
      'NORU fiscal API credentials',
      NULL
    );
    RETURN;
  END IF;

  created_id := vault.create_secret(
    payload,
    'fiscal-credentials:' || _integration_id::text,
    'NORU fiscal API credentials',
    NULL
  );

  INSERT INTO public.fiscal_credential_refs (integration_id, restaurant_id, vault_secret_id)
  VALUES (_integration_id, _restaurant_id, created_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.fiscal_read_api_credentials(_integration_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault', 'pg_temp'
AS $$
DECLARE
  secret_id uuid;
  secret text;
BEGIN
  SELECT vault_secret_id INTO secret_id
  FROM public.fiscal_credential_refs
  WHERE integration_id = _integration_id;
  IF secret_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT decrypted_secret INTO secret
  FROM vault.decrypted_secrets
  WHERE id = secret_id;
  RETURN secret;
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_store_api_credentials(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_store_api_credentials(uuid, uuid, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.fiscal_read_api_credentials(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_read_api_credentials(uuid) TO service_role;
