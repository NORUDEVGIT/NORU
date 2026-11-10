/**
 * Staff & Access presentation model.
 * Templates preselect grants. Role names never authorize.
 * Parent View rules match the server catalogue.
 */
import {
  PMS_PERMISSION_CODES,
  PMS_PERMISSION_DENIED,
  PMS_PERMISSIONS,
  actorMayAssignRole,
  actorMayGrantPermissions,
  isModuleViewPermission,
  isPmsPermissionCode,
  parentViewPermission,
  permissionRisk,
  type PmsPermissionCode,
  type PmsPermissionRisk,
} from "./pms-permissions.ts";

export const STAFF_ACCESS_TITLE = "Staff & Access";
export const STAFF_ACCESS_STEP_ID = "staff-access";
export const ACTIVE_STAFF_NEEDS_ROLE = "Active staff must have at least one role.";
export const GRANT_OUTSIDE_ACTOR = "You cannot grant access that you do not have.";
export const ROLE_OUTSIDE_ACTOR =
  "You cannot assign this role because it contains permissions you do not have.";
export const PERMISSION_OUTSIDE_ACTOR = "You do not have this permission and cannot grant it.";
export const CRITICAL_CONFIRM =
  "This permission grants sensitive operational or financial authority.";
export const ROLE_DEACTIVATE_WARNING =
  "Deactivating it will immediately remove these permissions from their effective access.";

export type StaffAccessTemplateId =
  | "blank"
  | "front-desk"
  | "reservation-agent"
  | "cashier"
  | "accountant"
  | "housekeeping-staff"
  | "housekeeping-supervisor"
  | "maintenance"
  | "night-auditor"
  | "general-manager";

export type StaffAccessPreset = "none" | "view" | "full";
export type StaffAccessTriState = "none" | "partial" | "all";

export type StaffAccessPermission = {
  code: PmsPermissionCode;
  label: string;
  description: string;
};

export type StaffAccessGroup = {
  id: string;
  label: string;
  permissions: StaffAccessPermission[];
};

export type StaffAccessModule = {
  id: string;
  label: string;
  section: string | null;
  view: PmsPermissionCode;
  viewLabel: string;
  groups: StaffAccessGroup[];
};

const P = PMS_PERMISSIONS;

function item(code: PmsPermissionCode, label: string, description: string): StaffAccessPermission {
  return { code, label, description };
}

