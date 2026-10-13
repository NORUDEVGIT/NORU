-- Sequential fiscal item codes (Phase 2 refinement).
-- Dual-lane: this file and supabase/migrations/0154_fiscal_item_code_sequence.sql
-- must stay byte-identical.
--
-- Allocates a stable numeric ItemCode per property, starting at 1001.
-- The counter row is locked with SELECT ... FOR UPDATE so two concurrent
-- assignments cannot receive the same code. Retired codes are not reused.
-- external_unit, nature_of_supplies, and fiscal_mode_mappings stay in place.
-- This migration does not post charges, payments, or allocations.
-- Sales receipts, credit notes, and debit notes are not implemented here.

CREATE TABLE IF NOT EXISTS public.fiscal_item_code_counters (
  restaurant_id uuid PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  last_code integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fiscal_item_code_counters_last_code_check CHECK (last_code >= 1000)
);

COMMENT ON TABLE public.fiscal_item_code_counters IS
  'Monotonic fiscal ItemCode counter per property. last_code starts at 1000 so the first allocation is 1001. The counter only moves forward.';

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

ALTER TABLE public.fiscal_item_code_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fiscal_item_code_counters FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.fiscal_item_code_counters TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS fiscal_item_mappings_property_code_unique
  ON public.fiscal_item_mappings (restaurant_id, btrim(external_item_code))
  WHERE active;
