import { useState } from "react";
import { createFileRoute, redirect, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Search, UserPlus } from "lucide-react";

import { RestaurantShell } from "@/components/restaurant-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addDays, formatStayDate, propertyToday } from "@/components/bookings/reservation-bits";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/lib/route-package-guard";
import { listGuests, type GuestSummary } from "@/lib/guests.functions";
import {
  createReservation,
  getBookingsAccess,
  getRoomTypeAvailability,
  listAssignableRooms,
} from "@/lib/reservations.functions";
import { nightsBetween } from "@/lib/reservation-dates";
import type { RestaurantMembership } from "@/lib/restaurant.functions";
import { quoteStay } from "@/lib/rates.functions";
import { useMoney, useRestaurantTimezone } from "@/state/restaurant-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/restaurant/bookings/new")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/restaurant/login", search: { redirect: "/restaurant/bookings/new" } });
    }

    await requireRoutePackage("pms");
  },
  head: () => ({
    meta: [
      { title: "New Reservation — Front Office — NORU" },
      {
        name: "description",
        content: "Create a hotel reservation: pick the guest, stay dates, room type and optional room assignment.",
      },
      { property: "og:title", content: "New Reservation — NORU" },
      { property: "og:description", content: "Create a reservation with live room-type availability." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NewReservationRoute,
});

function NewReservationRoute() {
  return (
    <RestaurantShell active="New Reservation">{(m) => <NewReservationPage membership={m} />}</RestaurantShell>
  );
}

const UNASSIGNED = "unassigned";

function NewReservationPage({ membership }: { membership: RestaurantMembership }) {
  const restaurantId = membership.restaurant.id;
  const navigate = useNavigate();
  const timezone = useRestaurantTimezone();
  const today = propertyToday(timezone);

  const fetchAccess = useServerFn(getBookingsAccess);
  const fetchGuests = useServerFn(listGuests);
  const fetchAvailability = useServerFn(getRoomTypeAvailability);
  const fetchRooms = useServerFn(listAssignableRooms);
  const submitReservation = useServerFn(createReservation);
  const fetchQuotes = useServerFn(quoteStay);
  const money = useMoney();

  const [guestSearch, setGuestSearch] = useState("");
  const [guest, setGuest] = useState<GuestSummary | null>(null);
  const [arrival, setArrival] = useState(today);
  const [departure, setDeparture] = useState(addDays(today, 1));
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [roomTypeId, setRoomTypeId] = useState("");
  const [roomId, setRoomId] = useState(UNASSIGNED);
  const [specialRequests, setSpecialRequests] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"pending" | "confirmed">("pending");
  const [ratePlanId, setRatePlanId] = useState("");

  const accessQuery = useQuery({
    queryKey: ["bookings-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });
  const canManage = accessQuery.data?.canManage ?? false;

  const guestsQuery = useQuery({
    queryKey: ["guests", restaurantId, guestSearch, "reservation-picker"],
    queryFn: () =>
      fetchGuests({
        data: { restaurantId, status: "active", limit: 8, ...(guestSearch.trim() ? { search: guestSearch.trim() } : {}) },
      }),
    enabled: canManage,
  });

  const datesValid = departure > arrival;
  const nights = datesValid ? nightsBetween(arrival, departure) : 0;

  const availabilityQuery = useQuery({
    queryKey: ["room-type-availability", restaurantId, arrival, departure],
    queryFn: () => fetchAvailability({ data: { restaurantId, arrival, departure } }),
    enabled: canManage && datesValid,
  });

  const roomsQuery = useQuery({
    queryKey: ["assignable-rooms", restaurantId, roomTypeId, arrival, departure],
    queryFn: () => fetchRooms({ data: { restaurantId, roomTypeId, arrival, departure } }),
    enabled: canManage && datesValid && !!roomTypeId,
  });

  const quotesQuery = useQuery({
    queryKey: ["stay-quotes", restaurantId, roomTypeId, arrival, departure],
    queryFn: () => fetchQuotes({ data: { restaurantId, roomTypeId, arrival, departure } }),
    enabled: canManage && datesValid && !!roomTypeId,
    retry: false,
  });
  const quotes = quotesQuery.data ?? [];
  const selectedQuote = quotes.find((q) => q.plan.id === ratePlanId) ?? null;

  const create = useMutation({
    mutationFn: () =>
      submitReservation({
        data: {
          restaurantId,
          guestId: guest?.id ?? "",
          roomTypeId,
          roomId: roomId === UNASSIGNED ? null : roomId,
          arrival,
          departure,
          adults,
          children,
          specialRequests: specialRequests.trim() || null,
          notes: notes.trim() || null,
          status,
          ratePlanId: ratePlanId || null,
        },
      }),
    onSuccess: (result) => {
      toast.success(`Reservation ${result.confirmationNumber} created.`);
      void navigate({
        to: "/restaurant/pms/reservations/$reservationId",
        params: { reservationId: result.id },
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (accessQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!canManage) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h1 className="font-display text-2xl">New Reservation</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only owners and managers can create reservations for this property.
        </p>
      </div>
    );
  }

  const availability = availabilityQuery.data ?? [];
  const selectedType = availability.find((a) => a.roomTypeId === roomTypeId);
  const rooms = roomsQuery.data ?? [];
  const canSubmit = !!guest && datesValid && !!roomTypeId && (selectedType?.available ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl">New Reservation</h1>
        <p className="text-sm text-muted-foreground">
          Create a stay for {membership.restaurant.name}. Availability updates as you change the dates.
        </p>
      </div>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-lg">1. Guest</h2>
        {guest ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-border p-3">
            <div>
              <p className="font-medium">{guest.fullName}</p>
              <p className="text-xs text-muted-foreground">
                {[guest.phone, guest.email].filter(Boolean).join(" · ") || "No contact details"}
              </p>
            </div>
            <Button className="ml-auto" variant="outline" size="sm" onClick={() => setGuest(null)}>
              Change guest
            </Button>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap gap-3">
              <div className="relative min-w-56 flex-1">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search guests by name, phone or email"
                  value={guestSearch}
                  onChange={(e) => setGuestSearch(e.target.value)}
                />
              </div>
              <Button asChild variant="outline">
                <Link to="/restaurant/guests">
                  <UserPlus className="size-4 sm:mr-2" />
                  <span className="hidden sm:inline">Create guest</span>
                </Link>
              </Button>
            </div>
            <ul className="space-y-2">
              {(guestsQuery.data ?? []).map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => setGuest(g)}
                    className="w-full rounded-xl border border-border px-3 py-2 text-left text-sm transition-colors hover:bg-accent/40"
                  >
                    <span className="font-medium">{g.fullName}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {[g.phone, g.email].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                </li>
              ))}
              {guestsQuery.data?.length === 0 ? (
                <li className="text-sm text-muted-foreground">No matching guests — create one first.</li>
              ) : null}
            </ul>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-lg">2. Stay</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="arrival">Arrival</Label>
            <Input id="arrival" type="date" value={arrival} onChange={(e) => setArrival(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="departure">Departure</Label>
            <Input id="departure" type="date" value={departure} onChange={(e) => setDeparture(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="adults">Adults</Label>
            <Input
              id="adults"
              type="number"
              min={1}
              max={20}
              value={adults}
              onChange={(e) => setAdults(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="children">Children</Label>
            <Input
              id="children"
              type="number"
              min={0}
              max={20}
              value={children}
              onChange={(e) => setChildren(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {datesValid
            ? `${nights} night${nights === 1 ? "" : "s"} · ${formatStayDate(arrival)} → ${formatStayDate(departure)}`
            : "Departure must be after arrival."}
        </p>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-lg">3. Room type</h2>
        {!datesValid ? (
          <p className="mt-3 text-sm text-muted-foreground">Choose valid dates to see availability.</p>
        ) : availabilityQuery.isLoading ? (
          <p className="mt-3 text-sm text-muted-foreground">Checking availability…</p>
        ) : availability.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No sellable room types yet. Add them in Configuration → Rooms.
          </p>
        ) : (
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {availability.map((a) => {
              const disabled = a.available <= 0;
              const selected = a.roomTypeId === roomTypeId;
              return (
                <li key={a.roomTypeId}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      setRoomTypeId(a.roomTypeId);
                      setRoomId(UNASSIGNED);
                      setRatePlanId("");
                    }}
                    className={cn(
                      "w-full rounded-xl border p-3 text-left transition-colors",
                      selected ? "border-primary bg-primary/5" : "border-border hover:bg-accent/40",
                      disabled && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{a.name}</span>
                      <span className="text-xs text-muted-foreground">{a.code}</span>
                      {selected ? <Check className="ml-auto size-4 text-primary" /> : null}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Sleeps {a.maxOccupancy} · {a.available} of {a.totalRooms} available
                      {disabled ? " · fully booked" : ""}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-lg">4. Rate plan</h2>
        {!roomTypeId || !datesValid ? (
          <p className="mt-3 text-sm text-muted-foreground">Pick dates and a room type to see rates.</p>
        ) : quotesQuery.isLoading ? (
          <p className="mt-3 text-sm text-muted-foreground">Pricing the stay…</p>
        ) : quotes.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No rate plans for this room type yet — the stay can be booked without pricing.
          </p>
        ) : (
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {quotes.map((q) => {
              const selected = q.plan.id === ratePlanId;
              const disabled = !q.quote;
              return (
                <li key={q.plan.id}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setRatePlanId(selected ? "" : q.plan.id)}
                    className={cn(
                      "w-full rounded-xl border p-3 text-left transition-colors",
                      selected ? "border-primary bg-primary/5" : "border-border hover:bg-accent/40",
                      disabled && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{q.plan.name}</span>
                      <span className="text-xs text-muted-foreground">{q.plan.code}</span>
                      {selected ? <Check className="ml-auto size-4 text-primary" /> : null}
                    </div>
                    {q.quote ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        From {money(Math.min(...q.quote.nightly.map((n) => n.rate)))} / night · total{" "}
                        <span className="font-medium text-foreground">{money(q.quote.subtotal)}</span> for{" "}
                        {q.quote.nights} night{q.quote.nights === 1 ? "" : "s"}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-destructive">{q.unavailableReason}</p>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {selectedQuote?.quote ? (
          <div className="mt-4 overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Night</th>
                  <th className="px-3 py-2 text-right">Rate</th>
                </tr>
              </thead>
              <tbody>
                {selectedQuote.quote.nightly.map((n) => (
                  <tr key={n.date} className="border-t border-border">
                    <td className="px-3 py-2">{formatStayDate(n.date)}</td>
                    <td className="px-3 py-2 text-right">{money(n.rate)}</td>
                  </tr>
                ))}
                <tr className="border-t border-border bg-muted/30 font-medium">
                  <td className="px-3 py-2">Stay total</td>
                  <td className="px-3 py-2 text-right">{money(selectedQuote.quote.subtotal)}</td>
                </tr>
              </tbody>
            </table>
            <p className="px-3 py-2 text-xs text-muted-foreground">
              Pricing is calculated and re-checked on the server when the reservation is created.
            </p>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-lg">5. Room assignment (optional)</h2>

        <div className="mt-3 max-w-sm">
          <Select value={roomId} onValueChange={setRoomId} disabled={!roomTypeId}>
            <SelectTrigger>
              <SelectValue placeholder="Assign later" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNASSIGNED}>Assign later</SelectItem>
              {rooms.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  Room {r.roomNumber}
                  {r.floor ? ` · Floor ${r.floor}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {roomTypeId && rooms.length === 0 && !roomsQuery.isLoading ? (
            <p className="mt-2 text-xs text-muted-foreground">
              No free rooms of this type for those dates — the stay can still be booked and assigned later.
            </p>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-lg">6. Details</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="requests">Special requests</Label>
            <Textarea
              id="requests"
              rows={3}
              value={specialRequests}
              onChange={(e) => setSpecialRequests(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="notes">Internal notes</Label>
            <Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <div className="mt-3 max-w-sm space-y-1">
          <Label htmlFor="status">Create as</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as "pending" | "confirmed")}>
            <SelectTrigger id="status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={!canSubmit || create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? "Creating…" : "Create reservation"}
        </Button>
        <Button asChild variant="outline">
          <Link to="/restaurant/pms/reservations">Cancel</Link>
        </Button>
        {!canSubmit ? (
          <p className="text-xs text-muted-foreground">
            Pick a guest, valid dates and an available room type to continue.
          </p>
        ) : null}
      </div>
    </div>
  );
}
