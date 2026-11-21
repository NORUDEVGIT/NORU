import { useEffect, useMemo } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Boxes,
  Users,
  Wallet,
  BarChart3,
  Hotel,
  Truck,
  PackageOpen,
  UserCheck,
  BedDouble,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import { RestaurantShell } from "@/core/components/restaurant-shell";
import { NoruLogo } from "@/core/components/noru-logo";
import { supabase } from "@/integrations/supabase/client";
import { getInventoryDashboard } from "@/lib/inventory-reporting.functions";
import { listShifts } from "@/core/lib/workforce.functions";
import { getFrontOfficeDashboard } from "@/packages/pms/lib/frontoffice.functions";
import { getMyRestaurants, type RestaurantMembership } from "@/core/lib/restaurant.functions";
import { useRestaurantTimezone } from "@/core/state/property-format";
import { localDateInZone } from "@/shared/lib/property-time";
import { getMyModuleAccess } from "@/core/lib/module-access.functions";
import type { ModuleKey } from "@/core/lib/module-access";
import { usePackageEntitlements } from "@/core/lib/use-package-entitlements";
import { sharedCoreLinkVisible } from "@/core/lib/shared-core-access";
import { usePmsPermissions } from "@/packages/pms/lib/use-pms-permissions";
import { PMS_OPERATIONAL_HOME_PATH } from "@/core/lib/pms-operational-home";
import { clearRoutePackageCache } from "@/core/lib/route-package-guard";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";

type HomeSearch = {
  blocked?: string;
  retired?: string;
  verify?: "failed";
};

function hasAccessNotice(search: HomeSearch): boolean {
  return Boolean(search.blocked || search.retired || search.verify === "failed");
}

