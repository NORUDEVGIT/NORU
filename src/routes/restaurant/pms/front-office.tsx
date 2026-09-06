import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/components/restaurant-shell";
import { FrontOfficeWorkspace } from "@/components/workspaces/front-office-workspace";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/restaurant/pms/front-office")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) =>
    typeof search["tab"] === "string" ? { tab: search["tab"] as string } : {},
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/pms/front-office" },
      });
    }
  },
  head: () => ({
    meta: [
      { title: "Front Office — NORU PMS" },
      { name: "description", content: "Arrivals, room assignment and check-in for today at your property." },
      { property: "og:title", content: "Front Office — NORU PMS" },
      { property: "og:description", content: "Arrivals, room assignment and check-in for today at your property." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FrontOfficePmsRoute,
});

function FrontOfficePmsRoute() {
  const searchTab = (Route.useSearch() as { tab?: string }).tab;
  return (
    <RestaurantShell active="Arrivals" module="rooms" pms pmsModule="front-office">
      {(m) => <FrontOfficeWorkspace membership={m} initialTab={searchTab ?? "overview"} />}
    </RestaurantShell>
  );
}
