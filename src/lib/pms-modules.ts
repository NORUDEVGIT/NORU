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

export type PmsModule = {
  title: string;
  description: string;
  icon: typeof LayoutDashboard;
  group: PmsGroupKey;
  /** Existing module-access key that governs visibility. */
  moduleKey: ModuleKey;
  to: string;
  tab?: string;
  /** True for the clean placeholder landing pages created this phase. */
  planned?: boolean;
};

export const PMS_MODULES: PmsModule[] = [
  {
    title: "Dashboard",
    description: "Live occupancy, arrivals, departures and in-house snapshot.",
    icon: LayoutDashboard,
    group: "core",
    moduleKey: "front_office",
    to: "/restaurant/rooms",
    tab: "dashboard",
  },
  {
    title: "Reservations",
    description: "Bookings, availability and stay changes.",
    icon: CalendarCheck,
    group: "core",
    moduleKey: "front_office",
    to: "/restaurant/bookings/reservations",
  },
  {
    title: "Front Office",
    description: "Arrivals, check-in and check-out, in-house and room moves.",
    icon: Hotel,
    group: "core",
    moduleKey: "front_office",
    to: "/restaurant/rooms/arrivals",
  },
  {
    title: "Cashiering",
    description: "Guest folios, postings, payments and cashier shifts.",
    icon: Wallet,
    group: "core",
    moduleKey: "accounting_finance",
    to: "/restaurant/cashiering",
    tab: "dashboard",
  },
  {
    title: "Housekeeping",
    description: "Room rack, cleaning board, inspections and discrepancies.",
    icon: Sparkles,
    group: "core",
    moduleKey: "housekeeping",
    to: "/restaurant/housekeeping",
    tab: "dashboard",
  },
  {
    title: "Room & Inventory",
    description: "Room types, rooms, availability and out of order / service.",
    icon: BedDouble,
    group: "core",
    moduleKey: "configuration",
    to: "/restaurant/rooms",
    tab: "rooms",
  },
  {
    title: "Rate & Revenue Management",
    description: "Rate plans, rate calendar and stay restrictions.",
    icon: TrendingUp,
    group: "core",
    moduleKey: "configuration",
    to: "/restaurant/bookings/rates",
    tab: "plans",
  },
  {
    title: "Night Audit",
    description: "Business date close, audit runs and exceptions.",
    icon: MoonStar,
    group: "core",
    moduleKey: "accounting_finance",
    to: "/restaurant/cashiering/night-audit",
  },
  {
    title: "Guest Services",
    description: "Guest profiles today; requests and concierge tracking are planned.",
    icon: ConciergeBell,
    group: "commercial",
    moduleKey: "front_office",
    to: "/restaurant/pms/guest-services",
    planned: true,
  },
  {
    title: "Sales & Events",
    description: "Group business, meetings and event bookings — planned.",
    icon: PartyPopper,
    group: "commercial",
    moduleKey: "configuration",
    to: "/restaurant/pms/sales-events",
    planned: true,
  },
  {
    title: "Distribution",
    description: "Direct booking engine and channel presence.",
    icon: Globe,
    group: "commercial",
    moduleKey: "configuration",
    to: "/restaurant/bookings/distribution",
  },
  {
    title: "Reports & Analytics",
    description: "Property performance reporting.",
    icon: BarChart3,
    group: "intelligence",
    moduleKey: "reports_analytics",
    to: "/restaurant/reports",
  },
  {
    title: "Property Setup",
    description: "Rooms, rates and property configuration in one place.",
    icon: SlidersHorizontal,
    group: "system",
    moduleKey: "configuration",
    to: "/restaurant/configuration",
  },
  {
    title: "Administration",
    description: "Staff, roles and module access for the property.",
    icon: ShieldCheck,
    group: "system",
    moduleKey: "human_resources",
    to: "/restaurant/staff",
    tab: "staff",
  },
  {
    title: "Integrations",
    description: "Property settings and connected services.",
    icon: Plug,
    group: "system",
    moduleKey: "property_settings",
    to: "/restaurant/settings",
  },
  {
    title: "Maintenance / Engineering",
    description: "Maintenance requests and room engineering follow-up.",
    icon: Wrench,
    group: "support",
    moduleKey: "housekeeping",
    to: "/restaurant/housekeeping",
    tab: "maintenance",
  },
  {
    title: "Notifications & Communications",
    description: "Guest and staff messaging — planned.",
    icon: Bell,
    group: "support",
    moduleKey: "property_settings",
    to: "/restaurant/pms/notifications",
    planned: true,
  },
  {
    title: "Security & Audit",
    description: "Access history and audit trail review — planned.",
    icon: FileSearch,
    group: "support",
    moduleKey: "property_settings",
    to: "/restaurant/pms/security-audit",
    planned: true,
  },
];
