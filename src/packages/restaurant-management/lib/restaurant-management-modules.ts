/**
 * Phase 8F1 — Restaurant Management submodule catalogue.
 *
 * One source of truth for what the Restaurant Management package contains.
 * Presentation only: every tile points at an EXISTING working screen and
 * reuses the existing module-access keys for visibility. No new entitlements,
 * Phase 8F2 — /restaurant/restaurant-management/* is now the CANONICAL route
 * family. `canonicalRoute` is the live address; `legacyRoutes` records the
 * older addresses that still work for bookmarks. No business logic changed.
 *
 * Ownership notes that must not drift:
 * - The current POS is the RESTAURANT MANAGEMENT POS (it uses the restaurant
 *   menu and restaurant orders). It is NOT the future Standalone POS package.
 * - Inventory, Procurement, Staff, Settings, Configuration and some reports
 *   are still SHARED_TEMPORARY services; Restaurant Management links to the
 *   current implementations and records that with `transitional: true`.
 * - Restaurant Payments & Cashiering is restaurant-only. Hotel folios and
 *   guest billing stay in PMS Cashiering.
 */
import {
  LayoutDashboard,
  CreditCard,
  QrCode,
  LayoutGrid,
  ReceiptText,
  ChefHat,
  UtensilsCrossed,
  BookOpen,
  Boxes,
  Users,
  Wallet,
  BarChart3,
  SlidersHorizontal,
  CalendarClock,
  UserRound,
  Martini,
  Truck,
  Factory,
  Bike,
  PartyPopper,
  BedDouble,
  HeartHandshake,
  Megaphone,
  TrendingUp,
  Calculator,
  Building2,
  Plug,
  ShieldCheck,
} from "lucide-react";
import type { ModuleKey } from "@/core/lib/module-access";

export type RmGroupKey = "operations" | "menu_cost_stock" | "people_control" | "system";

export const RM_GROUPS: { key: RmGroupKey; title: string; description: string }[] = [
  {
    key: "operations",
    title: "Restaurant operations",
    description: "Everyday service: selling, ordering, tables, orders and the kitchen.",
  },
  {
    key: "menu_cost_stock",
    title: "Menu, cost & stock",
    description: "What you sell, what it costs and what you hold.",
  },
  {
    key: "people_control",
    title: "People & control",
    description: "Workforce, restaurant money and restaurant performance.",
  },
  {
    key: "system",
    title: "System management",
    description: "Restaurant setup and administration.",
  },
];

export type RmImplementationStatus = "existing" | "partial" | "foundation" | "planned";

export type RmModule = {
  /** Stable key for the submodule. */
  key: string;
  title: string;
  description: string;
  icon: typeof LayoutDashboard;
  group: RmGroupKey;
  /** Existing module-access key that governs visibility. Unchanged in this phase. */
  moduleKey: ModuleKey;
  /** The canonical Restaurant Management address (live). */
  canonicalRoute: string;
  /** Optional query for the canonical route (tabbed screens). */
  canonicalSearch?: Record<string, string>;
  /** Older addresses that still work; not deleted in this phase. */
  legacyRoutes: string[];
  implementationStatus: RmImplementationStatus;
  /** True while the target screen is a shared/transitional property-wide service. */
  transitional?: boolean;
  /** Property-wide services this submodule consumes (never duplicates). */
  sharedDependencies?: ModuleKey[];
};

