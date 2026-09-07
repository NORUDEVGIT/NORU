/**
 * Phase 8G1 — Back Office package catalogue (foundation only).
 *
 * Back Office is the enterprise consolidation and control layer of NORU. It is
 * NOT another operational package: Restaurant Management runs restaurant
 * operations, PMS runs hotel operations, Standalone POS runs independent
 * checkout.
 *
 * Nothing here is owned by Back Office yet. Modules that point at a
 * `currentRoute` are pointing at an EXISTING shared/transitional property
 * service that keeps its current ownership, permissions and data. No status is
 * "existing", because no Back Office-owned functionality exists today.
 */
import {
  LayoutDashboard,
  Users,
  Wallet,
  Boxes,
  Truck,
  Calculator,
  BarChart3,
  ShieldCheck,
  TrendingDown,
  Database,
} from "lucide-react";
import type { ModuleKey } from "./module-access";

export type BoGroupKey = "overview" | "people" | "supply" | "finance" | "control";

export const BO_GROUPS: { key: BoGroupKey; title: string; description: string }[] = [
  {
    key: "overview",
    title: "Overview",
    description: "Where the Back Office layer stands today.",
  },
  {
    key: "people",
    title: "People & workforce",
    description: "One workforce record for the whole property, and what it will pay.",
  },
  {
    key: "supply",
    title: "Supply chain & cost",
    description: "Central warehouse, buying and the cost of what the property consumes.",
  },
  {
    key: "finance",
    title: "Finance & intelligence",
    description: "Consolidated money and consolidated insight across every package.",
  },
  {
    key: "control",
    title: "Control & governance",
    description: "Property-level oversight and shared reference data.",
  },
];

export type BoImplementationStatus = "existing" | "partial" | "foundation" | "planned";

export const BO_STATUS_LABEL: Record<BoImplementationStatus, string> = {
  existing: "Available",
  partial: "Shared today",
  foundation: "Foundation",
  planned: "Planned",
};

export type BoModule = {
  key: string;
  title: string;
  description: string;
  icon: typeof LayoutDashboard;
  group: BoGroupKey;
  /** Canonical Back Office address (live in Phase 8G1, foundation content). */
  canonicalRoute: string;
  /** Existing shared screen that covers part of this scope today, if any. */
  currentRoute?: string;
  currentSearch?: Record<string, string>;
  currentLabel?: string;
  /** Existing module-access key gating the "open the current screen" link. */
  moduleKey?: ModuleKey;
  implementationStatus: BoImplementationStatus;
  /** Packages whose data this module will eventually consolidate. */
  sourcePackages?: string[];
  /** Bullet points describing the future Back Office scope. Honest, no claims. */
  futureScope: string[];
  /** One line about where this lives today during migration. */
  todayNote: string;
};

