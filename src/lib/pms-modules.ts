/**
 * Phase 7D.2B — PMS submodule catalogue.
 *
 * Presentation only: every tile points at an existing workspace (or a clearly
 * labelled placeholder page) and reuses the existing module-access keys for
 * visibility. No new entitlements, no route migration.
 */
import {
  LayoutDashboard,
  CalendarCheck,
  Hotel,
  Wallet,
  Sparkles,
  BedDouble,
  TrendingUp,
  MoonStar,
  ConciergeBell,
  PartyPopper,
  Globe,
  BarChart3,
  SlidersHorizontal,
  ShieldCheck,
  Plug,
  Wrench,
  Bell,
  FileSearch,
} from "lucide-react";
import type { ModuleKey } from "./module-access";

export type PmsGroupKey = "core" | "commercial" | "intelligence" | "system" | "support";

export const PMS_GROUPS: { key: PmsGroupKey; title: string; description: string }[] = [
  {
    key: "core",
    title: "Core hotel operations",
    description: "Everyday rooms-side running of the property.",
  },
  {
    key: "commercial",
    title: "Guest & commercial operations",
    description: "Guest experience, group business and demand channels.",
  },
  {
    key: "intelligence",
    title: "Management & intelligence",
    description: "Performance reporting across the hotel domain.",
  },
  {
    key: "system",
    title: "System management",
    description: "Property configuration, administration and connections.",
  },
  {
    key: "support",
    title: "Support, communication & control",
    description: "Upkeep, messaging and oversight.",
  },
];

export type PmsImplementationStatus = "existing" | "partial" | "planned";

export type PmsModule = {
  /** Stable key for the submodule. */
  key: string;
  title: string;
  description: string;
  icon: typeof LayoutDashboard;
  group: PmsGroupKey;
  /** Existing module-access key that governs visibility. Unchanged in this phase. */
  moduleKey: ModuleKey;
  /** The one address PMS navigation uses. */
  canonicalRoute: string;
  /** Older addresses that still work (redirected or retained implementation routes). */
  legacyRoutes: string[];
  implementationStatus: PmsImplementationStatus;
};

