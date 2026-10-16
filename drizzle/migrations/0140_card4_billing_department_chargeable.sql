-- An active billing assignment makes its guest-service type available to Cashiering.
-- Removing or disabling an assignment does not silently turn off a service that a
-- manager may have intentionally marked chargeable.

CREATE OR REPLACE FUNCTION public.enable_service_type_for_billing_department()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.active IS TRUE AND NEW.is_billing_department IS TRUE THEN
    UPDATE public.pms_guest_service_types
    SET chargeable_to_folio = true,
        updated_at = now()
    WHERE id = NEW.service_type_id
      AND restaurant_id = NEW.restaurant_id
      AND chargeable_to_folio IS DISTINCT FROM true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enable_service_type_from_billing_department
  ON public.pms_guest_service_department_assignments;
CREATE TRIGGER enable_service_type_from_billing_department
AFTER INSERT OR UPDATE OF active, is_billing_department, service_type_id
ON public.pms_guest_service_department_assignments
FOR EACH ROW
EXECUTE FUNCTION public.enable_service_type_for_billing_department();

UPDATE public.pms_guest_service_types AS service
SET chargeable_to_folio = true,
    updated_at = now()
WHERE chargeable_to_folio IS DISTINCT FROM true
  AND EXISTS (
    SELECT 1
    FROM public.pms_guest_service_department_assignments AS assignment
    WHERE assignment.restaurant_id = service.restaurant_id
      AND assignment.service_type_id = service.id
      AND assignment.active = true
      AND assignment.is_billing_department = true
  );

REVOKE ALL ON FUNCTION public.enable_service_type_for_billing_department() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enable_service_type_for_billing_department() TO service_role;