export const RM_MODULES: RmModule[] = [
  // ---------------------------------------------------------------- operations
  {
    key: "dashboard",
    title: "Dashboard",
    description: "Today's restaurant trading: order value, active orders and service load.",
    icon: LayoutDashboard,
    group: "operations",
    moduleKey: "food_and_beverage",
    canonicalRoute: "/restaurant/restaurant-management/dashboard",
    legacyRoutes: ["/restaurant/dashboard"],
    implementationStatus: "existing",
  },
  {
    key: "pos-sales",
    title: "POS & Sales",
    description:
      "The restaurant till: touch selling from the restaurant menu into restaurant orders. Not the future Standalone POS package.",
    icon: CreditCard,
    group: "operations",
    moduleKey: "pos",
    canonicalRoute: "/restaurant/restaurant-management/pos-sales",
    legacyRoutes: ["/restaurant/pos/new"],
    implementationStatus: "existing",
  },
  {
    key: "digital-ordering",
    title: "Digital Ordering",
    description: "QR table ordering and waiter-assisted ordering for guests in the venue.",
    icon: QrCode,
    group: "operations",
    moduleKey: "food_and_beverage",
    canonicalRoute: "/restaurant/restaurant-management/digital-ordering",
    legacyRoutes: ["/restaurant/waiter"],
    implementationStatus: "existing",
  },
  {
    key: "tables-floor",
    title: "Table & Floor Management",
    description: "Tables, table codes and the printable QR cards guests scan.",
    icon: LayoutGrid,
    group: "operations",
    moduleKey: "food_and_beverage",
    canonicalRoute: "/restaurant/restaurant-management/tables",
    legacyRoutes: ["/restaurant/tables"],
    implementationStatus: "existing",
  },
  {
    key: "orders",
    title: "Order Management & Distribution",
    description: "Every restaurant order, its lines, its status and where it came from.",
    icon: ReceiptText,
    group: "operations",
    moduleKey: "food_and_beverage",
    canonicalRoute: "/restaurant/restaurant-management/orders",
    legacyRoutes: ["/restaurant/orders", "/restaurant/orders/$orderId"],
    implementationStatus: "existing",
  },
  {
    key: "kitchen",
    title: "Kitchen & Department Order Display",
    description: "Live preparation board for the kitchen and service departments.",
    icon: ChefHat,
    group: "operations",
    moduleKey: "food_and_beverage",
    canonicalRoute: "/restaurant/restaurant-management/kitchen",
    legacyRoutes: ["/restaurant/kitchen"],
    implementationStatus: "existing",
  },

  // ----------------------------------------------------------- menu cost stock
  {
    key: "menu",
    title: "Menu & Product Management",
    description: "Categories, dishes, prices, availability and menu images.",
    icon: UtensilsCrossed,
    group: "menu_cost_stock",
    moduleKey: "food_and_beverage",
    canonicalRoute: "/restaurant/restaurant-management/menu",
    legacyRoutes: ["/restaurant/menu"],
    implementationStatus: "existing",
  },
  {
    key: "recipe-cost",
    title: "Recipe & Cost Management",
    description:
      "Dish recipes, ingredient mapping and plate cost. Currently managed from inside the menu screen.",
    icon: BookOpen,
    group: "menu_cost_stock",
    moduleKey: "food_and_beverage",
    canonicalRoute: "/restaurant/restaurant-management/recipe-cost",
    legacyRoutes: ["/restaurant/menu"],
    implementationStatus: "partial",
    sharedDependencies: ["inventory"],
  },
  {
    key: "inventory",
    title: "Inventory & Stock Management",
    description:
      "Stock items, movements and low-stock control. Shared property-wide service for now.",
    icon: Boxes,
    group: "menu_cost_stock",
    moduleKey: "inventory",
    canonicalRoute: "/restaurant/restaurant-management/inventory",
    canonicalSearch: { tab: "overview" },
    legacyRoutes: ["/restaurant/inventory"],
    implementationStatus: "existing",
    transitional: true,
    sharedDependencies: ["inventory"],
  },

  // -------------------------------------------------------------- people/control
  {
    key: "staff",
    title: "Staff & Workforce Management",
    description:
      "Restaurant team, roles, schedule and attendance. One property-wide workforce for now.",
    icon: Users,
    group: "people_control",
    moduleKey: "human_resources",
    canonicalRoute: "/restaurant/restaurant-management/staff",
    canonicalSearch: { tab: "schedule" },
    legacyRoutes: ["/restaurant/staff"],
    implementationStatus: "existing",
    transitional: true,
    sharedDependencies: ["human_resources"],
  },
  {
    key: "payments-cashiering",
    title: "Payments & Cashiering",
    description:
      "How restaurant payments and cashier shifts work today, and what is not built yet. Settlement itself happens at the till; hotel folios and guest billing stay in PMS Cashiering.",
    icon: Wallet,
    group: "people_control",
    moduleKey: "pos",
    canonicalRoute: "/restaurant/restaurant-management/payments",
    legacyRoutes: [],
    implementationStatus: "foundation",
  },
  {
    key: "reports",
    title: "Reports & Analytics",
    description:
      "Restaurant sales, product performance, order performance and restaurant KPIs. No hotel reporting here.",
    icon: BarChart3,
    group: "people_control",
    moduleKey: "reports_analytics",
    canonicalRoute: "/restaurant/restaurant-management/reports",
    legacyRoutes: ["/restaurant/reports"],
    implementationStatus: "existing",
    transitional: true,
  },

  // -------------------------------------------------------------------- system
  {
    key: "setup-admin",
    title: "Restaurant Setup & Administration",
    description:
      "Outlet configuration, dining areas, tax & service, hours, charges and stations. Reuses the current configuration screen for now.",
    icon: SlidersHorizontal,
    group: "system",
    moduleKey: "configuration",
    canonicalRoute: "/restaurant/restaurant-management/setup",
    legacyRoutes: ["/restaurant/configuration"],
    implementationStatus: "partial",
    transitional: true,
  },
];

