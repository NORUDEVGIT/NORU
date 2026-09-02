import { useState, type ReactNode } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  LayoutDashboard,
  BedDouble,
  DoorOpen,
  UtensilsCrossed,
  ChefHat,
  ReceiptText,
  Boxes,
  Carrot,
  PackageOpen,
  Wrench,
  Truck,
  ShoppingCart,
  CalendarDays,
  ClipboardCheck,
  QrCode,
  Users,
  UserRound,
  HandPlatter,
  BarChart3,
  Settings,
  LogOut,
  ArrowLeft,
  Menu as MenuIcon,
  X,
} from "lucide-react";
import { NoruLogo } from "@/components/noru-logo";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getMyRestaurants, type RestaurantMembership } from "@/lib/restaurant.functions";
import { useAuth } from "@/state/auth-store";
import { cn } from "@/lib/utils";
import { RestaurantSettingsProvider } from "@/state/restaurant-context";

export type RestaurantNavLabel =
  | "Home"
  | "Dashboard"
  | "Menu"
  | "Kitchen"
  | "Orders"
  | "Tables & QR"
  | "Take Order"
  | "Inventory"
  | "Rooms"
  | "Guests"
  | "Staff"
  | "Customers"
  | "Reports"
  | "Settings";

export type WorkspaceModule =
  | "home"
  | "restaurant"
  | "stock"
  | "staff"
  | "rooms"
  | "guests"
  | "settings";

type NavEntry = {
  to: string;
  /** Optional tab search param for pages that host several tabs. */
  tab?: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** When set, only these membership roles see the entry. */
  roles?: string[];
};

const RESTAURANT_NAV: NavEntry[] = [
  { to: "/restaurant/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/restaurant/menu", label: "Menu", icon: UtensilsCrossed },
  { to: "/restaurant/kitchen", label: "Kitchen", icon: ChefHat },
  { to: "/restaurant/orders", label: "Orders", icon: ReceiptText },
  { to: "/restaurant/tables", label: "Tables & QR", icon: QrCode },
  {
    to: "/restaurant/waiter",
    label: "Take Order",
    icon: HandPlatter,
    roles: ["owner", "manager", "waiter"],
  },
];

const STOCK_NAV: NavEntry[] = [
  { to: "/restaurant/inventory", tab: "overview", label: "Overview", icon: LayoutDashboard },
  { to: "/restaurant/inventory", tab: "ingredient", label: "Ingredients", icon: Carrot },
  { to: "/restaurant/inventory", tab: "consumable", label: "Consumables", icon: PackageOpen },
  { to: "/restaurant/inventory", tab: "operating_asset", label: "Operating Assets", icon: Boxes },
  { to: "/restaurant/inventory", tab: "equipment", label: "Equipment", icon: Wrench },
  { to: "/restaurant/inventory", tab: "suppliers", label: "Suppliers", icon: Truck },
  { to: "/restaurant/inventory", tab: "purchasing", label: "Purchasing", icon: ShoppingCart },
];

const STAFF_NAV: NavEntry[] = [
  { to: "/restaurant/staff", tab: "staff", label: "Staff", icon: Users, roles: ["owner", "manager"] },
  { to: "/restaurant/staff", tab: "schedule", label: "Schedule", icon: CalendarDays },
  { to: "/restaurant/staff", tab: "attendance", label: "Attendance", icon: ClipboardCheck, roles: ["owner", "manager"] },
  { to: "/restaurant/staff", tab: "reports", label: "Reports", icon: BarChart3, roles: ["owner", "manager"] },
];

