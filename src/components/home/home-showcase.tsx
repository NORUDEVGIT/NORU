import { MockBars, MockChip, MockKpi, MockOrderCard } from "@/components/home/ui-mock";
import { cn } from "@/shared/lib/utils";

const ROWS = [
  {
    eyebrow: "Customer",
    title: "Order from the table, no app needed",
    body: "Guests scan the table QR code, browse the live menu and follow their order status as it moves through the kitchen.",
    panel: (
      <div className="grid gap-3">
        <MockOrderCard order="Your order" table="Table QR" status="Received" lines={["Starters", "Mains"]} />
        <div className="flex flex-wrap gap-2">
          <MockChip label="Received" />
          <MockChip label="Preparing" />
          <MockChip label="Ready" tone="green" />
        </div>
      </div>
    ),
  },
  {
    eyebrow: "Waiter",
    title: "Table service that stays accountable",
    body: "Checked-in waiters place orders for their assigned tables from a phone, and every order keeps its service attribution.",
    panel: (
      <div className="grid gap-3">
        <MockOrderCard order="Waiter order" table="Assigned table" status="On shift" lines={["Add items", "Send to kitchen"]} />
        <MockOrderCard order="Assignment" table="Current shift" status="Checked in" tone="green" lines={["Table coverage"]} />
      </div>
    ),
  },
  {
    eyebrow: "Kitchen",
    title: "One live board for the pass",
    body: "Orders arrive in real time and move from New to Preparing to Ready, so the kitchen and floor stay in sync.",
    panel: (
      <div className="grid gap-3 sm:grid-cols-2">
        <MockOrderCard order="New" table="Incoming" status="New" lines={["Items"]} />
        <MockOrderCard order="Ready" table="For service" status="Ready" tone="green" lines={["Items"]} />
      </div>
    ),
  },
  {
    eyebrow: "Manager",
    title: "The whole service, at a glance",
    body: "Track orders, active operations, order value and busy periods, and configure timezone, currency and staff from one place.",
    panel: (
      <div className="grid gap-3">
        <MockBars />
        <div className="grid gap-3 sm:grid-cols-2">
          <MockKpi label="Order value" hint="Today" />
          <MockKpi label="Staff on shift" hint="Attendance" />
        </div>
      </div>
    ),
  },
];

export function HomeShowcase() {
  return (
    <section id="for-restaurants" className="bg-background">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <div className="max-w-2xl">
          <h2 className="font-display text-3xl sm:text-4xl">One Connected Restaurant Experience</h2>
          <p className="mt-3 text-base text-muted-foreground">
            NORU keeps every part of the restaurant working from the same live information — from the
            customer's table to the kitchen and management dashboard.
          </p>
        </div>

        <div className="mt-12 space-y-12 sm:space-y-16">
          {ROWS.map((row, index) => (
            <div
              key={row.eyebrow}
              className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14"
            >
              <div className={cn(index % 2 === 1 && "lg:order-2")}>
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                  {row.eyebrow}
                </span>
                <h3 className="mt-3 font-display text-2xl sm:text-3xl">{row.title}</h3>
                <p className="mt-3 text-sm text-muted-foreground sm:text-base">{row.body}</p>
              </div>
              <div
                className={cn(
                  "rounded-3xl border border-border bg-muted/40 p-4 sm:p-6",
                  index % 2 === 1 && "lg:order-1",
                )}
              >
                {row.panel}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
