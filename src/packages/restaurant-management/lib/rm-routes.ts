/**
 * Phase 8F5 — Restaurant Management route paths.
 *
 * The legacy top-level addresses are now redirect-only, so every shared
 * workspace links to the canonical `/restaurant/restaurant-management/*`
 * family. `useIsRmContext()` is kept for presentation code that still needs to
 * know whether it is rendered inside the package family.
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
  home: "/restaurant/restaurant-management";
  dashboard: "/restaurant/restaurant-management/dashboard";
  orders: "/restaurant/restaurant-management/orders";
  orderDetail: "/restaurant/restaurant-management/orders/$orderId";
  kitchen: "/restaurant/restaurant-management/kitchen";
  menu: "/restaurant/restaurant-management/menu";
  tables: "/restaurant/restaurant-management/tables";
  staff: "/restaurant/restaurant-management/staff";
  reports: "/restaurant/restaurant-management/reports";
  setup: "/restaurant/restaurant-management/setup";
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

/** Canonical Restaurant Management paths. */
export function useRmRoutes(): RmRoutes {
  return CANONICAL;
}
