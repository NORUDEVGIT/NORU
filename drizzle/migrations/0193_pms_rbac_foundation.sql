-- PMS RBAC foundation (Phase 1).
-- Dual-lane: byte-identical copies live in
--   supabase/migrations/0193_pms_rbac_foundation.sql
--   drizzle/migrations/0193_pms_rbac_foundation.sql
--
-- Adds multi-role assignments, first-login flag, and reconciles the global
-- permission catalogue. Does not change live require* authorization.
--
-- restaurant_users.hotel_role_id is left in place (legacy Card 7). The new
-- resolver reads pms_membership_roles only.
-- restaurant_users.role / STAFF_ROLES are unchanged. Owner bypass still uses
-- role = 'owner'.
--
-- Do not run both copies against the same database.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.must_change_password IS
  'Identity-level first-login password change. Default false. Not user_metadata.';

ALTER TABLE public.pms_permissions
  DROP CONSTRAINT IF EXISTS pms_permissions_action_check;

ALTER TABLE public.pms_permissions
  ADD CONSTRAINT pms_permissions_action_check CHECK (
    action IN (
      'view',
      'create',
      'edit',
      'delete',
      'cancel',
      'approve',
      'post',
      'refund',
      'export',
      'print',
      'configure',
      'activate',
      'override',
      'authorize',
      'recover',
      'assign_roles',
      'reset_access',
      'assign_permissions'
    )
  );

ALTER TABLE public.pms_permissions
  DROP CONSTRAINT IF EXISTS pms_permissions_code_composed;

ALTER TABLE public.pms_permissions
  ADD CONSTRAINT pms_permissions_code_composed CHECK (
    code = module || '.' || function || '.' || action
    OR (function = action AND code = module || '.' || action)
  );

