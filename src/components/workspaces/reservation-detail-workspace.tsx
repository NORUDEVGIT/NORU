import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ReservationStatusBadge, formatStayDate } from "@/components/bookings/reservation-bits";
import {
  amendReservation,
  assignReservationRoom,
  getBookingsAccess,
  getReservation,
  getRoomTypeAvailability,
  listAssignableRooms,
  setReservationStatus,
  type ReservationDetail,
} from "@/lib/reservations.functions";
import { nightsBetween } from "@/lib/reservation-dates";
import type { RestaurantMembership } from "@/lib/restaurant.functions";
import { listRatePlans, repriceReservation } from "@/lib/rates.functions";
import { useMoney, useRestaurantTime } from "@/state/restaurant-context";

const UNASSIGNED = "unassigned";

export function ReservationDetailWorkspace({
  membership,
  reservationId,
}: {
  membership: RestaurantMembership;
  reservationId: string;
}) {
  const restaurantId = membership.restaurant.id;
  const queryClient = useQueryClient();
  const { dateTime } = useRestaurantTime();

  const fetchAccess = useServerFn(getBookingsAccess);
  const fetchReservation = useServerFn(getReservation);
  const fetchAvailability = useServerFn(getRoomTypeAvailability);
  const fetchRooms = useServerFn(listAssignableRooms);
  const submitAmend = useServerFn(amendReservation);
  const submitAssign = useServerFn(assignReservationRoom);
  const submitStatus = useServerFn(setReservationStatus);

  const [amendOpen, setAmendOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const accessQuery = useQuery({
    queryKey: ["bookings-access", restaurantId],
    queryFn: () => fetchAccess({ data: { restaurantId } }),
    retry: false,
  });
  const canManage = accessQuery.data?.canManage ?? false;

  const detailQuery = useQuery({
    queryKey: ["reservation", restaurantId, reservationId],
    queryFn: () => fetchReservation({ data: { restaurantId, reservationId } }),
    enabled: canManage,
    retry: false,
  });

  const reservation = detailQuery.data?.reservation;

  const roomsQuery = useQuery({
    queryKey: [
      "assignable-rooms",
      restaurantId,
      reservation?.roomTypeId,
      reservation?.arrivalDate,
      reservation?.departureDate,
      reservationId,
    ],
    queryFn: () =>
      fetchRooms({
        data: {
          restaurantId,
          roomTypeId: reservation!.roomTypeId,
          arrival: reservation!.arrivalDate,
          departure: reservation!.departureDate,
          excludeReservationId: reservationId,
        },
      }),
    enabled: canManage && !!reservation && reservation.status !== "cancelled",
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["reservation", restaurantId, reservationId] });
    void queryClient.invalidateQueries({ queryKey: ["reservations", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["assignable-rooms", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["bookings-dashboard", restaurantId] });
  }

  const statusMutation = useMutation({
    mutationFn: (vars: { status: "pending" | "confirmed" | "cancelled"; reason?: string }) =>
      submitStatus({
        data: {
          restaurantId,
          reservationId,
          status: vars.status,
          ...(vars.reason ? { reason: vars.reason } : {}),
        },
      }),
    onSuccess: () => {
      toast.success("Reservation updated.");
      setCancelOpen(false);
      setCancelReason("");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const assignMutation = useMutation({
    mutationFn: (roomId: string | null) =>
      submitAssign({ data: { restaurantId, reservationId, roomId } }),
    onSuccess: () => {
      toast.success("Room assignment updated.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (accessQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading reservation…</p>;
  if (!canManage) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h1 className="font-display text-2xl">Reservation</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only owners and managers can access reservations for this property.
        </p>
      </div>
    );
  }
  if (detailQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading reservation…</p>;
  if (detailQuery.isError || !reservation) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h1 className="font-display text-2xl">Reservation not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This reservation doesn't exist for {membership.restaurant.name}.
        </p>
        <Button asChild className="mt-4" variant="outline">
          <Link to="/restaurant/pms/reservations">Back to reservations</Link>
        </Button>
      </div>
    );
  }

  const history = detailQuery.data?.history ?? [];
  const rooms = roomsQuery.data ?? [];
  const cancelled = reservation.status === "cancelled";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to="/restaurant/pms/reservations"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" /> All reservations
          </Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-3 font-display text-2xl">
            {reservation.confirmationNumber}
            <ReservationStatusBadge status={reservation.status} />
          </h1>
          <p className="text-sm text-muted-foreground">
            {reservation.guestName}
            {reservation.guestVip ? " · VIP" : ""} · {formatStayDate(reservation.arrivalDate)} →{" "}
            {formatStayDate(reservation.departureDate)} · {reservation.nights} night
            {reservation.nights === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!cancelled ? (
            <>
              {reservation.status === "pending" ? (
                <Button
                  disabled={statusMutation.isPending}
                  onClick={() => statusMutation.mutate({ status: "confirmed" })}
                >
                  Confirm
                </Button>
              ) : null}
              <Button variant="outline" onClick={() => setAmendOpen(true)}>
                Amend stay
              </Button>
              <Button variant="outline" onClick={() => setCancelOpen(true)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button
              disabled={statusMutation.isPending}
              onClick={() => statusMutation.mutate({ status: "pending" })}
            >
              Restore reservation
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-border bg-card p-4 lg:col-span-2">
          <h2 className="font-display text-lg">Stay</h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Room type" value={reservation.roomTypeName} />
            <Field label="Room" value={reservation.roomNumber ?? "Unassigned"} />
            <Field label="Arrival" value={formatStayDate(reservation.arrivalDate)} />
            <Field label="Departure" value={formatStayDate(reservation.departureDate)} />
            <Field
              label="Occupancy"
              value={`${reservation.adults} adult${reservation.adults === 1 ? "" : "s"}${
                reservation.children > 0 ? `, ${reservation.children} children` : ""
              }`}
            />
            <Field label="Source" value={reservation.source === "staff" ? "Staff" : reservation.source} />
            <Field label="Special requests" value={reservation.specialRequests ?? "—"} />
            <Field label="Internal notes" value={reservation.notes ?? "—"} />
            {reservation.cancellationReason ? (
              <Field label="Cancellation reason" value={reservation.cancellationReason} />
            ) : null}
          </dl>

          {!cancelled ? (
            <div className="mt-4 max-w-sm space-y-1">
              <Label>Room assignment</Label>
              <Select
                value={reservation.roomId ?? UNASSIGNED}
                onValueChange={(v) => assignMutation.mutate(v === UNASSIGNED ? null : v)}
                disabled={assignMutation.isPending}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Assign later" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Assign later</SelectItem>
                  {reservation.roomId && reservation.roomNumber ? (
                    <SelectItem value={reservation.roomId}>Room {reservation.roomNumber}</SelectItem>
                  ) : null}
                  {rooms
                    .filter((r) => r.id !== reservation.roomId)
                    .map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        Room {r.roomNumber}
                        {r.floor ? ` · Floor ${r.floor}` : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="font-display text-lg">Guest</h2>
          <dl className="mt-3 space-y-3">
            <Field label="Name" value={reservation.guestName} />
            <Field label="Phone" value={reservation.guestPhone ?? "—"} />
            <Field label="Email" value={reservation.guestEmail ?? "—"} />
          </dl>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link to="/restaurant/pms/reservations/guests/$guestId" params={{ guestId: reservation.guestId }}>
              Open guest profile
            </Link>
          </Button>
        </section>
      </div>

      <PricingSection
        restaurantId={restaurantId}
        reservation={reservation}
        canManage={canManage && !cancelled}
        onRepriced={invalidate}
      />



      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-lg">History</h2>
        {history.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No history yet.</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {history.map((e) => (
              <li key={e.id} className="rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium capitalize">{e.eventType.replace(/_/g, " ")}</span>
                  <span className="text-xs text-muted-foreground">{dateTime(e.createdAt)}</span>
                </div>
                {e.notes ? <p className="mt-1 text-sm text-muted-foreground">{e.notes}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <AmendDialog
        open={amendOpen}
        onOpenChange={setAmendOpen}
        reservation={reservation}
        restaurantId={restaurantId}
        onSaved={invalidate}
        amend={submitAmend}
        fetchAvailability={fetchAvailability}
        fetchRooms={fetchRooms}
      />

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel reservation</DialogTitle>
            <DialogDescription>
              The stay stops blocking availability. You can restore it later if space allows.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="cancel-reason">Reason (optional)</Label>
            <Textarea
              id="cancel-reason"
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Keep reservation
            </Button>
            <Button
              disabled={statusMutation.isPending}
              onClick={() =>
                statusMutation.mutate({
                  status: "cancelled",
                  ...(cancelReason.trim() ? { reason: cancelReason.trim() } : {}),
                })
              }
            >
              Cancel reservation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

function AmendDialog({
  open,
  onOpenChange,
  reservation,
  restaurantId,
  onSaved,
  amend,
  fetchAvailability,
  fetchRooms,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservation: ReservationDetail;
  restaurantId: string;
  onSaved: () => void;
  amend: ReturnType<typeof useServerFn<typeof amendReservation>>;
  fetchAvailability: ReturnType<typeof useServerFn<typeof getRoomTypeAvailability>>;
  fetchRooms: ReturnType<typeof useServerFn<typeof listAssignableRooms>>;
}) {
  const [arrival, setArrival] = useState(reservation.arrivalDate);
  const [departure, setDeparture] = useState(reservation.departureDate);
  const [roomTypeId, setRoomTypeId] = useState(reservation.roomTypeId);
  const [roomId, setRoomId] = useState(reservation.roomId ?? UNASSIGNED);
  const [adults, setAdults] = useState(reservation.adults);
  const [children, setChildren] = useState(reservation.children);

  useEffect(() => {
    if (!open) return;
    setArrival(reservation.arrivalDate);
    setDeparture(reservation.departureDate);
    setRoomTypeId(reservation.roomTypeId);
    setRoomId(reservation.roomId ?? UNASSIGNED);
    setAdults(reservation.adults);
    setChildren(reservation.children);
  }, [open, reservation]);

  const datesValid = departure > arrival;

  const availabilityQuery = useQuery({
    queryKey: ["room-type-availability", restaurantId, arrival, departure, reservation.id],
    queryFn: () =>
      fetchAvailability({
        data: { restaurantId, arrival, departure, excludeReservationId: reservation.id },
      }),
    enabled: open && datesValid,
  });

  const roomsQuery = useQuery({
    queryKey: ["assignable-rooms", restaurantId, roomTypeId, arrival, departure, reservation.id, "amend"],
    queryFn: () =>
      fetchRooms({
        data: { restaurantId, roomTypeId, arrival, departure, excludeReservationId: reservation.id },
      }),
    enabled: open && datesValid && !!roomTypeId,
  });

  const save = useMutation({
    mutationFn: () =>
      amend({
        data: {
          restaurantId,
          reservationId: reservation.id,
          roomTypeId,
          roomId: roomId === UNASSIGNED ? null : roomId,
          arrival,
          departure,
          adults,
          children,
          specialRequests: reservation.specialRequests,
          notes: reservation.notes,
        },
      }),
    onSuccess: () => {
      toast.success("Reservation amended.");
      onOpenChange(false);
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const nights = datesValid ? nightsBetween(arrival, departure) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Amend stay</DialogTitle>
          <DialogDescription>
            Availability is rechecked on save, so an amendment can never overbook a room type.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="amend-arrival">Arrival</Label>
            <Input id="amend-arrival" type="date" value={arrival} onChange={(e) => setArrival(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="amend-departure">Departure</Label>
            <Input
              id="amend-departure"
              type="date"
              value={departure}
              onChange={(e) => setDeparture(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="amend-adults">Adults</Label>
            <Input
              id="amend-adults"
              type="number"
              min={1}
              value={adults}
              onChange={(e) => setAdults(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="amend-children">Children</Label>
            <Input
              id="amend-children"
              type="number"
              min={0}
              value={children}
              onChange={(e) => setChildren(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label>Room type</Label>
          <Select
            value={roomTypeId}
            onValueChange={(v) => {
              setRoomTypeId(v);
              setRoomId(UNASSIGNED);
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(availabilityQuery.data ?? []).map((a) => (
                <SelectItem key={a.roomTypeId} value={a.roomTypeId} disabled={a.available <= 0}>
                  {a.name} — {a.available} available
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label>Room</Label>
          <Select value={roomId} onValueChange={setRoomId}>
            <SelectTrigger>
              <SelectValue placeholder="Assign later" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNASSIGNED}>Assign later</SelectItem>
              {(roomsQuery.data ?? []).map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  Room {r.roomNumber}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <p className="text-xs text-muted-foreground">
          {datesValid ? `${nights} night${nights === 1 ? "" : "s"}` : "Departure must be after arrival."}
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button disabled={!datesValid || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PricingSection({
  restaurantId,
  reservation,
  canManage,
  onRepriced,
}: {
  restaurantId: string;
  reservation: ReservationDetail;
  canManage: boolean;
  onRepriced: () => void;
}) {
  const money = useMoney();
  const fetchPlans = useServerFn(listRatePlans);
  const submitReprice = useServerFn(repriceReservation);
  const [planId, setPlanId] = useState(reservation.ratePlanId ?? "");

  const plansQuery = useQuery({
    queryKey: ["rate-plans", restaurantId, reservation.roomTypeId, true],
    queryFn: () => fetchPlans({ data: { restaurantId, roomTypeId: reservation.roomTypeId, activeOnly: true } }),
    enabled: canManage,
    retry: false,
  });

  const reprice = useMutation({
    mutationFn: () => submitReprice({ data: { restaurantId, reservationId: reservation.id, ratePlanId: planId } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(`Repriced — new stay total ${money(result.subtotal)}.`);
      onRepriced();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const nightly = reservation.nightlyRates ?? [];

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="font-display text-lg">Pricing</h2>
      {nightly.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No pricing snapshot for this reservation. Existing stays keep their original terms — pick a rate plan below
          to price it.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Night</th>
                <th className="px-3 py-2 text-right">Rate</th>
              </tr>
            </thead>
            <tbody>
              {nightly.map((n) => (
                <tr key={n.date} className="border-t border-border">
                  <td className="px-3 py-2">{formatStayDate(n.date)}</td>
                  <td className="px-3 py-2 text-right">{money(n.rate)}</td>
                </tr>
              ))}
              <tr className="border-t border-border bg-muted/30 font-medium">
                <td className="px-3 py-2">Room subtotal</td>
                <td className="px-3 py-2 text-right">{money(reservation.roomSubtotal ?? 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {canManage ? (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-56 space-y-1">
            <Label>Rate plan</Label>
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger>
                <SelectValue placeholder="Select rate plan" />
              </SelectTrigger>
              <SelectContent>
                {(plansQuery.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.code} — {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" disabled={!planId || reprice.isPending} onClick={() => reprice.mutate()}>
            {reprice.isPending ? "Repricing…" : "Reprice stay"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Repricing recalculates every night on the server and records a history entry.
          </p>
        </div>
      ) : null}
    </section>
  );
}
