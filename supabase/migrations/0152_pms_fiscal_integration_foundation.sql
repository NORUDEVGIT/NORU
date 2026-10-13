-- PMS fiscal integration foundation (P1).
-- Dual-lane: this file and supabase/migrations/0152_pms_fiscal_integration_foundation.sql
-- must stay byte-identical.
--
-- P1 stores configuration, Vault-backed credential references, server-only
-- tokens, mapping tables, and the registration/outbox/attempt model.
-- It does not register invoices, notes, receipts, withholding, or cancellations,
-- and it does not change folio or account ledger behavior.
--
-- Later phases:
--   P2 invoice registration
--   P3 credit and debit notes
--   P4 sales receipts
--   P5 withholding
--   P6 cancellation

ALTER TABLE public.pms_integrations
  DROP CONSTRAINT IF EXISTS pms_integrations_category_check;
ALTER TABLE public.pms_integrations
  ADD CONSTRAINT pms_integrations_category_check CHECK (
    category IN (
      'payments',
      'sms',
      'email',
      'whatsapp',
      'accounting',
      'hospitality',
      'government',
      'distribution',
      'fiscal',
      'other'
    )
  );

-- One fiscal connector per property. Credentials are not stored on this row.
CREATE UNIQUE INDEX IF NOT EXISTS pms_integrations_one_fiscal_per_property
  ON public.pms_integrations (restaurant_id)
  WHERE category = 'fiscal' AND provider = 'erp_fiscal';

