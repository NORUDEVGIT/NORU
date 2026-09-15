import { useEffect, useState } from "react";
import { createFileRoute, redirect, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check } from "lucide-react";

import { RestaurantShell } from "@/core/components/restaurant-shell";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import { addDays, formatStayDate, propertyToday } from "@/packages/pms/components/bookings/reservation-bits";
import { CreateReservationContext } from "@/packages/pms/components/bookings/create-reservation-context";
import {
  CreateReservationGuest,
  type PickedReservationGuest,
} from "@/packages/pms/components/bookings/create-reservation-guest";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";
import { getGuestsAccess } from "@/packages/pms/lib/guests.functions";
import {
  createReservation,
  getBookingsAccess,
  getRoomTypeAvailability,
  listAssignableRooms,
} from "@/packages/pms/lib/reservations.functions";
import { nightsBetween } from "@/packages/pms/lib/reservation-dates";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { quoteStay } from "@/packages/pms/lib/rates.functions";
import { getPmsSet6Snapshot } from "@/packages/pms/lib/pms-set6-sales-distribution.functions";
import { getGuestAccount, listGuestAccountLinks } from "@/packages/pms/lib/guest-accounts.functions";
import {
  CREATE_RESERVATION_DENIED_COPY,
  CREATE_RESERVATION_SECTION1_SCOPE,
  CREATE_RESERVATION_SECTION2_SCOPE,
  CREATE_RESERVATION_SIDEBAR_DEFAULT_COLLAPSED,
  CREATE_RESERVATION_SUMMARY_NO_TOTAL,
  CREATE_RESERVATION_TYPE_CHANGE_WARN,
  RESERVATION_TYPE_LABELS,
  mastersForCreateMode,
  pickPrefillMasterId,
  resolveBookingSourceOptions,
  resolveMarketSegmentOptions,
  toPickedReservationMaster,
  type PickedReservationMaster,
  type ReservationTypeMode,
} from "@/packages/pms/lib/create-reservation-phase1";
import { useMoney, useRestaurantTimezone } from "@/packages/restaurant-management/state/restaurant-context";
import { cn } from "@/shared/lib/utils";

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
    <RestaurantShell
      active="New Reservation"
      sidebarDefaultCollapsed={CREATE_RESERVATION_SIDEBAR_DEFAULT_COLLAPSED}
    >
      {(m) => <NewReservationPage membership={m} />}
    </RestaurantShell>
  );
}

const UNASSIGNED = "unassigned";

