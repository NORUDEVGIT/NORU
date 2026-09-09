import {
  BarChart3,
  ChefHat,
  ClipboardList,
  ConciergeBell,
  QrCode,
  Settings,
  Table,
  Users,
} from "lucide-react";

const FEATURES = [
  {
    icon: QrCode,
    title: "QR Ordering",
    body: "Guests scan a table QR code, browse the live menu, place orders and track status without an app.",
  },
  {
    icon: ChefHat,
    title: "Kitchen Management",
    body: "Kitchen teams receive and manage live orders from New through Preparing and Ready.",
  },
  {
    icon: ConciergeBell,
    title: "Waiter-Assisted Ordering",
    body: "Checked-in waiters can take orders from their phone for assigned tables.",
  },
  {
    icon: ClipboardList,
    title: "Orders Management",
    body: "Search, filter and review restaurant orders with detailed status history.",
  },
  {
    icon: Users,
    title: "Staff & Shift Management",
    body: "Register staff, schedule shifts, assign tables and manage attendance.",
  },
  {
    icon: Table,
    title: "Tables & QR",
    body: "Manage restaurant tables and generate secure QR codes for each table.",
  },
  {
    icon: BarChart3,
    title: "Dashboard & Analytics",
    body: "View orders, active operations, order value, busy periods and outlet performance.",
  },
  {
    icon: Settings,
    title: "Outlet Settings",
    body: "Configure timezone, currency and operational preferences for the restaurant.",
  },
];

export function HomeFeatures() {
  return (
    <section id="features" className="bg-muted/50">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <div className="max-w-2xl">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            Restaurant Management
          </span>
          <h2 className="mt-3 font-display text-3xl sm:text-4xl">
            What Restaurant Management covers
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            The F&amp;B package connects guests, waiters, kitchens and managers. PMS, Standalone POS
            and Back Office Management sit alongside it as separate commercial packages.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <article
              key={title}
              className="rounded-3xl border border-border bg-card p-6 transition-shadow hover:shadow-md"
            >
              <span className="grid size-11 place-items-center rounded-2xl bg-accent/15 text-accent">
                <Icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-4 font-display text-xl">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