-- Pointer to a vault.secrets row. The secret value never lives in this table.
CREATE TABLE IF NOT EXISTS public.fiscal_credential_refs (
  integration_id uuid PRIMARY KEY REFERENCES public.pms_integrations(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  vault_secret_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fiscal_credential_refs_restaurant_idx
  ON public.fiscal_credential_refs (restaurant_id);

COMMENT ON TABLE public.fiscal_credential_refs IS
  'Server-only pointer to a Supabase Vault secret holding the fiscal API username and password. The secret value is not stored here.';

-- Access tokens. Readable by the service role only.
CREATE TABLE IF NOT EXISTS public.fiscal_integration_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL UNIQUE REFERENCES public.pms_integrations(id) ON DELETE CASCADE,
  access_token text NOT NULL DEFAULT '',
  expires_at timestamptz NOT NULL DEFAULT '-infinity',
  refresh_lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fiscal_integration_tokens_restaurant_idx
  ON public.fiscal_integration_tokens (restaurant_id);

COMMENT ON TABLE public.fiscal_integration_tokens IS
  'Server-only fiscal access tokens. Browser roles have no privileges on this table.';

CREATE TABLE IF NOT EXISTS public.fiscal_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL REFERENCES public.pms_integrations(id) ON DELETE CASCADE,
  device_id_snapshot text,
  taxpayer_tin_snapshot text,
  client_snapshot text,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  fiscal_document_type text NOT NULL,
  trnx_id text NOT NULL,
  related_registration_id uuid REFERENCES public.fiscal_registrations(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'NOT_REGISTERED',
  external_irn text,
  external_rrn text,
  external_document_number text,
  external_status text,
  external_id text,
  signed_qr text,
  signed_document text,
  acknowledged_at timestamptz,
  acknowledged_at_raw text,
  registered_at timestamptz,
  cancelled_at timestamptz,
  request_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_hash text,
  response_snapshot jsonb,
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  last_error_code text,
  last_error_message text,
  created_by_membership_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fiscal_registrations_source_type_check CHECK (
    source_type IN (
      'guest_invoice',
      'account_invoice',
      'credit_note',
      'debit_note',
      'guest_allocation',
      'account_allocation',
      'withholding'
    )
  ),
  CONSTRAINT fiscal_registrations_document_type_check CHECK (
    fiscal_document_type IN ('INV', 'CRE', 'DEB', 'SALES_RECEIPT', 'WITHHOLDING')
  ),
  CONSTRAINT fiscal_registrations_status_check CHECK (
    status IN (
      'NOT_REGISTERED',
      'BLOCKED',
      'PENDING',
      'REGISTERED',
      'FAILED',
      'CANCEL_PENDING',
      'CANCELLED'
    )
  ),
  CONSTRAINT fiscal_registrations_trnx_id_check CHECK (length(btrim(trnx_id)) BETWEEN 1 AND 80),
  CONSTRAINT fiscal_registrations_attempt_count_check CHECK (attempt_count >= 0),
  CONSTRAINT fiscal_registrations_restaurant_trnx_unique UNIQUE (restaurant_id, trnx_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS fiscal_registrations_active_source_unique
  ON public.fiscal_registrations (restaurant_id, source_type, source_id, fiscal_document_type)
  WHERE status <> 'CANCELLED';

CREATE UNIQUE INDEX IF NOT EXISTS fiscal_registrations_external_irn_unique
  ON public.fiscal_registrations (external_irn)
  WHERE external_irn IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS fiscal_registrations_external_rrn_unique
  ON public.fiscal_registrations (external_rrn)
  WHERE external_rrn IS NOT NULL;

CREATE INDEX IF NOT EXISTS fiscal_registrations_restaurant_idx
  ON public.fiscal_registrations (restaurant_id);
CREATE INDEX IF NOT EXISTS fiscal_registrations_integration_idx
  ON public.fiscal_registrations (integration_id);
CREATE INDEX IF NOT EXISTS fiscal_registrations_queue_idx
  ON public.fiscal_registrations (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS fiscal_registrations_source_idx
  ON public.fiscal_registrations (source_type, source_id);
CREATE INDEX IF NOT EXISTS fiscal_registrations_related_idx
  ON public.fiscal_registrations (related_registration_id);

COMMENT ON TABLE public.fiscal_registrations IS
  'Fiscal outbox and registration state. P1 does not insert rows from financial events. External IRN and RRN are immutable once set.';

CREATE TABLE IF NOT EXISTS public.fiscal_registration_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL REFERENCES public.fiscal_registrations(id) ON DELETE RESTRICT,
  attempt_number integer NOT NULL,
  endpoint text NOT NULL,
  request_hash text,
  request_body jsonb,
  http_status integer,
  response_body jsonb,
  outcome text NOT NULL,
  error_code text,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  latency_ms integer,
  actor_membership_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fiscal_registration_attempts_outcome_check CHECK (
    outcome IN ('success', 'retryable_error', 'fatal_error', 'timeout')
  ),
  CONSTRAINT fiscal_registration_attempts_number_check CHECK (attempt_number >= 1),
  CONSTRAINT fiscal_registration_attempts_number_unique UNIQUE (registration_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS fiscal_registration_attempts_registration_idx
  ON public.fiscal_registration_attempts (registration_id, created_at);

COMMENT ON TABLE public.fiscal_registration_attempts IS
  'Append-only fiscal API attempts. Payloads must already be redacted. UPDATE and DELETE are rejected.';

CREATE TABLE IF NOT EXISTS public.fiscal_tax_code_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL REFERENCES public.pms_integrations(id) ON DELETE CASCADE,
  pms_tax_id uuid REFERENCES public.pms_taxes(id) ON DELETE CASCADE,
  mapping_kind text NOT NULL DEFAULT 'TAX',
  external_tax_code text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fiscal_tax_code_mappings_kind_check CHECK (mapping_kind IN ('TAX', 'NO_TAX')),
  CONSTRAINT fiscal_tax_code_mappings_code_check CHECK (length(btrim(external_tax_code)) BETWEEN 1 AND 40),
  CONSTRAINT fiscal_tax_code_mappings_target_check CHECK (
    (mapping_kind = 'TAX' AND pms_tax_id IS NOT NULL)
    OR (mapping_kind = 'NO_TAX' AND pms_tax_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS fiscal_tax_code_mappings_tax_unique
  ON public.fiscal_tax_code_mappings (integration_id, pms_tax_id)
  WHERE pms_tax_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS fiscal_tax_code_mappings_no_tax_unique
  ON public.fiscal_tax_code_mappings (integration_id)
  WHERE mapping_kind = 'NO_TAX';

CREATE INDEX IF NOT EXISTS fiscal_tax_code_mappings_integration_idx
  ON public.fiscal_tax_code_mappings (integration_id);

CREATE TABLE IF NOT EXISTS public.fiscal_item_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL REFERENCES public.pms_integrations(id) ON DELETE CASCADE,
  service_type_id uuid,
  department_id uuid,
  charge_source text,
  is_default boolean NOT NULL DEFAULT false,
  external_item_code text NOT NULL,
  external_unit text NOT NULL,
  nature_of_supplies text NOT NULL,
  harmonization_code text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fiscal_item_mappings_classifier_check CHECK (
    (CASE WHEN service_type_id IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN department_id IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN charge_source IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN is_default THEN 1 ELSE 0 END) = 1
  ),
  CONSTRAINT fiscal_item_mappings_charge_source_check CHECK (
    charge_source IS NULL OR charge_source IN (
      'service', 'manual', 'room', 'pos', 'package', 'transfer', 'system'
    )
  ),
  CONSTRAINT fiscal_item_mappings_item_code_check CHECK (length(btrim(external_item_code)) BETWEEN 1 AND 40),
  CONSTRAINT fiscal_item_mappings_unit_check CHECK (length(btrim(external_unit)) BETWEEN 1 AND 20),
  CONSTRAINT fiscal_item_mappings_nature_check CHECK (length(btrim(nature_of_supplies)) BETWEEN 1 AND 40),
  CONSTRAINT fiscal_item_mappings_hs_check CHECK (
    harmonization_code IS NULL OR length(btrim(harmonization_code)) BETWEEN 1 AND 40
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS fiscal_item_mappings_service_unique
  ON public.fiscal_item_mappings (integration_id, service_type_id)
  WHERE service_type_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS fiscal_item_mappings_department_unique
  ON public.fiscal_item_mappings (integration_id, department_id)
  WHERE department_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS fiscal_item_mappings_source_unique
  ON public.fiscal_item_mappings (integration_id, charge_source)
  WHERE charge_source IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS fiscal_item_mappings_default_unique
  ON public.fiscal_item_mappings (integration_id)
  WHERE is_default;

CREATE INDEX IF NOT EXISTS fiscal_item_mappings_integration_idx
  ON public.fiscal_item_mappings (integration_id);

CREATE TABLE IF NOT EXISTS public.fiscal_mode_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL REFERENCES public.pms_integrations(id) ON DELETE CASCADE,
  document_context text NOT NULL,
  external_mode text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fiscal_mode_mappings_context_check CHECK (
    document_context IN (
      'guest_invoice', 'company_invoice', 'group_invoice', 'credit_note', 'debit_note'
    )
  ),
  CONSTRAINT fiscal_mode_mappings_mode_check CHECK (length(btrim(external_mode)) BETWEEN 1 AND 40),
  CONSTRAINT fiscal_mode_mappings_context_unique UNIQUE (integration_id, document_context)
);

CREATE INDEX IF NOT EXISTS fiscal_mode_mappings_integration_idx
  ON public.fiscal_mode_mappings (integration_id);

CREATE TABLE IF NOT EXISTS public.fiscal_buyer_code_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL REFERENCES public.pms_integrations(id) ON DELETE CASCADE,
  mapping_type text NOT NULL,
  internal_value text NOT NULL,
  external_value text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fiscal_buyer_code_mappings_type_check CHECK (
    mapping_type IN ('ID_TYPE', 'CITY', 'REGION', 'ZONE', 'WEREDA')
  ),
  CONSTRAINT fiscal_buyer_code_mappings_internal_check CHECK (length(btrim(internal_value)) BETWEEN 1 AND 80),
  CONSTRAINT fiscal_buyer_code_mappings_external_check CHECK (length(btrim(external_value)) BETWEEN 1 AND 80),
  CONSTRAINT fiscal_buyer_code_mappings_unique UNIQUE (integration_id, mapping_type, internal_value)
);

CREATE INDEX IF NOT EXISTS fiscal_buyer_code_mappings_integration_idx
  ON public.fiscal_buyer_code_mappings (integration_id);

-- Identity and status protection. External IRN/RRN cannot change once set.
CREATE OR REPLACE FUNCTION public.fiscal_registrations_protect()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.external_irn IS NOT NULL AND NEW.external_irn IS DISTINCT FROM OLD.external_irn THEN
    RAISE EXCEPTION 'FISCAL_IRN_IMMUTABLE';
  END IF;
  IF OLD.external_rrn IS NOT NULL AND NEW.external_rrn IS DISTINCT FROM OLD.external_rrn THEN
    RAISE EXCEPTION 'FISCAL_RRN_IMMUTABLE';
  END IF;
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NOT (
      (OLD.status = 'NOT_REGISTERED' AND NEW.status IN ('BLOCKED', 'PENDING'))
      OR (OLD.status = 'BLOCKED' AND NEW.status IN ('PENDING', 'NOT_REGISTERED'))
      OR (OLD.status = 'PENDING' AND NEW.status IN ('REGISTERED', 'FAILED', 'BLOCKED'))
      OR (OLD.status = 'FAILED' AND NEW.status IN ('PENDING', 'BLOCKED'))
      OR (OLD.status = 'REGISTERED' AND NEW.status = 'CANCEL_PENDING')
      OR (OLD.status = 'CANCEL_PENDING' AND NEW.status IN ('CANCELLED', 'REGISTERED'))
    ) THEN
      RAISE EXCEPTION 'FISCAL_STATUS_TRANSITION_INVALID:%:%', OLD.status, NEW.status;
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fiscal_registrations_protect ON public.fiscal_registrations;
CREATE TRIGGER fiscal_registrations_protect
  BEFORE UPDATE ON public.fiscal_registrations
  FOR EACH ROW EXECUTE FUNCTION public.fiscal_registrations_protect();

CREATE OR REPLACE FUNCTION public.fiscal_registration_attempts_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'FISCAL_ATTEMPT_IMMUTABLE';
END;
$$;

DROP TRIGGER IF EXISTS fiscal_registration_attempts_immutable ON public.fiscal_registration_attempts;
CREATE TRIGGER fiscal_registration_attempts_immutable
  BEFORE UPDATE OR DELETE ON public.fiscal_registration_attempts
  FOR EACH ROW EXECUTE FUNCTION public.fiscal_registration_attempts_immutable();

DROP TRIGGER IF EXISTS set_fiscal_credential_refs_updated_at ON public.fiscal_credential_refs;
CREATE TRIGGER set_fiscal_credential_refs_updated_at
  BEFORE UPDATE ON public.fiscal_credential_refs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_fiscal_integration_tokens_updated_at ON public.fiscal_integration_tokens;
CREATE TRIGGER set_fiscal_integration_tokens_updated_at
  BEFORE UPDATE ON public.fiscal_integration_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_fiscal_tax_code_mappings_updated_at ON public.fiscal_tax_code_mappings;
CREATE TRIGGER set_fiscal_tax_code_mappings_updated_at
  BEFORE UPDATE ON public.fiscal_tax_code_mappings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_fiscal_item_mappings_updated_at ON public.fiscal_item_mappings;
CREATE TRIGGER set_fiscal_item_mappings_updated_at
  BEFORE UPDATE ON public.fiscal_item_mappings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_fiscal_mode_mappings_updated_at ON public.fiscal_mode_mappings;
CREATE TRIGGER set_fiscal_mode_mappings_updated_at
  BEFORE UPDATE ON public.fiscal_mode_mappings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_fiscal_buyer_code_mappings_updated_at ON public.fiscal_buyer_code_mappings;
CREATE TRIGGER set_fiscal_buyer_code_mappings_updated_at
  BEFORE UPDATE ON public.fiscal_buyer_code_mappings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Lease a token refresh. Returns the current token when it is still inside
-- the safety window. Otherwise one caller receives needs_refresh = true.
CREATE OR REPLACE FUNCTION public.claim_fiscal_token_refresh(
  _integration_id uuid,
  _restaurant_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  row public.fiscal_integration_tokens%ROWTYPE;
BEGIN
  INSERT INTO public.fiscal_integration_tokens (restaurant_id, integration_id)
  VALUES (_restaurant_id, _integration_id)
  ON CONFLICT (integration_id) DO NOTHING;

  SELECT * INTO row
  FROM public.fiscal_integration_tokens
  WHERE integration_id = _integration_id
  FOR UPDATE;

  IF row.expires_at > now() + interval '5 minutes'
     AND length(row.access_token) > 0 THEN
    RETURN jsonb_build_object(
      'needsRefresh', false,
      'accessToken', row.access_token,
      'expiresAt', row.expires_at
    );
  END IF;

  IF row.refresh_lease_until IS NOT NULL AND row.refresh_lease_until > now() THEN
    RETURN jsonb_build_object(
      'needsRefresh', false,
      'inProgress', true,
      'expiresAt', row.expires_at
    );
  END IF;

  UPDATE public.fiscal_integration_tokens
  SET refresh_lease_until = now() + interval '20 seconds'
  WHERE integration_id = _integration_id
  RETURNING * INTO row;

  RETURN jsonb_build_object(
    'needsRefresh', true,
    'inProgress', false,
    'expiresAt', row.expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_fiscal_token_refresh(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_fiscal_token_refresh(uuid, uuid) TO service_role;

-- Claim queued registrations without two workers taking the same row.
CREATE OR REPLACE FUNCTION public.claim_fiscal_registrations(_limit integer)
RETURNS SETOF public.fiscal_registrations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  lim integer := COALESCE(_limit, 10);
BEGIN
  IF lim < 1 OR lim > 50 THEN
    lim := 10;
  END IF;
  RETURN QUERY
  WITH picked AS (
    SELECT id
    FROM public.fiscal_registrations
    WHERE status IN ('PENDING', 'FAILED')
      AND next_attempt_at IS NOT NULL
      AND next_attempt_at <= now()
      AND attempt_count < 6
    ORDER BY next_attempt_at NULLS FIRST, created_at
    LIMIT lim
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.fiscal_registrations AS registration
  SET next_attempt_at = now() + interval '15 minutes',
      updated_at = now()
  FROM picked
  WHERE registration.id = picked.id
  RETURNING registration.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_fiscal_registrations(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_fiscal_registrations(integer) TO service_role;

ALTER TABLE public.fiscal_credential_refs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_integration_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_registration_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_tax_code_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_item_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_mode_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_buyer_code_mappings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.fiscal_credential_refs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.fiscal_integration_tokens FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.fiscal_registrations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.fiscal_registration_attempts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.fiscal_tax_code_mappings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.fiscal_item_mappings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.fiscal_mode_mappings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.fiscal_buyer_code_mappings FROM PUBLIC, anon, authenticated;

GRANT ALL ON public.fiscal_credential_refs TO service_role;
GRANT ALL ON public.fiscal_integration_tokens TO service_role;
GRANT ALL ON public.fiscal_registrations TO service_role;
GRANT ALL ON public.fiscal_registration_attempts TO service_role;
GRANT ALL ON public.fiscal_tax_code_mappings TO service_role;
GRANT ALL ON public.fiscal_item_mappings TO service_role;
GRANT ALL ON public.fiscal_mode_mappings TO service_role;
GRANT ALL ON public.fiscal_buyer_code_mappings TO service_role;
