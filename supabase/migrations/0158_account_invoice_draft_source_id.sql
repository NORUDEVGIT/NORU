-- Saving a company invoice draft selected source_id both as a PL/pgSQL
-- variable and as the unnest column. Postgres then reports
-- column reference "source_id" is ambiguous. Guest drafts already alias
-- the unnest row. This replaces only that insert.

CREATE OR REPLACE FUNCTION public.update_financial_account_invoice_draft(
  _restaurant_id uuid,
  _draft_id uuid,
  _notes text,
  _source_ids uuid[],
  _membership_id uuid
) RETURNS public.financial_account_invoice_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  draft public.financial_account_invoice_drafts%ROWTYPE;
  source_id uuid;
  resolved jsonb;
  clean_notes text := NULLIF(btrim(COALESCE(_notes, '')), '');
BEGIN
  IF clean_notes IS NOT NULL AND char_length(clean_notes) > 500 THEN
    RAISE EXCEPTION 'NOTES_TOO_LONG';
  END IF;
  SELECT * INTO draft FROM public.financial_account_invoice_drafts
  WHERE id = _draft_id AND restaurant_id = _restaurant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCOUNT_INVOICE_DRAFT_NOT_FOUND';
  END IF;

  FOREACH source_id IN ARRAY COALESCE(_source_ids, ARRAY[]::uuid[]) LOOP
    resolved := public.resolve_account_invoice_group(_restaurant_id, draft.financial_account_id, source_id);
    IF COALESCE((resolved->>'ok')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION '%', COALESCE(resolved->>'code', 'ACCOUNT_CHARGE_NOT_INVOICEABLE');
    END IF;
  END LOOP;

  UPDATE public.financial_account_invoice_drafts
  SET notes = clean_notes,
      updated_by_membership_id = _membership_id,
      updated_at = now()
  WHERE id = draft.id
  RETURNING * INTO draft;

  DELETE FROM public.financial_account_invoice_draft_items WHERE draft_id = draft.id;
  INSERT INTO public.financial_account_invoice_draft_items (draft_id, source_group_id)
  SELECT draft.id, selected.source_group_id
  FROM unnest(COALESCE(_source_ids, ARRAY[]::uuid[])) AS selected(source_group_id);

  INSERT INTO public.financial_account_invoice_events (
    restaurant_id, financial_account_id, event_type, actor_membership_id, new_values
  ) VALUES (
    _restaurant_id, draft.financial_account_id, 'invoice_draft_updated', _membership_id,
    jsonb_build_object('draft_id', draft.id, 'source_count', COALESCE(array_length(_source_ids, 1), 0))
  );
  RETURN draft;
END;
$$;
