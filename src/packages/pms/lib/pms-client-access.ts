/**
 * Client PMS access. Permission ownership only.
 * Domain state (folio closed, checklist, window) stays with the screen.
 * Role names are not an input.
 */
import { PMS_PERMISSIONS, type PmsPermissionCode } from "./pms-permissions";
import { PMS_MODULE_NAV } from "./pms-module-nav";

export type PmsAccessSnapshot = {
  isOwner: boolean;
  codes: readonly string[];
};

export function pmsPermissionsQueryKey(restaurantId: string) {
  return ["pms-permissions", restaurantId] as const;
}

export function pmsCan(access: PmsAccessSnapshot, code: PmsPermissionCode): boolean {
  return access.isOwner || access.codes.includes(code);
}

export function pmsCanAny(access: PmsAccessSnapshot, codes: readonly PmsPermissionCode[]): boolean {
  return access.isOwner || codes.some((code) => access.codes.includes(code));
}

export function pmsCanAll(access: PmsAccessSnapshot, codes: readonly PmsPermissionCode[]): boolean {
  return access.isOwner || codes.every((code) => access.codes.includes(code));
}

/** Permission and record state are both required. */
export function pmsActionAvailable(hasPermission: boolean, domainAllows: boolean): boolean {
  return hasPermission && domainAllows;
}

/** Settings hub. There is no single Settings View permission. */
export const PMS_SETTINGS_HUB_PERMISSIONS = [
  PMS_PERMISSIONS.CONFIG_PROPERTY_VIEW,
  PMS_PERMISSIONS.CONFIG_ROOMS_OPS_VIEW,
  PMS_PERMISSIONS.CONFIG_FINANCIAL_VIEW,
  PMS_PERMISSIONS.CONFIG_GUEST_SETUP_VIEW,
  PMS_PERMISSIONS.CONFIG_ORGANIZATION_VIEW,
  PMS_PERMISSIONS.CONFIG_INTEGRATION_VIEW,
  PMS_PERMISSIONS.STAFF_VIEW,
  PMS_PERMISSIONS.ROLES_VIEW,
] as const satisfies readonly PmsPermissionCode[];

export function pmsSettingsHubVisible(access: PmsAccessSnapshot): boolean {
  return pmsCanAny(access, PMS_SETTINGS_HUB_PERMISSIONS);
}

/** Guest directory and detail host profiles and commercial accounts. */
export const PMS_GUEST_ROUTE_PERMISSIONS = [
  PMS_PERMISSIONS.GUEST_PROFILE_VIEW,
  PMS_PERMISSIONS.GUEST_ACCOUNT_VIEW,
] as const satisfies readonly PmsPermissionCode[];

/**
 * Account pages host invoices. Invoice view is enough to open that URL.
 * The cashiering desk and guest folio stay on folio view.
 */
export const PMS_ACCOUNT_ROUTE_PERMISSIONS = [
  PMS_PERMISSIONS.CASHIERING_VIEW,
  PMS_PERMISSIONS.CASHIERING_INVOICE_VIEW,
] as const satisfies readonly PmsPermissionCode[];

export const PMS_ADMIN_ROUTE_PERMISSIONS = [
  PMS_PERMISSIONS.STAFF_VIEW,
  PMS_PERMISSIONS.ROLES_VIEW,
] as const satisfies readonly PmsPermissionCode[];

/**
 * Settings card numbers match PROPERTY_SETUP_CARDS.
 * Card 7 is Security, Data & Reports. It opens for property view or roles view.
 * configuration.security.configure is not a gate.
 * Card 5 opens for organization view, or for Staff & Access (staff view or roles view).
 */
const SETTINGS_SECTION_CARD: Record<string, number> = {
  identity: 1,
  ops: 1,
  taxes: 1,
  policies: 1,
  structure: 2,
  rooms: 2,
  "housekeeping-rules": 2,
  "room-inventory-rules": 2,
  rates: 3,
  "guest-profile": 4,
  "guest-services-types": 4,
  notifications: 4,
  outlets: 5,
  departments: 5,
  "sales-events": 5,
  integrations: 6,
  distribution: 6,
  reports: 7,
  security: 7,
  "offline-sync": 1,
};

