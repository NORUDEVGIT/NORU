-- PMS Property Setup Card 7 — global permission catalogue seed (Phase 1).
--
-- Sequential after 0084. Dual-lane: byte-identical copies live in
--   supabase/migrations/0085_pms_card7_permission_catalogue.sql
--   drizzle/migrations/0085_pms_card7_permission_catalogue.sql
--
-- IN THE PR ONLY — do not apply to production from an agent.
-- APPLY AFTER MERGE — wait for PM approval of this SQL before apply.
--
-- Apply (do not run against production from an agent):
--   psql "$DATABASE_URL" -f drizzle/migrations/0085_pms_card7_permission_catalogue.sql
--   or the project's usual drizzle / Supabase migration apply path.
--   Do not run both copies against the same database.
--
-- Rollback:
--   DELETE FROM public.pms_permissions
--     WHERE code IN (
--       -- the 88 seeded codes below
--     );
--   ALTER TABLE public.pms_permissions DROP CONSTRAINT IF EXISTS pms_permissions_action_check;
--   ALTER TABLE public.pms_permissions ADD CONSTRAINT pms_permissions_action_check CHECK (
--     action IN ('view', 'create', 'update', 'delete', 'approve', 'override')
--   );
--
-- Scope fence — this migration explicitly does NOT touch:
--   restaurant_users.role / STAFF_ROLES
--   public.has_restaurant_role / public.is_restaurant_member
--   staff_module_access
--   existing RLS policies on operational tables
--   pms_hotel_roles / pms_role_permissions / pms_approval_rules rows
--   restaurant_users.hotel_role_id
--   restaurants.pms_property_setup_status / pms_set1_live
--   audit, reports, data-import tables
--   no approve seed rows (action remains in CHECK only)
--   no folio void/reopen, report export/schedule, Card 7 Audit/Reports/Import,
--     F&B till, inventory, or procurement permissions
--
-- Global catalogue only. No restaurant_id. Authenticated SELECT already granted in 0084.
-- Tenant writes remain denied. Live authz is unchanged.

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
      'authorize'
    )
  );

COMMENT ON CONSTRAINT pms_permissions_action_check ON public.pms_permissions IS
  'Card 7 approved verbs. edit replaces update. approve is reserved; 0085 seeds no approve rows.';

