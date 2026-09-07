/**
 * Phase 7C — NORU staff roles and module access.
 *
 * Client-safe definitions shared by the UI and the server-side resolver.
 * Module access controls *entry* into a workspace only; every write action
 * keeps its own role check server-side.
 */

export const STAFF_ROLES = [
  "owner",
  "manager",
  "kitchen",
  "waiter",
  "housekeeping", // legacy value, behaves as housekeeping_supervisor
  "receptionist",
  "housekeeper",
  "housekeeping_supervisor",
  "cashier",
  "storekeeper",
  "accountant",
  "maintenance",
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

/** Roles offered in the Human Resources role selector (legacy value excluded). */
export const SELECTABLE_STAFF_ROLES: StaffRole[] = [
  "owner",
  "manager",
  "kitchen",
  "waiter",
  "receptionist",
  "housekeeper",
  "housekeeping_supervisor",
  "cashier",
  "storekeeper",
  "accountant",
  "maintenance",
];

export const ROLE_LABELS: Record<StaffRole, string> = {
  owner: "Owner",
  manager: "Manager",
  kitchen: "Kitchen",
  waiter: "Waiter",
  housekeeping: "Housekeeping Supervisor",
  receptionist: "Receptionist",
  housekeeper: "Housekeeper",
  housekeeping_supervisor: "Housekeeping Supervisor",
  cashier: "Cashier",
  storekeeper: "Storekeeper",
  accountant: "Accountant",
  maintenance: "Maintenance",
};

/**
 * Phase 7D.2A — `pms` is the top-level hotel domain tile on Property Home.
 * The hotel keys below (front_office, housekeeping, configuration,
 * reports_analytics, property_settings) remain in use internally for sidebars,
 * route guards and server checks; they become PMS submodules in 7D.2B.
 */
export const MODULE_KEYS = [
  "pms",
  "food_and_beverage",
  "front_office",
  "housekeeping",
  "pos",
  "standalone_pos",
  "inventory",
  "procurement",
  "human_resources",
  "accounting_finance",
  "reports_analytics",
  "configuration",
  "property_settings",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export const MODULE_LABELS: Record<ModuleKey, string> = {
  pms: "PMS",
  food_and_beverage: "Food & Beverage",
  front_office: "Front Office",
  housekeeping: "Housekeeping",
  pos: "POS",
  standalone_pos: "Standalone POS",
  inventory: "Inventory / Warehouse",
  procurement: "Procurement",
  human_resources: "Human Resources",
  accounting_finance: "Accounting & Finance",
  reports_analytics: "Reports & Analytics",
  configuration: "Configuration",
  property_settings: "Property Settings & Integrations",
};

const ALL_MODULES = MODULE_KEYS as readonly ModuleKey[];

/** Default module entry per role. Owner/manager keep everything. */
export const ROLE_MODULES: Record<StaffRole, ModuleKey[]> = {
  owner: [...ALL_MODULES],
  manager: [...ALL_MODULES],
  kitchen: ["food_and_beverage", "inventory", "procurement"],
  waiter: ["food_and_beverage", "pos"],
  housekeeping: ["housekeeping"],
  housekeeping_supervisor: ["housekeeping"],
  housekeeper: ["housekeeping"],
  maintenance: ["housekeeping"],
  receptionist: ["front_office"],
  cashier: ["accounting_finance", "pos"],
  accountant: ["accounting_finance", "reports_analytics"],
  storekeeper: ["inventory", "procurement"],
};

/**
 * Modules an owner/manager may toggle per staff member. Configuration,
 * property settings and HR are never grantable through an override — they stay
 * tied to owner/manager so an override can't escalate privileges.
 */
export const OVERRIDABLE_MODULES: ModuleKey[] = [
  "food_and_beverage",
  "pos",
  "front_office",
  "housekeeping",
  "inventory",
  "procurement",
  "accounting_finance",
  "reports_analytics",
];

/** Roles whose access is fixed (they already hold everything). */
export const FIXED_ACCESS_ROLES: StaffRole[] = ["owner", "manager"];

export function isStaffRole(value: string): value is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(value);
}

export function defaultModulesForRole(role: string): ModuleKey[] {
  return isStaffRole(role) ? ROLE_MODULES[role] : [];
}

/**
 * THE access rule: role defaults, then owner/manager overrides for the
 * modules that may safely be toggled.
 */
export function resolveModules(role: string, overrides: Record<string, boolean> = {}): ModuleKey[] {
  const set = new Set<ModuleKey>(defaultModulesForRole(role));
  if (!FIXED_ACCESS_ROLES.includes(role as StaffRole)) {
    for (const key of OVERRIDABLE_MODULES) {
      const override = overrides[key];
      if (override === true) set.add(key);
      if (override === false) set.delete(key);
    }
  }
  return ALL_MODULES.filter((m) => set.has(m));
}

export function canAccessModuleFor(
  role: string,
  moduleKey: ModuleKey,
  overrides: Record<string, boolean> = {},
): boolean {
  return resolveModules(role, overrides).includes(moduleKey);
}

/* ------------------------------------------------------------------ *
 * Action scopes inside a module (still enforced server-side per action)
 * ------------------------------------------------------------------ */

export const HOUSEKEEPING_SUPERVISOR_ROLES = [
  "owner",
  "manager",
  "housekeeping",
  "housekeeping_supervisor",
] as const;

/** Roles that may be assigned a housekeeping cleaning task. */
export const HOUSEKEEPING_ASSIGNABLE_ROLES = [
  "owner",
  "manager",
  "housekeeping",
  "housekeeping_supervisor",
  "housekeeper",
] as const;

export type HousekeepingScope = "supervisor" | "housekeeper" | "maintenance";

export function housekeepingScope(role: string): HousekeepingScope {
  if ((HOUSEKEEPING_SUPERVISOR_ROLES as readonly string[]).includes(role)) return "supervisor";
  if (role === "maintenance") return "maintenance";
  return "housekeeper";
}

export const FRONT_OFFICE_ROLES = ["owner", "manager", "receptionist"] as const;
export const CASHIERING_ROLES = ["owner", "manager", "cashier", "accountant"] as const;
export const CASHIERING_MANAGE_ROLES = ["owner", "manager"] as const;
export const INVENTORY_ROLES = ["owner", "manager", "kitchen", "storekeeper"] as const;
export const PURCHASING_ROLES = ["owner", "manager", "storekeeper"] as const;
export const REPORTS_ROLES = ["owner", "manager", "accountant"] as const;
