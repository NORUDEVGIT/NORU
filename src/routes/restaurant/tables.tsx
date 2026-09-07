/**
 * Phase 8F5 — deprecated address. Kept working for bookmarks; redirects to the
 * canonical Restaurant Management tables & QR screen.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/restaurant/tables")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/restaurant-management/tables" },
      });
    }
    throw redirect({ to: "/restaurant/restaurant-management/tables", replace: true });
  },
  component: () => null,
});
