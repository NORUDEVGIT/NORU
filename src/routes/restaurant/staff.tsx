import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { StaffWorkspace } from "@/core/components/workspaces/staff-workspace";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/restaurant/staff")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) =>
    typeof search["tab"] === "string" ? { tab: search["tab"] as string } : {},

  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/staff" } });
    }
  },
  head: () => ({
    meta: [
      { title: "Human Resources — NORU" },
      {
        name: "description",
        content:
          "Add restaurant staff, set their roles and manage access to your dashboard, kitchen and orders.",
      },
      { property: "og:title", content: "Staff & Roles — NORU" },
      {
        property: "og:description",
        content: "Create staff accounts and manage restaurant roles securely.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StaffPage,
});

function StaffPage() {
  const searchTab = (Route.useSearch() as { tab?: string }).tab;
  return (
    <RestaurantShell active="Staff">
      {(m) => <StaffWorkspace membership={m} initialTab={searchTab ?? undefined} />}
    </RestaurantShell>
  );
}
