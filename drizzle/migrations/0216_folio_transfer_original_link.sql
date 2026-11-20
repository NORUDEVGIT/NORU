-- A transfer_in line is posted on the destination folio and points at the
-- source charge, which stays on the other folio. The same-folio foreign key
-- rejected that pointer. Refunds, adjustments, discounts, and transfer_out
-- lines still have to stay on the source folio.

ALTER TABLE public.folio_transactions
  DROP CONSTRAINT IF EXISTS folio_transactions_original_same_folio;

ALTER TABLE public.folio_transactions
  DROP CONSTRAINT IF EXISTS folio_transactions_original_transaction_fkey;

ALTER TABLE public.folio_transactions
  ADD CONSTRAINT folio_transactions_original_transaction_fkey
  FOREIGN KEY (original_transaction_id)
  REFERENCES public.folio_transactions (id);

CREATE OR REPLACE FUNCTION public.folio_transactions_enforce_original_link()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  source_folio uuid;
  source_restaurant uuid;
BEGIN
  IF NEW.original_transaction_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT folio_id, restaurant_id
    INTO source_folio, source_restaurant
  FROM public.folio_transactions
  WHERE id = NEW.original_transaction_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOURCE_NOT_FOUND';
  END IF;

  IF source_restaurant IS DISTINCT FROM NEW.restaurant_id THEN
    RAISE EXCEPTION 'SOURCE_WRONG_PROPERTY';
  END IF;

  IF NEW.transaction_type IS DISTINCT FROM 'transfer_in'
     AND source_folio IS DISTINCT FROM NEW.folio_id THEN
    RAISE EXCEPTION 'SOURCE_NOT_ON_FOLIO';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS folio_transactions_enforce_original_link ON public.folio_transactions;

CREATE TRIGGER folio_transactions_enforce_original_link
  BEFORE INSERT OR UPDATE OF original_transaction_id, folio_id, restaurant_id, transaction_type
  ON public.folio_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.folio_transactions_enforce_original_link();

COMMENT ON FUNCTION public.folio_transactions_enforce_original_link() IS
  'Source link stays in the same property. Only transfer_in may point at a charge on another folio.';
