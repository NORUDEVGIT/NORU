import { createFileRoute, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, ConciergeBell, ScrollText, UserRound } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { resolvePmsReturnTo } from "@/packages/pms/lib/cashiering-shell";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { SharedModuleLinks } from "@/packages/pms/components/pms/shared-module-links";
import { PmsPlaceholder } from "@/packages/pms/components/pms/pms-placeholder";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";

export const Route = createFileRoute("/restaurant/pms/guest-services")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    ...(typeof search["returnTo"] === "string" ? { returnTo: search["returnTo"] as string } : {}),
    ...(typeof search["returnToLabel"] === "string" ? { returnToLabel: search["returnToLabel"] as string } : {}),
  }),
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: location.pathname },
      });
    }

    await requireRoutePackage("pms");
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
  component: function GuestServicesRoute() {
    const pathname = useRouterState({ select: (state) => state.location.pathname });
    const search = Route.useSearch() as { returnTo?: string; returnToLabel?: string };
    const { hasPrevious, computedLabel, handleReturn } = resolvePmsReturnTo({
      returnTo: search.returnTo,
      returnToLabel: search.returnToLabel,
    });
    if (pathname !== "/restaurant/pms/guest-services") return <Outlet />;
    return (
      <RestaurantShell active="PMS" pmsModule="guest-services">
        {(m) => (
          <div className="space-y-8">
            {hasPrevious ? (
              <div className="flex items-center gap-2" data-testid="guest-services-header">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReturn}
                  data-testid="guest-services-return-to-previous"
                  className="h-8 gap-1.5 px-3 text-xs font-semibold text-[#5C5346] hover:text-[#251605] border-[#D6CDBF] bg-white shadow-xs hover:bg-[#FAF8F4] transition-all"
                >
                  <ArrowLeft className="size-3.5 text-[#8A6A24]" />
                  {computedLabel}
                </Button>
              </div>
            ) : null}
            <Link
              to="/restaurant/pms/guest-services/agreement"
              data-testid="guest-services-agreement-link"
              className="flex items-center justify-between rounded-2xl border border-[#DDD4C5] bg-white px-4 py-3 text-[#251605] shadow-sm transition-colors hover:border-[#C89933]"
            >
              <span>
                <span className="block font-display text-lg">Guest Agreement</span>
                <span className="block text-sm text-[#251605]/70">
                  Configure the registration agreement presented during check-in.
                </span>
              </span>
              <ScrollText className="size-5 text-[#C89933]" />
            </Link>
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
                to="/restaurant/pms/guests"
                className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
              >
                <UserRound className="size-4" /> Open Guest Profile
              </Link>
            </PmsPlaceholder>
            <SharedModuleLinks restaurantId={m.restaurantId} modules={["inventory"]} />
          </div>
        )}
      </RestaurantShell>
    );
  },
});
