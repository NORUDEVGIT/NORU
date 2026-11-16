/**
 * Locked PMS module bar.
 *
 * Operational desks only. Maintenance, Distribution, Administration,
 * placeholders, and the PMS home launcher are not items on this bar.
 * Settings is never a module: it lives in the profile menu at
 * `/restaurant/settings` so card hashes keep working.
 */
export const PMS_MODULE_NAV = [
  { id: "front-office", catalogueKey: "front-office", label: "Front Office", to: "/restaurant/pms/front-office" },
  { id: "reservations", catalogueKey: "reservations", label: "Reservations", to: "/restaurant/pms/reservations" },
  { id: "guest-profile", catalogueKey: "guest-profile", label: "Guest Profile", to: "/restaurant/pms/guests" },
  { id: "room-inventory", catalogueKey: "room-inventory", label: "Rooms & Inventory", to: "/restaurant/pms/room-inventory" },
  { id: "housekeeping", catalogueKey: "housekeeping", label: "Housekeeping", to: "/restaurant/pms/housekeeping" },
  { id: "cashiering", catalogueKey: "cashiering", label: "Cashiering", to: "/restaurant/pms/cashiering" },
  { id: "rates-revenue", catalogueKey: "rates-revenue", label: "Rate & Revenue", to: "/restaurant/pms/rates-revenue" },
  { id: "night-audit", catalogueKey: "night-audit", label: "Night Audit", to: "/restaurant/pms/night-audit" },
  { id: "reports", catalogueKey: "reports", label: "Reports", to: "/restaurant/pms/reports" },
] as const;

/** Profile-menu destination. Not part of `PMS_MODULE_NAV`. */
export const PMS_SETTINGS_HREF = "/restaurant/settings";

export type PmsModuleNavItem = (typeof PMS_MODULE_NAV)[number];
export type PmsModuleNavId = PmsModuleNavItem["id"];
export type PmsModuleNavLabel = PmsModuleNavItem["label"];
/** Chrome/help context. Settings has a workspace but is never a module-bar item. */
export type PmsChromeModuleLabel = PmsModuleNavLabel | "Settings";

/** Catalogue keys for the launcher and package rail. */
export const PMS_PRIMARY_MODULE_KEYS = PMS_MODULE_NAV.map((item) => item.catalogueKey);

/** Routes that stay alive and are not top-nav items. */
export const PMS_NON_NAV_ROUTES = [
  "/restaurant/pms",
  "/restaurant/pms/maintenance",
  "/restaurant/pms/distribution",
  "/restaurant/pms/administration",
  "/restaurant/pms/cashiering/folios/$folioId",
  "/restaurant/pms/reservations/$reservationId",
  "/restaurant/pms/guests/$guestId",
  "/restaurant/bookings/new",
] as const;

export function pmsModuleNavItem(id: PmsModuleNavId): PmsModuleNavItem {
  const item = PMS_MODULE_NAV.find((entry) => entry.id === id);
  if (!item) throw new Error(`Unknown PMS module nav id: ${id}`);
  return item;
}
