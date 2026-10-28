-- Manual folio charges store the cashier's goods or service choice.
-- Fiscal registration reads it from the frozen charge snapshot.
-- Dual-lane with drizzle/migrations/0186_manual_charge_fiscal_nature.sql.

CREATE OR REPLACE FUNCTION public.post_folio_manual_charge(
  _restaurant_id uuid,
  _folio_id uuid,
  _description text,
  _amount numeric,
  _membership_id uuid,
  _idempotency_key text,
  _nature_of_supplies text
) RETURNS folio_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  txn public.folio_transactions%ROWTYPE;
  nature text := lower(btrim(COALESCE(_nature_of_supplies, '')));
BEGIN
  IF nature NOT IN ('goods', 'service') THEN
    RAISE EXCEPTION 'INVALID_NATURE_OF_SUPPLIES';
  END IF;

  PERFORM set_config('noru.charge_source', 'manual', true);
  PERFORM set_config(
    'noru.charge_snapshot',
    jsonb_build_object(
      'chargeSource', 'manual',
      'departmentName', 'Manual',
      'natureOfSupplies', nature
    )::text,
    true
  );

  BEGIN
    txn := public.post_folio_transaction(
      _restaurant_id,
      _folio_id,
      'charge',
      'manual',
      _description,
      _amount,
      NULL,
      NULL,
      _membership_id,
      NULL,
      _idempotency_key,
      NULL
    );
    PERFORM set_config('noru.charge_source', '', true);
    PERFORM set_config('noru.charge_snapshot', '', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('noru.charge_source', '', true);
    PERFORM set_config('noru.charge_snapshot', '', true);
    RAISE;
  END;

  RETURN txn;
END;
$$;

REVOKE ALL ON FUNCTION public.post_folio_manual_charge(uuid, uuid, text, numeric, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_folio_manual_charge(uuid, uuid, text, numeric, uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.post_folio_manual_charge(uuid, uuid, text, numeric, uuid, text, text) IS
  'Posts a manual folio charge and freezes Nature of supplies as goods or service for fiscal registration.';
