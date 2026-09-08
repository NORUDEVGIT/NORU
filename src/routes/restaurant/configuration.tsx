import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { ConfigurationWorkspace } from "@/core/components/workspaces/configuration-workspace";
import { supabase } from "@/integrations/supabase/client";
import { requireOperationalRestaurantRoute } from "@/core/lib/route-package-guard";

export const Route = createFileRoute("/restaurant/configuration")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/configuration" } });
    }
    await requireOperationalRestaurantRoute();
  },
  head: () => ({
    meta: [
      { title: "Configuration — NORU" },
      {
        name: "description",
        content:
          "Operational master data in NORU: menu, tables and QR, room types, rooms, rate plans, rate calendar, restrictions and distribution.",
      },
      { property: "og:title", content: "Configuration — NORU" },
      { property: "og:description", content: "Set up the master data behind your daily operation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ConfigurationRoute,
});

function ConfigurationRoute() {
  return (
    <RestaurantShell active="Configuration">
      {(m) => <ConfigurationWorkspace membership={m} />}
    </RestaurantShell>
  );
}
