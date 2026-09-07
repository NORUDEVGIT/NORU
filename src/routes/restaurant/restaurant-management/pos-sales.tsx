/**
 * Phase 8F2 — canonical Restaurant Management route. Full-screen operating
 * surface: it renders the same shared workspace as the legacy address.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/lib/route-package-guard";
import { PosPage } from "@/components/workspaces/restaurant/pos-workspace";

export const Route = createFileRoute("/restaurant/restaurant-management/pos-sales/")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/restaurant-management/pos-sales" } });
    }

    await requireRoutePackage("restaurant_management");
  },
  head: () => ({
    meta: [
      { title: "POS & Sales — Restaurant Management — NORU" },
      { name: "description", content: "The restaurant till: touch selling from the restaurant menu into restaurant orders." },
      { property: "og:title", content: "POS & Sales — Restaurant Management — NORU" },
      { property: "og:description", content: "The restaurant till: touch selling from the restaurant menu into restaurant orders." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }}),
  component: PosPage,
});
