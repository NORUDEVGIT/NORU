import { useEffect, useState } from "react";
import { createFileRoute, redirect, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CreateReservationRoomType, OccupancySoftWarn } from "@/packages/pms/components/bookings/create-reservation-room-type";
import { CreateReservationRate } from "@/packages/pms/components/bookings/create-reservation-rate";

import { RestaurantShell } from "@/core/components/restaurant-shell";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
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
import { CreateReservationAssociations } from "@/packages/pms/components/bookings/create-reservation-associations";
import {
  CreateReservationGuest,
  type PickedReservationGuest,
} from "@/packages/pms/components/bookings/create-reservation-guest";
import { CreateReservationStay } from "@/packages/pms/components/bookings/create-reservation-stay";
import { supabase } from "@/integrations/supabase/client";
import { requireRoutePackage } from "@/core/lib/route-package-guard";
import { getGuestsAccess } from "@/packages/pms/lib/guests.functions";
import {
  createReservation,
  getBookingsAccess,
  getRoomTypeAvailability,
  listAssignableRooms,
  type RoomTypeAvailability,
} from "@/packages/pms/lib/reservations.functions";
import { nightsBetween } from "@/packages/pms/lib/reservation-dates";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { quoteStay } from "@/packages/pms/lib/rates.functions";
import { getPmsSet6Snapshot } from "@/packages/pms/lib/pms-set6-sales-distribution.functions";
import { getGuestAccount, listGuestAccountLinks } from "@/packages/pms/lib/guest-accounts.functions";
import {
  CREATE_RESERVATION_DENIED_COPY,
  CREATE_RESERVATION_MIN_NIGHTS,
  CREATE_RESERVATION_SECTION1_SCOPE,
  CREATE_RESERVATION_SECTION2_SCOPE,
  CREATE_RESERVATION_SECTION2A_SCOPE,
  CREATE_RESERVATION_SECTION3_SCOPE,
  CREATE_RESERVATION_SIDEBAR_DEFAULT_COLLAPSED,
  CREATE_RESERVATION_TYPE_CHANGE_WARN,
  RESERVATION_TYPE_LABELS,
  formatStayOccupancySummary,
  isStayRangeValid,
  linkedStayFromArrival,
  linkedStayFromDeparture,
  linkedStayFromNights,
  mastersForCreateMode,
  pickPrefillMasterId,
  createReservationPrefillRoles,
  resolveBookingSourceOptions,
  resolveMarketSegmentOptions,
  toPickedReservationMaster,
  type PickedReservationMaster,
  type ReservationTypeMode,
} from "@/packages/pms/lib/create-reservation-phase1";
import {
  stickyAvailability,
  stickyAvailabilityCopy,
  stickyRoomTypeLabel,
  type SelectedRoomTypeMeta,
} from "@/packages/pms/lib/create-reservation-phase1-section4";
import {
  CREATE_RESERVATION_SECTION5_SCOPE,
  canCreateUnpricedPending,
  canSubmitCreateReservation,
  createSubmitBlockCopy,
  fromNightlyRate,
  resolveCreatePricingState,
  shouldClearStaleRatePlan,
  stickyPricingCopy,
} from "@/packages/pms/lib/create-reservation-phase1-section5";
import { useMoney, useRestaurantTimezone } from "@/packages/restaurant-management/state/restaurant-context";

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
  const [companyOverride, setCompanyOverride] = useState(false);
  const [travelAgentOverride, setTravelAgentOverride] = useState(false);
  const [arrival, setArrival] = useState(today);
  const [departure, setDeparture] = useState(addDays(today, 1));
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [roomTypeId, setRoomTypeId] = useState("");
  const [selectedRoomType, setSelectedRoomType] = useState<SelectedRoomTypeMeta | null>(null);
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

  const datesValid = isStayRangeValid(arrival, departure);
  const nights = nightsBetween(arrival, departure);

  function handleArrivalChange(next: string) {
    if (!next) {
      setArrival("");
      setRatePlanId("");
      return;
    }
    const stay = linkedStayFromArrival(next, datesValid ? nights : CREATE_RESERVATION_MIN_NIGHTS);
    setArrival(stay.arrival);
    setDeparture(stay.departure);
    setRatePlanId("");
  }

  function handleNightsChange(next: number) {
    if (!arrival) return;
    const stay = linkedStayFromNights(arrival, next);
    setDeparture(stay.departure);
    setRatePlanId("");
  }

  function handleDepartureChange(next: string) {
    const stay = linkedStayFromDeparture(arrival, next);
    setDeparture(stay.departure);
    setRatePlanId("");
  }

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
  const actorRole = accessQuery.data?.role ?? membership.role;
  const canCreateUnpriced = canCreateUnpricedPending(actorRole);
  const priced = selectedQuote?.quote != null;
  const pricingState = resolveCreatePricingState({
    datesValid,
    roomTypeId,
    loading: quotesQuery.isLoading || quotesQuery.isFetching,
    error: quotesQuery.isError,
    selectedQuote,
  });

  useEffect(() => {
    if (
      shouldClearStaleRatePlan({
        ratePlanId,
        quotesReady: !quotesQuery.isLoading && !quotesQuery.isFetching && !quotesQuery.isError,
        quotes: quotes.map((row) => ({ planId: row.plan.id, hasQuote: row.quote != null })),
      })
    ) {
      setRatePlanId("");
    }
  }, [quotes, quotesQuery.isError, quotesQuery.isFetching, quotesQuery.isLoading, ratePlanId]);

  const prefillRoles = createReservationPrefillRoles(reservationType);
  const prefillCompany = !companyOverride && prefillRoles.includes("employer");
  const prefillTravelAgent = !travelAgentOverride && prefillRoles.includes("booker_ta");

  const linksQuery = useQuery({
    queryKey: ["guest-account-links", restaurantId, guest?.id, "create-reservation-prefill"],
    queryFn: () => fetchGuestLinks({ data: { restaurantId, guestId: guest!.id } }),
    enabled: canManage && !!guest && (prefillCompany || prefillTravelAgent),
    retry: false,
  });

  useEffect(() => {
    if (!guest) {
      if (!companyOverride) setCompanyMaster(null);
      if (!travelAgentOverride) setTravelAgentMaster(null);
      return;
    }
    if (!prefillCompany && !prefillTravelAgent) return;
    const links = linksQuery.data;
    if (!links) return;
    const rows = links;

    let cancelled = false;

    async function applyPrefill(
      role: "employer" | "booker_ta",
      setter: (master: PickedReservationMaster | null) => void,
    ) {
      const masterId = pickPrefillMasterId(rows, role);
      if (!masterId) {
        setter(null);
        return;
      }
      try {
        const profile = await fetchGuestAccount({ data: { restaurantId, accountId: masterId } });
        if (!cancelled) setter(toPickedReservationMaster(profile));
      } catch {
        if (!cancelled) setter(null);
      }
    }

    if (prefillCompany) void applyPrefill("employer", setCompanyMaster);
    if (prefillTravelAgent) void applyPrefill("booker_ta", setTravelAgentMaster);

    return () => {
      cancelled = true;
    };
  }, [
    companyOverride,
    fetchGuestAccount,
    guest,
    linksQuery.data,
    prefillCompany,
    prefillTravelAgent,
    restaurantId,
    travelAgentOverride,
  ]);

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
  const canSubmit = canSubmitCreateReservation({
    hasGuest: !!guest,
    datesValid,
    roomTypeId,
    available: selectedType?.available ?? 0,
    status,
    priced,
    canCreateUnpriced,
  });
  const submitBlockCopy = createSubmitBlockCopy({
    hasGuest: !!guest,
    datesValid,
    roomTypeId,
    available: selectedType?.available ?? 0,
    status,
    priced,
    canCreateUnpriced,
  });
  const bookingAgentName = accessQuery.data?.actorName ?? "Current user";
  const selectedMeta =
    selectedType != null
      ? {
          roomTypeId: selectedType.roomTypeId,
          name: selectedType.name,
          code: selectedType.code,
          maxOccupancy: selectedType.maxOccupancy,
          adultCapacity: selectedType.adultCapacity,
          childCapacity: selectedType.childCapacity,
        }
      : selectedRoomType?.roomTypeId === roomTypeId
        ? selectedRoomType
        : null;
  const summaryAvailability = stickyAvailability({
    roomTypeId,
    datesValid,
    loading: availabilityQuery.isLoading || availabilityQuery.isFetching,
    live: selectedType,
  });

  function selectRoomType(type: RoomTypeAvailability) {
    setRoomTypeId(type.roomTypeId);
    setSelectedRoomType({
      roomTypeId: type.roomTypeId,
      name: type.name,
      code: type.code,
      maxOccupancy: type.maxOccupancy,
      adultCapacity: type.adultCapacity,
      childCapacity: type.childCapacity,
    });
    setRoomId(UNASSIGNED);
    setRatePlanId("");
  }

  function requestTypeChange(next: ReservationTypeMode) {
    if (next === reservationType) return;
    setPendingType(next);
  }

  function applyTypeChange() {
    if (!pendingType) return;
    setReservationType(pendingType);
    setCompanyMaster(null);
    setTravelAgentMaster(null);
    setCompanyOverride(false);
    setTravelAgentOverride(false);
    setPendingType(null);
  }

  function handleCompanyMasterChange(next: PickedReservationMaster | null) {
    setCompanyMaster(next);
    setCompanyOverride(true);
  }

  function handleTravelAgentMasterChange(next: PickedReservationMaster | null) {
    setTravelAgentMaster(next);
    setTravelAgentOverride(true);
  }

  const actions = (
    <div className="flex flex-wrap items-center gap-3" data-testid="create-reservation-actions">
      <Button disabled={!canSubmit || create.isPending} onClick={() => create.mutate()}>
        {create.isPending ? "Creating…" : "Create reservation"}
      </Button>
      <Button asChild variant="outline">
        <Link to="/restaurant/pms/reservations">Cancel</Link>
      </Button>
      {!canSubmit && submitBlockCopy ? (
        <p className="text-xs text-muted-foreground">{submitBlockCopy}</p>
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
          <p className="mt-1 text-xs text-muted-foreground">{CREATE_RESERVATION_SECTION2A_SCOPE}</p>
          <p className="mt-1 text-xs text-muted-foreground">{CREATE_RESERVATION_SECTION3_SCOPE}</p>
          <p className="mt-1 text-xs text-muted-foreground">{CREATE_RESERVATION_SECTION5_SCOPE}</p>
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

        <div
          className={cn(
            "grid gap-6",
            reservationType === "individual" ? "lg:grid-cols-2 lg:items-start" : "",
          )}
        >
          <CreateReservationGuest
            restaurantId={restaurantId}
            canCreateGuest={guestAccessQuery.data?.canManage ?? false}
            guest={guest}
            onGuestChange={setGuest}
          />
          {reservationType === "individual" ? (
            <CreateReservationAssociations
              restaurantId={restaurantId}
              canCreateMaster={guestAccessQuery.data?.canManage ?? false}
              companyMaster={companyMaster}
              onCompanyMasterChange={handleCompanyMasterChange}
              travelAgentMaster={travelAgentMaster}
              onTravelAgentMasterChange={handleTravelAgentMasterChange}
            />
          ) : null}
        </div>

        <CreateReservationStay
          arrival={arrival}
          departure={departure}
          nights={nights}
          datesValid={datesValid}
          adults={adults}
          children={children}
          specialRequests={specialRequests}
          notes={notes}
          occupancyWarn={
            selectedMeta ? (
              <OccupancySoftWarn
                adults={adults}
                childCount={children}
                maxOccupancy={selectedMeta.maxOccupancy}
                testId="stay-occupancy-warn"
              />
            ) : null
          }
          onArrivalChange={handleArrivalChange}
          onDepartureChange={handleDepartureChange}
          onNightsChange={handleNightsChange}
          onAdultsChange={setAdults}
          onChildrenChange={setChildren}
          onSpecialRequestsChange={setSpecialRequests}
          onNotesChange={setNotes}
        />

        <CreateReservationRoomType
          datesValid={datesValid}
          loading={availabilityQuery.isLoading}
          availability={availability}
          roomTypeId={roomTypeId}
          adults={adults}
          childCount={children}
          selectedMaxOccupancy={selectedMeta?.maxOccupancy}
          onSelect={selectRoomType}
        />

        <CreateReservationRate
          datesValid={datesValid}
          roomTypeId={roomTypeId}
          loading={quotesQuery.isLoading || quotesQuery.isFetching}
          error={quotesQuery.isError}
          quotes={quotes}
          ratePlanId={ratePlanId}
          canCreateUnpriced={canCreateUnpriced}
          money={money}
          onSelect={setRatePlanId}
        />

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
          <div className="mt-3 max-w-sm space-y-1">
            <Label htmlFor="status">Create as</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as "pending" | "confirmed")}>
              <SelectTrigger id="status" data-testid="create-as-status">
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
            {reservationType === "individual" ? (
              <div data-testid="summary-associations">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Associations</dt>
                <dd className="space-y-1">
                  <p data-testid="summary-company">
                    <span className="text-muted-foreground">Company · </span>
                    {companyMaster?.name ?? "None"}
                  </p>
                  <p data-testid="summary-ta">
                    <span className="text-muted-foreground">Travel Agency · </span>
                    {travelAgentMaster?.name ?? "None"}
                  </p>
                </dd>
              </div>
            ) : null}
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
            <div data-testid="summary-stay">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Stay</dt>
              <dd data-testid="summary-stay-dates">
                {datesValid
                  ? `${formatStayDate(arrival)} → ${formatStayDate(departure)}`
                  : "Dates not set"}
              </dd>
            </div>
            {datesValid ? (
              <div data-testid="summary-stay-nights">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Nights</dt>
                <dd>{nights}</dd>
              </div>
            ) : null}
            <div data-testid="summary-stay-occupancy">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Occupancy</dt>
              <dd>{formatStayOccupancySummary(adults, children)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Room type</dt>
              <dd data-testid="summary-room-type">{stickyRoomTypeLabel(selectedMeta)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Availability</dt>
              <dd data-testid="summary-availability">{stickyAvailabilityCopy(summaryAvailability)}</dd>
            </div>
            {pricingState.kind === "priced" ? (
              <>
                <div data-testid="summary-rate">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Rate</dt>
                  <dd data-testid="summary-rate-code">
                    {pricingState.quote.ratePlanCode}
                    {pricingState.quote.ratePlanName ? ` · ${pricingState.quote.ratePlanName}` : ""}
                  </dd>
                </div>
                <div data-testid="summary-rate-and-total">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Rate & Total</dt>
                  <dd>
                    {pricingState.quote.nights} night{pricingState.quote.nights === 1 ? "" : "s"}
                    {fromNightlyRate(pricingState.quote) != null
                      ? ` · from ${money(fromNightlyRate(pricingState.quote)!)} / night`
                      : ""}
                  </dd>
                </div>
                <div data-testid="summary-stay-total">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Stay total</dt>
                  <dd>
                    {money(pricingState.quote.subtotal)}
                    {pricingState.quote.currency ? ` ${pricingState.quote.currency}` : ""}
                  </dd>
                </div>
              </>
            ) : null}
          </dl>
          {pricingState.kind !== "priced" ? (
            <div className="mt-3" data-testid="summary-pricing-state" data-pricing={pricingState.kind}>
              {pricingState.kind === "unpriced" ? (
                <span
                  data-testid="summary-unpriced-badge"
                  className="inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800"
                >
                  Unpriced
                </span>
              ) : null}
              <p className="mt-2 text-xs text-muted-foreground" data-testid="summary-no-fake-total">
                {stickyPricingCopy(pricingState)}
              </p>
            </div>
          ) : null}
          {selectedMeta ? (
            <div className="mt-3">
              <OccupancySoftWarn
                adults={adults}
                childCount={children}
                maxOccupancy={selectedMeta.maxOccupancy}
                testId="summary-occupancy-warn"
              />
            </div>
          ) : null}
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
