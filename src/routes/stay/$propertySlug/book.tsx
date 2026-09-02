import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StayLayout, StayLoading, StayNotFound, formatMoney } from "@/components/stay/stay-chrome";
import {
  getStayProperty,
  searchStay,
  submitDirectBooking,
  type PublicRoomTypeOffer,
} from "@/lib/public-booking.functions";
import { formatStayDate } from "@/lib/reservation-dates";

type BookSearch = {
  arrival: string;
  departure: string;
  adults: number;
  children: number;
  roomTypeId: string;
  ratePlanId: string;
};

export const Route = createFileRoute("/stay/$propertySlug/book")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): BookSearch => ({
    arrival: String(search["arrival"] ?? ""),
    departure: String(search["departure"] ?? ""),
    adults: Number(search["adults"] ?? 2),
    children: Number(search["children"] ?? 0),
    roomTypeId: String(search["roomTypeId"] ?? ""),
    ratePlanId: String(search["ratePlanId"] ?? ""),
  }),
  head: () => ({
    meta: [
      { title: "Complete your booking — NORU" },
      { name: "description", content: "Enter your details and confirm your direct room booking." },
      { property: "og:title", content: "Complete your booking" },
      { property: "og:description", content: "Enter your details and confirm your direct room booking." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BookRoute,
});

function BookRoute() {
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
      <BookPanel property={propertyQuery.data} />
    </StayLayout>
  );
}

function BookPanel({ property }: { property: NonNullable<Awaited<ReturnType<typeof getStayProperty>>> }) {
  const navigate = useNavigate();
  const s = Route.useSearch();
  const runSearch = useServerFn(searchStay);
  const submit = useServerFn(submitDirectBooking);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [nationality, setNationality] = useState("");
  const [specialRequests, setSpecialRequests] = useState("");
  const [error, setError] = useState<string | null>(null);

  // The price shown here is re-derived from the server, never from the browser.
  const offersQuery = useQuery({
    queryKey: ["stay-offer", property.slug, s.arrival, s.departure, s.adults, s.children],
    queryFn: () =>
      runSearch({
        data: {
          slug: property.slug,
          arrival: s.arrival,
          departure: s.departure,
          adults: s.adults,
          children: s.children,
        },
      }),
    enabled: !!s.arrival && !!s.departure && !!s.roomTypeId,
  });

  const offers: PublicRoomTypeOffer[] = offersQuery.data?.ok ? offersQuery.data.offers : [];
  const offer = offers.find((o) => o.roomTypeId === s.roomTypeId);
  const plan = offer?.plans.find((p) => p.ratePlanId === s.ratePlanId);

  const booking = useMutation({
    mutationFn: () =>
      submit({
        data: {
          slug: property.slug,
          arrival: s.arrival,
          departure: s.departure,
          adults: s.adults,
          children: s.children,
          roomTypeId: s.roomTypeId,
          ratePlanId: s.ratePlanId || null,
          firstName,
          lastName,
          email,
          phone,
          nationality,
          specialRequests,
        },
      }),
    onSuccess: (r) => {
      if (!r.ok) {
        setError(r.message);
        return;
      }
      void navigate({
        to: "/stay/$propertySlug/confirmation",
        params: { propertySlug: property.slug },
        search: { confirmation: r.confirmationNumber, contact: email },
      });
    },
  });

  if (offersQuery.isLoading) return <StayLoading />;

  if (!offer || !plan?.quote) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h1 className="font-display text-xl">That room is no longer available</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {plan?.unavailableReason ?? "Please search again to see what's still open for those dates."}
        </p>
        <Button asChild className="mt-4">
          <Link to="/stay/$propertySlug" params={{ propertySlug: property.slug }}>
            Back to search
          </Link>
        </Button>
      </div>
    );
  }

  const quote = plan.quote;

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_320px]">
      <section className="space-y-4">
        <h1 className="font-display text-2xl">Your details</h1>
        <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="firstName">First name</Label>
            <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="lastName">Last name</Label>
            <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="nationality">Nationality (optional)</Label>
            <Input id="nationality" value={nationality} onChange={(e) => setNationality(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="requests">Special requests (optional)</Label>
            <Textarea
              id="requests"
              rows={3}
              maxLength={1000}
              value={specialRequests}
              onChange={(e) => setSpecialRequests(e.target.value)}
            />
          </div>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Button
          size="lg"
          disabled={booking.isPending || !firstName.trim() || !email.trim() || phone.trim().length < 5}
          onClick={() => {
            setError(null);
            booking.mutate();
          }}
        >
          {booking.isPending ? "Confirming…" : `Confirm booking · ${formatMoney(quote.subtotal, quote.currency)}`}
        </Button>
        <p className="text-xs text-muted-foreground">
          No payment is taken online. You'll settle your stay with the property.
        </p>
      </section>

      <aside className="h-fit rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-lg">{offer.name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatStayDate(s.arrival)} → {formatStayDate(s.departure)}
        </p>
        <p className="text-sm text-muted-foreground">
          {quote.nights} night{quote.nights === 1 ? "" : "s"} · {s.adults} adult{s.adults === 1 ? "" : "s"}
          {s.children > 0 ? ` · ${s.children} child${s.children === 1 ? "" : "ren"}` : ""}
        </p>
        <p className="mt-3 text-sm font-medium">{plan.name}</p>
        <ul className="mt-2 space-y-1 text-sm">
          {quote.nightly.map((n) => (
            <li key={n.date} className="flex justify-between text-muted-foreground">
              <span>{formatStayDate(n.date)}</span>
              <span>{formatMoney(n.rate, quote.currency)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-between border-t border-border pt-3 font-display text-lg">
          <span>Total</span>
          <span>{formatMoney(quote.subtotal, quote.currency)}</span>
        </div>
      </aside>
    </div>
  );
}
