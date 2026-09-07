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
import { addDays, formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import { listGuests, type GuestSummary } from "@/packages/pms/lib/guests.functions";
import { getReservationFolio } from "@/packages/pms/lib/cashiering.functions";
import { useMoney } from "@/packages/restaurant-management/state/restaurant-context";
import {
  createReservation,
  getRoomTypeAvailability,
  listAssignableRooms,
} from "@/packages/pms/lib/reservations.functions";
import {
  changeStayDates,
  checkInReservation,
  checkOutReservation,
  markNoShow,
  moveReservationRoom,
  type FrontOfficeStay,
} from "@/packages/pms/lib/frontoffice.functions";
import { assignReservationRoom } from "@/packages/pms/lib/reservations.functions";

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
  });
  const rooms = roomsQuery.data ?? [];

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={roomsQuery.isLoading ? "Loading rooms…" : "Select a room"} />
        </SelectTrigger>
        <SelectContent>
          {rooms.map((room) => (
            <SelectItem key={room.id} value={room.id}>
              Room {room.roomNumber}
              {room.floor ? ` · Floor ${room.floor}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!roomsQuery.isLoading && rooms.length === 0 ? (
        <p className="text-xs text-destructive">
          No eligible {stay.roomTypeName} rooms are free for these dates.
        </p>
      ) : null}
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
            {stay.confirmationNumber} · {stay.guestName} · {stay.roomTypeName}
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
}: {
  restaurantId: string;
  stay: FrontOfficeStay;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [roomId, setRoomId] = useState(stay.roomId ?? "");
  const refresh = useRefresh();
  const checkIn = useServerFn(checkInReservation);

  useEffect(() => {
    if (open) setRoomId(stay.roomId ?? "");
  }, [open, stay.roomId]);

  const mutation = useMutation({
    mutationFn: () => checkIn({ data: { restaurantId, reservationId: stay.id, roomId: roomId || null } }),
    onSuccess: () => {
      toast.success(`${stay.guestName} checked in.`);
      refresh();
      onOpenChange(false);
    },
    onError: (error) => toast.error(errorText(error)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Check in</DialogTitle>
          <DialogDescription>
            {stay.confirmationNumber} · {stay.guestName} · {formatStayDate(stay.arrivalDate)} →{" "}
            {formatStayDate(stay.departureDate)}
          </DialogDescription>
        </DialogHeader>
        <RoomSelect restaurantId={restaurantId} stay={stay} value={roomId} onChange={setRoomId} />
        <p className="text-xs text-muted-foreground">
          Billing settlement will be handled in a future Cashiering phase.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!roomId || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Checking in…" : "Check in"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
    mutationFn: () => move({ data: { restaurantId, reservationId: stay.id, roomId, reason: reason.trim() } }),
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
            {stay.guestName} is in room {stay.roomNumber ?? "—"}. Moves stay within {stay.roomTypeName} in this phase.
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
  const [departure, setDeparture] = useState(stay.departureDate);
  const refresh = useRefresh();
  const change = useServerFn(changeStayDates);

  useEffect(() => {
    if (open) setDeparture(stay.departureDate);
  }, [open, stay.departureDate]);

  const mutation = useMutation({
    mutationFn: () => change({ data: { restaurantId, reservationId: stay.id, departure } }),
    onSuccess: () => {
      toast.success("Stay updated.");
      refresh();
      onOpenChange(false);
    },
    onError: (error) => toast.error(errorText(error)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Extend or shorten stay</DialogTitle>
          <DialogDescription>
            {stay.guestName} · arrived {formatStayDate(stay.arrivalDate)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="new-departure">New departure date</Label>
          <Input
            id="new-departure"
            type="date"
            value={departure}
            min={addDays(stay.arrivalDate, 1)}
            onChange={(e) => setDeparture(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={mutation.isPending || departure === stay.departureDate || departure <= stay.arrivalDate}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Saving…" : "Save stay"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const refresh = useRefresh();
  const checkOut = useServerFn(checkOutReservation);
  const fetchFolio = useServerFn(getReservationFolio);
  const money = useMoney();

  const folioQuery = useQuery({
    queryKey: ["reservation-folio", restaurantId, stay.id],
    queryFn: () => fetchFolio({ data: { restaurantId, reservationId: stay.id } }),
    enabled: open,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: () => checkOut({ data: { restaurantId, reservationId: stay.id } }),
    onSuccess: () => {
      toast.success(`${stay.guestName} checked out.`);
      refresh();
      onOpenChange(false);
    },
    onError: (error) => toast.error(errorText(error)),
  });

  const balance = folioQuery.data?.balance ?? 0;
  const outstanding = folioQuery.data !== null && folioQuery.data !== undefined && Math.abs(balance) >= 0.01;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Check out</DialogTitle>
          <DialogDescription>
            {stay.guestName} · room {stay.roomNumber ?? "—"} · {stay.confirmationNumber}
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          The room becomes vacant immediately and housekeeping opens a departure cleaning task.
        </p>
        {outstanding ? (
          <p className="text-sm text-destructive">
            Folio {folioQuery.data?.folioNumber} still has a balance of {money(balance)}. You can still check
            out — settle the folio in Accounting &amp; Finance.
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Checking out…" : "Check out"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const refresh = useRefresh();
  const noShow = useServerFn(markNoShow);

  const mutation = useMutation({
    mutationFn: () => noShow({ data: { restaurantId, reservationId: stay.id, today } }),
    onSuccess: () => {
      toast.success("Marked as no-show.");
      refresh();
      onOpenChange(false);
    },
    onError: (error) => toast.error(errorText(error)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark as no-show</DialogTitle>
          <DialogDescription>
            {stay.confirmationNumber} · {stay.guestName} · arrival {formatStayDate(stay.arrivalDate)}
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          The reservation stays in history and releases its room. No-show charges arrive in a later phase.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Saving…" : "Mark no-show"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------------------------------------------------- walk-in */

export function WalkInDialog({
  restaurantId,
  today,
  open,
  onOpenChange,
}: {
  restaurantId: string;
  today: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const refresh = useRefresh();
  const [guestSearch, setGuestSearch] = useState("");
  const [guest, setGuest] = useState<GuestSummary | null>(null);
  const [departure, setDeparture] = useState(addDays(today, 1));
  const [roomTypeId, setRoomTypeId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [adults, setAdults] = useState(1);

  useEffect(() => {
    if (open) {
      setGuestSearch("");
      setGuest(null);
      setDeparture(addDays(today, 1));
      setRoomTypeId("");
      setRoomId("");
      setAdults(1);
    }
  }, [open, today]);

  const fetchGuests = useServerFn(listGuests);
  const fetchAvailability = useServerFn(getRoomTypeAvailability);
  const fetchRooms = useServerFn(listAssignableRooms);
  const create = useServerFn(createReservation);
  const checkIn = useServerFn(checkInReservation);

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
  });

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
          children: 0,
          status: "confirmed" as const,
        },
      });
      await checkIn({ data: { restaurantId, reservationId: created.id, roomId } });
      return created;
    },
    onSuccess: (created) => {
      toast.success(`Walk-in ${created.confirmationNumber} checked in.`);
      refresh();
      onOpenChange(false);
    },
    onError: (error) => toast.error(errorText(error)),
  });

  const types = (availabilityQuery.data ?? []).filter((t) => t.available > 0);
  const rooms = roomsQuery.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Walk-in</DialogTitle>
          <DialogDescription>Create a confirmed reservation for today and check the guest straight in.</DialogDescription>
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
              {(guestsQuery.data ?? []).map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
                    onClick={() => setGuest(g)}
                  >
                    {g.fullName}
                    <span className="ml-2 text-xs text-muted-foreground">{g.phone ?? g.email ?? ""}</span>
                  </button>
                </li>
              ))}
              {(guestsQuery.data ?? []).length === 0 ? (
                <li className="px-3 py-2 text-xs text-muted-foreground">
                  No matching guest. Create the guest in Guests first.
                </li>
              ) : null}
            </ul>
          ) : null}
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
        </div>

        <div className="space-y-2">
          <Label>Room type</Label>
          <Select
            value={roomTypeId}
            onValueChange={(v) => {
              setRoomTypeId(v);
              setRoomId("");
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder={availabilityQuery.isLoading ? "Checking availability…" : "Select room type"} />
            </SelectTrigger>
            <SelectContent>
              {types.map((t) => (
                <SelectItem key={t.roomTypeId} value={t.roomTypeId}>
                  {t.name} · {t.available} available
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Room</Label>
          <Select value={roomId} onValueChange={setRoomId} disabled={!roomTypeId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a room" />
            </SelectTrigger>
            <SelectContent>
              {rooms.map((room) => (
                <SelectItem key={room.id} value={room.id}>
                  Room {room.roomNumber}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!guest || !roomTypeId || !roomId || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Creating…" : "Create & check in"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
