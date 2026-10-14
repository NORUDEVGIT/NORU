-- Fiscal tax mapping can keep a tax on the source item or emit it as its own item.
-- Existing rows stay SAME_LINE_TAX. This does not change pms_taxes, service charges,
-- or posted folio tax rows.

ALTER TABLE public.fiscal_tax_code_mappings
  ADD COLUMN IF NOT EXISTS fiscal_treatment text NOT NULL DEFAULT 'SAME_LINE_TAX',
  ADD COLUMN IF NOT EXISTS external_item_code text,
  ADD COLUMN IF NOT EXISTS external_unit text,
  ADD COLUMN IF NOT EXISTS nature_of_supplies text,
  ADD COLUMN IF NOT EXISTS harmonization_code text;

ALTER TABLE public.fiscal_tax_code_mappings
  DROP CONSTRAINT IF EXISTS fiscal_tax_code_mappings_treatment_check;
ALTER TABLE public.fiscal_tax_code_mappings
  ADD CONSTRAINT fiscal_tax_code_mappings_treatment_check CHECK (
    fiscal_treatment IN ('SAME_LINE_TAX', 'SEPARATE_ITEM')
  );

ALTER TABLE public.fiscal_tax_code_mappings
  DROP CONSTRAINT IF EXISTS fiscal_tax_code_mappings_separate_item_check;
ALTER TABLE public.fiscal_tax_code_mappings
  ADD CONSTRAINT fiscal_tax_code_mappings_separate_item_check CHECK (
    fiscal_treatment <> 'SEPARATE_ITEM'
    OR (
      mapping_kind = 'TAX'
      AND external_item_code IS NOT NULL
      AND length(btrim(external_item_code)) BETWEEN 1 AND 40
      AND external_unit IS NOT NULL
      AND length(btrim(external_unit)) BETWEEN 1 AND 20
      AND nature_of_supplies IS NOT NULL
      AND length(btrim(nature_of_supplies)) BETWEEN 1 AND 40
      AND (
        harmonization_code IS NULL
        OR length(btrim(harmonization_code)) BETWEEN 1 AND 40
      )
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS fiscal_tax_code_mappings_item_code_unique
  ON public.fiscal_tax_code_mappings (restaurant_id, btrim(external_item_code))
  WHERE external_item_code IS NOT NULL;

COMMENT ON COLUMN public.fiscal_tax_code_mappings.fiscal_treatment IS
  'SAME_LINE_TAX keeps the tax on the source fiscal line. SEPARATE_ITEM emits the frozen tax amount as its own VAT-coded item.';

CREATE OR REPLACE FUNCTION public.allocate_fiscal_item_code(
  _restaurant_id uuid,
  _requested integer DEFAULT NULL,
  _except_mapping_id uuid DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  current_code integer;
  assigned integer;
BEGIN
  INSERT INTO public.fiscal_item_code_counters (restaurant_id, last_code)
  VALUES (_restaurant_id, 1000)
  ON CONFLICT (restaurant_id) DO NOTHING;

  SELECT last_code
  INTO current_code
  FROM public.fiscal_item_code_counters
  WHERE restaurant_id = _restaurant_id
  FOR UPDATE;

  IF current_code IS NULL THEN
    RAISE EXCEPTION 'FISCAL_ITEM_CODE_INVALID';
  END IF;

  IF _requested IS NULL THEN
    assigned := current_code + 1;
    WHILE assigned <= 999999999 AND (
      EXISTS (
        SELECT 1
        FROM public.fiscal_item_mappings
        WHERE restaurant_id = _restaurant_id
          AND btrim(external_item_code) = assigned::text
      ) OR EXISTS (
        SELECT 1
        FROM public.fiscal_tax_code_mappings
        WHERE restaurant_id = _restaurant_id
          AND external_item_code IS NOT NULL
          AND btrim(external_item_code) = assigned::text
      )
    ) LOOP
      assigned := assigned + 1;
    END LOOP;
    IF assigned > 999999999 THEN
      RAISE EXCEPTION 'FISCAL_ITEM_CODE_INVALID';
    END IF;
    UPDATE public.fiscal_item_code_counters
    SET last_code = assigned,
        updated_at = now()
    WHERE restaurant_id = _restaurant_id;
    RETURN assigned;
  END IF;

  IF _requested < 1001 OR _requested > 999999999 THEN
    RAISE EXCEPTION 'FISCAL_ITEM_CODE_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.fiscal_item_mappings
    WHERE restaurant_id = _restaurant_id
      AND btrim(external_item_code) = _requested::text
      AND (_except_mapping_id IS NULL OR id <> _except_mapping_id)
  ) OR EXISTS (
    SELECT 1
    FROM public.fiscal_tax_code_mappings
    WHERE restaurant_id = _restaurant_id
      AND external_item_code IS NOT NULL
      AND btrim(external_item_code) = _requested::text
      AND (_except_mapping_id IS NULL OR id <> _except_mapping_id)
  ) THEN
    RAISE EXCEPTION 'FISCAL_ITEM_CODE_USED';
  END IF;

  IF _requested > current_code THEN
    UPDATE public.fiscal_item_code_counters
    SET last_code = _requested,
        updated_at = now()
    WHERE restaurant_id = _restaurant_id;
  END IF;

  RETURN _requested;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_fiscal_item_code(uuid, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_fiscal_item_code(uuid, integer, uuid) TO service_role;
