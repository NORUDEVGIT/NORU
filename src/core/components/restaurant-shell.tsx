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
  Wallet,
  MoonStar,
  Boxes,
  Carrot,
  PackageOpen,
  Wrench,
  Truck,
  ShoppingCart,
  CalendarDays,
  CalendarCheck,
  CalendarPlus,
  ClipboardCheck,
  QrCode,
  Users,
  UserRound,
  HandPlatter,
  BarChart3,
  Settings,
  LogOut,
  LogIn,
  Hotel,
  Sparkles,
  AlertTriangle,
  Ban,
  History,
  ArrowLeft,
  Menu as MenuIcon,
  X,
  Globe,
  Briefcase,
  Clock,
} from "lucide-react";
import { NoruLogo } from "@/core/components/noru-logo";
import { Button } from "@/shared/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getMyRestaurants, type RestaurantMembership } from "@/core/lib/restaurant.functions";
import { getMyModuleAccess } from "@/core/lib/module-access.functions";
import { usePackageEntitlements } from "@/core/lib/use-package-entitlements";
import { clearRoutePackageCache } from "@/core/lib/route-package-guard";
import { PMS_NAV_GROUPS, getPmsModule } from "@/packages/pms/lib/pms-modules";
import { RM_GROUPS, RM_MODULES } from "@/packages/restaurant-management/lib/restaurant-management-modules";
import { BO_GROUPS, BO_MODULES, getBoModule } from "@/packages/back-office/lib/back-office-modules";
import { POS_MODULES, getPosModule } from "@/packages/standalone-pos/lib/standalone-pos-modules";
import { useAuth } from "@/core/state/auth-store";
import { cn } from "@/shared/lib/utils";
import { RestaurantSettingsProvider } from "@/packages/restaurant-management/state/restaurant-context";
import { PmsHeadingProvider } from "@/core/state/pms-context";
import { HK_STATUS_TAB_LABEL } from "@/packages/pms/lib/housekeeping-labels";
import { shouldSuppressRestaurantPmsRail } from "@/packages/pms/lib/front-office-shell";

export type RestaurantNavLabel =
  | "Home"
  | "PMS"
  | "Restaurant Management"
  | "Back Office"
  | "Standalone POS"
  | "Dashboard"
  | "Menu"
  | "Kitchen"
  | "Orders"
  | "Tables & QR"
  | "Take Order"
  | "Inventory"
  | "Rooms"
  | "Arrivals"
  | "In-House"
  | "Departures"
  | "Housekeeping"
  | "Bookings"
  | "Reservations"
  | "New Reservation"
  | "Rates & Revenue"
  | "Distribution"
  | "Guests"
  | "Cashiering"
  | "Folios"
  | "Payments"
  | "Cashier Shifts"
  | "Night Audit"
  | "Staff"
  | "Customers"
  | "Reports"
  | "Configuration"
  | "Settings";

export type WorkspaceModule =
  | "home"
  | "pms"
  | "restaurant"
  | "stock"
  | "procurement"
  | "staff"
  | "rooms"
  | "housekeeping"
  | "guests"
  | "cashiering"
  | "reports"
  | "configuration"
  | "settings";

const FO = ["owner", "manager", "receptionist"];
const HK_ALL = [
  "owner",
  "manager",
  "housekeeping",
  "housekeeping_supervisor",
  "housekeeper",
  "maintenance",
];
const HK_SUP = ["owner", "manager", "housekeeping", "housekeeping_supervisor"];
const HK_CLEAN = [...HK_SUP, "housekeeper"];
const HK_MAINT = [...HK_SUP, "maintenance"];
const CASH = ["owner", "manager", "cashier", "accountant"];
const AUDIT = ["owner", "manager", "accountant"];
const INV = ["owner", "manager", "kitchen", "storekeeper"];
const PROC = ["owner", "manager", "storekeeper"];
const FNB = ["owner", "manager", "kitchen", "waiter"];