export function pmsSettingsSectionCard(sectionId: string): number | null {
  return SETTINGS_SECTION_CARD[sectionId] ?? null;
}

export function pmsSettingsCardEditable(access: PmsAccessSnapshot, cardNumber: number): boolean {
  switch (cardNumber) {
    case 1:
    case 8:
      return pmsCan(access, PMS_PERMISSIONS.CONFIG_PROPERTY_CONFIGURE);
    case 2:
      return pmsCan(access, PMS_PERMISSIONS.CONFIG_ROOMS_OPS_CONFIGURE);
    case 3:
      return pmsCan(access, PMS_PERMISSIONS.CONFIG_FINANCIAL_CONFIGURE);
    case 4:
      return pmsCan(access, PMS_PERMISSIONS.CONFIG_GUEST_SETUP_CONFIGURE);
    case 5:
      return pmsCan(access, PMS_PERMISSIONS.CONFIG_ORGANIZATION_CONFIGURE);
    case 6:
      return pmsCan(access, PMS_PERMISSIONS.CONFIG_INTEGRATION_CONFIGURE);
    case 7:
      return pmsCanAny(access, [
        PMS_PERMISSIONS.CONFIG_PROPERTY_CONFIGURE,
        PMS_PERMISSIONS.ROLES_EDIT,
      ]);
    default:
      return false;
  }
}

export function pmsSettingsSectionVisible(access: PmsAccessSnapshot, sectionId: string): boolean {
  const card = pmsSettingsSectionCard(sectionId);
  return card == null ? pmsSettingsHubVisible(access) : pmsSettingsCardVisible(access, card);
}

export function pmsSettingsSectionEditable(access: PmsAccessSnapshot, sectionId: string): boolean {
  const card = pmsSettingsSectionCard(sectionId) ?? 1;
  return pmsSettingsCardEditable(access, card);
}

export function pmsSettingsCardVisible(access: PmsAccessSnapshot, cardNumber: number): boolean {
  switch (cardNumber) {
    case 1:
    case 8:
      return pmsCan(access, PMS_PERMISSIONS.CONFIG_PROPERTY_VIEW);
    case 2:
      return pmsCan(access, PMS_PERMISSIONS.CONFIG_ROOMS_OPS_VIEW);
    case 3:
      return pmsCan(access, PMS_PERMISSIONS.CONFIG_FINANCIAL_VIEW);
    case 4:
      return pmsCan(access, PMS_PERMISSIONS.CONFIG_GUEST_SETUP_VIEW);
    case 5:
      return pmsCanAny(access, [
        PMS_PERMISSIONS.CONFIG_ORGANIZATION_VIEW,
        PMS_PERMISSIONS.STAFF_VIEW,
        PMS_PERMISSIONS.ROLES_VIEW,
      ]);
    case 6:
      return pmsCan(access, PMS_PERMISSIONS.CONFIG_INTEGRATION_VIEW);
    case 7:
      return pmsCanAny(access, [
        PMS_PERMISSIONS.CONFIG_PROPERTY_VIEW,
        PMS_PERMISSIONS.ROLES_VIEW,
      ]);
    default:
      return false;
  }
}

/** Catalogue key → view permission. Null means a compound check. */
export const PMS_MODULE_VIEW_PERMISSION = {
  dashboard: PMS_PERMISSIONS.DASHBOARD_VIEW,
  "front-office": PMS_PERMISSIONS.FRONT_OFFICE_VIEW,
  reservations: PMS_PERMISSIONS.RESERVATION_VIEW,
  "guest-profile": PMS_PERMISSIONS.GUEST_PROFILE_VIEW,
  "room-inventory": PMS_PERMISSIONS.ROOM_INVENTORY_VIEW,
  housekeeping: PMS_PERMISSIONS.HOUSEKEEPING_VIEW,
  cashiering: PMS_PERMISSIONS.CASHIERING_VIEW,
  "rates-revenue": PMS_PERMISSIONS.RATES_VIEW,
  "night-audit": PMS_PERMISSIONS.NIGHT_AUDIT_VIEW,
  reports: PMS_PERMISSIONS.REPORTS_VIEW,
  distribution: PMS_PERMISSIONS.CONFIG_INTEGRATION_VIEW,
  maintenance: PMS_PERMISSIONS.MAINTENANCE_VIEW,
} as const satisfies Record<string, PmsPermissionCode>;

