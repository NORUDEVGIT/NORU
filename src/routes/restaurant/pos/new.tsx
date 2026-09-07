/**
 * Phase 8F5 — deprecated address. Kept working for bookmarks; redirects to the
 * canonical Restaurant Management POS & Sales till.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/restaurant/pos/new")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/restaurant-management/pos-sales" },
      });
    }
    throw redirect({ to: "/restaurant/restaurant-management/pos-sales", replace: true });
  },
  component: () => null,
});