export const STAFF_ACCESS_MODULES: readonly StaffAccessModule[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    section: null,
    view: P.DASHBOARD_VIEW,
    viewLabel: "View Dashboard",
    groups: [],
  },
  {
    id: "reservations",
    label: "Reservations",
    section: null,
    view: P.RESERVATION_VIEW,
    viewLabel: "View Reservations",
    groups: [
      {
        id: "reservation-management",
        label: "Reservation Management",
        permissions: [
          item(P.RESERVATION_CREATE, "Create Reservation", "Create a new reservation."),
          item(P.RESERVATION_EDIT, "Edit Reservation", "Change reservation details."),
          item(P.RESERVATION_CANCEL, "Cancel Reservation", "Cancel a reservation."),
          item(P.RESERVATION_ASSIGNMENT_EDIT, "Assign / Change Room", "Assign or move a room."),
          item(P.RESERVATION_PRINT, "Print Reservation", "Print a reservation confirmation or summary."),
        ],
      },
      {
        id: "pricing-exceptions",
        label: "Pricing & Exceptions",
        permissions: [
          item(P.RESERVATION_RATE_OVERRIDE, "Change Stay Rate", "Override the priced stay rate."),
          item(P.RESERVATION_OVERBOOKING_AUTHORIZE, "Authorize Overbooking", "Allow a stay past available inventory."),
        ],
      },
      {
        id: "groups-waitlist",
        label: "Groups & Waitlist",
        permissions: [
          item(P.RESERVATION_GROUP_EDIT, "Manage Group Reservation", "Edit group reservation blocks."),
          item(P.RESERVATION_WAITLIST_EDIT, "Manage Waitlist", "Edit the reservation waitlist."),
        ],
      },
    ],
  },
  {
    id: "front-office",
    label: "Front Office",
    section: null,
    view: P.FRONT_OFFICE_VIEW,
    viewLabel: "View Front Office",
    groups: [
      {
        id: "desk",
        label: "Desk",
        permissions: [
          item(P.FRONT_OFFICE_CHECK_IN, "Check In", "Check a guest in."),
          item(P.FRONT_OFFICE_CHECK_OUT, "Check Out", "Check a guest out."),
          item(P.FRONT_OFFICE_WALK_IN, "Walk-In", "Create a walk-in stay."),
          item(P.FRONT_OFFICE_STAY_EDIT, "Edit Stay", "Change an in-house stay."),
        ],
      },
      {
        id: "front-office-exceptions",
        label: "Exceptions",
        permissions: [
          item(P.FRONT_OFFICE_NO_SHOW, "No-Show", "Mark a reservation as a no-show."),
          item(P.FRONT_OFFICE_CANCEL, "Cancel from Desk", "Cancel from the front office desk."),
          item(P.FRONT_OFFICE_CHECK_IN_OVERRIDE, "Check-In Override", "Override a check-in block."),
          item(P.FRONT_OFFICE_FEE_OVERRIDE, "Fee Override", "Override a front office fee."),
        ],
      },
    ],
  },
  {
    id: "guest-profiles",
    label: "Guest Profiles",
    section: null,
    view: P.GUEST_PROFILE_VIEW,
    viewLabel: "View Guest Profiles",
    groups: [
      {
        id: "profile",
        label: "Individual guests",
        permissions: [
          item(P.GUEST_PROFILE_CREATE, "Create Guest", "Create an individual guest profile."),
          item(P.GUEST_PROFILE_EDIT, "Edit Guest", "Edit an individual guest profile."),
          item(
            P.GUEST_PROFILE_PRINT,
            "Print & Export Lists",
            "Print guest profiles and download individual or commercial directory lists as CSV.",
          ),
          item(P.GUEST_PROFILE_ACTIVATE, "Activate / Deactivate Guest", "Change individual guest status."),
        ],
      },
      {
        id: "commercial-accounts",
        label: "Commercial accounts",
        permissions: [
          item(
            P.GUEST_ACCOUNT_VIEW,
            "View Commercial Accounts",
            "View company, group, and travel-agent master lists.",
          ),
          item(
            P.GUEST_ACCOUNT_CREATE,
            "Create Account",
            "Create a company, group, or travel-agent master.",
          ),
          item(P.GUEST_ACCOUNT_EDIT, "Edit Account", "Edit a company, group, or travel-agent master."),
          item(
            P.GUEST_ACCOUNT_ACTIVATE,
            "Activate / Deactivate Account",
            "Change commercial account status.",
          ),
        ],
      },
    ],
  },
  {
    id: "rooms",
    label: "Rooms & Inventory",
    section: null,
    view: P.ROOM_INVENTORY_VIEW,
    viewLabel: "View Rooms & Inventory",
    groups: [
      {
        id: "inventory",
        label: "Inventory",
        permissions: [
          item(P.ROOM_BLOCK_EDIT, "Block Rooms", "Place or change an operational room block."),
          item(P.ROOM_RESTRICTION_EDIT, "Room Restriction", "Restrict a room from sale or assignment."),
        ],
      },
    ],
  },
  {
    id: "housekeeping",
    label: "Housekeeping",
    section: null,
    view: P.HOUSEKEEPING_VIEW,
    viewLabel: "View Housekeeping",
    groups: [
      {
        id: "tasks",
        label: "Tasks",
        permissions: [
          item(P.HOUSEKEEPING_TASK_CREATE, "Create Task", "Create a housekeeping task."),
          item(P.HOUSEKEEPING_TASK_EDIT, "Edit / Complete Task", "Update or complete an assigned task."),
          item(P.HOUSEKEEPING_TASK_CANCEL, "Cancel Task", "Cancel a housekeeping task."),
          item(P.HOUSEKEEPING_INSPECTION_EDIT, "Inspect Room", "Record a housekeeping inspection."),
        ],
      },
    ],
  },
  {
    id: "maintenance",
    label: "Maintenance",
    section: null,
    view: P.MAINTENANCE_VIEW,
    viewLabel: "View Maintenance",
    groups: [
      {
        id: "work-orders",
        label: "Work Orders",
        permissions: [
          item(P.MAINTENANCE_CREATE, "Create Work Order", "Create a maintenance work order."),
          item(P.MAINTENANCE_EDIT, "Edit Work Order", "Update a maintenance work order."),
        ],
      },
    ],
  },
  {
    id: "cashiering",
    label: "Cashiering",
    section: null,
    view: P.CASHIERING_VIEW,
    viewLabel: "View Folios",
    groups: [
      {
        id: "posting",
        label: "Posting",
        permissions: [
          item(P.CASHIERING_CHARGE_POST, "Post Charge", "Post a charge to a folio."),
          item(P.CASHIERING_PAYMENT_POST, "Post Payment", "Post a payment."),
          item(P.CASHIERING_DEPOSIT_POST, "Post Deposit", "Post a deposit."),
        ],
      },
      {
        id: "adjustments",
        label: "Adjustments",
        permissions: [
          item(P.CASHIERING_REFUND, "Refund", "Refund a posted payment."),
          item(P.CASHIERING_ADJUSTMENT_POST, "Post Adjustment", "Post an adjustment."),
          item(P.CASHIERING_DISCOUNT_POST, "Post Discount", "Post a discount."),
          item(P.CASHIERING_TRANSFER_POST, "Transfer", "Transfer a folio amount."),
          item(P.CASHIERING_WRITE_OFF, "Write Off", "Authorize a write-off."),
        ],
      },
      {
        id: "settlement",
        label: "Settlement",
        permissions: [
          item(P.CASHIERING_FOLIO_CLOSE, "Close Folio", "Authorize closing a folio."),
          item(P.CASHIERING_ALLOCATION_EDIT, "Allocation", "Allocate payments and charges."),
        ],
      },
    ],
  },
  {
    id: "cashier-shift",
    label: "Cashier Shift",
    section: null,
    view: P.CASHIERING_SHIFT_VIEW,
    viewLabel: "View Shift",
    groups: [
      {
        id: "shift",
        label: "Shift",
        permissions: [
          item(P.CASHIERING_SHIFT_EDIT, "Own Shift", "Open and operate the caller's own shift."),
          item(P.CASHIERING_SHIFT_AUTHORIZE, "Close Other Shift", "Authorize another cashier's shift."),
        ],
      },
    ],
  },
  {
    id: "invoices",
    label: "Invoices",
    section: null,
    view: P.CASHIERING_INVOICE_VIEW,
    viewLabel: "View Invoices",
    groups: [
      {
        id: "invoice",
        label: "Invoices",
        permissions: [
          item(P.CASHIERING_INVOICE_EDIT, "Edit Invoice", "Edit an invoice draft."),
          item(P.CASHIERING_INVOICE_AUTHORIZE, "Issue Invoice", "Authorize issuing an invoice."),
        ],
      },
    ],
  },
  {
    id: "fiscal",
    label: "Fiscal",
    section: null,
    view: P.FISCAL_VIEW,
    viewLabel: "View Fiscal",
    groups: [
      {
        id: "fiscal-docs",
        label: "Documents",
        permissions: [
          item(P.FISCAL_DOCUMENT_AUTHORIZE, "Authorize Fiscal Document", "Authorize a fiscal document."),
        ],
      },
    ],
  },
  {
    id: "night-audit",
    label: "Night Audit",
    section: null,
    view: P.NIGHT_AUDIT_VIEW,
    viewLabel: "View Night Audit",
    groups: [
      {
        id: "audit-operations",
        label: "Audit Operations",
        permissions: [
          item(P.NIGHT_AUDIT_RUN, "Start / Recheck End of Day", "Start, resume, and recheck End of Day."),
          item(P.NIGHT_AUDIT_EXCEPTION_EDIT, "Retry OTB Snapshot", "Retry the post-close OTB snapshot."),
        ],
      },
      {
        id: "business-date",
        label: "Business Date Controls",
        permissions: [
          item(P.NIGHT_AUDIT_CLOSE_DATE, "Close Business Date", "Close the property business date."),
          item(P.NIGHT_AUDIT_FISCAL_AUTHORIZE, "Fiscal Override", "Authorize a fiscal close override."),
          item(P.NIGHT_AUDIT_RECOVER_DATE, "Business Date Recovery", "Recover a business date."),
          item(
            P.NIGHT_AUDIT_WINDOW_OVERRIDE,
            "Close Outside Window",
            "Close the business date outside the Night Audit Window.",
          ),
        ],
      },
    ],
  },
  {
    id: "rates",
    label: "Rate & Revenue",
    section: null,
    view: P.RATES_VIEW,
    viewLabel: "View Rates",
    groups: [
      {
        id: "rates",
        label: "Rates",
        permissions: [
          item(P.RATES_CONFIGURE, "Configure Rates", "Configure rate plans."),
          item(P.RATES_ACTIVATE, "Activate Rates", "Activate a rate change."),
          item(P.RATES_CALENDAR_OVERRIDE, "Calendar Override", "Override a daily rate."),
          item(P.RATES_RESTRICTION_CONFIGURE, "Rate Restrictions", "Configure stay restrictions."),
        ],
      },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    section: null,
    view: P.REPORTS_VIEW,
    viewLabel: "View Reports",
    groups: [
      {
        id: "reports",
        label: "Reports",
        permissions: [item(P.REPORTS_EXPORT, "Export Reports", "Export a PMS report.")],
      },
    ],
  },
  settingsModule("property", "Property & Business", P.CONFIG_PROPERTY_VIEW, "View Property & Business", [
    item(P.CONFIG_PROPERTY_CONFIGURE, "Configure Property & Business", "Change property and business setup."),
    item(P.CONFIG_PROPERTY_ACTIVATE, "Go-Live", "Activate the property for live operation."),
  ]),
  settingsModule("rooms-ops", "Rooms & Operations", P.CONFIG_ROOMS_OPS_VIEW, "View Rooms & Operations", [
    item(P.CONFIG_ROOMS_OPS_CONFIGURE, "Configure Rooms & Operations", "Change rooms and operations setup."),
  ]),
  settingsModule("financial", "Financial & Commercial", P.CONFIG_FINANCIAL_VIEW, "View Financial & Commercial", [
    item(P.CONFIG_FINANCIAL_CONFIGURE, "Configure Financial & Commercial", "Change financial and commercial setup."),
  ]),
  settingsModule("guest-setup", "Guest & Services", P.CONFIG_GUEST_SETUP_VIEW, "View Guest & Services", [
    item(P.CONFIG_GUEST_SETUP_CONFIGURE, "Configure Guest & Services", "Change guest and services setup."),
  ]),
  settingsModule("organization", "Organization", P.CONFIG_ORGANIZATION_VIEW, "View Organization", [
    item(P.CONFIG_ORGANIZATION_CONFIGURE, "Configure Organization", "Change departments, outlets, and events setup."),
  ]),
  settingsModule("integrations", "Integrations", P.CONFIG_INTEGRATION_VIEW, "View Integrations", [
    item(P.CONFIG_INTEGRATION_CONFIGURE, "Configure Integrations", "Change integration setup."),
  ]),
  {
    id: "staff",
    label: "Staff Management",
    section: null,
    view: P.STAFF_VIEW,
    viewLabel: "View Staff",
    groups: [
      {
        id: "staff",
        label: "Staff",
        permissions: [
          item(P.STAFF_CREATE, "Create Staff", "Add a hotel staff member."),
          item(P.STAFF_EDIT, "Edit Staff", "Edit a staff profile."),
          item(P.STAFF_ACTIVATE, "Activate / Deactivate Staff", "Change whether a staff member can sign in."),
          item(P.STAFF_ASSIGN_ROLES, "Assign Roles", "Change the roles on a staff member."),
          item(P.STAFF_RESET_ACCESS, "Reset Staff Access", "Reset a staff member's sign-in."),
        ],
      },
    ],
  },
  {
    id: "roles",
    label: "Role & Permission Management",
    section: null,
    view: P.ROLES_VIEW,
    viewLabel: "View Roles",
    groups: [
      {
        id: "roles",
        label: "Roles",
        permissions: [
          item(P.ROLES_CREATE, "Create Roles", "Create a hotel role."),
          item(P.ROLES_EDIT, "Edit Roles", "Edit a role name or description."),
          item(P.ROLES_ACTIVATE, "Activate / Deactivate Roles", "Change whether a role grants access."),
          item(P.ROLES_ASSIGN_PERMISSIONS, "Assign Role Permissions", "Change the permissions on a role."),
        ],
      },
    ],
  },
];

