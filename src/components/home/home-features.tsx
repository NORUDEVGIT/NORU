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
    body: "Customers scan their table QR code, browse the live menu, place orders and track status without downloading an app.",
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
    body: "View orders, active operations, order value, busy periods and restaurant performance.",
  },
  {
    icon: Settings,
    title: "Restaurant Settings",
    body: "Configure restaurant timezone, currency and operational preferences.",
  },
];

export function HomeFeatures() {
  return (
    <section id="features" className="bg-background">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <div className="max-w-2xl">
          <h2 className="font-display text-3xl sm:text-4xl">
            Everything Your Restaurant Needs in One Platform
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            NORU connects customers, waiters, kitchens and restaurant management through one simple
            operating system.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <article
              key={title}
              className="rounded-3xl border border-border bg-card p-6 transition-shadow hover:shadow-md"
            >
              <span className="grid size-11 place-items-center rounded-2xl bg-accent/15 text-accent">
                <Icon className="size-5" />
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