type NavEntry = {
  to: string;
  /** Optional tab search param for pages that host several tabs. */
  tab?: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** When set, only these membership roles see the entry. */
  roles?: string[];
  /** Optional group heading, used by the Configuration workspace. */
  section?: string;
};

const RESTAURANT_NAV: NavEntry[] = [
  { to: "/restaurant/restaurant-management/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: FNB },
  {
    to: "/restaurant/restaurant-management/kitchen",
    label: "Kitchen",
    icon: ChefHat,
    roles: ["owner", "manager", "kitchen"],
  },
  { to: "/restaurant/restaurant-management/orders", label: "Orders", icon: ReceiptText, roles: FNB },
  {
    to: "/restaurant/restaurant-management/digital-ordering",
    label: "Take Order",
    icon: HandPlatter,
    roles: ["owner", "manager", "waiter"],
  },
];


const STOCK_NAV: NavEntry[] = [
  {
    to: "/restaurant/inventory",
    tab: "overview",
    label: "Dashboard",
    icon: LayoutDashboard,
    roles: INV,
  },
  {
    to: "/restaurant/inventory",
    tab: "ingredient",
    label: "Ingredients",
    icon: Carrot,
    roles: INV,
  },
  {
    to: "/restaurant/inventory",
    tab: "consumable",
    label: "Consumables",
    icon: PackageOpen,
    roles: INV,
  },
  {
    to: "/restaurant/inventory",
    tab: "operating_asset",
    label: "Operating Assets",
    icon: Boxes,
    roles: INV,
  },
  { to: "/restaurant/inventory", tab: "equipment", label: "Equipment", icon: Wrench, roles: INV },
];

// Phase 8G2B — Back Office is the canonical owner of procurement, so this
// group points at the canonical Back Office addresses.
const PROCUREMENT_NAV: NavEntry[] = [
  {
    to: "/restaurant/back-office/procurement/suppliers",
    label: "Suppliers",
    icon: Truck,
    roles: PROC,
  },
  {
    to: "/restaurant/back-office/procurement/purchase-orders",
    label: "Purchasing",
    icon: ShoppingCart,
    roles: PROC,
  },
];

const STAFF_NAV: NavEntry[] = [
  {
    to: "/restaurant/staff",
    tab: "staff",
    label: "Staff",
    icon: Users,
    roles: ["owner", "manager"],
  },
  { to: "/restaurant/staff", tab: "schedule", label: "Schedule", icon: CalendarDays },
  {
    to: "/restaurant/staff",
    tab: "attendance",
    label: "Attendance",
    icon: ClipboardCheck,
    roles: ["owner", "manager"],
  },
  {
    to: "/restaurant/staff",
    tab: "reports",
    label: "Reports",
    icon: BarChart3,
    roles: ["owner", "manager"],
  },
];

const ROOMS_NAV: NavEntry[] = [
  {
    to: "/restaurant/rooms",
    tab: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    roles: FO,
  },
  { to: "/restaurant/pms/front-office", label: "Arrivals", icon: LogIn, roles: FO },
  { to: "/restaurant/rooms/in-house", label: "In-House", icon: Hotel, roles: FO },
  { to: "/restaurant/rooms/departures", label: "Departures", icon: LogOut, roles: FO },
  {
    to: "/restaurant/pms/reservations",
    label: "Reservations",
    icon: CalendarCheck,
    roles: FO,
  },
  { to: "/restaurant/bookings/new", label: "New Reservation", icon: CalendarPlus, roles: FO },
  { to: "/restaurant/guests", label: "Guests", icon: UserRound, roles: FO },
];

const HOUSEKEEPING_NAV: NavEntry[] = [
  {
    to: "/restaurant/housekeeping",
    tab: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    roles: HK_ALL,
  },
  {
    to: "/restaurant/housekeeping",
    tab: "rack",
    label: HK_STATUS_TAB_LABEL,
    icon: DoorOpen,
    roles: HK_ALL,
  },
  {
    to: "/restaurant/housekeeping",
    tab: "board",
    label: "Cleaning Board",
    icon: Sparkles,
    roles: HK_CLEAN,
  },
  {
    to: "/restaurant/housekeeping",
    tab: "inspections",
    label: "Inspections",
    icon: ClipboardCheck,
    roles: HK_SUP,
  },
  {
    to: "/restaurant/housekeeping",
    tab: "discrepancies",
    label: "Discrepancies",
    icon: AlertTriangle,
    roles: HK_SUP,
  },
  {
    to: "/restaurant/housekeeping",
    tab: "restrictions",
    label: "Room Restrictions",
    icon: Ban,
    roles: HK_SUP,
  },
  {
    to: "/restaurant/housekeeping",
    tab: "maintenance",
    label: "Maintenance",
    icon: Wrench,
    roles: HK_MAINT,
  },
  {
    to: "/restaurant/housekeeping",
    tab: "history",
    label: "History",
    icon: History,
    roles: HK_SUP,
  },
];

const CASHIERING_NAV: NavEntry[] = [
  {
    to: "/restaurant/cashiering",
    tab: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    roles: CASH,
  },
  {
    to: "/restaurant/cashiering",
    tab: "folios",
    label: "Folios",
    icon: ReceiptText,
    roles: CASH,
  },
  {
    to: "/restaurant/cashiering",
    tab: "payments",
    label: "Payments",
    icon: Wallet,
    roles: CASH,
  },
  {
    to: "/restaurant/cashiering",
    tab: "shifts",
    label: "Cashier Shifts",
    icon: ClipboardCheck,
    roles: CASH,
  },
  {
    to: "/restaurant/pms/night-audit",
    label: "Night Audit",
    icon: MoonStar,
    roles: AUDIT,
  },
];

const REPORTS_NAV: NavEntry[] = [
  { to: "/restaurant/reports", label: "Reports", icon: BarChart3, roles: AUDIT },
];

const CONFIGURATION_NAV: NavEntry[] = [
  { to: "/restaurant/configuration", label: "Configuration", icon: LayoutDashboard },
  { to: "/restaurant/restaurant-management/menu", label: "Menu", icon: UtensilsCrossed, section: "Food & Beverage" },
  { to: "/restaurant/restaurant-management/tables", label: "Tables & QR", icon: QrCode, section: "Food & Beverage" },

  {
    to: "/restaurant/rooms",
    tab: "room-types",
    label: "Room Types",
    icon: BedDouble,
    section: "Rooms",
    roles: ["owner", "manager"],
  },
  {
    to: "/restaurant/rooms",
    tab: "rooms",
    label: "Rooms",
    icon: DoorOpen,
    section: "Rooms",
    roles: ["owner", "manager"],
  },
  {
    to: "/restaurant/pms/rates-revenue",
    tab: "plans",
    label: "Rate Plans",
    icon: BarChart3,
    section: "Rates & Revenue",
    roles: ["owner", "manager"],
  },
  {
    to: "/restaurant/pms/rates-revenue",
    tab: "calendar",
    label: "Rate Calendar",
    icon: CalendarDays,
    section: "Rates & Revenue",
    roles: ["owner", "manager"],
  },
  {
    to: "/restaurant/pms/rates-revenue",
    tab: "restrictions",
    label: "Restrictions",
    icon: Ban,
    section: "Rates & Revenue",
    roles: ["owner", "manager"],
  },
  {
    to: "/restaurant/pms/distribution",
    label: "Distribution",
    icon: Globe,
    section: "Distribution",
    roles: ["owner", "manager"],
  },
];

const MODULE_NAV: Record<WorkspaceModule, NavEntry[]> = {
  home: [],
  pms: [],
  restaurant: RESTAURANT_NAV,
  stock: STOCK_NAV,
  procurement: PROCUREMENT_NAV,
  staff: STAFF_NAV,
  rooms: ROOMS_NAV,
  housekeeping: HOUSEKEEPING_NAV,
  guests: ROOMS_NAV,
  cashiering: CASHIERING_NAV,
  reports: REPORTS_NAV,
  configuration: CONFIGURATION_NAV,
  settings: [{ to: "/restaurant/settings", label: "Settings", icon: Settings }],
};

const MODULE_TITLE: Record<WorkspaceModule, string> = {
  home: "Property Home",
  pms: "PMS",
  restaurant: "Food & Beverage",
  stock: "Inventory / Warehouse",
  procurement: "Procurement",
  staff: "Human Resources",
  rooms: "Front Office",
  housekeeping: "Housekeeping",
  guests: "Front Office",
  cashiering: "Accounting & Finance",
  reports: "Reports & Analytics",
  configuration: "Configuration",
  settings: "Property Settings & Integrations",
};

/** Which workspace a page belongs to, derived from its nav label. */
const LABEL_MODULE: Record<RestaurantNavLabel, WorkspaceModule> = {
  Home: "home",
  PMS: "pms",
  "Restaurant Management": "restaurant",
  "Back Office": "home",
  "Standalone POS": "home",
  Dashboard: "restaurant",
  Menu: "configuration",
  Kitchen: "restaurant",
  Orders: "restaurant",
  "Tables & QR": "configuration",
  "Take Order": "restaurant",
  Inventory: "stock",
  Rooms: "rooms",
  Arrivals: "rooms",
  "In-House": "rooms",
  Departures: "rooms",
  Housekeeping: "housekeeping",
  Bookings: "rooms",
  Reservations: "rooms",
  "New Reservation": "rooms",
  "Rates & Revenue": "configuration",
  Distribution: "configuration",
  Guests: "rooms",
  Cashiering: "cashiering",
  Folios: "cashiering",
  Payments: "cashiering",
  "Cashier Shifts": "cashiering",
  "Night Audit": "cashiering",
  Staff: "staff",
  Customers: "restaurant",
  Reports: "reports",
  Configuration: "configuration",
  Settings: "settings",
};

export function RestaurantShell({
  active,
  module,
  pms,
  pmsModule,
  pmsLeaf,
  rmModule,
  rmDetailLabel,
  boModule,
  boDetailLabel,
  posModule,
  children,
}: {
  active: RestaurantNavLabel;
  /** Overrides the workspace derived from `active` for pages shared by two modules. */
  module?: WorkspaceModule;
  /** Marks the page as a canonical PMS submodule: adds PMS context and a way back to PMS Home. */
  pms?: boolean;
  /**
   * Phase 7D.2D — key from `PMS_MODULES`. When set, the page is presented as a
   * PMS submodule: PMS sidebar, PMS breadcrumb, PMS heading. Presentation only.
   */
  pmsModule?: string;
  /** Optional final breadcrumb step (e.g. "Reservation", "Guest Profile") for detail pages. */
  pmsLeaf?: string;
  /**
   * Phase 8F2 — key from `RM_MODULES`. When set, the page is presented as a
   * canonical Restaurant Management submodule: breadcrumb, context label and a
   * way back to the Restaurant Management home. Presentation only.
   */
  rmModule?: string;
  /** Phase 8F3 — final breadcrumb crumb on a Restaurant Management detail page. */
  rmDetailLabel?: string;
  /**
   * Phase 8G1 — key from `BO_MODULES`. When set, the page is presented as a
   * Back Office submodule: Back Office sidebar, breadcrumb and context label.
   */
  boModule?: string;
  /** Phase 8G2B — final breadcrumb crumb on a Back Office detail page. */
  boDetailLabel?: string;
  /**
   * Phase 8H3 — key from `POS_MODULES`. When set, the page is presented as a
   * Standalone POS screen: POS-only sidebar and context label. Presentation
   * only; the route guard and server guards do the enforcing.
   */
  posModule?: string;
  children: (membership: RestaurantMembership) => ReactNode;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session, user } = useAuth();
  const fetchRestaurants = useServerFn(getMyRestaurants);
  const fetchModules = useServerFn(getMyModuleAccess);
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
    clearRoutePackageCache();
    await supabase.auth.signOut();
    void navigate({ to: "/restaurant/login", replace: true });
  }

  const membership = data?.[0];
  const restaurant = membership?.restaurant;
  const operational = restaurant?.status === "approved";
  const pmsMod = pmsModule ? getPmsModule(pmsModule) : undefined;
  const hidePackageRail = shouldSuppressRestaurantPmsRail(pmsModule);
  const rmMod = rmModule ? RM_MODULES.find((m) => m.key === rmModule) : undefined;
  const boMod = boModule ? getBoModule(boModule) : undefined;
  const posMod = posModule ? getPosModule(posModule) : undefined;

  const moduleAccess = useQuery({
    queryKey: ["my-module-access", membership?.restaurantId],
    queryFn: () => fetchModules({ data: { restaurantId: membership!.restaurantId } }),
    enabled: (!!pmsMod || !!rmMod || !!boMod) && !!membership?.restaurantId,
    retry: false,
  });

  const allowedModules = moduleAccess.data?.modules ?? [];
  // Phase 8C — package entitlement hides package-level entry points only.
  const packages = usePackageEntitlements(membership?.restaurantId);
  const pmsPackage = packages.has("pms");

  const workspace = module ?? LABEL_MODULE[active];
  // Restaurant Management is a package-level nav group: it disappears from
  // navigation when the package is switched off (routes still work).
  const workspacePackaged = workspace === "restaurant" ? packages.has("restaurant_management") : true;
  const items = workspacePackaged
    ? MODULE_NAV[workspace].filter(
        (item) => !item.roles || (membership ? item.roles.includes(membership.role) : false),
      )
    : [];
  const activeItem = items.find((i) => i.label === active);
  const activeTab =
    search.tab ?? (activeItem && !activeItem.tab ? undefined : items.find((i) => i.tab)?.tab);

  const contextLabel = posMod
    ? `Standalone POS · ${posMod.title}`
    : active === "Standalone POS"
    ? "Standalone POS"
    : boMod
    ? `Back Office · ${boMod.title}`
    : active === "Back Office"
    ? "Back Office"
    : rmMod
    ? `Restaurant Management · ${rmMod.title}`
    : pmsMod
    ? `PMS · ${pmsMod.title}`
    : pms && workspace !== "pms"
      ? `PMS · ${MODULE_TITLE[workspace]}`
      : MODULE_TITLE[workspace];

  const pmsSidebarNav = (
    <nav className="min-h-0 flex-1 overflow-y-auto" aria-label="PMS navigation">
      {PMS_NAV_GROUPS.map((group) => {
        const groupItems = group.modules.filter((m) => allowedModules.includes(m.moduleKey));
        if (groupItems.length === 0) return null;
        return (
          <div key={group.key} className="pb-2">
            <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
              {group.title}
            </p>
            <ul className="space-y-1">
              {groupItems.map((m) => (
                <li key={m.key}>
                  <Link
                    to={m.canonicalRoute}
                    onClick={() => setNavOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                      m.key === pmsMod?.key
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <m.icon className="size-4 shrink-0" /> {m.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );

  // Phase 8F4 — dedicated Restaurant Management navigation, grouped exactly as
  // the package launcher. Presentation only: visibility still comes from the
  // existing module-access result.
  const rmSidebarNav = (
    <nav className="min-h-0 flex-1 overflow-y-auto" aria-label="Restaurant Management navigation">
      {RM_GROUPS.map((group) => {
        const groupItems = RM_MODULES.filter(
          (m) => m.group === group.key && allowedModules.includes(m.moduleKey),
        );
        if (groupItems.length === 0) return null;
        return (
          <div key={group.key} className="pb-2">
            <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
              {group.title}
            </p>
            <ul className="space-y-1">
              {groupItems.map((m) => (
                <li key={m.key}>
                  <Link
                    to={m.canonicalRoute}
                    {...(m.canonicalSearch ? { search: m.canonicalSearch } : {})}
                    onClick={() => setNavOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                      m.key === rmMod?.key
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <m.icon className="size-4 shrink-0" /> {m.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );



  // Phase 8G1 — dedicated Back Office navigation, grouped exactly as the
  // package launcher. Presentation only; no module-access gating is applied
  // because these foundation pages carry no business data.
  const boSidebarNav = (
    <nav className="min-h-0 flex-1 overflow-y-auto" aria-label="Back Office navigation">
      {BO_GROUPS.map((group) => {
        const groupItems = BO_MODULES.filter((m) => m.group === group.key);
        if (groupItems.length === 0) return null;
        return (
          <div key={group.key} className="pb-2">
            <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
              {group.title}
            </p>
            <ul className="space-y-1">
              {groupItems.map((m) => (
                <li key={m.key}>
                  <Link
                    to={m.canonicalRoute}
                    onClick={() => setNavOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                      m.key === boMod?.key
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <m.icon className="size-4 shrink-0" /> {m.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );


  // Phase 8H3 — Standalone POS navigation. This package never shows
  // Restaurant Management, PMS or Back Office navigation. Areas that are not
  // built yet are listed but not clickable, so nobody is routed into an
  // unfinished screen.
  const posSidebarNav = (
    <nav className="min-h-0 flex-1 overflow-y-auto" aria-label="Standalone POS navigation">
      <ul className="space-y-1 pt-2">
        {POS_MODULES.map((m) => {
          const className = cn(
            "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
            m.key === posMod?.key
              ? "bg-sidebar-primary text-sidebar-primary-foreground"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          );
          return (
            <li key={m.key}>
              {m.canonicalRoute ? (
                <Link to={m.canonicalRoute} onClick={() => setNavOpen(false)} className={className}>
                  <m.icon className="size-4 shrink-0" /> {m.title}
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  title="Not available yet"
                  className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-sidebar-foreground/35"
                >
                  <m.icon className="size-4 shrink-0" /> {m.title}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );


  const restrictedSidebar = (
    <div className="flex h-full flex-col gap-5 p-4">
      <Link
        to="/restaurant/home"
        className="flex items-center gap-2 px-2 font-display text-lg"
        onClick={() => setNavOpen(false)}
        aria-label="NORU property home"
      >
        <NoruLogo size="sm" wordmarkClassName="text-sidebar-foreground" />
      </Link>
      <nav className="min-h-0 flex-1" aria-label="Account">
        <ul className="space-y-1">
          <li>
            <Link
              to="/restaurant/home"
              onClick={() => setNavOpen(false)}
              className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <LayoutDashboard className="size-4 shrink-0" /> Home
            </Link>
          </li>
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

  const sidebar = !operational && membership ? restrictedSidebar : (
    <div className="flex h-full flex-col gap-5 p-4">
      <Link
        to="/restaurant/home"
        className="flex items-center gap-2 px-2 font-display text-lg"
        onClick={() => setNavOpen(false)}
        aria-label="NORU property home"
      >
        <NoruLogo size="sm" wordmarkClassName="text-sidebar-foreground" />
      </Link>

      {pmsMod ? (
        <div className="space-y-1">
          <Link
            to="/restaurant/home"
            onClick={() => setNavOpen(false)}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <ArrowLeft className="size-4 shrink-0" /> Property Home
          </Link>
          {pmsPackage ? (
            <Link
              to="/restaurant/pms"
              onClick={() => setNavOpen(false)}
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <Hotel className="size-4 shrink-0" /> PMS Home
            </Link>
          ) : null}
        </div>
      ) : posMod || active === "Standalone POS" ? (
        <div className="space-y-1">
          <Link
            to="/restaurant/home"
            onClick={() => setNavOpen(false)}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <ArrowLeft className="size-4 shrink-0" /> Property Home
          </Link>
          <Link
            to="/restaurant/pos"
            onClick={() => setNavOpen(false)}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <ShoppingCart className="size-4 shrink-0" /> Standalone POS Home
          </Link>
        </div>
      ) : boMod || active === "Back Office" ? (
        <div className="space-y-1">
          <Link
            to="/restaurant/home"
            onClick={() => setNavOpen(false)}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <ArrowLeft className="size-4 shrink-0" /> Property Home
          </Link>
          <Link
            to="/restaurant/back-office"
            onClick={() => setNavOpen(false)}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <Briefcase className="size-4 shrink-0" /> Back Office Home
          </Link>
        </div>
      ) : rmMod ? (
        <div className="space-y-1">
          <Link
            to="/restaurant/home"
            onClick={() => setNavOpen(false)}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <ArrowLeft className="size-4 shrink-0" /> Property Home
          </Link>
          <Link
            to="/restaurant/restaurant-management"
            onClick={() => setNavOpen(false)}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <UtensilsCrossed className="size-4 shrink-0" /> Restaurant Management Home
          </Link>
        </div>
      ) : workspace !== "home" ? (
        <div className="space-y-2">
          <Link
            to={pms && pmsPackage ? "/restaurant/pms" : "/restaurant/home"}
            onClick={() => setNavOpen(false)}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <ArrowLeft className="size-4 shrink-0" />{" "}
            {pms && pmsPackage ? "PMS Home" : "Property Home"}
          </Link>
          <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
            {contextLabel}
          </p>
        </div>
      ) : null}

      {pmsMod && pmsPackage && !hidePackageRail ? pmsSidebarNav : null}
      {rmMod ? rmSidebarNav : null}
      {boMod || active === "Back Office" ? boSidebarNav : null}
      {posMod || active === "Standalone POS" ? posSidebarNav : null}

      <nav className={cn("min-h-0 flex-1 overflow-y-auto", (pmsMod || rmMod || boMod || posMod || active === "Back Office" || active === "Standalone POS") &&
            "hidden")}>

        <ul className="space-y-1">
          {items.map((item, index) => {
            const isActive = item.tab ? activeTab === item.tab : active === item.label;
            const showSection = !!item.section && item.section !== items[index - 1]?.section;
            return (
              <li key={`${item.label}-${item.tab ?? ""}`}>
                {showSection ? (
                  <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                    {item.section}
                  </p>
                ) : null}
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
        {/* Desktop sidebar — FO-FS0: omit the package rail and its w-60 width on Front Office. */}
        {hidePackageRail ? null : (
          <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:block">
            {sidebar}
          </aside>
        )}

        {/* Mobile drawer — never open the package drawer on Front Office. */}
        {!hidePackageRail && navOpen ? (
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
              {hidePackageRail ? null : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden"
                  aria-label="Open navigation"
                  onClick={() => setNavOpen(true)}
                >
                  <MenuIcon className="size-5" />
                </Button>
              )}
              <div className="min-w-0">
                <p className="truncate font-display text-lg leading-tight">
                  {restaurant?.name ?? "Restaurant"}
                </p>
                <p className="text-xs text-muted-foreground">{contextLabel}</p>
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
                  <p className="text-[11px] capitalize text-muted-foreground">
                    {membership?.role ?? ""}
                  </p>
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
              <p className="text-sm text-destructive">
                We couldn't load your restaurant. Please try again.
              </p>
            ) : !membership ? (
              <div className="rounded-2xl border border-border bg-card p-6">
                <h1 className="font-display text-2xl">Access denied</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  This account isn't linked to a restaurant. If you're a customer, head back to the
                  menu — or register your restaurant to get started.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button asChild>
                    <Link to="/restaurant/register">Register a restaurant</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link to="/">Back to home</Link>
                  </Button>
                </div>
              </div>
            ) : !operational && active !== "Settings" ? (
              <UnavailableRestaurantScreen membership={membership} />
            ) : (
              <RestaurantSettingsProvider
                timezone={membership.restaurant.timezone}
                currencyCode={membership.restaurant.currencyCode}
              >
                <PmsHeadingProvider
                  heading={pmsMod?.title ?? rmMod?.title}
                  kind={pmsMod ? "pms" : rmMod ? "rm" : undefined}
                >

                  {boMod ? (
                    <nav aria-label="Breadcrumb" className="mb-4 text-xs text-muted-foreground">
                      <Link to="/restaurant/home" className="hover:text-foreground">
                        Property Home
                      </Link>
                      <span className="px-1.5">→</span>
                      <Link to="/restaurant/back-office" className="hover:text-foreground">
                        Back Office
                      </Link>
                      <span className="px-1.5">→</span>
                      {boDetailLabel ? (
                        <>
                          <Link to={boMod.canonicalRoute} className="hover:text-foreground">
                            {boMod.title}
                          </Link>
                          <span className="px-1.5">→</span>
                          <span className="text-foreground">{boDetailLabel}</span>
                        </>
                      ) : (
                        <span className="text-foreground">{boMod.title}</span>
                      )}
                    </nav>
                  ) : null}

                  {rmMod ? (
                    <nav aria-label="Breadcrumb" className="mb-4 text-xs text-muted-foreground">
                      <Link to="/restaurant/home" className="hover:text-foreground">
                        Property Home
                      </Link>
                      <span className="px-1.5">→</span>
                      <Link to="/restaurant/restaurant-management" className="hover:text-foreground">
                        Restaurant Management
                      </Link>
                      <span className="px-1.5">→</span>
                      {rmDetailLabel ? (
                        <>
                          <span>{rmMod.title}</span>
                          <span className="px-1.5">→</span>
                          <span className="text-foreground">{rmDetailLabel}</span>
                        </>
                      ) : (
                        <span className="text-foreground">{rmMod.title}</span>
                      )}
                    </nav>
                  ) : null}

                  {pmsMod ? (
                    <nav aria-label="Breadcrumb" className="mb-4 text-xs text-muted-foreground">
                      <Link to="/restaurant/home" className="hover:text-foreground">
                        Property Home
                      </Link>
                      <span className="px-1.5">→</span>
                      <Link to="/restaurant/pms" className="hover:text-foreground">
                        PMS
                      </Link>
                      <span className="px-1.5">→</span>
                      {pmsLeaf ? (
                        <>
                          <Link to={pmsMod.canonicalRoute} className="hover:text-foreground">
                            {pmsMod.title}
                          </Link>
                          <span className="px-1.5">→</span>
                          <span className="text-foreground">{pmsLeaf}</span>
                        </>
                      ) : (
                        <span className="text-foreground">{pmsMod.title}</span>
                      )}
                    </nav>
                  ) : null}

                  {children(membership)}
                </PmsHeadingProvider>
              </RestaurantSettingsProvider>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function UnavailableRestaurantScreen({ membership }: { membership: RestaurantMembership }) {
  const status = membership.restaurant.status;
  const copy =
    status === "pending"
      ? {
          title: "Pending approval",
          body: "Your restaurant is registered and waiting for NORU to review it. Operational dashboards stay unavailable until we approve the property. Packages are assigned separately after approval.",
        }
      : status === "suspended"
        ? {
            title: "Restaurant unavailable",
            body: "This restaurant is suspended. Operational dashboards and packages are unavailable until a platform administrator reactivates it.",
          }
        : {
            title: "Restaurant unavailable",
            body: "This restaurant is not active. Contact NORU if you believe this is a mistake.",
          };

  return (
    <div className="mx-auto max-w-lg space-y-4 rounded-2xl border border-border bg-card p-6">
      <div className="flex items-center gap-3">
        <span className="inline-flex size-11 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-400">
          <Clock className="size-5" />
        </span>
        <div>
          <h1 className="font-display text-2xl">{membership.restaurant.name}</h1>
          <div className="mt-1">
            <StatusPill status={status} />
          </div>
        </div>
      </div>
      <h2 className="text-lg font-semibold">{copy.title}</h2>
      <p className="text-sm text-muted-foreground">{copy.body}</p>
    </div>
  );
}

function StatusPill({ status }: { status: RestaurantMembership["restaurant"]["status"] }) {
  const map = {
    approved: { label: "Active", className: "bg-success/15 text-success" },
    pending: {
      label: "Pending approval",
      className: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    },
    suspended: {
      label: "Suspended",
      className: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
    },
    rejected: { label: "Not approved", className: "bg-destructive/10 text-destructive" },
  }[status];
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
        map.className,
      )}
    >
      {map.label}
    </span>
  );
}
