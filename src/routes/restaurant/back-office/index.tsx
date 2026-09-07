/**
 * Phase 8G1 — Back Office package home (launcher).
 *
 * Foundation only: every tile opens a Back Office foundation page. No shared
 * service has moved, no ownership has changed and no database work happens
 * here.
 */
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Briefcase } from "lucide-react";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";
import { BO_GROUPS, BO_MODULES, BO_STATUS_LABEL } from "@/packages/back-office/lib/back-office-modules";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";

export const Route = createFileRoute("/restaurant/back-office/")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/back-office" },
      });
    }

    await requireRoutePackage("back_office");
  },
  head: () => ({
    meta: [
      { title: "Back Office — NORU" },
      {
        name: "description",
        content:
          "The NORU Back Office package: the enterprise consolidation and control layer for workforce, supply chain, finance, intelligence and governance.",
      },
      { property: "og:title", content: "Back Office — NORU" },
      {
        property: "og:description",
        content: "The consolidation and control layer above your operating packages.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BackOfficeHomeRoute,
});

function BackOfficeHomeRoute() {
  return (
    <RestaurantShell active="Back Office">{(m) => <BackOfficeHome membership={m} />}</RestaurantShell>
  );
}

function BackOfficeHome({ membership }: { membership: RestaurantMembership }) {
  return (
    <div className="space-y-8">
      <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
        <Link to="/restaurant/home" className="hover:text-foreground">
          Property Home
        </Link>
        <span className="px-1.5">→</span>
        <span className="text-foreground">Back Office</span>
      </nav>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Briefcase className="size-6" />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-2xl sm:text-3xl">Back Office</h1>
            <p className="text-sm text-muted-foreground">{membership.restaurant.name}</p>
          </div>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          The enterprise consolidation and control layer for this property. Restaurant Management
          runs restaurant operations and PMS runs hotel operations; Back Office is where workforce,
          supply chain, finance, intelligence and governance come together above them.
        </p>
      </header>

      {BO_GROUPS.map((group) => {
        const modules = BO_MODULES.filter((m) => m.group === group.key);
        if (modules.length === 0) return null;
        return (
          <section key={group.key} className="space-y-3">
            <div>
              <h2 className="font-display text-xl">{group.title}</h2>
              <p className="text-sm text-muted-foreground">{group.description}</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {modules.map((m) => (
                <Link
                  key={m.key}
                  to={m.canonicalRoute}
                  className="group flex items-start gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/60 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <m.icon className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{m.title}</span>
                      <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {BO_STATUS_LABEL[m.implementationStatus]}
                      </span>
                    </span>
                    <span className="mt-1 block text-sm text-muted-foreground">{m.description}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
