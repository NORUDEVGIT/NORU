import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { StayProperty } from "@/lib/public-booking.server";
import { formatMoney } from "@/lib/restaurant-time";

export { formatMoney };

/** Shared public shell for the direct booking pages. */
export function StayLayout({
  property,
  children,
}: {
  property: StayProperty;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Link
            to="/stay/$propertySlug"
            params={{ propertySlug: property.slug }}
            className="flex items-center gap-3"
          >
            {property.logoUrl ? (
              <img src={property.logoUrl} alt={`${property.name} logo`} className="h-10 w-10 rounded-full object-cover" />
            ) : null}
            <span>
              <span className="block font-display text-lg leading-tight">{property.name}</span>
              {property.city ? (
                <span className="block text-xs text-muted-foreground">{property.city}</span>
              ) : null}
            </span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/stay/$propertySlug" params={{ propertySlug: property.slug }} className="hover:underline">
              Book a stay
            </Link>
            <Link
              to="/stay/$propertySlug/manage"
              params={{ propertySlug: property.slug }}
              className="hover:underline"
            >
              My booking
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>

      <footer className="border-t border-border py-6">
        <div className="mx-auto flex max-w-5xl flex-wrap gap-x-6 gap-y-1 px-4 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} {property.name}</span>
          {property.contactEmail ? <span>{property.contactEmail}</span> : null}
          {property.contactPhone ? <span>{property.contactPhone}</span> : null}
          <span className="ml-auto">Powered by NORU</span>
        </div>
      </footer>
    </div>
  );
}

export function StayNotFound() {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-4 text-center">
      <h1 className="font-display text-2xl">Booking page unavailable</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This property isn't taking direct bookings right now.
      </p>
    </div>
  );
}

/**
 * Phase 8D2 — neutral public notice when online booking is switched off for
 * this property. Deliberately says nothing about packages or billing.
 */
export function StayUnavailable() {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-4 text-center">
      <h1 className="font-display text-2xl">Online booking is currently unavailable</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Please contact the property directly to arrange your stay.
      </p>
    </div>
  );
}

export function StayLoading() {
  return <p className="p-8 text-center text-sm text-muted-foreground">Loading…</p>;
}
