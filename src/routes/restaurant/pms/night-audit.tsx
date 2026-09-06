import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/components/restaurant-shell";
import { NightAuditWorkspace } from "@/components/workspaces/night-audit-workspace";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/restaurant/pms/night-audit")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/pms/night-audit" },
      });
    }
  },
  head: () => ({
    meta: [
      { title: "Night Audit — NORU PMS" },
      { name: "description", content: "Business date close, audit runs and exceptions for your property." },
      { property: "og:title", content: "Night Audit — NORU PMS" },
      { property: "og:description", content: "Business date close, audit runs and exceptions for your property." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NightAuditPmsRoute,
});

function NightAuditPmsRoute() {
  return (
    <RestaurantShell active="Night Audit" module="cashiering" pms>
      {(m) => <NightAuditWorkspace membership={m} />}
    </RestaurantShell>
  );
}
