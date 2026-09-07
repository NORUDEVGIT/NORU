import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/shared/components/ui/button";
import { StayLayout, StayLoading, StayNotFound, StayUnavailable, formatMoney } from "@/components/stay/stay-chrome";
import { getStayProperty, lookupDirectBooking } from "@/lib/public-booking.functions";
import { formatStayDate } from "@/lib/reservation-dates";

export const Route = createFileRoute("/stay/$propertySlug/confirmation")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    confirmation: String(search["confirmation"] ?? ""),
    contact: String(search["contact"] ?? ""),
  }),
  head: () => ({
    meta: [
      { title: "Booking confirmed — NORU" },
      { name: "description", content: "Your direct room booking is confirmed. Here are your stay details." },
      { property: "og:title", content: "Booking confirmed" },
      { property: "og:description", content: "Your direct room booking is confirmed." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ConfirmationRoute,
});

function ConfirmationRoute() {
  const { propertySlug } = Route.useParams();
  const { confirmation, contact } = Route.useSearch();
  const fetchProperty = useServerFn(getStayProperty);
  const lookup = useServerFn(lookupDirectBooking);

  const propertyQuery = useQuery({
    queryKey: ["stay-property", propertySlug],
    queryFn: () => fetchProperty({ data: { slug: propertySlug } }),
  });
  const bookingQuery = useQuery({
    queryKey: ["stay-confirmation", propertySlug, confirmation, contact],
    queryFn: () => lookup({ data: { slug: propertySlug, confirmationNumber: confirmation, contact } }),
    enabled: !!confirmation && !!contact,
  });

  if (propertyQuery.isLoading) return <StayLoading />;
  if (propertyQuery.data?.status === "unavailable") return <StayUnavailable />;
  const property = propertyQuery.data?.property ?? null;
  if (!property) return <StayNotFound />;

  const booking = bookingQuery.data?.ok ? bookingQuery.data.booking : null;

  return (
    <StayLayout property={property}>
      {bookingQuery.isLoading ? <StayLoading /> : null}

      {!bookingQuery.isLoading && !booking ? (
        <div className="rounded-2xl border border-border bg-card p-6">
          <h1 className="font-display text-xl">We couldn't load that booking</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Use your confirmation number and the email or phone you booked with to find it again.
          </p>
          <Button asChild className="mt-4">
            <Link to="/stay/$propertySlug/manage" params={{ propertySlug }}>
              Find my booking
            </Link>
          </Button>
        </div>
      ) : null}

      {booking ? (
        <div className="space-y-5">
          <section className="rounded-2xl border border-success/40 bg-success/10 p-6">
            <h1 className="font-display text-2xl">Booking confirmed</h1>
            <p className="mt-1 text-sm">
              Thanks {booking.guestName} — your stay at {booking.propertyName} is reserved.
            </p>
            <p className="mt-3 font-display text-3xl tracking-wide">{booking.confirmationNumber}</p>
            <p className="text-xs text-muted-foreground">Keep this confirmation number for your records.</p>
          </section>

          <section className="rounded-2xl border border-border bg-card p-6">
            <dl className="grid gap-3 sm:grid-cols-2">
              <Row label="Room type" value={booking.roomTypeName} />
              <Row label="Rate" value={booking.ratePlanName ?? "—"} />
              <Row label="Check-in" value={formatStayDate(booking.arrivalDate)} />
              <Row label="Check-out" value={formatStayDate(booking.departureDate)} />
              <Row label="Nights" value={String(booking.nights)} />
              <Row
                label="Guests"
                value={`${booking.adults} adult${booking.adults === 1 ? "" : "s"}${
                  booking.children > 0 ? `, ${booking.children} child${booking.children === 1 ? "" : "ren"}` : ""
                }`}
              />
              {booking.total !== null ? (
                <Row label="Total" value={formatMoney(booking.total, booking.currency)} />
              ) : null}
              {booking.specialRequests ? <Row label="Special requests" value={booking.specialRequests} /> : null}
            </dl>
          </section>

          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link to="/stay/$propertySlug" params={{ propertySlug }}>
                Book another stay
              </Link>
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              Print confirmation
            </Button>
          </div>
        </div>
      ) : null}
    </StayLayout>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}
