/**
 * Phase 7D.2E — cross-domain links from a PMS page into a shared property-wide
 * service.
 *
 * NORU keeps ONE enterprise service per capability (Inventory / Warehouse,
 * Procurement, Human Resources, Accounting & Finance, Reports). PMS consumes
 * them — it never forks its own copy. This strip is presentation only: it
 * renders a link for a shared module only when the caller already has access to
 * that module under the existing access model. It grants nothing.
 */
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, Boxes, Truck, Users, Wallet, BarChart3, type LucideIcon } from "lucide-react";
import { getMyModuleAccess } from "@/lib/module-access.functions";
import { MODULE_LABELS, type ModuleKey } from "@/lib/module-access";

type SharedTarget = {
  icon: LucideIcon;
  to: string;
  search?: Record<string, string>;
  note: string;
};

const SHARED: Partial<Record<ModuleKey, SharedTarget>> = {
  inventory: {
    icon: Boxes,
    to: "/restaurant/inventory",
    search: { tab: "overview" },
    note: "Property-wide stock and assets: guest amenities, linen, cleaning supplies, spare parts and equipment.",
  },
  procurement: {
    icon: Truck,
    to: "/restaurant/inventory",
    search: { tab: "suppliers" },
    note: "Property-wide suppliers, purchase orders and goods receiving.",
  },
  human_resources: {
    icon: Users,
    to: "/restaurant/staff",
    search: { tab: "schedule" },
    note: "One property-wide workforce: schedule, attendance and staff records.",
  },
  accounting_finance: {
    icon: Wallet,
    to: "/restaurant/cashiering",
    search: { tab: "dashboard" },
    note: "Property-wide finance follow-up across hotel, restaurant and purchasing.",
  },
  reports_analytics: {
    icon: BarChart3,
    to: "/restaurant/reports",
    note: "Cross-domain property reporting beyond the hotel.",
  },
};

export function SharedModuleLinks({
  restaurantId,
  modules,
  heading = "Shared property services",
  intro = "These are property-wide systems shared with the rest of NORU — opening one leaves PMS.",
}: {
  restaurantId: string;
  modules: ModuleKey[];
  heading?: string;
  intro?: string;
}) {
  const fetchModules = useServerFn(getMyModuleAccess);
  const access = useQuery({
    queryKey: ["my-module-access", restaurantId],
    queryFn: () => fetchModules({ data: { restaurantId } }),
    enabled: !!restaurantId,
    retry: false,
  });

  const allowed = access.data?.modules ?? [];
  const items = modules.filter((key) => SHARED[key] && allowed.includes(key));
  if (items.length === 0) return null;

  return (
    <section
      aria-label={heading}
      className="rounded-2xl border border-border bg-muted/20 p-5 sm:p-6"
    >
      <p className="font-display text-lg">{heading}</p>
      <p className="mt-1 text-sm text-muted-foreground">{intro}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {items.map((key) => {
          const target = SHARED[key]!;
          const Icon = target.icon;
          return (
            <Link
              key={key}
              to={target.to}
              search={target.search as never}
              className="group flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/60 hover:bg-secondary"
            >
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1 font-medium">
                  Open {MODULE_LABELS[key]}
                  <ArrowUpRight className="size-3.5 text-muted-foreground" />
                </span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{target.note}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
