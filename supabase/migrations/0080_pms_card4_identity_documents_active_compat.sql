-- Card 4 Phase 3 compatibility for the shared SET3 identity-type catalogue.
-- SET3 only writes name/code/active. Clear the check-in requirement before
-- constraint validation whenever either surface deactivates a document type.

CREATE OR REPLACE FUNCTION public.normalize_pms_guest_id_type_flags()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.active = false THEN
    NEW.required_at_check_in := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_pms_guest_id_type_flags
  ON public.pms_guest_id_types;
CREATE TRIGGER normalize_pms_guest_id_type_flags
  BEFORE INSERT OR UPDATE OF active, required_at_check_in
  ON public.pms_guest_id_types
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_pms_guest_id_type_flags();
