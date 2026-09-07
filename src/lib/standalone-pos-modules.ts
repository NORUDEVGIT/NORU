/**
 * Phase 8H3 — Standalone POS package registry.
 *
 * Standalone POS is an independent commercial package: its own catalog, its
 * own sales, its own settings. It is NOT the Restaurant Management till
 * ("POS & Sales"), which keeps its own routes, menu and orders.
 *
 * Statuses here are honest. Nothing claims to work before it does.
 */
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  ReceiptText,
  MonitorSmartphone,
  BarChart3,
  Settings,
} from "lucide-react";

export type PosModuleStatus = "live" | "foundation" | "next" | "blocked";

export const POS_STATUS_LABEL: Record<PosModuleStatus, string> = {
  live: "Available",
  foundation: "Foundation",
  next: "Next phase",
  blocked: "Not available yet",
};

export type PosModule = {
  key: string;
  title: string;
  description: string;
  icon: typeof LayoutDashboard;
  /** Canonical Standalone POS address, or undefined when no screen exists. */
  canonicalRoute?: string;
  status: PosModuleStatus;
  /** Extra sentence shown on the package home for unfinished areas. */
  note?: string;
};

export const POS_MODULES: PosModule[] = [
  {
    key: "dashboard",
    title: "Dashboard",
    description: "How ready this till is: catalog size, registers and open shifts.",
    icon: LayoutDashboard,
    canonicalRoute: "/restaurant/pos/dashboard",
    status: "foundation",
    note: "Sales figures appear once selling is live.",
  },
  {
    key: "sell",
    title: "Sell",
    description: "Ring up a sale, take payment and finish at the till.",
    icon: ShoppingCart,
    status: "next",
    note: "Selling needs an active register and an open cashier shift — both are ready now. The sell screen is built in the next phase.",
  },

  {
    key: "catalog",
    title: "Catalog",
    description: "The products and categories this till sells — its own, separate from any restaurant menu.",
    icon: Package,
    canonicalRoute: "/restaurant/pos/catalog",
    status: "live",
  },
  {
    key: "transactions",
    title: "Transactions",
    description: "Completed sales, refunds and receipts for this till.",
    icon: ReceiptText,
    canonicalRoute: "/restaurant/pos/transactions",
    status: "foundation",
    note: "Available once selling is enabled.",
  },
  {
    key: "shifts",
    title: "Registers & Shifts",
    description: "Tills in this property and the cashier shifts opened on them.",
    icon: MonitorSmartphone,
    canonicalRoute: "/restaurant/pos/shifts",
    status: "next",
    note: "Built in the next phase, before selling.",
  },
  {
    key: "reports",
    title: "Reports",
    description: "Sales, products, payments, cashier shifts and refunds.",
    icon: BarChart3,
    canonicalRoute: "/restaurant/pos/reports",
    status: "foundation",
    note: "Reports need real sales first.",
  },
  {
    key: "settings",
    title: "Settings",
    description: "Tax behaviour, currency, business date and receipt numbering for this till.",
    icon: Settings,
    canonicalRoute: "/restaurant/pos/settings",
    status: "live",
  },
];

export function getPosModule(key: string): PosModule | undefined {
  return POS_MODULES.find((m) => m.key === key);
}
