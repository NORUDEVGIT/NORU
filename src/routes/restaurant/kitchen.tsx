/**
 * Phase 8F5 — deprecated address. Kept working for bookmarks; redirects to the
 * canonical Restaurant Management kitchen screen.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/restaurant/kitchen")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/restaurant-management/kitchen" },
      });
    }
    throw redirect({ to: "/restaurant/restaurant-management/kitchen", replace: true });
  },
  component: () => null,
});