CREATE TABLE IF NOT EXISTS public.pms_membership_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL,
  role_id uuid NOT NULL,
  assigned_by_membership_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pms_membership_roles_membership_role_unique UNIQUE (membership_id, role_id),
  CONSTRAINT pms_membership_roles_id_restaurant_unique UNIQUE (id, restaurant_id),
  CONSTRAINT pms_membership_roles_membership_fk
    FOREIGN KEY (membership_id, restaurant_id)
    REFERENCES public.restaurant_users (id, restaurant_id)
    ON DELETE CASCADE,
  CONSTRAINT pms_membership_roles_role_fk
    FOREIGN KEY (role_id, restaurant_id)
    REFERENCES public.pms_hotel_roles (id, restaurant_id)
    ON DELETE RESTRICT,
  CONSTRAINT pms_membership_roles_assigned_by_fk
    FOREIGN KEY (assigned_by_membership_id)
    REFERENCES public.restaurant_users (id)
    ON DELETE SET NULL,
  CONSTRAINT pms_membership_roles_assigned_by_tenant_fk
    FOREIGN KEY (assigned_by_membership_id, restaurant_id)
    REFERENCES public.restaurant_users (id, restaurant_id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS pms_membership_roles_restaurant_idx
  ON public.pms_membership_roles(restaurant_id, membership_id);
CREATE INDEX IF NOT EXISTS pms_membership_roles_role_idx
  ON public.pms_membership_roles(restaurant_id, role_id);

COMMENT ON TABLE public.pms_membership_roles IS
  'PMS multi-role assignments. Live RBAC source. hotel_role_id is not used.';
COMMENT ON COLUMN public.pms_membership_roles.assigned_by_membership_id IS
  'Optional actor membership. Same-property composite FK plus SET NULL on delete.';

GRANT SELECT ON public.pms_membership_roles TO authenticated;
GRANT ALL ON public.pms_membership_roles TO service_role;
ALTER TABLE public.pms_membership_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read membership roles" ON public.pms_membership_roles;
CREATE POLICY "Members read membership roles" ON public.pms_membership_roles
  FOR SELECT TO authenticated USING (public.is_restaurant_member(restaurant_id));

INSERT INTO public.pms_permissions (
  code, module, function, action, name, description, sensitive, active
) VALUES
  ('dashboard.view', 'dashboard', 'view', 'view', 'View Dashboard', 'Open the PMS home occupancy snapshot.', false, true),
  ('reservation.reservation.view', 'reservation', 'reservation', 'view', 'View Reservations', 'List and open reservations.', false, true),
  ('reservation.reservation.create', 'reservation', 'reservation', 'create', 'Create Reservation', 'Create a hotel reservation.', false, true),
  ('reservation.reservation.edit', 'reservation', 'reservation', 'edit', 'Edit Reservation', 'Amend, confirm or reactivate a reservation.', false, true),
  ('reservation.reservation.cancel', 'reservation', 'reservation', 'cancel', 'Cancel Reservation', 'Cancel a reservation.', true, true),
  ('reservation.assignment.edit', 'reservation', 'assignment', 'edit', 'Assign / Change Room', 'Assign or change a reservation room.', false, true),
  ('reservation.rate.override', 'reservation', 'rate', 'override', 'Change Stay Rate', 'Reprice an existing reservation.', true, true),
  ('reservation.group.edit', 'reservation', 'group', 'edit', 'Manage Group Reservation', 'Create or amend group reservation blocks.', true, true),
  ('reservation.waitlist.edit', 'reservation', 'waitlist', 'edit', 'Manage Waitlist', 'Create or convert waitlist requests.', true, true),
  ('reservation.overbooking.authorize', 'reservation', 'overbooking', 'authorize', 'Authorize Overbooking', 'Book beyond physical availability.', true, true),
  ('front_office.desk.view', 'front_office', 'desk', 'view', 'View Front Office', 'View arrivals, in-house, departures and the rack.', false, true),
  ('front_office.check_in.create', 'front_office', 'check_in', 'create', 'Check In', 'Complete front-office check-in.', false, true),
  ('front_office.check_out.create', 'front_office', 'check_out', 'create', 'Check Out', 'Complete front-office check-out.', false, true),
  ('front_office.walk_in.create', 'front_office', 'walk_in', 'create', 'Walk-In', 'Start a walk-in stay.', false, true),
  ('front_office.stay.edit', 'front_office', 'stay', 'edit', 'Edit In-House Stay', 'Move rooms, change dates or companions.', false, true),
  ('front_office.no_show.edit', 'front_office', 'no_show', 'edit', 'Mark No-Show', 'Mark a reservation as no-show.', true, true),
  ('front_office.cancel.cancel', 'front_office', 'cancel', 'cancel', 'Cancel In-House Stay', 'Complete the front-office cancel flow.', true, true),
  ('front_office.check_in.override', 'front_office', 'check_in', 'override', 'Waive Check-In Requirements', 'Waive registration, deposit or key at check-in.', true, true),
  ('front_office.fee.override', 'front_office', 'fee', 'override', 'Waive Cancel / No-Show Fee', 'Waive a cancellation or no-show fee.', true, true),
  ('guest.profile.view', 'guest', 'profile', 'view', 'View Guest Profiles', 'Open the guest directory and profiles.', false, true),
  ('guest.profile.create', 'guest', 'profile', 'create', 'Create Guest', 'Create an individual guest profile.', false, true),
  ('guest.profile.edit', 'guest', 'profile', 'edit', 'Edit Guest', 'Update profile, documents, notes or VIP.', false, true),
  ('guest.profile.activate', 'guest', 'profile', 'activate', 'Activate / Deactivate Guest', 'Set a guest profile active or inactive.', false, true),
  ('guest.merge.authorize', 'guest', 'merge', 'authorize', 'Merge / Unmerge Guests', 'Merge or unmerge guest profiles.', true, true),
  ('guest.restriction.authorize', 'guest', 'restriction', 'authorize', 'Restrict / Blacklist Guest', 'Restrict or lift a guest restriction.', true, true),
  ('guest.privacy.export', 'guest', 'privacy', 'export', 'Export Guest Privacy Data', 'Export guest data as JSON.', true, true),
  ('guest.privacy.delete', 'guest', 'privacy', 'delete', 'Anonymise Guest Data', 'Anonymise a guest profile.', true, true),
  ('guest.account.view', 'guest', 'account', 'view', 'View Commercial Accounts', 'View company, travel agency and group masters.', false, true),
  ('guest.account.create', 'guest', 'account', 'create', 'Create Commercial Account', 'Create a company, travel agency or group master.', false, true),
  ('guest.account.edit', 'guest', 'account', 'edit', 'Edit Commercial Account', 'Update a commercial account master.', false, true),
  ('guest.account.activate', 'guest', 'account', 'activate', 'Activate / Deactivate Commercial Account', 'Set a commercial account active or inactive.', false, true),
  ('room.inventory.view', 'room', 'inventory', 'view', 'View Rooms & Inventory', 'View the room board, availability and calendar.', false, true),
  ('room.block.edit', 'room', 'block', 'edit', 'Manage Inventory Blocks', 'Create or release operational inventory blocks.', true, true),
  ('room.restriction.edit', 'room', 'restriction', 'edit', 'Set OOO / OOS / Return to Service', 'Change operational room restrictions.', true, true),
  ('housekeeping.board.view', 'housekeeping', 'board', 'view', 'View Housekeeping', 'View the housekeeping board, rack and history.', false, true),
  ('housekeeping.task.create', 'housekeeping', 'task', 'create', 'Create Housekeeping Task', 'Create a housekeeping task.', false, true),
  ('housekeeping.task.edit', 'housekeeping', 'task', 'edit', 'Update / Assign / Complete Task', 'Assign, start or complete a housekeeping task.', false, true),
  ('housekeeping.task.cancel', 'housekeeping', 'task', 'cancel', 'Cancel Housekeeping Task', 'Cancel a housekeeping task.', false, true),
  ('housekeeping.inspection.edit', 'housekeeping', 'inspection', 'edit', 'Inspect Room', 'Pass or fail a room inspection.', false, true),
  ('maintenance.view', 'maintenance', 'view', 'view', 'View Maintenance', 'View maintenance work orders.', false, true),
  ('maintenance.work_order.create', 'maintenance', 'work_order', 'create', 'Create Work Order', 'Log a maintenance request.', false, true),
  ('maintenance.work_order.edit', 'maintenance', 'work_order', 'edit', 'Update / Start / Complete Work Order', 'Start, complete or reopen a maintenance request.', false, true),
  ('cashiering.folio.view', 'cashiering', 'folio', 'view', 'View Folios & Ledgers', 'View folios, accounts and the cashiering desk.', false, true),
  ('cashiering.charge.post', 'cashiering', 'charge', 'post', 'Post Charge', 'Post a manual or service charge.', false, true),
  ('cashiering.payment.post', 'cashiering', 'payment', 'post', 'Post Payment', 'Post a folio or invoice payment.', false, true),
  ('cashiering.deposit.post', 'cashiering', 'deposit', 'post', 'Post Deposit', 'Post a deposit.', false, true),
  ('cashiering.folio.refund', 'cashiering', 'folio', 'refund', 'Refund', 'Post a folio or account refund.', true, true),
  ('cashiering.adjustment.post', 'cashiering', 'adjustment', 'post', 'Post Adjustment / Correction / Return', 'Correct or reverse a posted amount.', true, true),
  ('cashiering.discount.post', 'cashiering', 'discount', 'post', 'Post Discount', 'Post a folio discount.', true, true),
  ('cashiering.transfer.post', 'cashiering', 'transfer', 'post', 'Transfer', 'Transfer between folios or ledgers.', true, true),
  ('cashiering.write_off.authorize', 'cashiering', 'write_off', 'authorize', 'Write Off', 'Write off a recoverable balance.', true, true),
  ('cashiering.folio.authorize', 'cashiering', 'folio', 'authorize', 'Close Folio / Account', 'Close a folio or financial account.', true, true),
  ('cashiering.allocation.edit', 'cashiering', 'allocation', 'edit', 'Allocate Payments / Deposits', 'Allocate payments or deposits to invoices.', false, true),
  ('cashiering.shift.view', 'cashiering', 'shift', 'view', 'View Cashier Shifts', 'View cashier shifts and drawer activity.', false, true),
  ('cashiering.shift.edit', 'cashiering', 'shift', 'edit', 'Open / Close Own Shift', 'Open or close the caller''s own shift and cash movements.', false, true),
  ('cashiering.shift.authorize', 'cashiering', 'shift', 'authorize', 'Close / Move Another Cashier Shift', 'Close or move another cashier''s drawer.', true, true),
  ('cashiering.invoice.view', 'cashiering', 'invoice', 'view', 'View Invoices', 'View guest, company and group invoices.', false, true),
  ('cashiering.invoice.edit', 'cashiering', 'invoice', 'edit', 'Draft / Edit Invoice', 'Create, update or delete an invoice draft.', false, true),
  ('cashiering.invoice.authorize', 'cashiering', 'invoice', 'authorize', 'Issue / Reprint Invoice', 'Issue or reprint an invoice.', true, true),
  ('fiscal.view', 'fiscal', 'view', 'view', 'View Fiscal Status', 'View fiscal registration status.', false, true),
  ('fiscal.document.authorize', 'fiscal', 'document', 'authorize', 'Register / Retry Fiscal Documents', 'Register or retry fiscal documents.', true, true),
  ('night_audit.run.view', 'night_audit', 'run', 'view', 'View Night Audit', 'View night-audit runs and history.', false, true),
  ('night_audit.run.create', 'night_audit', 'run', 'create', 'Run / Recheck Night Audit', 'Run or refresh night audit.', false, true),
  ('night_audit.exception.edit', 'night_audit', 'exception', 'edit', 'Review Warnings / Exceptions', 'Resolve warnings, exceptions or OTB retry.', false, true),
  ('night_audit.business_date.activate', 'night_audit', 'business_date', 'activate', 'Close Business Date', 'Roll the property business date.', true, true),
  ('night_audit.fiscal.authorize', 'night_audit', 'fiscal', 'authorize', 'Authorize Fiscal Close Override', 'Authorize a night-audit fiscal close override.', true, true),
  ('night_audit.business_date.recover', 'night_audit', 'business_date', 'recover', 'Recover / Adjust Business Date', 'Adjust the property business date outside close-of-day.', true, true),
  ('rates.plan.view', 'rates', 'plan', 'view', 'View Rates', 'View rate plans, categories and the calendar.', false, true),
  ('rates.plan.configure', 'rates', 'plan', 'configure', 'Configure Rate Plans', 'Save rate plans, promotions or packages.', false, true),
  ('rates.plan.activate', 'rates', 'plan', 'activate', 'Activate / Deactivate Rate Plan', 'Activate or deactivate a rate plan.', true, true),
  ('rates.calendar.override', 'rates', 'calendar', 'override', 'Override Calendar Rate', 'Save a daily rate calendar override.', true, true),
  ('rates.restriction.configure', 'rates', 'restriction', 'configure', 'Configure Rate Restrictions', 'Save stay restrictions such as stop-sell.', false, true),
  ('reports.pms.view', 'reports', 'pms', 'view', 'View Reports', 'View PMS operational and financial reports.', false, true),
  ('reports.pms.export', 'reports', 'pms', 'export', 'Export Reports', 'Export a PMS report workbook.', false, true),
  ('configuration.property.view', 'configuration', 'property', 'view', 'View Property Settings', 'Open Property & Business settings.', false, true),
  ('configuration.property.configure', 'configuration', 'property', 'configure', 'Configure Property', 'Save Property & Business settings.', false, true),
  ('configuration.property.activate', 'configuration', 'property', 'activate', 'Activate Property / Go-Live', 'Set the property live.', true, true),
  ('configuration.rooms_ops.view', 'configuration', 'rooms_ops', 'view', 'View Rooms & Operations Settings', 'Open Card 2 rooms and operations settings.', false, true),
  ('configuration.rooms_ops.configure', 'configuration', 'rooms_ops', 'configure', 'Configure Rooms & Operations', 'Save Card 2 rooms, housekeeping and inventory rules.', false, true),
  ('configuration.financial.view', 'configuration', 'financial', 'view', 'View Financial Settings', 'Open financial and commercial settings.', false, true),
  ('configuration.financial.configure', 'configuration', 'financial', 'configure', 'Configure Financial Settings', 'Save currency, tax, payment and billing catalogues.', false, true),
  ('configuration.guest_setup.view', 'configuration', 'guest_setup', 'view', 'View Guest & Services Settings', 'Open guest and services settings.', false, true),
  ('configuration.guest_setup.configure', 'configuration', 'guest_setup', 'configure', 'Configure Guest & Services', 'Save guest profile and service catalogues.', false, true),
  ('configuration.organization.view', 'configuration', 'organization', 'view', 'View Organization Settings', 'Open departments, outlets and facilities settings.', false, true),
  ('configuration.organization.configure', 'configuration', 'organization', 'configure', 'Configure Organization', 'Save departments, outlets and sales masters.', false, true),
  ('configuration.integration.view', 'configuration', 'integration', 'view', 'View Integrations', 'Open connectivity, distribution and fiscal credentials.', false, true),
  ('configuration.integration.configure', 'configuration', 'integration', 'configure', 'Configure Integrations', 'Save integration and fiscal credential settings.', true, true),
  ('administration.staff.view', 'administration', 'staff', 'view', 'View Staff', 'List property staff memberships.', false, true),
  ('administration.staff.create', 'administration', 'staff', 'create', 'Create Staff', 'Create a staff membership.', true, true),
  ('administration.staff.edit', 'administration', 'staff', 'edit', 'Edit Staff Profile', 'Update staff profile fields.', false, true),
  ('administration.staff.activate', 'administration', 'staff', 'activate', 'Activate / Deactivate Staff', 'Activate or deactivate a staff membership.', true, true),
  ('administration.staff.assign_roles', 'administration', 'staff', 'assign_roles', 'Assign Roles to Staff', 'Assign or remove custom roles on a membership.', true, true),
  ('administration.staff.reset_access', 'administration', 'staff', 'reset_access', 'Reset Staff Password / Access', 'Reset a staff member''s sign-in access.', true, true),
  ('administration.roles.view', 'administration', 'roles', 'view', 'View Roles', 'List custom property roles.', false, true),
  ('administration.roles.create', 'administration', 'roles', 'create', 'Create Role', 'Create a custom property role.', true, true),
  ('administration.roles.edit', 'administration', 'roles', 'edit', 'Edit Role Details', 'Rename or describe a custom role.', true, true),
  ('administration.roles.activate', 'administration', 'roles', 'activate', 'Activate / Deactivate Role', 'Activate or deactivate a custom role.', true, true),
  ('administration.roles.assign_permissions', 'administration', 'roles', 'assign_permissions', 'Assign Role Permissions', 'Change the permissions granted by a role.', true, true)
ON CONFLICT (code) DO UPDATE SET
  module = EXCLUDED.module,
  function = EXCLUDED.function,
  action = EXCLUDED.action,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sensitive = EXCLUDED.sensitive,
  active = EXCLUDED.active;

UPDATE public.pms_permissions
SET active = false
WHERE code IN (
  'front_office.check_out.print',
  'reservation.reservation.print',
  'reservation.quote.view',
  'reservation.status.edit',
  'guest.vip.edit',
  'room.image.delete',
  'room.room_type.configure',
  'room.room.configure',
  'room.room_type.activate',
  'room.room.activate',
  'room.amenity.configure',
  'housekeeping.restriction.edit',
  'housekeeping.maintenance.edit',
  'administration.module_access.configure',
  'configuration.security.configure',
  'rates.quote.view'
);
