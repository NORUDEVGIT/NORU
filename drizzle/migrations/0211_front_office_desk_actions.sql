-- Front Office desk actions. Each code parents to front_office.desk.view,
-- so a role can post, assign, or create from the desk without the other module's View.
-- The owning module's code remains valid for the same write.

INSERT INTO public.pms_permissions (
  code, module, function, action, name, description, sensitive, active
)
VALUES
  ('front_office.charge.post', 'front_office', 'charge', 'post', 'Post Charge from Desk', 'Post a charge on the stay in front of you without opening Cashiering.', true, true),
  ('front_office.deposit.post', 'front_office', 'deposit', 'post', 'Post Deposit from Desk', 'Collect a deposit during check-in without opening Cashiering.', true, true),
  ('front_office.payment.post', 'front_office', 'payment', 'post', 'Take Payment from Desk', 'Take a payment during check-out without opening Cashiering.', true, true),
  ('front_office.folio.authorize', 'front_office', 'folio', 'authorize', 'Close Folio from Desk', 'Close this stay''s folio without opening Cashiering.', true, true),
  ('front_office.adjustment.post', 'front_office', 'adjustment', 'post', 'Post Adjustment from Desk', 'Post an adjustment on this stay without opening Cashiering.', true, true),
  ('front_office.discount.post', 'front_office', 'discount', 'post', 'Post Discount from Desk', 'Post a discount on this stay without opening Cashiering.', true, true),
  ('front_office.folio.refund', 'front_office', 'folio', 'refund', 'Refund from Desk', 'Refund a payment on this stay without opening Cashiering.', true, true),
  ('front_office.invoice.authorize', 'front_office', 'invoice', 'authorize', 'Issue Invoice from Desk', 'Issue this stay''s invoice without opening Invoices.', true, true),
  ('front_office.housekeeping_task.create', 'front_office', 'housekeeping_task', 'create', 'Create Housekeeping Task from Desk', 'Create a housekeeping task for a room from the desk.', false, true),
  ('front_office.housekeeping_task.edit', 'front_office', 'housekeeping_task', 'edit', 'Update Housekeeping Task from Desk', 'Start cleaning on a task opened from the desk.', false, true),
  ('front_office.maintenance.create', 'front_office', 'maintenance', 'create', 'Create Work Order from Desk', 'Create a maintenance work order from the desk.', false, true),
  ('front_office.guest.edit', 'front_office', 'guest', 'edit', 'Update Guest on this Stay', 'Update the guest on this stay, including an ID, without opening Guest Profiles.', false, true),
  ('front_office.guest_service.create', 'front_office', 'guest_service', 'create', 'Add Guest Service from Desk', 'Add a guest service request on this stay without opening Guest Profiles.', false, true),
  ('front_office.assignment.edit', 'front_office', 'assignment', 'edit', 'Assign Room from Desk', 'Assign or change a room before arrival without opening Reservations.', false, true),
  ('front_office.reservation.edit', 'front_office', 'reservation', 'edit', 'Edit Reservation from Desk', 'Change reservation details and occupants from the desk without opening Reservations.', false, true)
ON CONFLICT (code) DO UPDATE SET
  module = EXCLUDED.module,
  function = EXCLUDED.function,
  action = EXCLUDED.action,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sensitive = EXCLUDED.sensitive,
  active = true;

-- Already seeded by Card 7. Put it back on the live catalogue and keep it active.
INSERT INTO public.pms_permissions (
  code, module, function, action, name, description, sensitive, active
)
VALUES (
  'front_office.check_out.override',
  'front_office',
  'check_out',
  'override',
  'Check-Out Override',
  'Leave the folio unsettled at check-out.',
  true,
  true
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sensitive = EXCLUDED.sensitive,
  active = true;