/**
 * Future Restaurant Management capabilities. Registered so the architecture is
 * explicit — NOT built, and never presented as working functionality.
 * `currentRoute` is only set where a real, existing screen already covers part
 * of the capability.
 */
export type RmFutureModule = {
  key: string;
  title: string;
  description: string;
  icon: typeof LayoutDashboard;
  implementationStatus: Exclude<RmImplementationStatus, "existing">;
  moduleKey?: ModuleKey;
  currentRoute?: string;
  currentSearch?: Record<string, string>;
};

export const RM_FUTURE_MODULES: RmFutureModule[] = [
  {
    key: "reservations-waitlist",
    title: "Restaurant Reservation & Waitlist",
    description: "Table bookings and waitlist for the venue.",
    icon: CalendarClock,
    implementationStatus: "planned",
  },
  {
    key: "guest-customers",
    title: "Guest & Customer Management",
    description: "Restaurant customer profiles and order history.",
    icon: UserRound,
    implementationStatus: "planned",
  },
  {
    key: "bar-beverage",
    title: "Bar & Beverage Management",
    description: "Bar service, pouring control and beverage stock.",
    icon: Martini,
    implementationStatus: "planned",
  },
  {
    key: "procurement",
    title: "Procurement & Supplier Management",
    description: "Suppliers, purchase orders and goods receiving (shared service today).",
    icon: Truck,
    implementationStatus: "foundation",
    moduleKey: "procurement",
    currentRoute: "/restaurant/inventory",
    currentSearch: { tab: "suppliers" },
  },
  {
    key: "production",
    title: "Production & Central Kitchen",
    description: "Batch production and central kitchen distribution.",
    icon: Factory,
    implementationStatus: "planned",
  },
  {
    key: "delivery",
    title: "Delivery Management",
    description: "Delivery orders, drivers and dispatch.",
    icon: Bike,
    implementationStatus: "planned",
  },
  {
    key: "buffet-catering",
    title: "Buffet & Catering",
    description: "Buffet service and catering events.",
    icon: PartyPopper,
    implementationStatus: "planned",
  },
  {
    key: "room-service",
    title: "Room Service & PMS Integration",
    description: "Room service ordering; Charge to Room already posts to hotel folios.",
    icon: BedDouble,
    implementationStatus: "foundation",
  },
  {
    key: "loyalty",
    title: "Customer Loyalty & Membership",
    description: "Loyalty points, tiers and memberships.",
    icon: HeartHandshake,
    implementationStatus: "planned",
  },
  {
    key: "promotions",
    title: "Promotions & Marketing",
    description: "Offers, vouchers and campaigns.",
    icon: Megaphone,
    implementationStatus: "planned",
  },
  {
    key: "staff-sales",
    title: "Staff Money & Sales Dashboard",
    description: "Per-server sales, tips and cash accountability.",
    icon: TrendingUp,
    implementationStatus: "planned",
  },
  {
    key: "finance",
    title: "Restaurant Finance & Accounting",
    description: "Restaurant-level revenue, cost and margin accounting.",
    icon: Calculator,
    implementationStatus: "planned",
  },
  {
    key: "multi-outlet",
    title: "Multi-Outlet & Chain Management",
    description: "Several outlets or venues under one brand.",
    icon: Building2,
    implementationStatus: "planned",
  },
  {
    key: "integrations",
    title: "Integrations & API",
    description: "Third-party connections and API access for the restaurant.",
    icon: Plug,
    implementationStatus: "planned",
  },
  {
    key: "security-audit",
    title: "Security & Audit",
    description: "Restaurant-level activity trail and control review.",
    icon: ShieldCheck,
    implementationStatus: "planned",
  },
];
