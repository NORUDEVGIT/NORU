/**
 * Phase 8G2D — Back Office attendance administration over the one shared
 * attendance record.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/lib/route-package-guard";
import { BackOfficeHrAttendance } from "@/components/workspaces/back-office/hr-pages";

export const Route = createFileRoute("/restaurant/back-office/hr/attendance")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/back-office/hr/attendance" },
      });
    }

    await requireRoutePackage("back_office");
  },
  head: () => ({
    meta: [
      { title: "Attendance — Back Office HR — NORU" },
      { name: "description", content: "Today's check-ins and check-outs against the property schedule." },
      { property: "og:title", content: "Attendance — Back Office HR — NORU" },
      { property: "og:description", content: "Today's check-ins and check-outs against the property schedule." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <RestaurantShell active="Back Office" boModule="hr" boDetailLabel="Attendance">
      {(m) => <BackOfficeHrAttendance membership={m} />}
    </RestaurantShell>
  );
}