function NewReservationPage({ membership }: { membership: RestaurantMembership }) {
  const restaurantId = membership.restaurant.id;
  const navigate = useNavigate();
  const timezone = useRestaurantTimezone();
  const today = propertyToday(timezone);

  const fetchAccess = useServerFn(getBookingsAccess);
  const fetchGuestAccess = useServerFn(getGuestsAccess);
  const fetchSet6 = useServerFn(getPmsSet6Snapshot);
  const fetchGuestLinks = useServerFn(listGuestAccountLinks);
  const fetchGuestAccount = useServerFn(getGuestAccount);
  const fetchAvailability = useServerFn(getRoomTypeAvailability);
  const fetchRooms = useServerFn(listAssignableRooms);
  const submitReservation = useServerFn(createReservation);
  const fetchQuotes = useServerFn(quoteStay);
  const money = useMoney();

  const [reservationType, setReservationType] = useState<ReservationTypeMode>("individual");
  const [pendingType, setPendingType] = useState<ReservationTypeMode | null>(null);
  const [bookingSource, setBookingSource] = useState("");
  const [marketSegment, setMarketSegment] = useState("");
  const [externalReference, setExternalReference] = useState("");
  const [guest, setGuest] = useState<PickedReservationGuest | null>(null);
  const [companyMaster, setCompanyMaster] = useState<PickedReservationMaster | null>(null);
  const [travelAgentMaster, setTravelAgentMaster] = useState<PickedReservationMaster | null>(null);
  const [masterOverride, setMasterOverride] = useState(false);
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

  const guestAccessQuery = useQuery({
    queryKey: ["guests-access", restaurantId],
    queryFn: () => fetchGuestAccess({ data: { restaurantId } }),
    enabled: canManage,
    retry: false,
  });

  const set6Query = useQuery({
    queryKey: ["pms-set6-snapshot", restaurantId, "create-reservation"],
    queryFn: () => fetchSet6({ data: { restaurantId } }),
    enabled: canManage,
    retry: false,
  });
  const sourceOptions = resolveBookingSourceOptions(set6Query.data?.snapshot.sourceCodes);
  const segmentOptions = resolveMarketSegmentOptions(set6Query.data?.snapshot.marketSegments);

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

  const linksQuery = useQuery({
    queryKey: ["guest-account-links", restaurantId, guest?.id, "create-reservation-prefill"],
    queryFn: () => fetchGuestLinks({ data: { restaurantId, guestId: guest!.id } }),
    enabled: canManage && !!guest && reservationType !== "individual" && !masterOverride,
    retry: false,
  });

  useEffect(() => {
    if (masterOverride) return;
    if (!guest || reservationType === "individual") {
      setCompanyMaster(null);
      setTravelAgentMaster(null);
      return;
    }
    const links = linksQuery.data;
    if (!links) return;
    const role = reservationType === "corporate" ? "employer" : "booker_ta";
    const masterId = pickPrefillMasterId(links, role);
    if (!masterId) {
      if (reservationType === "corporate") setCompanyMaster(null);
      else setTravelAgentMaster(null);
      return;
    }
    let cancelled = false;
    void fetchGuestAccount({ data: { restaurantId, accountId: masterId } })
      .then((profile) => {
        if (cancelled) return;
        const picked = toPickedReservationMaster(profile);
        if (reservationType === "corporate") setCompanyMaster(picked);
        else setTravelAgentMaster(picked);
      })
      .catch(() => {
        if (cancelled) return;
        if (reservationType === "corporate") setCompanyMaster(null);
        else setTravelAgentMaster(null);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchGuestAccount, guest, linksQuery.data, masterOverride, reservationType, restaurantId]);

  const boundMasters = mastersForCreateMode(
    reservationType,
    companyMaster?.id ?? null,
    travelAgentMaster?.id ?? null,
  );

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
          companyMasterId: boundMasters.companyMasterId,
          travelAgentMasterId: boundMasters.travelAgentMasterId,
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
        <p className="mt-2 text-sm text-muted-foreground">{CREATE_RESERVATION_DENIED_COPY}</p>
      </div>
    );
  }

  const availability = availabilityQuery.data ?? [];
  const selectedType = availability.find((a) => a.roomTypeId === roomTypeId);
  const rooms = roomsQuery.data ?? [];
  const canSubmit = !!guest && datesValid && !!roomTypeId && (selectedType?.available ?? 0) > 0;
  const bookingAgentName = accessQuery.data?.actorName ?? "Current user";

  function requestTypeChange(next: ReservationTypeMode) {
    if (next === reservationType) return;
    setPendingType(next);
  }

  function applyTypeChange() {
    if (!pendingType) return;
    setReservationType(pendingType);
    setCompanyMaster(null);
    setTravelAgentMaster(null);
    setMasterOverride(false);
    setPendingType(null);
  }

  function handleCompanyMasterChange(next: PickedReservationMaster | null) {
    setCompanyMaster(next);
    setMasterOverride(true);
  }

  function handleTravelAgentMasterChange(next: PickedReservationMaster | null) {
    setTravelAgentMaster(next);
    setMasterOverride(true);
  }

  const actions = (
    <div className="flex flex-wrap items-center gap-3" data-testid="create-reservation-actions">
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
  );

  return (
    <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
      <div className="min-w-0 flex-1 space-y-6">
        <div>
          <h1 className="font-display text-2xl">New Reservation</h1>
          <p className="text-sm text-muted-foreground">
            Create a stay for {membership.restaurant.name}. Availability updates as you change the dates.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{CREATE_RESERVATION_SECTION1_SCOPE}</p>
          <p className="mt-1 text-xs text-muted-foreground">{CREATE_RESERVATION_SECTION2_SCOPE}</p>
        </div>

        <CreateReservationContext
          restaurantId={restaurantId}
          canCreateMaster={guestAccessQuery.data?.canManage ?? false}
          reservationType={reservationType}
          onRequestTypeChange={requestTypeChange}
          bookingSource={bookingSource}
          onBookingSourceChange={setBookingSource}
          sourceOptions={sourceOptions}
          marketSegment={marketSegment}
          onMarketSegmentChange={setMarketSegment}
          segmentOptions={segmentOptions}
          externalReference={externalReference}
          onExternalReferenceChange={setExternalReference}
          bookingAgentName={bookingAgentName}
          companyMaster={companyMaster}
          onCompanyMasterChange={handleCompanyMasterChange}
          travelAgentMaster={travelAgentMaster}
          onTravelAgentMasterChange={handleTravelAgentMasterChange}
        />

        <CreateReservationGuest
          restaurantId={restaurantId}
          canCreateGuest={guestAccessQuery.data?.canManage ?? false}
          guest={guest}
          onGuestChange={setGuest}
        />

        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="font-display text-lg">Stay</h2>
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
          <h2 className="font-display text-lg">Room type</h2>
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
          <h2 className="font-display text-lg">Rate plan</h2>
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
          <h2 className="font-display text-lg">Room assignment (optional)</h2>

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
          <h2 className="font-display text-lg">Details</h2>
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

        <div className="xl:hidden">{actions}</div>
      </div>

      <aside
        className="space-y-4 xl:sticky xl:top-4 xl:w-80"
        data-testid="create-reservation-summary"
      >
        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="font-display text-lg">Summary</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Type</dt>
              <dd>{RESERVATION_TYPE_LABELS[reservationType]}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Guest</dt>
              <dd>{guest?.fullName ?? "No guest selected"}</dd>
            </div>
            {reservationType === "corporate" ? (
              <div data-testid="summary-company">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Company</dt>
                <dd>{companyMaster?.name ?? "Not selected"}</dd>
              </div>
            ) : null}
            {reservationType === "travel_agency" ? (
              <div data-testid="summary-ta">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Travel Agency</dt>
                <dd>{travelAgentMaster?.name ?? "Not selected"}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Stay</dt>
              <dd>
                {datesValid
                  ? `${formatStayDate(arrival)} → ${formatStayDate(departure)}`
                  : "Dates not set"}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground" data-testid="summary-no-fake-total">
            {CREATE_RESERVATION_SUMMARY_NO_TOTAL}
          </p>
        </section>
        <div className="hidden xl:block">{actions}</div>
      </aside>

      <AlertDialog open={pendingType !== null} onOpenChange={(open) => !open && setPendingType(null)}>
        <AlertDialogContent data-testid="type-change-warn">
          <AlertDialogHeader>
            <AlertDialogTitle>Change reservation type?</AlertDialogTitle>
            <AlertDialogDescription>{CREATE_RESERVATION_TYPE_CHANGE_WARN}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep current type</AlertDialogCancel>
            <AlertDialogAction onClick={applyTypeChange}>Switch type</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
