import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { SettingsWorkspace } from "@/core/components/workspaces/settings-workspace";
import { PmsSet1Hub } from "@/packages/pms/components/settings/pms-set1-hub";
import { usePackageEntitlements } from "@/core/lib/use-package-entitlements";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/restaurant/settings")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/restaurant/login" });
  },
  head: () => ({
    meta: [
      { title: "Settings — NORU" },
      { name: "description", content: "Property identity, check-in times, taxes and policies." },
      { property: "og:title", content: "Settings — NORU" },
      { property: "og:description", content: "Property identity, check-in times, taxes and policies." },
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
      {(m) => <PropertySettingsPage membership={m} />}
    </RestaurantShell>
  );
}

function PropertySettingsPage({ membership }: { membership: RestaurantMembership }) {
  const packages = usePackageEntitlements(membership.restaurantId);
  if (packages.loading) return <p className="text-sm text-muted-foreground">Loading settings…</p>;
  if (packages.has("pms")) return <PmsSet1Hub membership={membership} />;
  return <SettingsWorkspace membership={membership} />;
}
