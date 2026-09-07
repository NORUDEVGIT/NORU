/**
 * Phase 8G1 — Back Office dashboard foundation. No consolidated figures: it
 * reports honestly on how far each Back Office area has moved.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { RestaurantShell } from "@/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/lib/route-package-guard";
import { BO_GROUPS, BO_MODULES, BO_STATUS_LABEL } from "@/lib/back-office-modules";

export const Route = createFileRoute("/restaurant/back-office/dashboard")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/back-office/dashboard" },
      });
    }

    await requireRoutePackage("back_office");
  },
  head: () => ({
    meta: [
      { title: "Dashboard — Back Office — NORU" },
      {
        name: "description",
        content:
          "Back Office overview for your property: which areas are consolidated and what is still shared.",
      },
      { property: "og:title", content: "Dashboard — Back Office — NORU" },
      {
        property: "og:description",
        content: "How far each Back Office area has moved for this property.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BackOfficeDashboardRoute,
});

function BackOfficeDashboardRoute() {
  return (
    <RestaurantShell active="Back Office" boModule="dashboard">
      {() => <BackOfficeDashboard />}
    </RestaurantShell>
  );
}

function BackOfficeDashboard() {
  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-2">
        <h1 className="font-display text-2xl sm:text-3xl">Back Office overview</h1>
        <p className="text-sm text-muted-foreground">
          Back Office is the enterprise consolidation and control layer for this property. Day-to-day
          numbers stay in the package that owns them — restaurant trading in Restaurant Management,
          rooms in PMS — and nothing is copied here until the area is genuinely consolidated.
        </p>
      </header>

      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h2 className="font-display text-lg">Where each area stands</h2>
        <div className="mt-4 space-y-5">
          {BO_GROUPS.filter((g) => g.key !== "overview").map((group) => (
            <div key={group.key}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.title}
              </p>
              <ul className="mt-2 space-y-2">
                {BO_MODULES.filter((m) => m.group === group.key).map((m) => (
                  <li
                    key={m.key}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background px-3 py-2 text-sm"
                  >
                    <m.icon className="size-4 shrink-0 text-primary" />
                    <span className="font-medium">{m.title}</span>
                    <span className="ml-auto rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {BO_STATUS_LABEL[m.implementationStatus]}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-dashed border-border bg-muted/30 p-5 sm:p-6">
        <h2 className="font-display text-lg">What happens next</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Areas marked “Shared today” are running on the property-wide screens you already use;
          Back Office links to them without changing who can open them. Consolidation happens area
          by area in later steps — nothing here changes your data, your permissions or where work is
          done today.
        </p>
      </section>
    </div>
  );
}
