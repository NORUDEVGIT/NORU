import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BedDouble,
  CalendarCheck,
  CalendarDays,
  Hotel,
  MoonStar,
  Settings,
  Sparkles,
  TrendingUp,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { getMyModuleAccess } from "@/core/lib/module-access.functions";
import { getFrontOfficeDashboard } from "@/packages/pms/lib/frontoffice.functions";
import { PMS_MODULE_NAV, type PmsModuleNavId } from "@/packages/pms/lib/pms-module-nav";
import { pmsLauncherModules } from "@/packages/pms/lib/pms-modules";
import { getPmsPropertySetupCard1 } from "@/packages/pms/lib/pms-property-setup-card1.functions";
import { usePropertyBusinessDate } from "@/packages/pms/lib/use-property-business-date";
import { cn } from "@/shared/lib/utils";

const CARD_COPY: Record<
  PmsModuleNavId,
  { title: string; description: string; icon: LucideIcon; tint: string }
> = {
  "front-office": {
    title: "Front Office",
    description: "Room rack, arrivals, in-house, departures and stay amendments.",
    icon: Hotel,
    tint: "bg-[#F8EBD4] text-[#8A6232]",
  },
  reservations: {
    title: "Reservations",
    description: "Bookings, availability and stay changes.",
    icon: CalendarCheck,
    tint: "bg-[#E7F0FF] text-[#3D6CB5]",
  },
  "guest-profile": {
    title: "Guest Profile",
    description: "Guest directory, companies, groups and travel agents.",
    icon: UserRound,
    tint: "bg-[#E5F6EA] text-[#3E8B55]",
  },
  "room-inventory": {
    title: "Rooms & Inventory",
    description: "Room types, rooms, availability and out of service.",
    icon: BedDouble,
    tint: "bg-[#EEE8FF] text-[#6A56B8]",
  },
  housekeeping: {
    title: "Housekeeping",
    description: "Room status, cleaning board, inspections and maintenance.",
    icon: Sparkles,
    tint: "bg-[#FDE8EF] text-[#C45B78]",
  },
  cashiering: {
    title: "Cashiering",
    description: "Guest folios, postings, payments and cashier shifts.",
    icon: Wallet,
    tint: "bg-[#E5F6EA] text-[#3E8B55]",
  },
  "rates-revenue": {
    title: "Rate & Revenue",
    description: "Pricing, revenue control and commercial operations.",
    icon: TrendingUp,
    tint: "bg-[#F8EBD4] text-[#8A6232]",
  },
  "night-audit": {
    title: "Night Audit",
    description: "Close of day, confirm date roll and audit history.",
    icon: MoonStar,
    tint: "bg-[#EEE8FF] text-[#6A56B8]",
  },
  reports: {
    title: "Reports",
    description: "Occupancy, revenue and rooms-side operations.",
    icon: BarChart3,
    tint: "bg-[#E7F0FF] text-[#3D6CB5]",
  },
  settings: {
    title: "Settings",
    description: "Property setup, master data, policies, taxes and go-live.",
    icon: Settings,
    tint: "bg-[#F3EFE8] text-[#6B6256]",
  },
};

