/**
 * Phase 8G1 — Back Office foundation route. Presentation only: no business
 * data, no ownership migration, no new entitlement logic.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";
import { getBoModule } from "@/packages/back-office/lib/back-office-modules";
import { BackOfficeFoundation } from "@/packages/back-office/components/foundation-page";

const MODULE = getBoModule("payroll")!;

export const Route = createFileRoute("/restaurant/back-office/payroll")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/back-office/payroll" },
      });
    }

    await requireRoutePackage("back_office");
  },
  head: () => ({
    meta: [
      { title: "Payroll — Back Office — NORU" },
      { name: "description", content: "Back Office Payroll: planned pay runs built from the shared workforce record." },
      { property: "og:title", content: "Payroll — Back Office — NORU" },
      { property: "og:description", content: "Back Office Payroll: planned pay runs built from the shared workforce record." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BackOfficeModuleRoute,
});

function BackOfficeModuleRoute() {
  return (
    <RestaurantShell active="Back Office" boModule="payroll">
      {(m) => <BackOfficeFoundation module={MODULE} restaurantId={m.restaurantId} />}
    </RestaurantShell>
  );
}
