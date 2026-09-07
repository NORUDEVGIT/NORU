import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy compatibility route — the kitchen now lives in Restaurant Management. */
export const Route = createFileRoute("/kitchen/")({
  ssr: false,
  beforeLoad: async () => {
    const { supabase } = await import("@/integrations/supabase/client");
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