const ROOMS_NAV: NavEntry[] = [
  { to: "/restaurant/rooms", tab: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/restaurant/rooms", tab: "room-types", label: "Room Types", icon: BedDouble },
  { to: "/restaurant/rooms", tab: "rooms", label: "Rooms", icon: DoorOpen },
];

const GUESTS_NAV: NavEntry[] = [
  { to: "/restaurant/guests", label: "Guests", icon: UserRound, roles: ["owner", "manager"] },
];

const MODULE_NAV: Record<WorkspaceModule, NavEntry[]> = {
  home: [],
  restaurant: RESTAURANT_NAV,
  stock: STOCK_NAV,
  staff: STAFF_NAV,
  rooms: ROOMS_NAV,
  guests: GUESTS_NAV,
  settings: [{ to: "/restaurant/settings", label: "Settings", icon: Settings }],
};

const MODULE_TITLE: Record<WorkspaceModule, string> = {
  home: "Property Home",
  restaurant: "Restaurant Management",
  stock: "Stock & Procurement",
  staff: "Staff Management",
  rooms: "Rooms & Front Office",
  guests: "Booking & Guest Management",
  settings: "Property Settings & Integrations",
};

/** Which workspace a page belongs to, derived from its nav label. */
const LABEL_MODULE: Record<RestaurantNavLabel, WorkspaceModule> = {
  Home: "home",
  Dashboard: "restaurant",
  Menu: "restaurant",
  Kitchen: "restaurant",
  Orders: "restaurant",
  "Tables & QR": "restaurant",
  "Take Order": "restaurant",
  Inventory: "stock",
  Rooms: "rooms",
  Guests: "guests",
  Staff: "staff",
  Customers: "restaurant",
  Reports: "restaurant",
  Settings: "settings",
};


export function RestaurantShell({
  active,
  children,
}: {
  active: RestaurantNavLabel;
  children: (membership: RestaurantMembership) => ReactNode;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session, user } = useAuth();
  const fetchRestaurants = useServerFn(getMyRestaurants);
  const [navOpen, setNavOpen] = useState(false);
  const search = useSearch({ strict: false }) as { tab?: string };

  const { data, isLoading, isError } = useQuery({
    queryKey: ["my-restaurants", user?.id],
    queryFn: () => fetchRestaurants(),
    enabled: !!session && !!user?.id,
    retry: false,
  });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    void navigate({ to: "/restaurant/login", replace: true });
  }

  const membership = data?.[0];
  const restaurant = membership?.restaurant;
  const workspace = LABEL_MODULE[active];
  const items = MODULE_NAV[workspace].filter(
    (item) => !item.roles || (membership ? item.roles.includes(membership.role) : false),
  );
  const activeTab = search.tab ?? items.find((i) => i.tab)?.tab;

  const sidebar = (
    <div className="flex h-full flex-col gap-5 p-4">
      <Link
        to="/restaurant/home"
        className="flex items-center gap-2 px-2 font-display text-lg"
        onClick={() => setNavOpen(false)}
        aria-label="NORU property home"
      >
        <NoruLogo size="sm" wordmarkClassName="text-sidebar-foreground" />
      </Link>

      {workspace !== "home" ? (
        <div className="space-y-2">
          <Link
            to="/restaurant/home"
            onClick={() => setNavOpen(false)}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <ArrowLeft className="size-4 shrink-0" /> NORU Home
          </Link>
          <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
            {MODULE_TITLE[workspace]}
          </p>
        </div>
      ) : null}

      <nav className="min-h-0 flex-1 overflow-y-auto">
        <ul className="space-y-1">
          {items.map((item) => {
            const isActive = item.tab ? activeTab === item.tab : active === item.label;
            return (
              <li key={item.label}>
                <Link
                  to={item.to}
                  {...(item.tab ? { search: { tab: item.tab } } : {})}
                  onClick={() => setNavOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <item.icon className="size-4 shrink-0" /> {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="space-y-1">
        <Link
          to="/restaurant/settings"
          onClick={() => setNavOpen(false)}
          className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <Settings className="size-4 shrink-0" /> Settings
        </Link>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={() => void signOut()}
        >
          <LogOut className="mr-2 size-4" /> Log out
        </Button>
      </div>
    </div>
  );


  return (
    <div className="min-h-dvh bg-muted/30">
      <div className="mx-auto flex w-full max-w-[1600px]">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:block">
          {sidebar}
        </aside>

        {/* Mobile drawer */}
        {navOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-foreground/40" onClick={() => setNavOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-64 border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
              <button
                type="button"
                aria-label="Close navigation"
                className="absolute right-3 top-3 rounded-lg p-1 text-sidebar-foreground/70 hover:bg-sidebar-accent"
                onClick={() => setNavOpen(false)}
              >
                <X className="size-4" />
              </button>
              {sidebar}
            </aside>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
            <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label="Open navigation"
                onClick={() => setNavOpen(true)}
              >
                <MenuIcon className="size-5" />
              </Button>
              <div className="min-w-0">
                <p className="truncate font-display text-lg leading-tight">
                  {restaurant?.name ?? "Restaurant"}
                </p>
                <p className="text-xs text-muted-foreground">{MODULE_TITLE[workspace]}</p>
              </div>
              <div className="ml-auto flex items-center gap-3">
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  {new Date().toLocaleDateString(undefined, {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
                {restaurant ? <StatusPill status={restaurant.status} /> : null}
                <div className="hidden text-right sm:block">
                  <p className="max-w-[180px] truncate text-xs font-medium">{user?.email ?? ""}</p>
                  <p className="text-[11px] capitalize text-muted-foreground">{membership?.role ?? ""}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => void signOut()}>
                  <LogOut className="size-4 sm:mr-2" />
                  <span className="hidden sm:inline">Log out</span>
                </Button>
              </div>
            </div>
          </header>

          <main className="min-w-0 flex-1 px-4 py-6 sm:px-6">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading your restaurant…</p>
            ) : isError ? (
              <p className="text-sm text-destructive">We couldn't load your restaurant. Please try again.</p>
            ) : !membership ? (
              <div className="rounded-2xl border border-border bg-card p-6">
                <h1 className="font-display text-2xl">Access denied</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  This account isn't linked to a restaurant. If you're a customer, head back to the menu — or register
                  your restaurant to get started.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button asChild><Link to="/restaurant/register">Register a restaurant</Link></Button>
                  <Button asChild variant="outline"><Link to="/">Back to home</Link></Button>
                </div>
              </div>
            ) : (
              <RestaurantSettingsProvider
                timezone={membership.restaurant.timezone}
                currencyCode={membership.restaurant.currencyCode}
              >
                {children(membership)}
              </RestaurantSettingsProvider>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: RestaurantMembership["restaurant"]["status"] }) {
  const map = {
    approved: { label: "Active", className: "bg-success/15 text-success" },
    pending: { label: "Pending approval", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
    suspended: { label: "Suspended", className: "bg-orange-500/15 text-orange-700 dark:text-orange-400" },
    rejected: { label: "Not approved", className: "bg-destructive/10 text-destructive" },
  }[status];
  return (
    <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap", map.className)}>
      {map.label}
    </span>
  );
}