function settingsModule(
  id: string,
  label: string,
  view: PmsPermissionCode,
  viewLabel: string,
  permissions: StaffAccessPermission[],
): StaffAccessModule {
  return {
    id: `settings-${id}`,
    label,
    section: "Settings",
    view,
    viewLabel,
    groups: [{ id, label, permissions }],
  };
}

const LABEL_INDEX = new Map<PmsPermissionCode, StaffAccessPermission & { moduleLabel: string }>();
for (const module of STAFF_ACCESS_MODULES) {
  LABEL_INDEX.set(module.view, {
    code: module.view,
    label: module.viewLabel,
    description: `Open ${module.label}.`,
    moduleLabel: module.label,
  });
  for (const group of module.groups) {
    for (const permission of group.permissions) {
      LABEL_INDEX.set(permission.code, { ...permission, moduleLabel: module.label });
    }
  }
}

export function staffAccessPermission(code: PmsPermissionCode) {
  return LABEL_INDEX.get(code) ?? null;
}

export function modulePermissionCodes(module: StaffAccessModule): PmsPermissionCode[] {
  return [module.view, ...module.groups.flatMap((group) => group.permissions.map((row) => row.code))];
}

export function nonCriticalModuleCodes(module: StaffAccessModule): PmsPermissionCode[] {
  return modulePermissionCodes(module).filter((code) => permissionRisk(code) !== "CRITICAL");
}

