import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import type { StayProperty } from "@/lib/public-booking.server";
import { StayLayout, StayLoading, StayNotFound, StayUnavailable, formatMoney } from "@/components/stay/stay-chrome";
import { getStayProperty, searchStay, type PublicRoomTypeOffer } from "@/lib/public-booking.functions";
import { addDays, formatStayDate, propertyToday } from "@/lib/reservation-dates";

export const Route = createFileRoute("/stay/$propertySlug/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Book your stay — NORU" },
      {
        name: "description",
        content: "Check availability and book a room directly with the property. No booking fees, instant confirmation.",
      },
      { property: "og:title", content: "Book your stay" },
      { property: "og:description", content: "Check live availability and book directly with the property." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StaySearchRoute,
});

function StaySearchRoute() {
  const { propertySlug } = Route.useParams();
  const fetchProperty = useServerFn(getStayProperty);
  const propertyQuery = useQuery({
    queryKey: ["stay-property", propertySlug],
    queryFn: () => fetchProperty({ data: { slug: propertySlug } }),
  });

  if (propertyQuery.isLoading) return <StayLoading />;
  if (propertyQuery.data?.status === "unavailable") return <StayUnavailable />;
  const property = propertyQuery.data?.property ?? null;
  if (!property) return <StayNotFound />;

  return (
    <StayLayout property={property}>
      <SearchPanel property={property} />
    </StayLayout>
  );
}

function SearchPanel({ property }: { property: StayProperty }) {
  const navigate = useNavigate();
  const today = propertyToday(property.timezone);
  const [arrival, setArrival] = useState(today);
  const [departure, setDeparture] = useState(addDays(today, 1));
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ offers: PublicRoomTypeOffer[]; nights: number } | null>(null);

  const run = useServerFn(searchStay);
  const search = useMutation({
    mutationFn: () => run({ data: { slug: property.slug, arrival, departure, adults, children } }),
    onSuccess: (r) => {
      if (!r.ok) {
        setError(r.message);
        setResult(null);
        return;
      }
      setError(null);
      setResult({ offers: r.offers, nights: r.nights });
    },
  });

  return (
    <div className="space-y-8">
      <section>
        <h1 className="font-display text-3xl">Book your stay at {property.name}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {property.bookingMessage ?? "Live availability, direct rates and instant confirmation."}
        </p>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <Label htmlFor="arrival">Check-in</Label>
            <Input
              id="arrival"
              type="date"
              min={today}
              value={arrival}
              onChange={(e) => {
                setArrival(e.target.value);
                if (departure <= e.target.value) setDeparture(addDays(e.target.value, 1));
              }}
            />
          </div>
          <div>
            <Label htmlFor="departure">Check-out</Label>
            <Input
              id="departure"
              type="date"
              min={addDays(arrival, 1)}
              value={departure}
              onChange={(e) => setDeparture(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="adults">Adults</Label>
            <Input
              id="adults"
              type="number"
              min={1}
              max={10}
              value={adults}
              onChange={(e) => setAdults(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <div>
            <Label htmlFor="children">Children</Label>
            <Input
              id="children"
              type="number"
              min={0}
              max={10}
              value={children}
              onChange={(e) => setChildren(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
        </div>
        <div className="mt-4">
          <Button onClick={() => search.mutate()} disabled={search.isPending}>
            {search.isPending ? "Searching…" : "Search availability"}
          </Button>
        </div>
        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      </section>

      {result ? (
        <section className="space-y-4">
          <h2 className="font-display text-xl">
            {formatStayDate(arrival)} → {formatStayDate(departure)} · {result.nights} night
            {result.nights === 1 ? "" : "s"}
          </h2>

          {result.offers.length === 0 ? (
            <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
              No rooms are available for those dates. Try different dates or fewer guests.
            </p>
          ) : null}

          {result.offers.map((offer) => (
            <article key={offer.roomTypeId} className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="grid gap-4 md:grid-cols-[240px_1fr]">
                {offer.coverUrl ? (
                  <img
                    src={offer.coverUrl}
                    alt={offer.name}
                    loading="lazy"
                    className="h-48 w-full object-cover md:h-full"
                  />
                ) : (
                  <div className="h-48 w-full bg-muted md:h-full" />
                )}
                <div className="p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-display text-lg">{offer.name}</h3>
                    <span className="text-xs text-muted-foreground">{offer.available} left</span>
                  </div>
                  {offer.description ? (
                    <p className="mt-1 text-sm text-muted-foreground">{offer.description}</p>
                  ) : null}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Sleeps {offer.maxOccupancy}
                    {offer.bedType ? ` · ${offer.bedCount ?? 1} × ${offer.bedType}` : ""}
                    {offer.roomSize ? ` · ${offer.roomSize}` : ""}
                    {offer.roomView ? ` · ${offer.roomView} view` : ""}
                  </p>
                  {offer.amenities.length > 0 ? (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {offer.amenities.map((a) => (
                        <li key={a} className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                          {a}
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <div className="mt-4 space-y-2">
                    {offer.plans.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No public rate is published for this room type yet.
                      </p>
                    ) : null}
                    {offer.plans.map((plan) => (
                      <div
                        key={plan.ratePlanId}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3"
                      >
                        <div>
                          <p className="text-sm font-medium">{plan.name}</p>
                          {plan.description ? (
                            <p className="text-xs text-muted-foreground">{plan.description}</p>
                          ) : null}
                          {plan.unavailableReason ? (
                            <p className="text-xs text-destructive">{plan.unavailableReason}</p>
                          ) : null}
                        </div>
                        {plan.quote ? (
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="font-display text-lg">
                                {formatMoney(plan.quote.subtotal, plan.quote.currency)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                total for {plan.quote.nights} night{plan.quote.nights === 1 ? "" : "s"}
                              </p>
                            </div>
                            <Button
                              onClick={() =>
                                navigate({
                                  to: "/stay/$propertySlug/book",
                                  params: { propertySlug: property.slug },
                                  search: {
                                    arrival,
                                    departure,
                                    adults,
                                    children,
                                    roomTypeId: offer.roomTypeId,
                                    ratePlanId: plan.ratePlanId,
                                  },
                                })
                              }
                            >
                              Select
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}
