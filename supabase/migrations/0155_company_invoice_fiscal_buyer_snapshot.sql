-- Freeze company buyer and charge identity onto a company invoice at issue.
-- Dual-lane: this file and drizzle/migrations/0155_company_invoice_fiscal_buyer_snapshot.sql
-- must stay byte-identical.
--
-- Existing issued invoices are not updated. Amounts, allocations, and the
-- account balance are not changed. The free-text address is not split into
-- Region, Zone, Wereda, Kebele, or HouseNumber.
-- Company credit notes, debit notes, and sales receipts are not implemented.

CREATE OR REPLACE FUNCTION public.freeze_company_invoice_fiscal_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  acct public.financial_accounts%ROWTYPE;
  master public.guest_account_masters%ROWTYPE;
  bill jsonb;
  groups jsonb;
  group_row jsonb;
  enriched_groups jsonb := '[]'::jsonb;
  component jsonb;
  tax_lines jsonb;
  parent_id uuid;
  charge public.folio_transactions%ROWTYPE;
  identity public.folio_transactions%ROWTYPE;
  have_identity boolean;
  tax_charge public.folio_transactions%ROWTYPE;
  tax_identity public.folio_transactions%ROWTYPE;
  have_tax boolean;
BEGIN
  IF NEW.snapshot IS NULL OR jsonb_typeof(NEW.snapshot) <> 'object' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO acct
  FROM public.financial_accounts
  WHERE id = NEW.financial_account_id
    AND restaurant_id = NEW.restaurant_id;
  IF NOT FOUND OR acct.account_kind IS DISTINCT FROM 'company' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO master
  FROM public.guest_account_masters
  WHERE id = acct.master_id
    AND restaurant_id = NEW.restaurant_id;

  bill := COALESCE(NEW.snapshot->'billTo', '{}'::jsonb);
  IF FOUND THEN
    bill := bill || jsonb_build_object(
      'registrationNumber', NULLIF(btrim(COALESCE(master.business_registration_number, '')), ''),
      'city', NULLIF(btrim(COALESCE(master.city, '')), ''),
      'region', NULLIF(btrim(COALESCE(master.region, '')), '')
    );
  END IF;

  groups := NEW.snapshot->'groups';
  IF jsonb_typeof(groups) = 'array' THEN
    FOR group_row IN SELECT value FROM jsonb_array_elements(groups) AS element(value)
    LOOP
      tax_lines := '[]'::jsonb;
      parent_id := NULL;
      IF jsonb_typeof(group_row->'components') = 'array' THEN
        FOR component IN
          SELECT value FROM jsonb_array_elements(group_row->'components') AS component_row(value)
        LOOP
          IF component->>'kind' = 'parent'
            AND parent_id IS NULL
            AND COALESCE(component->>'id', '') ~* '^[0-9a-f-]{36}$'
          THEN
            parent_id := (component->>'id')::uuid;
          ELSIF component->>'kind' = 'tax'
            AND COALESCE(component->>'id', '') ~* '^[0-9a-f-]{36}$'
          THEN
            SELECT * INTO tax_charge
            FROM public.folio_transactions
            WHERE id = (component->>'id')::uuid
              AND restaurant_id = NEW.restaurant_id;
            have_tax := FOUND;
            tax_identity := tax_charge;
            IF have_tax
              AND tax_charge.transaction_type = 'transfer_in'
              AND tax_charge.original_transaction_id IS NOT NULL
            THEN
              SELECT * INTO tax_identity
              FROM public.folio_transactions
              WHERE id = tax_charge.original_transaction_id
                AND restaurant_id = NEW.restaurant_id;
              IF NOT FOUND THEN
                tax_identity := tax_charge;
              END IF;
            END IF;
            tax_lines := tax_lines || jsonb_build_array(jsonb_build_object(
              'id', component->>'id',
              'description', component->>'description',
              'amount', component->'amount',
              'name', CASE
                WHEN have_tax THEN COALESCE(tax_identity.tax_snapshot->>'name', component->>'description')
                ELSE component->>'description'
              END,
              'taxSnapshot', CASE
                WHEN have_tax THEN tax_identity.tax_snapshot
                ELSE NULL
              END
            ));
          END IF;
        END LOOP;
      END IF;

      have_identity := false;
      IF parent_id IS NOT NULL THEN
        SELECT * INTO charge
        FROM public.folio_transactions
        WHERE id = parent_id
          AND restaurant_id = NEW.restaurant_id;
        IF FOUND THEN
          identity := charge;
          have_identity := true;
          IF charge.transaction_type = 'transfer_in'
            AND charge.original_transaction_id IS NOT NULL
          THEN
            SELECT * INTO identity
            FROM public.folio_transactions
            WHERE id = charge.original_transaction_id
              AND restaurant_id = NEW.restaurant_id;
            IF NOT FOUND THEN
              identity := charge;
            END IF;
          END IF;
        END IF;
      END IF;

      IF have_identity THEN
        group_row := group_row || jsonb_build_object(
          'chargeSource', to_jsonb(identity.charge_source),
          'chargeSnapshot', COALESCE(identity.charge_snapshot, 'null'::jsonb),
          'taxLines', tax_lines
        );
      ELSE
        group_row := group_row || jsonb_build_object('taxLines', tax_lines);
      END IF;
      enriched_groups := enriched_groups || jsonb_build_array(group_row);
    END LOOP;
    NEW.snapshot := jsonb_set(NEW.snapshot, '{groups}', enriched_groups, true);
  END IF;

  NEW.snapshot := jsonb_set(NEW.snapshot, '{billTo}', bill, true);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS financial_account_invoices_freeze_fiscal_identity_trg
  ON public.financial_account_invoices;
CREATE TRIGGER financial_account_invoices_freeze_fiscal_identity_trg
  BEFORE INSERT ON public.financial_account_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.freeze_company_invoice_fiscal_identity();

REVOKE ALL ON FUNCTION public.freeze_company_invoice_fiscal_identity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.freeze_company_invoice_fiscal_identity() TO service_role;

COMMENT ON FUNCTION public.freeze_company_invoice_fiscal_identity() IS
  'On company invoice insert, copy registration number, city, region, charge identity, and tax identity into the snapshot. Does not update existing invoices or ledger amounts.';
