/**
 * Phase 8F1 — Restaurant Management package home.
 *
 * Launcher only: every tile opens an existing working screen. Route migration
 * to /restaurant/restaurant-management/* is Phase 8F2.
 */
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { UtensilsCrossed } from "lucide-react";
import { RestaurantShell } from "@/components/restaurant-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/lib/route-package-guard";
import { getMyModuleAccess } from "@/lib/module-access.functions";
import {
  RM_FUTURE_MODULES,
  RM_GROUPS,
  RM_MODULES,
  type RmFutureModule,
  type RmModule,
} from "@/lib/restaurant-management-modules";
import type { RestaurantMembership } from "@/lib/restaurant.functions";

export const Route = createFileRoute("/restaurant/restaurant-management/")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/restaurant/login",
        search: { redirect: "/restaurant/restaurant-management" },
      });
    }

    await requireRoutePackage("restaurant_management");
  },
  head: () => ({
    meta: [
      { title: "Restaurant Management — NORU" },
      {
        name: "description",
        content:
          "The NORU Restaurant Management package: POS, digital ordering, tables, orders, kitchen, menu, recipes, stock, restaurant payments and restaurant reporting.",
      },
      { property: "og:title", content: "Restaurant Management — NORU" },
      {
        property: "og:description",
        content: "Every food and beverage operation of your property in one restaurant workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RestaurantManagementHomeRoute,
});

function RestaurantManagementHomeRoute() {
  return (
    <RestaurantShell active="Restaurant Management">
      {(m) => <RestaurantManagementHome membership={m} />}
    </RestaurantShell>
  );
}

const STATUS_LABEL: Record<string, string> = {
  partial: "Partial",
  foundation: "Foundation",
  planned: "Planned",
};

function StatusChip({ status }: { status: string }) {
  if (status === "existing") return null;
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function ModuleCard({ m }: { m: RmModule }) {
  return (
    <Link
      to={m.currentRoute}
      {...(m.currentSearch ? { search: m.currentSearch } : {})}
      className="group flex min-h-36 flex-col rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/60 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <div className="flex w-full items-start justify-between gap-2">
        <span className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
          <m.icon className="size-5" />
        </span>
        <div className="flex items-center gap-1.5">
          {m.transitional ? (
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Shared
            </span>
          ) : null}
          <StatusChip status={m.implementationStatus} />
        </div>
      </div>
      <p className="mt-4 font-display text-lg leading-snug">{m.title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{m.description}</p>
    </Link>
  );
}

function FutureCard({ m }: { m: RmFutureModule }) {
  const inner = (
    <>
      <div className="flex w-full items-start justify-between gap-2">
        <span className="inline-flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <m.icon className="size-4" />
        </span>
        <StatusChip status={m.implementationStatus} />
      </div>
      <p className="mt-3 font-medium leading-snug">{m.title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{m.description}</p>
    </>
  );

  const className =
    "flex flex-col rounded-xl border border-dashed border-border bg-muted/20 p-4 text-left";

  if (m.currentRoute) {
    return (
      <Link
        to={m.currentRoute}
        {...(m.currentSearch ? { search: m.currentSearch } : {})}
        className={`${className} transition-colors hover:border-primary/50 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
      >
        {inner}
      </Link>
    );
  }

  return (
    <div className={className} aria-disabled="true">
      {inner}
    </div>
  );
}

function RestaurantManagementHome({ membership }: { membership: RestaurantMembership }) {
  const restaurantId = membership.restaurant.id;
  const fetchModules = useServerFn(getMyModuleAccess);
  const moduleAccess = useQuery({
    queryKey: ["rm-home-modules", restaurantId],
    queryFn: () => fetchModules({ data: { restaurantId } }),
  });
  const allowed = moduleAccess.data?.modules ?? [];
  const visible = RM_MODULES.filter((m) => allowed.includes(m.moduleKey));
  const futures = RM_FUTURE_MODULES.filter((m) => !m.moduleKey || allowed.includes(m.moduleKey));

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
          <Link to="/restaurant/home" className="hover:text-foreground">
            Property Home
          </Link>
          <span className="px-1.5">→</span>
          <span className="text-foreground">Restaurant Management</span>
        </nav>
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex size-12 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <UtensilsCrossed className="size-6" />
          </span>
          <div>
            <h1 className="font-display text-2xl sm:text-3xl">Restaurant Management</h1>
            <p className="text-sm text-muted-foreground">
              Food & beverage operating system · {membership.restaurant.name}
            </p>
          </div>
        </div>
      </header>

      {RM_GROUPS.map((group) => {
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
                <ModuleCard key={m.key} m={m} />
              ))}
            </div>
          </section>
        );
      })}

      {futures.length > 0 ? (
        <section aria-label="Future capabilities" className="space-y-4">
          <div className="border-b border-border pb-2">
            <h2 className="font-display text-xl">Future capabilities</h2>
            <p className="text-sm text-muted-foreground">
              Planned Restaurant Management areas. Nothing here is working yet unless it opens an
              existing screen.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {futures.map((m) => (
              <FutureCard key={m.key} m={m} />
            ))}
          </div>
        </section>
      ) : null}

      {!moduleAccess.isLoading && visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You don't have access to any restaurant workspace for this property yet.
        </p>
      ) : null}
    </div>
  );
}