export const Route = createFileRoute("/restaurant/home")({
  ssr: false,
  // Access notices land here without looping. Live PMS properties redirect to operational home.
  validateSearch: (search: Record<string, unknown>): HomeSearch => ({
    ...(typeof search["blocked"] === "string" ? { blocked: search["blocked"] as string } : {}),
    ...(typeof search["retired"] === "string" ? { retired: search["retired"] as string } : {}),
    ...(search["verify"] === "failed" ? { verify: "failed" as const } : {}),
  }),
  beforeLoad: async ({ search }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/home" } });
    }
    // Keep the route for focused access / pre-live onboarding. Do not bounce notice URLs.
    if (hasAccessNotice(search)) return;
    const memberships = await getMyRestaurants().catch(() => null);
    const restaurant = memberships?.[0]?.restaurant;
    if (restaurant?.status === "approved" && restaurant.pmsSet1Live === true) {
      throw redirect({ to: PMS_OPERATIONAL_HOME_PATH, replace: true });
    }
  },
  head: () => ({
    meta: [
      { title: "Property Home — NORU" },
      {
        name: "description",
        content:
          "Property onboarding and access notices for this NORU property.",
      },
      { property: "og:title", content: "Property Home — NORU" },
      { property: "og:description", content: "Property onboarding and access notices." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PropertyHomeRoute,
});

function PropertyHomeRoute() {
  const search = Route.useSearch();
  const accessNotice = hasAccessNotice(search);
  return (
    <RestaurantShell
      active="Home"
      // Access notices are a focused full-page state — no gold package rail/sidebar.
      hidePackageRail={accessNotice}
      hideTopHeader={accessNotice}
    >
      {(m) => <PropertyHome membership={m} />}
    </RestaurantShell>
  );
}

/**
 * Focused access state for package-gate failures.
 * Does not render the legacy Available Packages launcher.
 */
function PmsPackageAccessState({ search }: { search: HomeSearch }) {
  const navigate = useNavigate();

  function retryPms() {
    clearRoutePackageCache();
    void navigate({ to: PMS_OPERATIONAL_HOME_PATH, replace: true });
  }

  const title =
    search.verify === "failed"
      ? "PMS access could not be verified."
      : search.retired
        ? "This product is retired and is no longer available."
        : "PMS isn't enabled for this property.";

  const message =
    search.verify === "failed"
      ? "A temporary check failed, or your session could not confirm PMS entitlement. Retry, or ask a property administrator if this continues."
      : search.retired
        ? "Ask NORU support if you believe this product should still be available."
        : "Ask the property owner or a NORU administrator to enable PMS for this property. This is not a product-selection screen.";

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col justify-center gap-4 p-6" data-testid="pms-package-access-state">
      <NoruLogo size="sm" />
      <div className="rounded-2xl border border-[#E6E1D8] bg-white p-6">
        <h1 className="font-display text-xl text-[#251605]">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        {search.verify === "failed" ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" onClick={retryPms} data-testid="pms-access-retry">
              Retry PMS access
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link to="/restaurant/settings">Open Settings</Link>
            </Button>
          </div>
        ) : (
          <div className="mt-4">
            <Button type="button" variant="outline" asChild>
              <Link to="/restaurant/settings">Open Settings</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Shared/Core hotel services retained with PMS. Module permission still required. */
const SHARED_CORE_LINKS: {
  moduleKey: ModuleKey;
  title: string;
  note: string;
  to: string;
  tab?: string;
  icon: LucideIcon;
}[] = [
  {
    moduleKey: "inventory",
    title: "Inventory / Warehouse",
    note: "Property-wide stock, assets and equipment.",
    to: "/restaurant/inventory",
    tab: "overview",
    icon: Boxes,
  },
  {
    moduleKey: "procurement",
    title: "Procurement",
    note: "Suppliers, purchase orders and goods receiving.",
    to: "/restaurant/inventory",
    tab: "suppliers",
    icon: Truck,
  },
  {
    moduleKey: "human_resources",
    title: "Human Resources",
    note: "One property-wide workforce: staff, schedule and attendance.",
    to: "/restaurant/staff",
    tab: "schedule",
    icon: Users,
  },
  {
    moduleKey: "accounting_finance",
    title: "Accounting & Finance",
    note: "Property-wide folios, payments and night audit.",
    to: "/restaurant/pms/cashiering",
    tab: "folios",
    icon: Wallet,
  },
  {
    moduleKey: "reports_analytics",
    title: "Reports & Analytics",
    note: "Cross-domain property reporting.",
    to: "/restaurant/reports",
    icon: BarChart3,
  },
];

const PMS_SUBMODULES = [
  "Front Office",
  "Reservations",
  "Housekeeping",
  "Cashiering",
  "Rooms & Rates",
  "Distribution",
  "Night Audit",
];

function PropertyHome({ membership }: { membership: RestaurantMembership }) {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const live = membership.restaurant.pmsSet1Live === true;
  const approved = membership.restaurant.status === "approved";

  useEffect(() => {
    if (hasAccessNotice(search)) return;
    if (approved && live) {
      void navigate({ to: PMS_OPERATIONAL_HOME_PATH, replace: true });
    }
  }, [approved, live, navigate, search]);

  if (hasAccessNotice(search)) {
    return <PmsPackageAccessState search={search} />;
  }

  // Active PMS properties use the operational home — never the package launcher.
  if (approved && live) {
    return (
      <p className="p-6 text-sm text-muted-foreground" data-testid="property-home-redirecting-pms">
        Opening PMS…
      </p>
    );
  }

  return <LegacyPackageLauncher membership={membership} />;
}

/**
 * Legacy multi-package launcher retained only for rare non-live fallthrough.
 * Normal active PMS properties never reach this surface.
 */
function LegacyPackageLauncher({ membership }: { membership: RestaurantMembership }) {
  const restaurantId = membership.restaurant.id;
  const timezone = useRestaurantTimezone();

  const fetchInventory = useServerFn(getInventoryDashboard);
  const fetchShifts = useServerFn(listShifts);
  const fetchFrontOffice = useServerFn(getFrontOfficeDashboard);
  const fetchModules = useServerFn(getMyModuleAccess);

  const moduleAccess = useQuery({
    queryKey: ["property-home-modules", restaurantId],
    queryFn: () => fetchModules({ data: { restaurantId } }),
  });
  const allowed = moduleAccess.data?.modules ?? [];
  const packages = usePackageEntitlements(restaurantId);
  const pmsAccess = usePmsPermissions(packages.has("pms") ? restaurantId : undefined);

  const canManageStaff = allowed.includes("front_office");
  const canSeeStock = allowed.includes("inventory");
  const today = useMemo(() => localDateInZone(timezone), [timezone]);

  const inventory = useQuery({
    queryKey: ["property-home-inventory", restaurantId],
    queryFn: () => fetchInventory({ data: { restaurantId, preset: "today" } }),
    enabled: canSeeStock,
  });

  const shifts = useQuery({
    queryKey: ["property-home-shifts", restaurantId, today],
    queryFn: () => fetchShifts({ data: { restaurantId, from: today, to: today } }),
    enabled: allowed.includes("human_resources"),
    retry: false,
  });

  const frontOffice = useQuery({
    queryKey: ["property-home-front-office", restaurantId, today],
    queryFn: () => fetchFrontOffice({ data: { restaurantId, today } }),
    enabled: canManageStaff,
    retry: false,
  });

  const onShift = shifts.data
    ? shifts.data.shifts.filter((s) => s.attendanceStatus === "checked_in").length
    : null;

  const occupancy = frontOffice.data
    ? (() => {
        const total = frontOffice.data.occupiedRooms + frontOffice.data.availableRooms;
        return total > 0 ? `${Math.round((frontOffice.data.occupiedRooms / total) * 100)}%` : "0%";
      })()
    : null;

  const showPms =
    packages.has("pms") &&
    !pmsAccess.isLoading &&
    !pmsAccess.isError &&
    (pmsAccess.isOwner || pmsAccess.permissions.length > 0);
  const sharedCoreLinks = SHARED_CORE_LINKS.filter((l) =>
    sharedCoreLinkVisible(l.moduleKey, allowed, (key) => packages.has(key)),
  );
  const nothingVisible =
    !showPms &&
    sharedCoreLinks.length === 0 &&
    !packages.loading;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <NoruLogo size="sm" />
          <span className="text-muted-foreground">·</span>
          <h1 className="font-display text-2xl sm:text-3xl">{membership.restaurant.name}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Complete property setup to activate PMS. This is not the live operational home.
        </p>
      </header>

      <section aria-label="Today at a glance" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <SummaryCard
          icon={BedDouble}
          label="Occupancy"
          value={canManageStaff ? occupancy : "—"}
          loading={canManageStaff && frontOffice.isLoading}
        />
        <SummaryCard
          icon={Hotel}
          label="In-house guests"
          value={
            canManageStaff ? (frontOffice.data ? String(frontOffice.data.inHouse) : null) : "—"
          }
          loading={canManageStaff && frontOffice.isLoading}
        />
        <SummaryCard
          icon={UserCheck}
          label="Staff on shift"
          value={
            allowed.includes("human_resources") ? (onShift === null ? null : String(onShift)) : "—"
          }
          loading={allowed.includes("human_resources") && shifts.isLoading}
        />
        <SummaryCard
          icon={PackageOpen}
          label="Low stock items"
          value={
            canSeeStock ? (inventory.data ? String(inventory.data.stock.lowStock) : null) : "—"
          }
          loading={canSeeStock && inventory.isLoading}
        />
      </section>

      <section aria-label="Available packages" className="space-y-4">
        <h2 className="font-display text-xl">Available packages</h2>

        <div className="grid gap-4 lg:grid-cols-2">
          {showPms ? (
            <PackageTile
              icon={Hotel}
              title="PMS"
              description="Hotel operating system — the home for every rooms-side operation."
              detail={`${PMS_SUBMODULES.join(" · ")} and more`}
              to={PMS_OPERATIONAL_HOME_PATH}
            />
          ) : null}
        </div>

        {sharedCoreLinks.length > 0 ? (
          <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            <p className="font-display text-lg">Shared property services</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Property-wide hotel services available with this PMS.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {sharedCoreLinks.map((l) => (
                <Link
                  key={l.title}
                  to={l.to}
                  {...(l.tab ? { search: { tab: l.tab } } : {})}
                  className="group flex items-start gap-3 rounded-xl border border-border bg-background p-4 transition-colors hover:border-primary/60 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <l.icon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1 font-medium">
                      {l.title}
                      <ArrowUpRight className="size-3.5 text-muted-foreground" />
                    </span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">{l.note}</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        {nothingVisible ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
            <p className="font-medium">No packages available for you here</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Ask the property owner to give you access, or get in touch with NORU about adding a
              package to this property.
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function PackageTile({
  icon: Icon,
  title,
  description,
  detail,
  to,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  detail: string;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="group flex flex-col gap-4 rounded-2xl border border-primary/40 bg-card p-6 transition-colors hover:border-primary hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:flex-row sm:items-center"
    >
      <span className="inline-flex size-14 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent transition-colors group-hover:bg-accent group-hover:text-accent-foreground">
        <Icon className="size-7" />
      </span>
      <div className="min-w-0 space-y-1">
        <p className="font-display text-2xl leading-snug">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </Link>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: LucideIcon;
  label: string;
  value: string | null;
  loading: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-4" /> {label}
      </div>
      <p
        className={cn(
          "mt-2 font-display text-2xl",
          loading && "animate-pulse text-muted-foreground",
        )}
      >
        {loading ? "—" : (value ?? "—")}
      </p>
    </div>
  );
}