export const PMS_MODULES: PmsModule[] = [
  {
    key: "dashboard",
    title: "Dashboard",
    description: "Live occupancy, arrivals, departures and in-house snapshot.",
    icon: LayoutDashboard,
    group: "core",
    moduleKey: "front_office",
    canonicalRoute: "/restaurant/pms/dashboard",
    legacyRoutes: ["/restaurant/rooms?tab=dashboard"],
    implementationStatus: "existing",
  },
  {
    key: "reservations",
    title: "Reservations",
    description: "Bookings, availability and stay changes.",
    icon: CalendarCheck,
    group: "core",
    moduleKey: "front_office",
    canonicalRoute: "/restaurant/pms/reservations",
    legacyRoutes: ["/restaurant/bookings/reservations"],
    implementationStatus: "existing",
  },
  {
    key: "front-office",
    title: "Front Office",
    description: "Arrivals, check-in and check-out, in-house and room moves.",
    icon: Hotel,
    group: "core",
    moduleKey: "front_office",
    canonicalRoute: "/restaurant/pms/front-office",
    legacyRoutes: ["/restaurant/rooms/arrivals"],
    implementationStatus: "existing",
  },
  {
    key: "cashiering",
    title: "Cashiering",
    description: "Guest folios, postings, payments and cashier shifts.",
    icon: Wallet,
    group: "core",
    moduleKey: "accounting_finance",
    canonicalRoute: "/restaurant/pms/cashiering",
    legacyRoutes: ["/restaurant/cashiering?tab=dashboard"],
    implementationStatus: "existing",
  },
  {
    key: "housekeeping",
    title: "Housekeeping",
    description: "Room rack, cleaning board, inspections and discrepancies.",
    icon: Sparkles,
    group: "core",
    moduleKey: "housekeeping",
    canonicalRoute: "/restaurant/pms/housekeeping",
    legacyRoutes: ["/restaurant/housekeeping?tab=dashboard"],
    implementationStatus: "existing",
  },
  {
    key: "room-inventory",
    title: "Room & Inventory",
    description: "Room types, rooms, availability and out of order / service.",
    icon: BedDouble,
    group: "core",
    moduleKey: "configuration",
    canonicalRoute: "/restaurant/pms/room-inventory",
    legacyRoutes: ["/restaurant/rooms?tab=rooms"],
    implementationStatus: "existing",
  },
  {
    key: "rates-revenue",
    title: "Rate & Revenue Management",
    description: "Rate plans, rate calendar and stay restrictions.",
    icon: TrendingUp,
    group: "core",
    moduleKey: "configuration",
    canonicalRoute: "/restaurant/pms/rates-revenue",
    legacyRoutes: ["/restaurant/bookings/rates?tab=plans"],
    implementationStatus: "existing",
  },
  {
    key: "night-audit",
    title: "Night Audit",
    description: "Business date close, audit runs and exceptions.",
    icon: MoonStar,
    group: "core",
    moduleKey: "accounting_finance",
    canonicalRoute: "/restaurant/pms/night-audit",
    legacyRoutes: ["/restaurant/cashiering/night-audit"],
    implementationStatus: "existing",
  },
  {
    key: "guest-services",
    title: "Guest Services",
    description: "Guest profiles today; requests and concierge tracking are planned.",
    icon: ConciergeBell,
    group: "commercial",
    moduleKey: "front_office",
    canonicalRoute: "/restaurant/pms/guest-services",
    legacyRoutes: [],
    implementationStatus: "planned",
  },
  {
    key: "sales-events",
    title: "Sales & Events",
    description: "Group business, meetings and event bookings — planned.",
    icon: PartyPopper,
    group: "commercial",
    moduleKey: "configuration",
    canonicalRoute: "/restaurant/pms/sales-events",
    legacyRoutes: [],
    implementationStatus: "planned",
  },
  {
    key: "distribution",
    title: "Distribution",
    description: "Direct booking engine and channel presence.",
    icon: Globe,
    group: "commercial",
    moduleKey: "configuration",
    canonicalRoute: "/restaurant/pms/distribution",
    legacyRoutes: ["/restaurant/bookings/distribution"],
    implementationStatus: "existing",
  },
  {
    key: "reports",
    title: "Reports & Analytics",
    description: "Property performance reporting.",
    icon: BarChart3,
    group: "intelligence",
    moduleKey: "reports_analytics",
    canonicalRoute: "/restaurant/pms/reports",
    legacyRoutes: ["/restaurant/reports"],
    implementationStatus: "existing",
  },
  {
    key: "property-setup",
    title: "Property Setup",
    description: "Rooms, rates and property configuration in one place.",
    icon: SlidersHorizontal,
    group: "system",
    moduleKey: "configuration",
    canonicalRoute: "/restaurant/pms/property-setup",
    legacyRoutes: ["/restaurant/configuration"],
    implementationStatus: "existing",
  },
  {
    key: "administration",
    title: "Administration",
    description: "Staff, roles and module access for the property.",
    icon: ShieldCheck,
    group: "system",
    moduleKey: "human_resources",
    canonicalRoute: "/restaurant/pms/administration",
    legacyRoutes: ["/restaurant/staff?tab=staff"],
    implementationStatus: "partial",
  },
  {
    key: "integrations",
    title: "Integrations",
    description: "Property settings and connected services.",
    icon: Plug,
    group: "system",
    moduleKey: "property_settings",
    canonicalRoute: "/restaurant/pms/integrations",
    legacyRoutes: ["/restaurant/settings"],
    implementationStatus: "partial",
  },
  {
    key: "maintenance",
    title: "Maintenance / Engineering",
    description: "Maintenance requests and room engineering follow-up.",
    icon: Wrench,
    group: "support",
    moduleKey: "housekeeping",
    canonicalRoute: "/restaurant/pms/maintenance",
    legacyRoutes: ["/restaurant/housekeeping?tab=maintenance"],
    implementationStatus: "existing",
  },
  {
    key: "notifications",
    title: "Notifications & Communications",
    description: "Guest and staff messaging — planned.",
    icon: Bell,
    group: "support",
    moduleKey: "property_settings",
    canonicalRoute: "/restaurant/pms/notifications",
    legacyRoutes: [],
    implementationStatus: "planned",
  },
  {
    key: "security-audit",
    title: "Security & Audit",
    description: "Access history and audit trail review — planned.",
    icon: FileSearch,
    group: "support",
    moduleKey: "property_settings",
    canonicalRoute: "/restaurant/pms/security-audit",
    legacyRoutes: [],
    implementationStatus: "planned",
  },
];

/** Lookup by submodule key — used by the shell for PMS context and headings. */
export function getPmsModule(key: string): PmsModule | undefined {
  return PMS_MODULES.find((m) => m.key === key);
}

/**
 * Phase 7D.2D — the one PMS navigation model, grouped in the approved order.
 * Every consumer (PMS Home launcher, PMS sidebar) reads this.
 */
export const PMS_NAV_GROUPS: { key: PmsGroupKey; title: string; modules: PmsModule[] }[] =
  PMS_GROUPS.map((g) => ({
    key: g.key,
    title: g.title,
    modules: PMS_MODULES.filter((m) => m.group === g.key),
  }));
