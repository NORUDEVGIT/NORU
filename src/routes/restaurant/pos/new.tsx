/**
 * Legacy address kept working for bookmarks. The canonical Restaurant
 * Management address renders the same shared workspace component.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/lib/route-package-guard";
import { PosPage } from "@/components/workspaces/restaurant/pos-workspace";

export const Route = createFileRoute("/restaurant/pos/new")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/pos/new" } });
    }
    await requireRoutePackage("restaurant_management");
  },
  head: () => ({
    meta: [
      { title: "POS Till | NORU Property Portal" },
      {
        name: "description",
        content:
          "Touchscreen point of sale for counter and takeaway orders: one-tap menu, cash and card payments, and charge to room.",
      },
      { property: "og:title", content: "POS Till | NORU" },
      {
        property: "og:description",
        content: "Take counter and takeaway sales in seconds on a tablet till.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PosPage,
});