export function criticalModuleCodes(module: StaffAccessModule): PmsPermissionCode[] {
  return modulePermissionCodes(module).filter((code) => permissionRisk(code) === "CRITICAL");
}

export const STAFF_ACCESS_TEMPLATES: ReadonlyArray<{
  id: StaffAccessTemplateId;
  label: string;
  description: string;
}> = [
  { id: "blank", label: "Blank Role", description: "Start with no permissions." },
  { id: "front-desk", label: "Front Desk Agent", description: "Desk, stay, and guest profile work." },
  { id: "reservation-agent", label: "Reservation Agent", description: "Reservation create, edit, and cancel." },
  { id: "cashier", label: "Cashier", description: "Folio view, payments, deposits, and own shift." },
  { id: "accountant", label: "Accountant", description: "Read financials, allocation, and report export." },
  { id: "housekeeping-staff", label: "Housekeeping Staff", description: "Board view and assigned task updates." },
  { id: "housekeeping-supervisor", label: "Housekeeping Supervisor", description: "Task control, inspection, and room restriction." },
  { id: "maintenance", label: "Maintenance", description: "Work order view, create, and edit." },
  { id: "night-auditor", label: "Night Auditor", description: "Audit run and exceptions, without closing the date." },
  { id: "general-manager", label: "General Manager", description: "Broad operational access. Critical actions stay off." },
];

