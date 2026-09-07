import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Hotel } from "lucide-react";
import { RestaurantShell } from "@/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/lib/route-package-guard";
import { getMyModuleAccess } from "@/lib/module-access.functions";
import { PMS_GROUPS, PMS_MODULES } from "@/lib/pms-modules";
import { SharedModuleLinks } from "@/components/pms/shared-module-links";
import type { RestaurantMembership } from "@/lib/restaurant.functions";

export const Route = createFileRoute("/restaurant/pms/")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/pms" } });
    }

    await requireRoutePackage("pms");
  },
  head: () => ({
    meta: [
      { title: "PMS Home — NORU" },
      {
        name: "description",
        content:
          "The NORU hotel property management system: reservations, front office, cashiering, housekeeping, rooms, rates, night audit, distribution and more.",
      },
      { property: "og:title", content: "PMS Home — NORU" },
      {
        property: "og:description",
        content: "Every rooms-side operation of your property in one hotel workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PmsHomeRoute,
});

function PmsHomeRoute() {
  return <RestaurantShell active="PMS">{(m) => <PmsHome membership={m} />}</RestaurantShell>;
}

function PmsHome({ membership }: { membership: RestaurantMembership }) {
  const restaurantId = membership.restaurant.id;
  const fetchModules = useServerFn(getMyModuleAccess);
  const moduleAccess = useQuery({
    queryKey: ["pms-home-modules", restaurantId],
    queryFn: () => fetchModules({ data: { restaurantId } }),
  });
  const allowed = moduleAccess.data?.modules ?? [];
  const visible = PMS_MODULES.filter((m) => allowed.includes(m.moduleKey));

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
          <Link to="/restaurant/home" className="hover:text-foreground">
            Property Home
          </Link>
          <span className="px-1.5">→</span>
          <span className="text-foreground">PMS</span>
        </nav>
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex size-12 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <Hotel className="size-6" />
          </span>
          <div>
            <h1 className="font-display text-2xl sm:text-3xl">PMS</h1>
            <p className="text-sm text-muted-foreground">
              Hotel operating system · {membership.restaurant.name}
            </p>
          </div>
        </div>
      </header>

      {PMS_GROUPS.map((group) => {
        const items = visible.filter((m) => m.group === group.key);
        if (items.length === 0) return null;
        return (
          <section key={group.key} aria-label={group.title} className="space-y-4">
            <div className="border-b border-border pb-2">
              <h2 className="font-display text-xl">{group.title}</h2>
              <p className="text-sm text-muted-foreground">{group.description}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((m) => (
                <Link
                  key={m.key}
                  to={m.canonicalRoute}
                  className="group flex min-h-36 flex-col rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/60 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <div className="flex w-full items-start justify-between gap-2">
                    <span className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <m.icon className="size-5" />
                    </span>
                    {m.implementationStatus === "planned" ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Planned
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-4 font-display text-lg leading-snug">{m.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{m.description}</p>
                </Link>
              ))}
            </div>
          </section>
        );
      })}

      <SharedModuleLinks
        restaurantId={restaurantId}
        modules={["inventory", "procurement", "human_resources", "accounting_finance"]}
        intro="PMS uses the property-wide NORU services for stock, purchasing, workforce and finance — it never keeps its own copies. Opening one leaves PMS."
      />

      {!moduleAccess.isLoading && visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You don't have access to any hotel workspace for this property yet.
        </p>
      ) : null}
    </div>
  );
}
