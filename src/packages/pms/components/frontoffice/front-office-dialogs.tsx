/** Front Office action dialogs — check-in, room move, stay change, check-out, no-show, walk-in. */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { addDays } from "@/packages/pms/components/bookings/reservation-bits";
import { GuestRestrictionBadges, GuestRestrictionWarn } from "@/packages/pms/components/guests/guest-bits";
import { GuestFormDialog } from "@/packages/pms/components/guests/guest-form-dialog";
import { guestListItems, listGuests, type GuestSummary } from "@/packages/pms/lib/guests.functions";
import {
  createReservation,
  getRoomTypeAvailability,
  listAssignableRooms,
} from "@/packages/pms/lib/reservations.functions";
import { quoteStay } from "@/packages/pms/lib/rates.functions";
import {
  moveReservationRoom,
  type FrontOfficeStay,
} from "@/packages/pms/lib/frontoffice.functions";
import { assignReservationRoom } from "@/packages/pms/lib/reservations.functions";
import { FoCheckInStepper } from "@/packages/pms/components/frontoffice/fo-check-in-stepper";
import { FoCheckOutStepper } from "@/packages/pms/components/frontoffice/fo-check-out-stepper";
import { FoNoShowStepper } from "@/packages/pms/components/frontoffice/fo-no-show-stepper";
import { FoRackConfirmSheet } from "@/packages/pms/components/frontoffice/fo-rack-confirm-sheet";
import type { RackDatesDraft } from "@/packages/pms/lib/fo-rack-power";
import { startWalkInCheckIn } from "@/packages/pms/lib/fo-check-in.functions";
import { isRoomReady } from "@/packages/pms/lib/fo-check-in";
import { nightsBetween } from "@/packages/pms/lib/reservation-dates";
import type { CheckInStepId } from "@/packages/pms/lib/fo-check-in";
import {
  assignableListUi,
  formatRoomTypeLabel,
} from "@/packages/pms/lib/fo-room-assignment";
import { AssignableRoomsHint } from "@/packages/pms/components/frontoffice/assignable-rooms-hint";
import { useMoney } from "@/packages/restaurant-management/state/restaurant-context";

function useRefresh() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["front-office"] });
    void queryClient.invalidateQueries({ queryKey: ["reservations"] });
    void queryClient.invalidateQueries({ queryKey: ["reservation"] });
    void queryClient.invalidateQueries({ queryKey: ["rooms-dashboard"] });
  };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

/* ------------------------------------------------------------- room picker */