export function templatePermissionCodes(id: StaffAccessTemplateId): PmsPermissionCode[] {
  switch (id) {
    case "blank":
      return [];
    case "front-desk":
      return [
        P.FRONT_OFFICE_VIEW,
        P.FRONT_OFFICE_CHECK_IN,
        P.FRONT_OFFICE_CHECK_OUT,
        P.FRONT_OFFICE_WALK_IN,
        P.FRONT_OFFICE_STAY_EDIT,
        P.RESERVATION_VIEW,
        P.RESERVATION_CREATE,
        P.RESERVATION_EDIT,
        P.RESERVATION_ASSIGNMENT_EDIT,
        P.RESERVATION_PRINT,
        P.GUEST_PROFILE_VIEW,
        P.GUEST_PROFILE_CREATE,
        P.GUEST_PROFILE_EDIT,
        P.GUEST_PROFILE_PRINT,
        P.ROOM_INVENTORY_VIEW,
      ];
    case "reservation-agent":
      return [
        P.RESERVATION_VIEW,
        P.RESERVATION_CREATE,
        P.RESERVATION_EDIT,
        P.RESERVATION_CANCEL,
        P.RESERVATION_ASSIGNMENT_EDIT,
        P.RESERVATION_PRINT,
        P.GUEST_PROFILE_VIEW,
        P.GUEST_PROFILE_CREATE,
        P.GUEST_PROFILE_EDIT,
        P.GUEST_PROFILE_PRINT,
      ];
    case "cashier":
      return [
        P.CASHIERING_VIEW,
        P.CASHIERING_PAYMENT_POST,
        P.CASHIERING_DEPOSIT_POST,
        P.CASHIERING_SHIFT_VIEW,
        P.CASHIERING_SHIFT_EDIT,
        P.CASHIERING_INVOICE_VIEW,
      ];
    case "accountant":
      return [
        P.CASHIERING_VIEW,
        P.CASHIERING_ALLOCATION_EDIT,
        P.CASHIERING_INVOICE_VIEW,
        P.FISCAL_VIEW,
        P.REPORTS_VIEW,
        P.REPORTS_EXPORT,
      ];
    case "housekeeping-staff":
      return [P.HOUSEKEEPING_VIEW, P.HOUSEKEEPING_TASK_EDIT];
    case "housekeeping-supervisor":
      return [
        P.HOUSEKEEPING_VIEW,
        P.HOUSEKEEPING_TASK_CREATE,
        P.HOUSEKEEPING_TASK_EDIT,
        P.HOUSEKEEPING_TASK_CANCEL,
        P.HOUSEKEEPING_INSPECTION_EDIT,
        P.ROOM_INVENTORY_VIEW,
        P.ROOM_RESTRICTION_EDIT,
        P.MAINTENANCE_VIEW,
      ];
    case "maintenance":
      return [P.MAINTENANCE_VIEW, P.MAINTENANCE_CREATE, P.MAINTENANCE_EDIT];
    case "night-auditor":
      return [
        P.NIGHT_AUDIT_VIEW,
        P.NIGHT_AUDIT_RUN,
        P.NIGHT_AUDIT_EXCEPTION_EDIT,
        P.CASHIERING_VIEW,
        P.FRONT_OFFICE_VIEW,
      ];
    case "general-manager":
      return PMS_PERMISSION_CODES.filter((code) => permissionRisk(code) !== "CRITICAL");
    default:
      return [];
  }
}

