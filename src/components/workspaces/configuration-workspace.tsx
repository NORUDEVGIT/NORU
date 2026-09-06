import { Link } from "@tanstack/react-router";
import { ArrowRight, BedDouble, CalendarDays, Ban, DoorOpen, Globe, QrCode, UtensilsCrossed, BarChart3 } from "lucide-react";
import { RestaurantShell } from "@/components/restaurant-shell";
import type { RestaurantMembership } from "@/lib/restaurant.functions";

type ConfigLink = {
  title: string;
  description: string;
  icon: typeof QrCode;
  to: string;
  tab?: string;
  roles?: string[];
};

type ConfigGroup = { section: string; items: ConfigLink[] };

const GROUPS: ConfigGroup[] = [
  {
    section: "Food & Beverage",
    items: [
      {
        title: "Menu",
        description: "Categories, items, prices, availability and recipe mapping.",
        icon: UtensilsCrossed,
        to: "/restaurant/menu",
      },
      {
        title: "Tables & QR",
        description: "Tables, QR codes and printable table cards.",
        icon: QrCode,
        to: "/restaurant/tables",
      },
    ],
  },
  {
    section: "Rooms",
    items: [
      {
        title: "Room Types",
        description: "Room types, occupancy, amenities and imagery.",
        icon: BedDouble,
        to: "/restaurant/rooms",
        tab: "room-types",
        roles: ["owner", "manager"],
      },
      {
        title: "Rooms",
        description: "Physical rooms, numbering and their room type.",
        icon: DoorOpen,
        to: "/restaurant/rooms",
        tab: "rooms",
        roles: ["owner", "manager"],
      },
    ],
  },
  {
    section: "Rates & Revenue",
    items: [
      {
        title: "Rate Plans",
        description: "Rate categories, plans and base rates.",
        icon: BarChart3,
        to: "/restaurant/bookings/rates",
        tab: "plans",
        roles: ["owner", "manager"],
      },
      {
        title: "Rate Calendar",
        description: "Daily rate overrides per plan.",
        icon: CalendarDays,
        to: "/restaurant/bookings/rates",
        tab: "calendar",
        roles: ["owner", "manager"],
      },
      {
        title: "Restrictions",
        description: "Stop-sell, closed to arrival/departure and minimum stay.",
        icon: Ban,
        to: "/restaurant/bookings/rates",
        tab: "restrictions",
        roles: ["owner", "manager"],
      },
    ],
  },
  {
    section: "Distribution",
    items: [
      {
        title: "Distribution",
        description: "Direct booking page, contact details and booking activity.",
        icon: Globe,
        to: "/restaurant/bookings/distribution",
        roles: ["owner", "manager"],
      },
    ],
  },
];

export function ConfigurationWorkspace({ membership, initialTab }: { membership: RestaurantMembership; initialTab?: string }) {
  const role = membership.role;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl">Configuration</h1>
        <p className="text-sm text-muted-foreground">
          Operational master data for {membership.restaurant.name}. Property, regional and account settings live in
          Property Settings & Integrations.
        </p>
      </div>

      {GROUPS.map((group) => {
        const items = group.items.filter((i) => !i.roles || i.roles.includes(role));
        if (items.length === 0) return null;
        return (
          <section key={group.section} className="space-y-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group.section}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => (
                <Link
                  key={item.title}
                  to={item.to}
                  {...(item.tab ? { search: { tab: item.tab } } : {})}
                  className="group flex flex-col rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/50 hover:bg-accent/40"
                >
                  <item.icon className="size-5 text-primary" />
                  <p className="mt-3 font-display text-lg">{item.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                  <span className="mt-auto inline-flex items-center gap-1 pt-3 text-sm font-medium text-primary">
                    Open <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
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