function RoomSelect({
  restaurantId,
  stay,
  value,
  onChange,
  label = "Room",
}: {
  restaurantId: string;
  stay: FrontOfficeStay;
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  const fetchRooms = useServerFn(listAssignableRooms);
  const roomsQuery = useQuery({
    queryKey: ["front-office", "assignable", restaurantId, stay.id, stay.roomTypeId, stay.arrivalDate, stay.departureDate],
    queryFn: () =>
      fetchRooms({
        data: {
          restaurantId,
          roomTypeId: stay.roomTypeId,
          arrival: stay.arrivalDate,
          departure: stay.departureDate,
          excludeReservationId: stay.id,
        },
      }),
    retry: false,
  });
  const rooms = roomsQuery.data ?? [];
  const listState = assignableListUi({
    isPending: roomsQuery.isPending,
    isError: roomsQuery.isError,
    rooms: roomsQuery.data,
  });
  const roomTypeLabel = formatRoomTypeLabel(stay.roomTypeName, stay.roomTypeCode);

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={listState.status === "loading" || listState.status === "error"}>
        <SelectTrigger>
          <SelectValue placeholder={listState.status === "loading" ? "Loading rooms…" : "Select a room"} />
        </SelectTrigger>
        <SelectContent>
          {rooms.map((room) => (
            <SelectItem key={room.id} value={room.id}>
              Room {room.roomNumber}
              {room.floor ? ` · Floor ${room.floor}` : ""}
              {room.housekeepingStatus ? ` · ${room.housekeepingStatus}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <AssignableRoomsHint
        status={listState.status}
        roomTypeLabel={roomTypeLabel}
        onRetry={() => void roomsQuery.refetch()}
        detail={roomsQuery.error instanceof Error ? roomsQuery.error.message : null}
      />
    </div>
  );
}

/* --------------------------------------------------------- assign / check-in */

export function AssignRoomDialog({
  restaurantId,
  stay,
  open,
  onOpenChange,
}: {
  restaurantId: string;
  stay: FrontOfficeStay;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [roomId, setRoomId] = useState(stay.roomId ?? "");
  const refresh = useRefresh();
  const assign = useServerFn(assignReservationRoom);

  useEffect(() => {
    if (open) setRoomId(stay.roomId ?? "");
  }, [open, stay.roomId]);

  const mutation = useMutation({
    mutationFn: () => assign({ data: { restaurantId, reservationId: stay.id, roomId } }),
    onSuccess: () => {
      toast.success("Room assigned.");
      refresh();
      onOpenChange(false);
    },
    onError: (error) => toast.error(errorText(error)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign room</DialogTitle>
          <DialogDescription>
            {stay.confirmationNumber} · {stay.guestName} · {formatRoomTypeLabel(stay.roomTypeName, stay.roomTypeCode)}
          </DialogDescription>
        </DialogHeader>
        <RoomSelect restaurantId={restaurantId} stay={stay} value={roomId} onChange={setRoomId} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!roomId || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Assigning…" : "Assign room"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CheckInDialog({
  restaurantId,
  stay,
  open,
  onOpenChange,
  initialStep,
}: {
  restaurantId: string;
  stay: FrontOfficeStay;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialStep?: CheckInStepId;
}) {
  return (
    <FoCheckInStepper
      restaurantId={restaurantId}
      stay={stay}
      open={open}
      onOpenChange={onOpenChange}
      {...(initialStep ? { initialStep } : {})}
    />
  );
}

/* ----------------------------------------------------------------- in-house */

export function RoomMoveDialog({
  restaurantId,
  stay,
  open,
  onOpenChange,
}: {
  restaurantId: string;
  stay: FrontOfficeStay;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [roomId, setRoomId] = useState("");
  const [reason, setReason] = useState("");
  const refresh = useRefresh();
  const move = useServerFn(moveReservationRoom);

  useEffect(() => {
    if (open) {
      setRoomId("");
      setReason("");
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: () =>
      move({
        data: {
          restaurantId,
          reservationId: stay.id,
          roomId,
          reason: reason.trim(),
          expectedRoomId: stay.roomId,
          expectedArrival: stay.arrivalDate,
          expectedDeparture: stay.departureDate,
          expectedUpdatedAt: stay.updatedAt ?? null,
        },
      }),
    onSuccess: () => {
      toast.success("Guest moved.");
      refresh();
      onOpenChange(false);
    },
    onError: (error) => toast.error(errorText(error)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Room move</DialogTitle>
          <DialogDescription>
            {stay.guestName} is in room {stay.roomNumber ?? "—"}. Same-type moves use the canonical room-move writer.
            A different room type is a commercial amendment — use Amend Stay → Room type change.
          </DialogDescription>
        </DialogHeader>
        <RoomSelect restaurantId={restaurantId} stay={stay} value={roomId} onChange={setRoomId} label="New room" />
        <div className="space-y-2">
          <Label htmlFor="move-reason">Reason</Label>
          <Textarea
            id="move-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is the guest moving?"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!roomId || !reason.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Moving…" : "Move guest"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Phone/menu Confirm family — same changeStayDates writer as Room Rack + Calendar. */
export function StayDatesDialog({
  restaurantId,
  stay,
  open,
  onOpenChange,
}: {
  restaurantId: string;
  stay: FrontOfficeStay;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const draft: RackDatesDraft = {
    kind: "change_dates",
    reservationId: stay.id,
    guestName: stay.guestName,
    confirmationNumber: stay.confirmationNumber,
    status: stay.status,
    currentRoomId: stay.roomId,
    currentRoomNumber: stay.roomNumber,
    currentRoomTypeId: stay.roomTypeId,
    arrivalDate: stay.arrivalDate,
    departureDate: stay.departureDate,
    nextArrivalDate: stay.arrivalDate,
    nextDepartureDate: stay.departureDate,
    roomSubtotal: null,
    nightlyRates: null,
  };

  return (
    <FoRackConfirmSheet
      restaurantId={restaurantId}
      draft={open ? draft : null}
      open={open}
      overlappingStays={[]}
      onOpenChange={onOpenChange}
      editableDates
    />
  );
}

export function CheckOutDialog({
  restaurantId,
  stay,
  open,
  onOpenChange,
}: {
  restaurantId: string;
  stay: FrontOfficeStay;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <FoCheckOutStepper restaurantId={restaurantId} stay={stay} open={open} onOpenChange={onOpenChange} />
  );
}

export function NoShowDialog({
  restaurantId,
  stay,
  today,
  open,
  onOpenChange,
}: {
  restaurantId: string;
  stay: FrontOfficeStay;
  today: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <FoNoShowStepper
      restaurantId={restaurantId}
      stay={stay}
      today={today}
      open={open}
      onOpenChange={onOpenChange}
    />
  );
}

/* ----------------------------------------------------------------- walk-in */

export function WalkInDialog({
  restaurantId,
  today,
  open,
  onOpenChange,
  onCreated,
}: {
  restaurantId: string;
  today: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (stay: FrontOfficeStay) => void;
}) {
  const refresh = useRefresh();
  const money = useMoney();
  const [guestSearch, setGuestSearch] = useState("");
  const [guest, setGuest] = useState<GuestSummary | null>(null);
  const [createGuestOpen, setCreateGuestOpen] = useState(false);
  const [departure, setDeparture] = useState(addDays(today, 1));
  const [roomTypeId, setRoomTypeId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [ratePlanId, setRatePlanId] = useState("");

  useEffect(() => {
    if (open) {
      setGuestSearch("");
      setGuest(null);
      setCreateGuestOpen(false);
      setDeparture(addDays(today, 1));
      setRoomTypeId("");
      setRoomId("");
      setAdults(1);
      setChildren(0);
      setRatePlanId("");
    }
  }, [open, today]);

  const fetchGuests = useServerFn(listGuests);
  const fetchAvailability = useServerFn(getRoomTypeAvailability);
  const fetchRooms = useServerFn(listAssignableRooms);
  const fetchQuotes = useServerFn(quoteStay);
  const create = useServerFn(createReservation);
  const startWalkIn = useServerFn(startWalkInCheckIn);

  const guestsQuery = useQuery({
    queryKey: ["front-office", "walkin-guests", restaurantId, guestSearch],
    queryFn: () =>
      fetchGuests({
        data: {
          restaurantId,
          status: "active" as const,
          limit: 6,
          ...(guestSearch.trim() ? { search: guestSearch.trim() } : {}),
        },
      }),
    enabled: open,
  });

  const availabilityQuery = useQuery({
    queryKey: ["front-office", "walkin-availability", restaurantId, today, departure],
    queryFn: () => fetchAvailability({ data: { restaurantId, arrival: today, departure } }),
    enabled: open && departure > today,
  });

  const roomsQuery = useQuery({
    queryKey: ["front-office", "walkin-rooms", restaurantId, roomTypeId, today, departure],
    queryFn: () => fetchRooms({ data: { restaurantId, roomTypeId, arrival: today, departure } }),
    enabled: open && !!roomTypeId && departure > today,
    retry: false,
  });

  const quotesQuery = useQuery({
    queryKey: ["front-office", "walkin-quotes", restaurantId, roomTypeId, today, departure],
    queryFn: () => fetchQuotes({ data: { restaurantId, roomTypeId, arrival: today, departure } }),
    enabled: open && !!roomTypeId && departure > today,
    retry: false,
  });

  const rooms = roomsQuery.data ?? [];
  const types = (availabilityQuery.data ?? []).filter((t) => t.available > 0);
  const pricedQuotes = (quotesQuery.data ?? []).filter((row) => row.quote);
  const walkInRoomsState = assignableListUi({
    isPending: roomsQuery.isPending,
    isError: roomsQuery.isError,
    rooms: roomsQuery.data,
  });
  const selectedWalkInType = types.find((t) => t.roomTypeId === roomTypeId);
  const selectedQuote = pricedQuotes.find((row) => row.plan.id === ratePlanId);
  const selectedWalkInRoom = rooms.find((room) => room.id === roomId);
  const selectedWalkInReady = selectedWalkInRoom
    ? isRoomReady({
        status: "available",
        housekeepingStatus: selectedWalkInRoom.housekeepingStatus,
      }).ready
    : null;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!guest) throw new Error("Pick a guest first.");
      const created = await create({
        data: {
          restaurantId,
          guestId: guest.id,
          roomTypeId,
          roomId,
          arrival: today,
          departure,
          adults,
          children,
          status: "confirmed" as const,
          ratePlanId: ratePlanId || null,
          source: "walk_in" as const,
          // Section 7 TIP option 1: FO walk-in stays confirmed + rate without guarantee.
        },
      });
      await startWalkIn({ data: { restaurantId, reservationId: created.id } });
      const room = rooms.find((r) => r.id === roomId);
      const roomType = types.find((t) => t.roomTypeId === roomTypeId);
      const stay: FrontOfficeStay = {
        id: created.id,
        confirmationNumber: created.confirmationNumber,
        guestId: guest.id,
        guestName: guest.fullName,
        guestVip: guest.vipStatus,
        guestPhone: guest.phone,
        roomTypeId,
        roomTypeName: roomType?.name ?? "Room type",
        roomTypeCode: roomType?.code ?? null,
        roomId,
        roomNumber: room?.roomNumber ?? null,
        arrivalDate: today,
        departureDate: departure,
        nights: nightsBetween(today, departure),
        adults,
        children,
        status: "confirmed",
        specialRequests: null,
        source: "walk_in",
        overstay: false,
        walkInIncomplete: true,
      };
      return stay;
    },
    onSuccess: (createdStay) => {
      toast.success(`Walk-in ${createdStay.confirmationNumber} created — finish check-in.`);
      refresh();
      onOpenChange(false);
      onCreated?.(createdStay);
    },
    onError: (error) => toast.error(errorText(error)),
  });

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Walk-in</DialogTitle>
          <DialogDescription>Create a confirmed stay for today, then continue registration, deposit and key.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="walkin-guest">Guest</Label>
          <Input
            id="walkin-guest"
            placeholder="Search name, phone or email"
            value={guest ? guest.fullName : guestSearch}
            onChange={(e) => {
              setGuest(null);
              setGuestSearch(e.target.value);
            }}
          />
          {!guest ? (
            <ul className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-border p-1">
              {guestListItems(guestsQuery.data).map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
                    onClick={() => setGuest(g)}
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      {g.fullName}
                      <GuestRestrictionBadges guest={g} />
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">{g.phone ?? g.email ?? ""}</span>
                  </button>
                </li>
              ))}
              {guestListItems(guestsQuery.data).length === 0 ? (
                <li className="px-3 py-2 text-xs text-muted-foreground">
                  No matching guest. Create a guest with Guest Profile, or search again.
                </li>
              ) : null}
            </ul>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={() => setCreateGuestOpen(true)}>
            Create guest
          </Button>
          {guest ? <GuestRestrictionWarn guest={guest} /> : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="walkin-departure">Departure</Label>
            <Input
              id="walkin-departure"
              type="date"
              min={addDays(today, 1)}
              value={departure}
              onChange={(e) => {
                setDeparture(e.target.value);
                setRoomTypeId("");
                setRoomId("");
                setRatePlanId("");
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="walkin-adults">Adults</Label>
            <Input
              id="walkin-adults"
              type="number"
              min={1}
              max={20}
              value={adults}
              onChange={(e) => setAdults(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="walkin-children">Children</Label>
            <Input
              id="walkin-children"
              type="number"
              min={0}
              max={20}
              value={children}
              onChange={(e) => setChildren(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Room type</Label>
          <Select
            value={roomTypeId}
            onValueChange={(v) => {
              setRoomTypeId(v);
              setRoomId("");
              setRatePlanId("");
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder={availabilityQuery.isLoading ? "Checking availability…" : "Select room type"} />
            </SelectTrigger>
            <SelectContent>
              {types.map((t) => (
                <SelectItem key={t.roomTypeId} value={t.roomTypeId}>
                  {formatRoomTypeLabel(t.name, t.code)} · {t.available} available
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Rate plan</Label>
          <Select value={ratePlanId} onValueChange={setRatePlanId} disabled={!roomTypeId}>
            <SelectTrigger data-testid="walkin-rate-plan">
              <SelectValue
                placeholder={
                  quotesQuery.isLoading
                    ? "Pricing the stay…"
                    : pricedQuotes.length === 0
                      ? "No quoted rate for this stay"
                      : "Select a rate plan"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {pricedQuotes.map((row) => (
                <SelectItem key={row.plan.id} value={row.plan.id}>
                  {row.plan.code} · {row.plan.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedQuote?.quote ? (
            <p className="text-xs text-muted-foreground">
              {selectedQuote.quote.nights} night{selectedQuote.quote.nights === 1 ? "" : "s"} · nightly{" "}
              {money(selectedQuote.quote.nightly[0]?.rate ?? 0)} · total {money(selectedQuote.quote.subtotal)}
            </p>
          ) : quotesQuery.isError ? (
            <p className="text-xs text-destructive">Pricing unavailable for this stay.</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label>Room</Label>
          <Select value={roomId} onValueChange={setRoomId} disabled={!roomTypeId || walkInRoomsState.status === "error"}>
            <SelectTrigger>
              <SelectValue
                placeholder={walkInRoomsState.status === "loading" ? "Loading rooms…" : "Select a room"}
              />
            </SelectTrigger>
            <SelectContent>
              {rooms.map((room) => (
                <SelectItem key={room.id} value={room.id}>
                  Room {room.roomNumber}
                  {room.housekeepingStatus ? ` · ${room.housekeepingStatus}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {roomTypeId ? (
            <AssignableRoomsHint
              status={walkInRoomsState.status}
              roomTypeLabel={formatRoomTypeLabel(
                selectedWalkInType?.name ?? "room type",
                selectedWalkInType?.code,
              )}
              onRetry={() => void roomsQuery.refetch()}
              detail={roomsQuery.error instanceof Error ? roomsQuery.error.message : null}
            />
          ) : null}
          {selectedWalkInReady === false ? (
            <p className="text-xs text-muted-foreground">Assignable, but not check-in ready yet (housekeeping).</p>
          ) : selectedWalkInReady === true ? (
            <p className="text-xs text-muted-foreground">Room is check-in ready under current HK rules.</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!guest || !roomTypeId || !roomId || !ratePlanId || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Creating…" : "Create stay"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <GuestFormDialog
      restaurantId={restaurantId}
      open={createGuestOpen}
      onOpenChange={setCreateGuestOpen}
      onSaved={(guestId) => {
        setCreateGuestOpen(false);
        void guestsQuery.refetch().then((result) => {
          const found = guestListItems(result.data).find((item) => item.id === guestId);
          if (found) setGuest(found);
        });
      }}
      onOpenExisting={(guestId) => {
        setCreateGuestOpen(false);
        void guestsQuery.refetch().then((result) => {
          const found = guestListItems(result.data).find((item) => item.id === guestId);
          if (found) setGuest(found);
        });
      }}
    />
    </>
  );
}