INSERT INTO public.pms_permissions (
  code, module, function, action, name, description, sensitive, active
) VALUES
  ('front_office.desk.view', 'front_office', 'desk', 'view', 'View front office desk', 'View arrivals, in-house, departures, occupancy and exceptions.', false, true),
  ('front_office.check_in.create', 'front_office', 'check_in', 'create', 'Complete check-in', 'Complete the front-office check-in flow.', false, true),
  ('front_office.check_in.override', 'front_office', 'check_in', 'override', 'Waive check-in steps', 'Waive registration, deposit or key at check-in.', true, true),
  ('front_office.check_out.create', 'front_office', 'check_out', 'create', 'Complete check-out', 'Complete the front-office check-out flow.', false, true),
  ('front_office.check_out.override', 'front_office', 'check_out', 'override', 'Override checkout settlement', 'Leave the folio open or override settlement at check-out.', true, true),
  ('front_office.check_out.print', 'front_office', 'check_out', 'print', 'Print checkout document', 'Print or email the checkout document.', false, true),
  ('front_office.walk_in.create', 'front_office', 'walk_in', 'create', 'Create walk-in', 'Start a walk-in stay and check-in.', false, true),
  ('front_office.stay.edit', 'front_office', 'stay', 'edit', 'Edit in-house stay', 'Move rooms, change dates, companions, upgrades or stay services.', false, true),
  ('front_office.no_show.edit', 'front_office', 'no_show', 'edit', 'Mark no-show', 'Mark a reservation as no-show.', false, true),
  ('front_office.cancel.cancel', 'front_office', 'cancel', 'cancel', 'Cancel in-house stay', 'Complete the front-office cancel flow.', false, true),
  ('front_office.fee.post', 'front_office', 'fee', 'post', 'Post cancel or no-show fee', 'Post a cancellation or no-show fee.', false, true),
  ('front_office.fee.override', 'front_office', 'fee', 'override', 'Waive cancel or no-show fee', 'Waive a cancellation or no-show fee.', true, true),
  ('front_office.guest_request.edit', 'front_office', 'guest_request', 'edit', 'Edit guest request', 'Create or update a front-office guest request.', false, true),
  ('reservation.reservation.view', 'reservation', 'reservation', 'view', 'View reservations', 'List and open reservations.', false, true),
  ('reservation.reservation.create', 'reservation', 'reservation', 'create', 'Create reservation', 'Create a hotel reservation.', false, true),
  ('reservation.reservation.edit', 'reservation', 'reservation', 'edit', 'Amend reservation', 'Amend stay details on a reservation.', false, true),
  ('reservation.reservation.cancel', 'reservation', 'reservation', 'cancel', 'Cancel reservation', 'Cancel a reservation from the reservations workspace.', false, true),
  ('reservation.reservation.print', 'reservation', 'reservation', 'print', 'Print confirmation', 'Print a reservation confirmation.', false, true),
  ('reservation.assignment.edit', 'reservation', 'assignment', 'edit', 'Assign reservation room', 'Assign or unassign a room before arrival.', false, true),
  ('reservation.status.edit', 'reservation', 'status', 'edit', 'Change reservation status', 'Confirm a reservation or restore a cancelled one.', false, true),
  ('reservation.quote.view', 'reservation', 'quote', 'view', 'View stay quote', 'Quote a stay using the rate engine.', false, true),
  ('guest.profile.view', 'guest', 'profile', 'view', 'View guest profiles', 'Open the guest directory and individual profiles.', false, true),
  ('guest.profile.create', 'guest', 'profile', 'create', 'Create guest profile', 'Create an individual guest profile.', false, true),
  ('guest.profile.edit', 'guest', 'profile', 'edit', 'Edit guest profile', 'Update profile, preferences, notes or consent.', false, true),
  ('guest.profile.activate', 'guest', 'profile', 'activate', 'Activate guest profile', 'Set a guest profile active or inactive.', false, true),
  ('guest.restriction.authorize', 'guest', 'restriction', 'authorize', 'Authorize guest restriction', 'Restrict, blacklist or lift a guest restriction.', true, true),
  ('guest.document.edit', 'guest', 'document', 'edit', 'Edit guest documents', 'Upload, register or review identity documents.', false, true),
  ('guest.merge.authorize', 'guest', 'merge', 'authorize', 'Authorize guest merge', 'Merge or unmerge guest profiles.', true, true),
  ('guest.privacy.export', 'guest', 'privacy', 'export', 'Export guest privacy data', 'Export guest or account data as JSON.', true, true),
  ('guest.privacy.delete', 'guest', 'privacy', 'delete', 'Anonymise guest data', 'Anonymise a guest or account profile.', true, true),
  ('guest.account.view', 'guest', 'account', 'view', 'View guest accounts', 'View company, group and travel-agent masters.', false, true),
  ('guest.account.create', 'guest', 'account', 'create', 'Create guest account', 'Create a company, group or travel-agent master.', false, true),
  ('guest.account.edit', 'guest', 'account', 'edit', 'Edit guest account', 'Update or link guest account masters.', false, true),
  ('guest.vip.edit', 'guest', 'vip', 'edit', 'Edit guest VIP', 'Set or unset the guest VIP flag.', false, true),
  ('room.inventory.view', 'room', 'inventory', 'view', 'View room inventory', 'View rooms, types and occupancy.', false, true),
  ('room.room_type.configure', 'room', 'room_type', 'configure', 'Configure room types', 'Save room type records.', false, true),
  ('room.room_type.activate', 'room', 'room_type', 'activate', 'Activate room type', 'Activate or deactivate a room type.', true, true),
  ('room.room.configure', 'room', 'room', 'configure', 'Configure rooms', 'Save or bulk-create rooms.', false, true),
  ('room.room.activate', 'room', 'room', 'activate', 'Activate room', 'Activate or deactivate a room.', true, true),
  ('room.image.delete', 'room', 'image', 'delete', 'Delete room type image', 'Delete a room type image.', false, true),
  ('room.amenity.configure', 'room', 'amenity', 'configure', 'Configure amenities', 'Maintain amenities and room-type links.', false, true),
  ('housekeeping.board.view', 'housekeeping', 'board', 'view', 'View housekeeping board', 'View the housekeeping dashboard, rack and history.', false, true),
  ('housekeeping.task.create', 'housekeeping', 'task', 'create', 'Create housekeeping task', 'Create a housekeeping task.', false, true),
  ('housekeeping.task.edit', 'housekeeping', 'task', 'edit', 'Edit housekeeping task', 'Assign, start or complete a housekeeping task.', false, true),
  ('housekeeping.task.cancel', 'housekeeping', 'task', 'cancel', 'Cancel housekeeping task', 'Cancel a housekeeping task.', false, true),
  ('housekeeping.inspection.edit', 'housekeeping', 'inspection', 'edit', 'Inspect room', 'Pass or fail a room inspection.', false, true),
  ('housekeeping.restriction.edit', 'housekeeping', 'restriction', 'edit', 'Edit room restriction', 'Set a room available, out of order or out of service.', false, true),
  ('housekeeping.discrepancy.edit', 'housekeeping', 'discrepancy', 'edit', 'Edit discrepancy', 'Create or resolve a housekeeping discrepancy.', false, true),
  ('housekeeping.maintenance.edit', 'housekeeping', 'maintenance', 'edit', 'Edit maintenance request', 'Create or update a maintenance request.', false, true),
  ('cashiering.folio.view', 'cashiering', 'folio', 'view', 'View folios', 'View folios, the ledger and the cashiering dashboard.', false, true),
  ('cashiering.folio.create', 'cashiering', 'folio', 'create', 'Open folio', 'Open a guest folio.', false, true),
  ('cashiering.charge.post', 'cashiering', 'charge', 'post', 'Post folio charge', 'Post a charge to a guest folio.', false, true),
  ('cashiering.payment.post', 'cashiering', 'payment', 'post', 'Post folio payment', 'Post a payment to a guest folio.', false, true),
  ('cashiering.deposit.post', 'cashiering', 'deposit', 'post', 'Post folio deposit', 'Post a deposit to a guest folio.', false, true),
  ('cashiering.folio.refund', 'cashiering', 'folio', 'refund', 'Refund folio', 'Post a folio refund.', true, true),
  ('cashiering.adjustment.post', 'cashiering', 'adjustment', 'post', 'Post folio adjustment', 'Post a signed folio adjustment.', true, true),
  ('cashiering.discount.post', 'cashiering', 'discount', 'post', 'Post folio discount', 'Post a folio discount.', true, true),
  ('cashiering.folio.authorize', 'cashiering', 'folio', 'authorize', 'Close folio', 'Close a guest folio at zero balance.', true, true),
  ('cashiering.shift.edit', 'cashiering', 'shift', 'edit', 'Edit cashier shift', 'Open or close a cashier shift.', false, true),
  ('cashiering.room_charge.post', 'cashiering', 'room_charge', 'post', 'Post room charge', 'Post a POS charge to a guest folio.', false, true),
  ('cashiering.room_charge.override', 'cashiering', 'room_charge', 'override', 'Reverse room charge', 'Reverse a POS charge posted to a guest folio.', true, true),
  ('night_audit.run.view', 'night_audit', 'run', 'view', 'View night audit', 'View night-audit runs and the business date.', false, true),
  ('night_audit.run.create', 'night_audit', 'run', 'create', 'Run night audit', 'Run or refresh night audit.', false, true),
  ('night_audit.exception.edit', 'night_audit', 'exception', 'edit', 'Edit night audit exception', 'Resolve or ignore a warning exception.', false, true),
  ('night_audit.business_date.activate', 'night_audit', 'business_date', 'activate', 'Close business date', 'Roll the property business date.', true, true),
  ('rates.plan.view', 'rates', 'plan', 'view', 'View rates', 'View rate plans, categories and the calendar.', false, true),
  ('rates.plan.configure', 'rates', 'plan', 'configure', 'Configure rate plans', 'Save rate categories and plans.', false, true),
  ('rates.plan.activate', 'rates', 'plan', 'activate', 'Activate rate plan', 'Activate or deactivate a rate plan.', true, true),
  ('rates.calendar.override', 'rates', 'calendar', 'override', 'Override rate calendar', 'Save a daily rate calendar override.', true, true),
  ('rates.restriction.configure', 'rates', 'restriction', 'configure', 'Configure rate restrictions', 'Save stay restrictions such as stop-sell.', false, true),
  ('rates.quote.view', 'rates', 'quote', 'view', 'View rate quote', 'View quotes and revenue KPIs.', false, true),
  ('reports.pms.view', 'reports', 'pms', 'view', 'View PMS reports', 'View operational, financial, occupancy and revenue report tabs.', false, true),
  ('administration.staff.view', 'administration', 'staff', 'view', 'View staff', 'List property staff memberships.', false, true),
  ('administration.staff.create', 'administration', 'staff', 'create', 'Create staff', 'Create a staff membership.', false, true),
  ('administration.staff.edit', 'administration', 'staff', 'edit', 'Edit staff role', 'Change the live STAFF_ROLES value on a membership.', true, true),
  ('administration.staff.activate', 'administration', 'staff', 'activate', 'Activate staff', 'Activate or deactivate a staff membership.', true, true),
  ('administration.module_access.configure', 'administration', 'module_access', 'configure', 'Configure module access', 'Toggle overridable staff module access.', true, true),
  ('configuration.property.configure', 'configuration', 'property', 'configure', 'Configure property', 'Save Card 1 property and business setup.', false, true),
  ('configuration.property.activate', 'configuration', 'property', 'activate', 'Activate property', 'Set pms_set1_live and activate the property.', true, true),
  ('configuration.rooms_ops.configure', 'configuration', 'rooms_ops', 'configure', 'Configure rooms operations', 'Save Card 2 housekeeping, inventory and maintenance rules.', false, true),
  ('configuration.financial.configure', 'configuration', 'financial', 'configure', 'Configure financial setup', 'Save Card 3 currency, tax, payment and billing catalogues.', false, true),
  ('configuration.guest_setup.configure', 'configuration', 'guest_setup', 'configure', 'Configure guest setup', 'Save Card 4 profile types, documents and preferences.', false, true),
  ('configuration.organization.configure', 'configuration', 'organization', 'configure', 'Configure organization', 'Save Card 5 departments, outlets and sales masters.', false, true),
  ('configuration.security.configure', 'configuration', 'security', 'configure', 'Configure hotel roles', 'Save Card 7 hotel roles, mappings, approval rules and hotel_role_id.', true, true),
  ('distribution.channel.view', 'distribution', 'channel', 'view', 'View distribution channels', 'View channel and distribution overview.', false, true),
  ('distribution.channel.activate', 'distribution', 'channel', 'activate', 'Activate distribution channel', 'Enable or disable a distribution channel.', true, true),
  ('distribution.mapping.configure', 'distribution', 'mapping', 'configure', 'Configure distribution mapping', 'Save room and rate channel mappings.', false, true),
  ('distribution.direct_booking.configure', 'distribution', 'direct_booking', 'configure', 'Configure direct booking', 'Save direct-booking settings.', false, true)
ON CONFLICT (code) DO UPDATE SET
  module = EXCLUDED.module,
  function = EXCLUDED.function,
  action = EXCLUDED.action,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sensitive = EXCLUDED.sensitive,
  active = EXCLUDED.active;
