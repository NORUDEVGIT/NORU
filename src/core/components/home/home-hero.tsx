import { type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { QrCode, Sparkles } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { MockBars, MockKpi, MockOrderCard } from "@/core/components/home/ui-mock";

export function HomeHero({ shortcuts }: { shortcuts?: ReactNode }) {
  return (
    <section id="top" className="bg-primary text-primary-foreground">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:py-20 lg:grid-cols-2 lg:items-center lg:py-24">
        <div className="fade-up">
          <span className="inline-flex items-center gap-2 rounded-full bg-accent/20 px-3 py-1 text-xs font-semibold text-accent">
            <Sparkles className="size-3.5" aria-hidden />
            Hospitality management platform
          </span>
          <h1 className="mt-5 font-display text-4xl leading-tight sm:text-5xl lg:text-6xl">
            Run hotels and restaurants on NORU
          </h1>
          <p className="mt-4 max-w-xl text-base text-primary-foreground/80 sm:text-lg">
            Restaurant Management, PMS, Standalone POS and Back Office Management — one platform for
            the floor, the stay and the office.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="h-12 rounded-full bg-accent px-7 font-semibold text-accent-foreground hover:bg-accent/90"
            >
              <Link to="/restaurant/register">Register Your Company</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 rounded-full border-primary-foreground/30 bg-transparent px-7 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
            >
              <a href="#packages">See packages</a>
            </Button>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button
              asChild
              variant="ghost"
              className="h-11 rounded-full px-4 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
            >
              <Link to="/scan">
                <QrCode className="mr-2 size-5" aria-hidden />
                Scan a table QR code
              </Link>
            </Button>
            {shortcuts}
          </div>
        </div>

        <div className="fade-up rounded-4xl border border-primary-foreground/15 bg-primary-foreground/5 p-4 sm:p-6">
          <div className="rounded-3xl bg-background p-4 text-foreground shadow-2xl sm:p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <MockKpi label="Today's operations" hint="Restaurant, rooms and till" />
              <MockKpi label="Live service" hint="Kitchen, house and POS" />
            </div>
            <div className="mt-3">
              <MockBars />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <MockOrderCard
                order="Dining"
                table="Restaurant Management"
                status="Preparing"
                lines={["QR orders", "Kitchen"]}
              />
              <MockOrderCard
                order="Stay"
                table="PMS"
                status="Ready"
                tone="green"
                lines={["Rooms", "Guests"]}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
