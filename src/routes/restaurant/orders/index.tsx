/**
 * Phase 8F5 — deprecated address. Kept working for bookmarks; redirects to the
 * canonical Restaurant Management order list, preserving filters and paging.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { validateOrdersSearch } from "@/packages/restaurant-management/components/workspaces/orders-workspace";

export const Route = createFileRoute("/restaurant/orders/")({
  ssr: false,
  validateSearch: validateOrdersSearch,
  beforeLoad: async ({ search }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/restaurant-management/orders" },
      });
    }
    throw redirect({
      to: "/restaurant/restaurant-management/orders",
      search,
      replace: true,
    });
  },
  component: () => null,
});