export function pmsModuleVisible(access: PmsAccessSnapshot, moduleKey: string): boolean {
  if (moduleKey === "property-setup") return pmsSettingsHubVisible(access);
  if (moduleKey === "administration") {
    return pmsCanAny(access, [PMS_PERMISSIONS.STAFF_VIEW, PMS_PERMISSIONS.ROLES_VIEW]);
  }
  const code = PMS_MODULE_VIEW_PERMISSION[moduleKey as keyof typeof PMS_MODULE_VIEW_PERMISSION];
  return code ? pmsCan(access, code) : false;
}

export const PMS_QUICK_ACTIONS = {
  newReservation: PMS_PERMISSIONS.RESERVATION_CREATE,
  walkIn: PMS_PERMISSIONS.FRONT_OFFICE_WALK_IN,
  checkIn: PMS_PERMISSIONS.FRONT_OFFICE_CHECK_IN,
  checkOut: PMS_PERMISSIONS.FRONT_OFFICE_CHECK_OUT,
  postPayment: PMS_PERMISSIONS.CASHIERING_PAYMENT_POST,
} as const;

const PMS_ROUTE_ORDER: { path: string; visible: (access: PmsAccessSnapshot) => boolean }[] = [
  { path: "/restaurant/pms", visible: (access) => pmsCan(access, PMS_PERMISSIONS.DASHBOARD_VIEW) },
  ...PMS_MODULE_NAV.map((item) => ({
    path: item.to,
    visible: (access: PmsAccessSnapshot) => pmsModuleVisible(access, item.catalogueKey),
  })),
  {
    path: "/restaurant/pms/maintenance",
    visible: (access: PmsAccessSnapshot) => pmsModuleVisible(access, "maintenance"),
  },
  {
    path: "/restaurant/pms/distribution",
    visible: (access: PmsAccessSnapshot) => pmsModuleVisible(access, "distribution"),
  },
];

/** First module the caller may open, in PMS nav order. Dashboard is first when granted. */
export function getFirstAccessiblePmsRoute(
  access: PmsAccessSnapshot,
  skipPath?: string,
): string | null {
  for (const entry of PMS_ROUTE_ORDER) {
    if (entry.path === skipPath) continue;
    if (entry.visible(access)) return entry.path;
  }
  return null;
}

export function pmsKpiVisible(
  access: PmsAccessSnapshot,
  kpi: "stay" | "rooms" | "cash" | "fiscal" | "revenue" | "housekeeping",
): boolean {
  switch (kpi) {
    case "stay":
      return pmsCanAny(access, [
        PMS_PERMISSIONS.FRONT_OFFICE_VIEW,
        PMS_PERMISSIONS.RESERVATION_VIEW,
      ]);
    case "rooms":
      return pmsCan(access, PMS_PERMISSIONS.ROOM_INVENTORY_VIEW);
    case "cash":
      return pmsCan(access, PMS_PERMISSIONS.CASHIERING_VIEW);
    case "fiscal":
      return pmsCan(access, PMS_PERMISSIONS.FISCAL_VIEW);
    case "revenue":
      return pmsCanAny(access, [PMS_PERMISSIONS.RATES_VIEW, PMS_PERMISSIONS.REPORTS_VIEW]);
    case "housekeeping":
      return pmsCan(access, PMS_PERMISSIONS.HOUSEKEEPING_VIEW);
    default:
      return false;
  }
}
