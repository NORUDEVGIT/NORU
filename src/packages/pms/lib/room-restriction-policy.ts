/**
 * Mirrors pms_set_room_operational_restriction.
 * A maintenance ticket is required only for Out of Order, and only when
 * pms_maintenance_rules.operational_ooo_maintenance_ticket_required is on.
 * Out of Service does not use that flag. No saved rule means the ticket is not required.
 */
export const OOO_MAINTENANCE_TICKET_MESSAGE =
  "A maintenance request is required before this room can be placed Out of Order.";

export function outOfOrderNeedsMaintenanceTicket(
  status: "available" | "out_of_order" | "out_of_service",
  operationalOooMaintenanceTicketRequired: boolean,
): boolean {
  return status === "out_of_order" && operationalOooMaintenanceTicketRequired;
}

export function staffRestrictionError(message: string): string {
  if (message.includes("MAINTENANCE_TICKET_REQUIRED")) return OOO_MAINTENANCE_TICKET_MESSAGE;
  return message;
}