export function PmsHomeDesk({
  membership,
  moduleQuery = "",
}: {
  membership: RestaurantMembership;
  moduleQuery?: string;
}) {
  const restaurantId = membership.restaurant.id;
  const businessDate = usePropertyBusinessDate(restaurantId, membership.restaurant.timezone);
  const fetchModules = useServerFn(getMyModuleAccess);
  const fetchCard1 = useServerFn(getPmsPropertySetupCard1);
  const fetchFrontOffice = useServerFn(getFrontOfficeDashboard);

  const moduleAccess = useQuery({
    queryKey: ["pms-home-modules", restaurantId],
    queryFn: () => fetchModules({ data: { restaurantId } }),
  });
  const card1 = useQuery({
    queryKey: ["pms-card1", restaurantId],
    queryFn: () => fetchCard1({ data: { restaurantId } }),
    retry: false,
  });
  const allowed = moduleAccess.data?.modules ?? [];
  const canReadFrontOffice = allowed.includes("front_office");
  const frontOffice = useQuery({
    queryKey: ["pms-home-front-office", restaurantId, businessDate],
    queryFn: () => fetchFrontOffice({ data: { restaurantId, today: businessDate } }),
    enabled: canReadFrontOffice,
    retry: false,
  });

  const configuredName = card1.data?.snapshot.draft.name.trim() ?? "";
  const propertyName = configuredName || membership.restaurant.name;
  const needle = moduleQuery.trim().toLowerCase();
  const cards = pmsLauncherModules().filter((module) => {
    if (moduleAccess.data && !allowed.includes(module.moduleKey)) return false;
    const nav = PMS_MODULE_NAV.find((item) => item.catalogueKey === module.key);
    if (!nav) return false;
    if (!needle) return true;
    const copy = CARD_COPY[nav.id];
    return `${copy.title} ${copy.description}`.toLowerCase().includes(needle);
  });

  const snapshot = frontOffice.data;
  const roomTotal = snapshot ? snapshot.occupiedRooms + snapshot.availableRooms : 0;
  const occupancy =
    snapshot && roomTotal > 0 ? `${Math.round((snapshot.occupiedRooms / roomTotal) * 100)}%` : snapshot ? "0%" : null;

  return (
    <div className="min-h-full bg-[#F6F3EE] px-4 py-5 sm:px-6 sm:py-6" data-testid="pms-home-desk">
      <section className="relative overflow-hidden rounded-3xl border border-[#E7E0D4] bg-[#F7F1E8]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-[48%] sm:block"
          style={{
            background:
              "linear-gradient(105deg, rgba(247,241,232,0) 0%, rgba(232,214,184,0.55) 28%, #d7c09a 62%, #b89262 100%)",
          }}
        />
        <div aria-hidden className="pointer-events-none absolute right-[7%] top-8 hidden h-36 w-52 rounded-2xl border border-white/40 bg-white/25 sm:block" />
        <div aria-hidden className="pointer-events-none absolute bottom-8 right-[18%] hidden size-16 rounded-full bg-[#C89933]/25 sm:block" />
        <div className="relative space-y-5 px-5 py-6 sm:px-8 sm:py-8">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-[#7A7166]">
            <Link to="/restaurant/home" className="hover:text-[#251605]">
              Property Home
            </Link>
            <span aria-hidden>›</span>
            <span className="text-[#251605]">PMS</span>
          </nav>
          <div className="flex items-center gap-4">
            <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-[#F8EBD4] text-[#8A6232]">
              <Hotel className="size-7" />
            </span>
            <div>
              <h1 className="font-display text-4xl font-semibold tracking-tight text-[#251605]">PMS</h1>
              <p className="mt-1 text-sm text-[#6B6256]">Hotel operating system – {propertyName}</p>
            </div>
          </div>
          <div className="h-8 sm:h-10" />
        </div>
      </section>

      <section
        aria-label="Today"
        className="relative z-10 -mt-8 grid grid-cols-1 overflow-hidden rounded-2xl border border-[#E7E0D4] bg-white shadow-sm sm:grid-cols-2 xl:grid-cols-4"
        data-testid="pms-home-kpis"
      >
        <Kpi
          icon={Users}
          tint="bg-[#F8EBD4] text-[#8A6232]"
          label="In-House Guests"
          value={snapshot ? String(snapshot.inHouse) : "—"}
        />
        <Kpi
          icon={BedDouble}
          tint="bg-[#E7F0FF] text-[#3D6CB5]"
          label="Occupied Rooms"
          value={occupancy ?? "—"}
          detail={snapshot ? `${snapshot.occupiedRooms} of ${roomTotal} rooms` : undefined}
        />
        <Kpi
          icon={CalendarDays}
          tint="bg-[#FDE8EF] text-[#C45B78]"
          label="Arrivals Today"
          value={snapshot ? String(snapshot.arrivalsToday) : "—"}
        />
        <Kpi
          icon={ArrowUpRight}
          tint="bg-[#EEE8FF] text-[#6A56B8]"
          label="Departures Today"
          value={snapshot ? String(snapshot.departuresToday) : "—"}
        />
      </section>

      <section className="mt-8 space-y-4" aria-label="PMS Modules">
        <div>
          <h2 className="font-display text-xl text-[#251605]">PMS Modules</h2>
          <p className="text-sm text-[#6B6256]">Manage your hotel operations from one place.</p>
        </div>
        {cards.length === 0 ? (
          <p className="text-sm text-[#6B6256]">
            {moduleAccess.isLoading
              ? "Loading modules…"
              : needle
                ? "No module matches that search."
                : "You don't have access to a hotel desk for this property yet."}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {cards.map((module) => {
              const nav = PMS_MODULE_NAV.find((item) => item.catalogueKey === module.key);
              if (!nav) return null;
              const copy = CARD_COPY[nav.id];
              const Icon = copy.icon;
              return (
                <Link
                  key={module.key}
                  to={nav.to}
                  className="group flex min-h-44 flex-col rounded-2xl border border-[#E7E0D4] bg-white p-4 shadow-sm transition-colors hover:border-[#C89933]/70"
                >
                  <span className={cn("inline-flex size-11 items-center justify-center rounded-xl", copy.tint)}>
                    <Icon className="size-5" />
                  </span>
                  <p className="mt-4 font-display text-base font-semibold text-[#251605]">{copy.title}</p>
                  <p className="mt-1 flex-1 text-sm leading-snug text-[#6B6256]">{copy.description}</p>
                  <span className="mt-4 inline-flex size-8 items-center justify-center self-end rounded-full border border-[#E7E0D4] text-[#6B6256] transition-colors group-hover:border-[#C89933] group-hover:text-[#8A6232]">
                    <ArrowRight className="size-4" />
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Kpi({
  icon: Icon,
  tint,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  tint: string;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="flex items-center gap-3 border-[#E7E0D4] px-4 py-4 sm:border-l sm:first:border-l-0">
      <span className={cn("inline-flex size-11 shrink-0 items-center justify-center rounded-xl", tint)}>
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-[#6B6256]">{label}</p>
        <p className="font-display text-3xl font-semibold leading-none text-[#251605]">{value}</p>
        {detail ? <p className="mt-1 text-[11px] text-[#8A8176]">{detail}</p> : null}
      </div>
    </div>
  );
}
