/**
 * Phase 8F3 — small route-context helper for Restaurant Management.
 *
 * Shared workspace components are rendered by BOTH the legacy top-level
 * addresses and the canonical `/restaurant/restaurant-management/*` family.
 * This helper answers one question — "which family am I in?" — and hands back
 * the matching paths, so a canonical page links to canonical children and a
 * legacy page keeps its legacy targets. No routing framework, just a lookup.
 */
import { useRouterState } from "@tanstack/react-router";

export const RM_BASE = "/restaurant/restaurant-management";

export function useIsRmContext(): boolean {
  return useRouterState({
    select: (s) => s.location.pathname.startsWith(RM_BASE),
  });
}

export type RmRoutes = {
  canonical: boolean;
  home: "/restaurant/restaurant-management" | "/restaurant/home";
  dashboard: "/restaurant/restaurant-management/dashboard" | "/restaurant/dashboard";
  orders: "/restaurant/restaurant-management/orders" | "/restaurant/orders";
  orderDetail: "/restaurant/restaurant-management/orders/$orderId" | "/restaurant/orders/$orderId";
  kitchen: "/restaurant/restaurant-management/kitchen" | "/restaurant/kitchen";
  menu: "/restaurant/restaurant-management/menu" | "/restaurant/menu";
  tables: "/restaurant/restaurant-management/tables" | "/restaurant/tables";
  staff: "/restaurant/restaurant-management/staff" | "/restaurant/staff";
  reports: "/restaurant/restaurant-management/reports" | "/restaurant/reports";
  setup: "/restaurant/restaurant-management/setup" | "/restaurant/settings";
};

const CANONICAL: RmRoutes = {
  canonical: true,
  home: "/restaurant/restaurant-management",
  dashboard: "/restaurant/restaurant-management/dashboard",
  orders: "/restaurant/restaurant-management/orders",
  orderDetail: "/restaurant/restaurant-management/orders/$orderId",
  kitchen: "/restaurant/restaurant-management/kitchen",
  menu: "/restaurant/restaurant-management/menu",
  tables: "/restaurant/restaurant-management/tables",
  staff: "/restaurant/restaurant-management/staff",
  reports: "/restaurant/restaurant-management/reports",
  setup: "/restaurant/restaurant-management/setup",
};

const LEGACY: RmRoutes = {
  canonical: false,
  home: "/restaurant/home",
  dashboard: "/restaurant/dashboard",
  orders: "/restaurant/orders",
  orderDetail: "/restaurant/orders/$orderId",
  kitchen: "/restaurant/kitchen",
  menu: "/restaurant/menu",
  tables: "/restaurant/tables",
  staff: "/restaurant/staff",
  reports: "/restaurant/reports",
  setup: "/restaurant/settings",
};

/** Paths for the family the current page belongs to. */
export function useRmRoutes(): RmRoutes {
  return useIsRmContext() ? CANONICAL : LEGACY;
}
