import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StayLayout, StayLoading, StayNotFound, formatMoney } from "@/components/stay/stay-chrome";
import {
  cancelDirectBooking,
  getStayProperty,
  lookupDirectBooking,
  type PublicBookingDetail,
} from "@/lib/public-booking.functions";
import { formatStayDate } from "@/lib/reservation-dates";

export const Route = createFileRoute("/stay/$propertySlug/manage")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Manage your booking — NORU" },
      {
        name: "description",
        content: "Look up your reservation with your confirmation number and the email or phone you booked with.",
      },
      { property: "og:title", content: "Manage your booking" },
      { property: "og:description", content: "Look up or cancel your direct reservation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ManageRoute,
});

function ManageRoute() {
  const { propertySlug } = Route.useParams();
  const fetchProperty = useServerFn(getStayProperty);
  const propertyQuery = useQuery({
    queryKey: ["stay-property", propertySlug],
    queryFn: () => fetchProperty({ data: { slug: propertySlug } }),
  });

  if (propertyQuery.isLoading) return <StayLoading />;
  if (!propertyQuery.data) return <StayNotFound />;

  return (
    <StayLayout property={propertyQuery.data}>
      <ManagePanel slug={propertySlug} />
    </StayLayout>
  );
}

function ManagePanel({ slug }: { slug: string }) {
  const lookup = useServerFn(lookupDirectBooking);
  const cancel = useServerFn(cancelDirectBooking);

  const [confirmationNumber, setConfirmationNumber] = useState("");
  const [contact, setContact] = useState("");
  const [booking, setBooking] = useState<PublicBookingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const find = useMutation({
    mutationFn: () => lookup({ data: { slug, confirmationNumber, contact } }),
    onSuccess: (r) => {
      if (!r.ok) {
        setBooking(null);
        setError(r.message);
        return;
      }
      setError(null);
      setBooking(r.booking);
    },
  });

  const drop = useMutation({
    mutationFn: () => cancel({ data: { slug, confirmationNumber, contact } }),
    onSuccess: (r) => {
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setError(null);
      setBooking(r.booking);
      setNotice("Your booking is cancelled. Cancellation charges are not yet automated.");
    },
  });

  return (
    <div className="space-y-6">
      <section>
        <h1 className="font-display text-2xl">Find your booking</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter your confirmation number and the email or phone number you booked with.
        </p>
      </section>

      <section className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-[1fr_1fr_auto]">
        <div>
          <Label htmlFor="confirmation">Confirmation number</Label>
          <Input
            id="confirmation"
            value={confirmationNumber}
            onChange={(e) => setConfirmationNumber(e.target.value)}
            placeholder="NR-000001"
          />
        </div>
        <div>
          <Label htmlFor="contact">Email or phone</Label>
          <Input id="contact" value={contact} onChange={(e) => setContact(e.target.value)} />
        </div>
        <div className="flex items-end">
          <Button
            className="w-full"
            disabled={find.isPending || confirmationNumber.trim().length < 3 || contact.trim().length < 3}
            onClick={() => {
              setNotice(null);
              find.mutate();
            }}
          >
            {find.isPending ? "Searching…" : "Find booking"}
          </Button>
        </div>
      </section>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

      {booking ? (
        <section className="rounded-2xl border border-border bg-card p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-xl">{booking.confirmationNumber}</h2>
            <span className="text-sm capitalize text-muted-foreground">{booking.status.replace("_", " ")}</span>
          </div>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <Row label="Guest" value={booking.guestName} />
            <Row label="Room type" value={booking.roomTypeName} />
            <Row label="Check-in" value={formatStayDate(booking.arrivalDate)} />
            <Row label="Check-out" value={formatStayDate(booking.departureDate)} />
            <Row label="Nights" value={String(booking.nights)} />
            <Row label="Rate" value={booking.ratePlanName ?? "—"} />
            {booking.total !== null ? (
              <Row label="Total" value={formatMoney(booking.total, booking.currency)} />
            ) : null}
            {booking.specialRequests ? <Row label="Special requests" value={booking.specialRequests} /> : null}
          </dl>

          {booking.canCancel ? (
            <div className="mt-5">
              <Button variant="destructive" disabled={drop.isPending} onClick={() => drop.mutate()}>
                {drop.isPending ? "Cancelling…" : "Cancel this booking"}
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                Cancellation charges are not yet automated — the property will contact you if any apply.
              </p>
            </div>
          ) : null}

          <div className="mt-5">
            <Button asChild variant="outline">
              <Link to="/stay/$propertySlug" params={{ propertySlug: slug }}>
                Book another stay
              </Link>
            </Button>
          </div>
        </section>
      ) : null}
    </div>
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