export function accessCounts(codes: Iterable<string>): { modules: number; actions: number; critical: number } {
  let modules = 0;
  let actions = 0;
  let critical = 0;
  const seen = new Set<string>();
  for (const value of codes) {
    if (!isPmsPermissionCode(value) || seen.has(value)) continue;
    seen.add(value);
    if (permissionRisk(value) === "CRITICAL") critical += 1;
    if (isModuleViewPermission(value)) modules += 1;
    else actions += 1;
  }
  return { modules, actions, critical };
}

export function withPermissionEnabled(selected: Iterable<string>, code: PmsPermissionCode): Set<PmsPermissionCode> {
  const next = new Set<PmsPermissionCode>();
  for (const value of selected) if (isPmsPermissionCode(value)) next.add(value);
  next.add(parentViewPermission(code));
  next.add(code);
  return next;
}

export function withPermissionDisabled(selected: Iterable<string>, code: PmsPermissionCode): Set<PmsPermissionCode> {
  const next = new Set<PmsPermissionCode>();
  for (const value of selected) if (isPmsPermissionCode(value)) next.add(value);
  if (isModuleViewPermission(code)) {
    for (const value of PMS_PERMISSION_CODES) {
      if (parentViewPermission(value) === code) next.delete(value);
    }
  } else {
    next.delete(code);
  }
  return next;
}

export function applyModulePreset(
  selected: Iterable<string>,
  module: StaffAccessModule,
  preset: StaffAccessPreset,
): Set<PmsPermissionCode> {
  const next = new Set<PmsPermissionCode>();
  for (const value of selected) if (isPmsPermissionCode(value)) next.add(value);
  for (const code of modulePermissionCodes(module)) next.delete(code);
  if (preset === "view") next.add(module.view);
  if (preset === "full") {
    for (const code of nonCriticalModuleCodes(module)) next.add(code);
  }
  return next;
}

export function moduleTriState(selected: Iterable<string>, module: StaffAccessModule): StaffAccessTriState {
  const have = new Set(selected);
  const codes = modulePermissionCodes(module);
  const on = codes.filter((code) => have.has(code));
  if (on.length === 0) return "none";
  if (nonCriticalModuleCodes(module).every((code) => have.has(code))) return "all";
  return "partial";
}

