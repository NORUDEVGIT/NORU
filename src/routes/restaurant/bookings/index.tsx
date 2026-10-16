import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";

export const Route = createFileRoute("/restaurant/bookings/")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/bookings" } });
    }

    await requireRoutePackage("pms");
    throw redirect({ to: "/restaurant/pms/reservations" });
  },
  component: function BookingsRedirect() {
    return null;
  },
});
