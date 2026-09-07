import { createFileRoute, redirect } from "@tanstack/react-router";
import { FileSearch } from "lucide-react";
import { RestaurantShell } from "@/components/restaurant-shell";
import { PmsPlaceholder } from "@/components/pms/pms-placeholder";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/lib/route-package-guard";

export const Route = createFileRoute("/restaurant/pms/security-audit")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/pms/security-audit" },
      });
    }

    await requireRoutePackage("pms");
  },
  head: () => ({
    meta: [
      { title: "Security & Audit — NORU PMS" },
      {
        name: "description",
        content: "Access history, sensitive-action review and audit trails for your property.",
      },
      { property: "og:title", content: "Security & Audit — NORU PMS" },
      { property: "og:description", content: "Audit trail and access oversight in NORU." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <RestaurantShell active="PMS" pmsModule="security-audit">
      {() => (
        <PmsPlaceholder
          title="Security & Audit"
          icon={FileSearch}
          description="Oversight of who did what across the hotel domain."
          planned={[
            "Unified audit trail across reservations, folios and rooms",
            "Sensitive-action review (voids, refunds, rate overrides)",
            "Staff access history per property",
          ]}
        />
      )}
    </RestaurantShell>
  ),
});
