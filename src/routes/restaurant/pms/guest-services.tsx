import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ConciergeBell, UserRound } from "lucide-react";
import { RestaurantShell } from "@/components/restaurant-shell";
import { SharedModuleLinks } from "@/components/pms/shared-module-links";
import { PmsPlaceholder } from "@/components/pms/pms-placeholder";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/restaurant/pms/guest-services")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/pms/guest-services" },
      });
    }
  },
  head: () => ({
    meta: [
      { title: "Guest Services — NORU PMS" },
      {
        name: "description",
        content: "Guest requests, concierge tasks and stay preferences for your property.",
      },
      { property: "og:title", content: "Guest Services — NORU PMS" },
      { property: "og:description", content: "Guest requests and concierge operations in NORU." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <RestaurantShell active="PMS" pmsModule="guest-services">
      {(m) => (
        <div className="space-y-8">
        <PmsPlaceholder
          title="Guest Services"
          icon={ConciergeBell}
          description="Requests, concierge tasks and guest preferences across the stay."
          planned={[
            "Guest requests with ownership and follow-up",
            "Concierge task board tied to the stay",
            "Preferences and VIP handling on the guest profile",
          ]}
        >
          <Link
            to="/restaurant/guests"
            className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
          >
            <UserRound className="size-4" /> Open guest profiles
          </Link>
        </PmsPlaceholder>
          <SharedModuleLinks restaurantId={m.restaurantId} modules={["inventory"]} />
        </div>
      )}
    </RestaurantShell>
  ),
});
