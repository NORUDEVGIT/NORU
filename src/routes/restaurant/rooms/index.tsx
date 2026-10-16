import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";

export const Route = createFileRoute("/restaurant/rooms/")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) =>
    typeof search["tab"] === "string" ? { tab: search["tab"] as string } : {},
  beforeLoad: async ({ search }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/rooms" } });
    }

    await requireRoutePackage("pms");
    const tab = "tab" in search && typeof search.tab === "string" ? search.tab : undefined;
    throw redirect({
      to: "/restaurant/pms/room-inventory",
      search: tab ? { tab } : {},
    });
  },
  component: function RoomsRedirect() {
    return null;
  },
});