export const BO_MODULES: BoModule[] = [
  {
    key: "dashboard",
    title: "Dashboard",
    description: "What Back Office covers for this property and how far each area has moved.",
    icon: LayoutDashboard,
    group: "overview",
    canonicalRoute: "/restaurant/back-office/dashboard",
    implementationStatus: "foundation",
    futureScope: [
      "A single view of the property's back-office position once the areas below are consolidated.",
      "Cross-package status: Restaurant Management, PMS and Standalone POS as source systems.",
    ],
    todayNote:
      "No consolidated figures are shown yet — operational numbers stay in the package that owns them.",
  },

  // ------------------------------------------------------------ people
  {
    key: "hr",
    title: "Human Resources",
    description: "One property-wide workforce record, consolidated across every package.",
    icon: Users,
    group: "people",
    canonicalRoute: "/restaurant/back-office/hr",
    currentRoute: "/restaurant/staff",
    currentSearch: { tab: "schedule" },
    currentLabel: "Open the current Workforce screen",
    moduleKey: "human_resources",
    implementationStatus: "partial",
    sourcePackages: ["Restaurant Management", "PMS"],
    futureScope: [
      "Employee master record shared by every package.",
      "Contracts, documents and workforce policy at property level.",
      "Consolidated scheduling and attendance reporting.",
    ],
    todayNote:
      "People, roles, shifts and attendance remain the existing shared workforce service. Nothing has moved and no records are duplicated.",
  },
  {
    key: "payroll",
    title: "Payroll",
    description: "Paying the property's workforce from the shared employee record.",
    icon: Wallet,
    group: "people",
    canonicalRoute: "/restaurant/back-office/payroll",
    implementationStatus: "planned",
    futureScope: [
      "Pay runs built from attendance and contracts.",
      "Payslips, deductions and statutory handling.",
    ],
    todayNote: "Payroll does not exist yet in NORU. Nothing is calculated or stored.",
  },

  // ------------------------------------------------------------ supply
  {
    // Phase 8G2C — Back Office is the canonical home for central inventory.
    key: "inventory",
    title: "Inventory / Warehouse",
    description:
      "Central stock control for the property: item master, movement ledger and shared units.",
    icon: Boxes,
    group: "supply",
    canonicalRoute: "/restaurant/back-office/inventory",
    moduleKey: "inventory",
    implementationStatus: "partial",
    sourcePackages: ["Restaurant Management", "PMS"],
    futureScope: [
      "Storage locations, a central warehouse and issues to each operating package.",
      "Inter-outlet transfers.",
      "A real stock valuation method and period closing stock.",
    ],
    todayNote:
      "Item master, property-wide movement history and units are canonical here, on the same records and the same single stock ledger (inventory_items, inventory_stock_movements, inventory_units). Restaurant operational stock, operating assets and recipe cost stay in Restaurant Management. Received goods from Procurement post to this same ledger. Valuation and warehouses do not exist yet.",
  },

  {
    // Phase 8G2B — Back Office is the canonical owner of procurement.
    key: "procurement",
    title: "Procurement",
    description:
      "Suppliers, purchase orders and goods receiving for the whole property, owned by Back Office.",
    icon: Truck,
    group: "supply",
    canonicalRoute: "/restaurant/back-office/procurement",
    moduleKey: "procurement",
    implementationStatus: "existing",
    sourcePackages: ["Restaurant Management", "PMS"],
    futureScope: [
      "Purchasing approvals and spend limits.",
      "Purchase-to-pay linked into Back Office accounting.",
      "Supplier returns and credit notes.",
    ],
    todayNote:
      "Suppliers, purchase orders and goods receiving are live here on the same data and the same Procurement permissions. Received goods still post to the Inventory stock ledger, which Inventory owns. The old Inventory tabs keep working.",
  },
  {
    key: "cost-control",
    title: "Cost Control",
    description: "What the property spends to produce what it sells.",
    icon: TrendingDown,
    group: "supply",
    canonicalRoute: "/restaurant/back-office/cost-control",
    implementationStatus: "planned",
    sourcePackages: ["Restaurant Management", "PMS"],
    futureScope: [
      "Cost of sales from inventory valuation, recipes and purchasing.",
      "Labour cost against revenue from the operating packages.",
      "Variance and wastage control at property level.",
    ],
    todayNote:
      "No cost-control calculations run yet. Recipe cost stays in Restaurant Management.",
  },

  // ------------------------------------------------------------ finance
  {
    key: "accounting",
    title: "Accounting & Finance",
    description: "Consolidated financial events from every package.",
    icon: Calculator,
    group: "finance",
    canonicalRoute: "/restaurant/back-office/accounting",
    currentRoute: "/restaurant/cashiering",
    currentSearch: { tab: "dashboard" },
    currentLabel: "Open the current Accounting & Finance screen",
    moduleKey: "accounting_finance",
    implementationStatus: "foundation",
    sourcePackages: ["Restaurant Management", "PMS", "Standalone POS", "Procurement"],
    futureScope: [
      "Consolidation of restaurant payments, hotel folio postings, POS sales and purchasing effects.",
      "Property-level financial control and period close.",
    ],
    todayNote:
      "There is no general ledger, chart of accounts, journals or AP/AR in NORU. Hotel folios stay in PMS and restaurant payments stay in Restaurant Management.",
  },
  {
    key: "reports",
    title: "Reports & Intelligence",
    description: "Cross-package reporting once each source package is consolidated.",
    icon: BarChart3,
    group: "finance",
    canonicalRoute: "/restaurant/back-office/reports",
    currentRoute: "/restaurant/reports",
    currentLabel: "Open the current shared Reports screen",
    moduleKey: "reports_analytics",
    implementationStatus: "partial",
    sourcePackages: ["Restaurant Management", "PMS", "Standalone POS"],
    futureScope: [
      "Consolidated property performance across packages.",
      "Comparisons and trends that no single package can produce alone.",
    ],
    todayNote:
      "Package reports are not copied here. Restaurant reporting stays in Restaurant Management and hotel reporting stays in PMS.",
  },

  // ------------------------------------------------------------ control
  {
    key: "audit",
    title: "Audit & Compliance",
    description: "Property-level oversight of who changed what.",
    icon: ShieldCheck,
    group: "control",
    canonicalRoute: "/restaurant/back-office/audit",
    implementationStatus: "foundation",
    futureScope: [
      "Property-level activity trail across packages.",
      "Compliance checks and controlled exports.",
    ],
    todayNote:
      "Existing audit records stay under their current, stricter access. Nothing platform-level is exposed here.",
  },
  {
    key: "master-data",
    title: "Master Data",
    description: "Shared reference data used by every package.",
    icon: Database,
    group: "control",
    canonicalRoute: "/restaurant/back-office/master-data",
    implementationStatus: "foundation",
    futureScope: [
      "Property-level reference lists shared by more than one package.",
      "Consistent naming, units and categories across the estate.",
    ],
    todayNote:
      "Hotel master data stays in PMS setup and restaurant reference data stays in Restaurant Management setup. Nothing has moved.",
  },
];

export function getBoModule(key: string): BoModule | undefined {
  return BO_MODULES.find((m) => m.key === key);
}
