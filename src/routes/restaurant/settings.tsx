import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/components/restaurant-shell";
import { SettingsWorkspace } from "@/components/workspaces/settings-workspace";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/restaurant/settings")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/restaurant/login" });
  },
  head: () => ({
    meta: [
      { title: "Property Settings & Integrations — NORU" },
      { name: "description", content: "Update your restaurant name, contact details and address on the NORU platform." },
      { property: "og:title", content: "Property Settings & Integrations — NORU" },
      { property: "og:description", content: "Update your restaurant details." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RestaurantSettings,
});

function RestaurantSettings() {
  return (
    <RestaurantShell active="Settings">
      {(m) => <SettingsWorkspace membership={m} />}
    </RestaurantShell>
  );
}