export function riskLabel(risk: PmsPermissionRisk): string | null {
  if (risk === "CRITICAL") return "Critical";
  if (risk === "HIGH") return "High Risk";
  return null;
}

export function modulesMatchingSearch(query: string): string[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return STAFF_ACCESS_MODULES.filter((module) => {
    if (module.label.toLowerCase().includes(needle)) return true;
    if (module.viewLabel.toLowerCase().includes(needle)) return true;
    return module.groups.some((group) =>
      group.permissions.some(
        (permission) =>
          permission.label.toLowerCase().includes(needle) ||
          permission.description.toLowerCase().includes(needle),
      ),
    );
  }).map((module) => module.id);
}

export function unionPermissionDetail(
  roles: ReadonlyArray<{ name: string; codes: readonly string[]; active: boolean }>,
): Array<{ code: PmsPermissionCode; label: string; moduleLabel: string; grantedBy: string[] }> {
  const sources = new Map<PmsPermissionCode, string[]>();
  for (const role of roles) {
    if (!role.active) continue;
    for (const value of role.codes) {
      if (!isPmsPermissionCode(value)) continue;
      const names = sources.get(value) ?? [];
      if (!names.includes(role.name)) names.push(role.name);
      sources.set(value, names);
    }
  }
  return [...sources.entries()].map(([code, grantedBy]) => {
    const meta = staffAccessPermission(code);
    return {
      code,
      label: meta?.label ?? code,
      moduleLabel: meta?.moduleLabel ?? "Access",
      grantedBy,
    };
  });
}

export function actorCanGrantCode(
  actor: { isOwner: boolean; codes: Iterable<string> },
  code: PmsPermissionCode,
): boolean {
  return actorMayGrantPermissions(actor, [parentViewPermission(code), code].filter((value, index, all) => all.indexOf(value) === index));
}

export function roleFitsActor(
  actor: { isOwner: boolean; codes: Iterable<string> },
  roleCodes: readonly string[],
): boolean {
  return actorMayAssignRole(actor, roleCodes);
}

export function canOfferAddStaff(canCreate: boolean, canAssignRoles: boolean): boolean {
  return canCreate && canAssignRoles;
}

export function staffAccessStepVisible(canStaff: boolean, canRoles: boolean): boolean {
  return canStaff || canRoles;
}

export function roleCodeFromName(name: string, taken: readonly string[]): string {
  const cleaned = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  let code = cleaned.replace(/^[0-9]/, "R");
  if (code.length < 2) code = "ROLE";
  code = code.slice(0, 20);
  if (!/^[A-Z]/.test(code)) code = `R${code}`.slice(0, 20);
  const used = new Set(taken);
  let candidate = code;
  let n = 2;
  while (used.has(candidate)) {
    const suffix = `_${n}`;
    candidate = `${code.slice(0, Math.max(2, 20 - suffix.length))}${suffix}`;
    n += 1;
  }
  return candidate;
}

export function friendlyAccessError(message: string): string {
  if (/at least one role/i.test(message)) return ACTIVE_STAFF_NEEDS_ROLE;
  if (message === PMS_PERMISSION_DENIED || /do not have|cannot grant|cannot assign/i.test(message)) {
    return GRANT_OUTSIDE_ACTOR;
  }
  if (/does not belong|another property|not on this property|cross/i.test(message)) return PMS_PERMISSION_DENIED;
  if (/already used/i.test(message)) return "A role with this code already exists for this property.";
  return message || PMS_PERMISSION_DENIED;
}

export function auditActionLabel(action: string): string {
  switch (action) {
    case "staff_created":
      return "Staff created";
    case "staff_profile_updated":
      return "Profile updated";
    case "roles_assigned":
      return "Roles assigned";
    case "roles_removed":
      return "Roles removed";
    case "staff_deactivated":
      return "Deactivated";
    case "staff_reactivated":
      return "Activated";
    case "password_reset_initiated":
      return "Reset initiated";
    case "role_created":
      return "Role created";
    case "role_updated":
      return "Role updated";
    case "role_activated":
      return "Role activated";
    case "role_deactivated":
      return "Role deactivated";
    case "role_permissions_updated":
      return "Role permissions changed";
    default:
      return action.replaceAll("_", " ");
  }
}
