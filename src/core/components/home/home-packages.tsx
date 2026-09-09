import { Link } from "@tanstack/react-router";
import { Briefcase, Building2, ShoppingBag, UtensilsCrossed } from "lucide-react";
import { Button } from "@/shared/components/ui/button";

const PACKAGES = [
  {
    icon: UtensilsCrossed,
    title: "Restaurant Management",
    body: "QR ordering, kitchen boards, tables, waiter service and F&B operations in one workspace.",
  },
  {
    icon: Building2,
    title: "PMS",
    body: "Rooms, reservations, guests, housekeeping and front office for hotel and stay operations.",
  },
  {
    icon: ShoppingBag,
    title: "Standalone POS",
    body: "Independent till: catalog, sell screen, payments and receipts without tying to table QR flow.",
  },
  {
    icon: Briefcase,
    title: "Back Office Management",
    body: "Procurement, inventory, HR and finance reporting for the property behind the floor.",
  },
] as const;

export function HomePackages() {
  return (
    <section id="packages" className="bg-background" aria-labelledby="packages-heading">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
        <div className="max-w-2xl">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            Commercial packages
          </span>
          <h2 id="packages-heading" className="mt-3 font-display text-3xl sm:text-4xl">
            Four packages. One hospitality platform.
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            NORU is sold as Restaurant Management, PMS, Standalone POS and Back Office Management.
            Properties receive the packages they need — not a single restaurant-only product.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PACKAGES.map(({ icon: Icon, title, body }) => (
            <article
              key={title}
              className="flex flex-col rounded-3xl border border-border bg-card p-6 transition-shadow hover:shadow-md"
            >
              <span className="grid size-11 place-items-center rounded-2xl bg-accent/15 text-accent">
                <Icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-4 font-display text-xl">{title}</h3>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">{body}</p>
            </article>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Button
            asChild
            size="lg"
            className="h-12 rounded-full bg-accent px-7 font-semibold text-accent-foreground hover:bg-accent/90"
          >
            <Link to="/restaurant/register">Register Your Company</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-12 rounded-full px-7">
            <a href="#contact">Contact Us</a>
          </Button>
        </div>
      </div>
    </section>
  );
}
