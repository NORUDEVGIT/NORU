-- Drop inventory-rule flags that nothing reads.
-- Availability, assignment, and room move already apply their own rules.
-- The duplicate housekeeping and maintenance flags are not the ones eligibility uses.
-- Do not apply this from an agent. Apply it with the code that stops writing these columns.
-- Applying it first makes an older save fail because those columns no longer exist.

ALTER TABLE public.pms_inventory_rules
  DROP CONSTRAINT IF EXISTS pms_inventory_rules_assignment_mode_check,
  DROP CONSTRAINT IF EXISTS pms_inventory_rules_move_off_check;

ALTER TABLE public.pms_inventory_rules
  DROP COLUMN IF EXISTS operational_availability_required,
  DROP COLUMN IF EXISTS housekeeping_readiness_required,
  DROP COLUMN IF EXISTS maintenance_clear_required,
  DROP COLUMN IF EXISTS room_block_removes_inventory,
  DROP COLUMN IF EXISTS out_of_order_removes_inventory,
  DROP COLUMN IF EXISTS out_of_service_removes_inventory,
  DROP COLUMN IF EXISTS automatic_assignment_allowed,
  DROP COLUMN IF EXISTS manual_assignment_allowed,
  DROP COLUMN IF EXISTS room_move_allowed,
  DROP COLUMN IF EXISTS room_type_change_allowed,
  DROP COLUMN IF EXISTS rate_recalculation_required,
  DROP COLUMN IF EXISTS move_approval_required,
  DROP COLUMN IF EXISTS move_reason_required,
  DROP COLUMN IF EXISTS inventory_recalculation_required,
  DROP COLUMN IF EXISTS housekeeping_update_required,
  DROP COLUMN IF EXISTS maintenance_validation_required;
