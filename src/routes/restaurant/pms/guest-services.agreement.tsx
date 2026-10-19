import { createFileRoute, Link, redirect } from "@tanstack/react-router";

import { RestaurantShell } from "@/core/components/restaurant-shell";
import { GuestAgreementWorkspace } from "@/packages/pms/components/guests/guest-agreement-workspace";
import { requireRoutePackage } from "@/core/lib/route-package-guard";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/restaurant/pms/guest-services/agreement")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/pms/guest-services/agreement" },
      });
    }
    await requireRoutePackage("pms");
  },
  head: () => ({
    meta: [
      { title: "Guest Agreement — NORU PMS" },
      {
        name: "description",
        content:
          "Configure the registration agreement and acknowledgements presented during check-in.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: function GuestAgreementRoute() {
    return (
      <RestaurantShell active="PMS" pmsModule="guest-services">
        {(membership) => (
          <div className="space-y-4">
            <Link
              to="/restaurant/pms/guest-services"
              className="text-sm text-[#251605]/70 underline-offset-2 hover:underline"
            >
              Guest Services
            </Link>
            <GuestAgreementWorkspace
              restaurantId={membership.restaurantId}
              role={membership.role}
            />
          </div>
        )}
      </RestaurantShell>
    );
  },
});
