import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import { listAssignableRooms } from "@/packages/pms/lib/reservations.functions";
import { listGuests, type GuestSummary } from "@/packages/pms/lib/guests.functions";
import type { FrontOfficeStay } from "@/packages/pms/lib/frontoffice.functions";
import { useMoney } from "@/packages/restaurant-management/state/restaurant-context";
import { isPermissionDeniedMessage } from "@/packages/pms/lib/front-office-shell";
import { PermissionDeniedPanel } from "@/packages/pms/components/frontoffice/coming-soon-panel";
import {
  COMPANIONS_DEFERRED,
  RATE_IMPACT_UNAVAILABLE,
  SERVICE_ZERO_NO_POST,
  SPECIAL_REQUEST_CATEGORIES,
  SPECIAL_REQUEST_CATEGORY_LABELS,
  canConfirmGuestRequest,
  canConfirmGuests,
  canConfirmService,
  canConfirmSpecialRequest,
  canConfirmUpgrade,
  occupancyBlockMessage,
  rateImpact,
  servicePostsToFolio,
  targetRoomRequired,
  upgradeRoomBlocked,
  type SpecialRequestCategory,
} from "@/packages/pms/lib/fo-amendments";
import {
  addSpecialRequest,
  addStayService,
  amendStayGuests,
  createGuestRequest,
  getAmendContext,
  setGuestRequestStatus,
  upgradeReservationType,
} from "@/packages/pms/lib/fo-amendments.functions";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function refreshKeys(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["front-office"] });
  void queryClient.invalidateQueries({ queryKey: ["reservations"] });
  void queryClient.invalidateQueries({ queryKey: ["reservation"] });
  void queryClient.invalidateQueries({ queryKey: ["reservation-amendments"] });
  void queryClient.invalidateQueries({ queryKey: ["fo-amend"] });
}

function BeforeAfterCard({
  rows,
  rate,
}: {
  rows: Array<{ label: string; previous: string; next: string }>;
  rate: ReturnType<typeof rateImpact>;
}) {
  const money = useMoney();
  return (
    <div className="rounded-xl border border-border p-3" data-testid="fo-amend-before-after">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">Before → After</p>
      <dl className="mt-2 space-y-2 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-2 gap-2">
            <div>
              <dt className="text-xs text-muted-foreground">Previous {row.label}</dt>
              <dd>{row.previous}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">New {row.label}</dt>
              <dd>{row.next}</dd>
            </div>
          </div>
        ))}
      </dl>
      {rate.kind === "available" ? (
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Previous rate</p>
            <p>{money(rate.previous)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">New rate</p>
            <p>{rate.next == null ? RATE_IMPACT_UNAVAILABLE : money(rate.next)}</p>
          </div>
        </div>
      ) : (
        <p className="mt-3 inline-flex rounded-full bg-[#C89933]/20 px-2.5 py-1 text-xs font-semibold text-[#251605]">
          {RATE_IMPACT_UNAVAILABLE}
        </p>
      )}
    </div>
  );
}

function FoAmendSheet({
  open,
  onOpenChange,
  title,
  stay,
  confirmLabel,
  confirmDisabled,
  pending,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  stay: FrontOfficeStay;
  confirmLabel: string;
  confirmDisabled: boolean;
  pending: boolean;
  onConfirm: () => void;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        data-testid="fo-amend-sheet"
        className="flex h-dvh w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[560px]"
      >
        <SheetHeader className="shrink-0 border-b border-[#CCCCCC] px-5 py-4 text-left">
          <SheetTitle className="text-[#251605]">{title}</SheetTitle>
          <SheetDescription>
            {stay.guestName} · {stay.confirmationNumber} · {stay.roomNumber ? `Room ${stay.roomNumber}` : "Unassigned"}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">{children}</div>
        <div className="shrink-0 border-t border-[#CCCCCC] px-5 py-4">
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
              disabled={confirmDisabled || pending}
              onClick={onConfirm}
            >
              {pending ? "Saving…" : confirmLabel}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ReasonField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Reason</Label>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder="Why is this stay changing?"
      />
    </div>
  );
}

export function FoAmendUpgradeSheet({
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
  const queryClient = useQueryClient();
  const fetchContext = useServerFn(getAmendContext);
  const fetchRooms = useServerFn(listAssignableRooms);
  const upgrade = useServerFn(upgradeReservationType);
  const [roomTypeId, setRoomTypeId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [reason, setReason] = useState("");
  const [deny, setDeny] = useState<string | null>(null);

  const contextQuery = useQuery({
    queryKey: ["fo-amend", restaurantId, stay.id],
    queryFn: () => fetchContext({ data: { restaurantId, reservationId: stay.id } }),
    enabled: open,
    retry: false,
  });

  useEffect(() => {
    if (open) {
      setRoomTypeId("");
      setRoomId("");
      setReason("");
      setDeny(null);
    }
  }, [open, stay.id]);

  const roomsQuery = useQuery({
    queryKey: ["fo-amend", "assignable", restaurantId, stay.id, roomTypeId, stay.arrivalDate, stay.departureDate],
    queryFn: () =>
      fetchRooms({
        data: {
          restaurantId,
          roomTypeId,
          arrival: stay.arrivalDate,
          departure: stay.departureDate,
          excludeReservationId: stay.id,
        },
      }),
    enabled: open && !!roomTypeId,
  });

  const ctx = contextQuery.data;
  const selectedRoom = (roomsQuery.data ?? []).find((r) => r.id === roomId) ?? null;
  const roomGate = upgradeRoomBlocked(
    selectedRoom
      ? { status: "available", housekeepingStatus: selectedRoom.housekeepingStatus }
      : roomId
        ? { status: "available", housekeepingStatus: null }
        : null,
  );
  const roomRequired = targetRoomRequired({ status: stay.status, roomId: stay.roomId });
  const canConfirm = canConfirmUpgrade({
    targetRoomTypeId: roomTypeId,
    currentRoomTypeId: stay.roomTypeId,
    targetRoomId: roomId || null,
    roomRequired,
    roomBlocked: !!roomId && roomGate.blocked,
    reason,
  });
  const targetType = (ctx?.roomTypes ?? []).find((t) => t.id === roomTypeId);
  const rate = rateImpact({
    roomSubtotal: ctx?.roomSubtotal,
    nightlyRates: ctx?.nightlyRates,
  });

  const mutation = useMutation({
    mutationFn: () =>
      upgrade({
        data: {
          restaurantId,
          reservationId: stay.id,
          roomTypeId,
          roomId: roomId || null,
          reason: reason.trim(),
        },
      }),
    onSuccess: () => {
      toast.success("Room type updated.");
      refreshKeys(queryClient);
      onOpenChange(false);
    },
    onError: (error) => {
      if (isPermissionDeniedMessage(error)) setDeny(errorText(error));
      else toast.error(errorText(error));
    },
  });

  if (deny) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="sm:max-w-[560px]">
          <PermissionDeniedPanel message={deny} />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <FoAmendSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Upgrade / Downgrade"
      stay={stay}
      confirmLabel="Confirm"
      confirmDisabled={!canConfirm}
      pending={mutation.isPending}
      onConfirm={() => mutation.mutate()}
    >
      <p className="text-sm text-muted-foreground">
        {formatStayDate(stay.arrivalDate)} → {formatStayDate(stay.departureDate)}
      </p>
      <div className="rounded-xl border border-border p-3 text-sm">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Current</p>
        <p className="mt-1 font-medium">{stay.roomTypeName}</p>
        <p>Room {stay.roomNumber ?? "—"}</p>
        <p className="text-muted-foreground">
          HK {ctx?.currentRoom?.housekeepingStatus ?? "—"}
          {ctx?.currentRoom?.status ? ` · ${ctx.currentRoom.status.replace(/_/g, " ")}` : ""}
        </p>
      </div>
      <div className="space-y-2">
        <Label>Target room type</Label>
        <Select
          value={roomTypeId}
          onValueChange={(v) => {
            setRoomTypeId(v);
            setRoomId("");
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder={contextQuery.isLoading ? "Loading types…" : "Select room type"} />
          </SelectTrigger>
          <SelectContent>
            {(ctx?.roomTypes ?? [])
              .filter((t) => t.id !== stay.roomTypeId)
              .map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name} · {t.available} available
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Target room{roomRequired ? "" : " (optional)"}</Label>
        <Select value={roomId} onValueChange={setRoomId} disabled={!roomTypeId}>
          <SelectTrigger>
            <SelectValue placeholder={roomsQuery.isLoading ? "Loading rooms…" : "Select a room"} />
          </SelectTrigger>
          <SelectContent>
            {(roomsQuery.data ?? []).map((room) => (
              <SelectItem key={room.id} value={room.id}>
                Room {room.roomNumber}
                {room.housekeepingStatus ? ` · HK ${room.housekeepingStatus}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {roomGate.blocked && roomId ? <p className="text-xs text-destructive">{roomGate.reason}</p> : null}
      </div>
      <ReasonField id="fo-upgrade-reason" value={reason} onChange={setReason} />
      <BeforeAfterCard
        rows={[
          { label: "room type", previous: stay.roomTypeName, next: targetType?.name ?? "—" },
          { label: "room", previous: stay.roomNumber ?? "Unassigned", next: selectedRoom?.roomNumber ?? (roomId ? "—" : "Unassigned") },
        ]}
        rate={rate}
      />
    </FoAmendSheet>
  );
}

export function FoAmendGuestsSheet({
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
  const queryClient = useQueryClient();
  const fetchContext = useServerFn(getAmendContext);
  const fetchGuests = useServerFn(listGuests);
  const save = useServerFn(amendStayGuests);
  const [adults, setAdults] = useState(stay.adults);
  const [children, setChildren] = useState(stay.children);
  const [reason, setReason] = useState("");
  const [guestSearch, setGuestSearch] = useState("");
  const [guest, setGuest] = useState<GuestSummary | null>(null);
  const [deny, setDeny] = useState<string | null>(null);

  const contextQuery = useQuery({
    queryKey: ["fo-amend", restaurantId, stay.id],
    queryFn: () => fetchContext({ data: { restaurantId, reservationId: stay.id } }),
    enabled: open,
    retry: false,
  });

  useEffect(() => {
    if (open) {
      setAdults(stay.adults);
      setChildren(stay.children);
      setReason("");
      setGuestSearch("");
      setGuest(null);
      setDeny(null);
    }
  }, [open, stay.adults, stay.children, stay.id]);

  const guestsQuery = useQuery({
    queryKey: ["fo-amend", "guests", restaurantId, guestSearch],
    queryFn: () =>
      fetchGuests({
        data: {
          restaurantId,
          status: "active" as const,
          limit: 6,
          ...(guestSearch.trim() ? { search: guestSearch.trim() } : {}),
        },
      }),
    enabled: open && guestSearch.trim().length > 0,
  });

  const maxOccupancy = contextQuery.data?.maxOccupancy ?? 0;
  const block = occupancyBlockMessage(adults, children, maxOccupancy);
  const canConfirm = canConfirmGuests({ adults, children, maxOccupancy, reason });
  const nextGuest = guest?.fullName ?? stay.guestName;

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          restaurantId,
          reservationId: stay.id,
          adults,
          children,
          reason: reason.trim(),
          ...(guest ? { guestId: guest.id } : {}),
        },
      }),
    onSuccess: () => {
      toast.success("Guests updated.");
      refreshKeys(queryClient);
      onOpenChange(false);
    },
    onError: (error) => {
      if (isPermissionDeniedMessage(error)) setDeny(errorText(error));
      else toast.error(errorText(error));
    },
  });

  if (deny) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="sm:max-w-[560px]">
          <PermissionDeniedPanel message={deny} />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <FoAmendSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Add / Remove Guest"
      stay={stay}
      confirmLabel="Confirm"
      confirmDisabled={!canConfirm}
      pending={mutation.isPending}
      onConfirm={() => mutation.mutate()}
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="fo-amend-adults">Adults</Label>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setAdults((n) => Math.max(1, n - 1))}>
              −
            </Button>
            <Input id="fo-amend-adults" readOnly value={adults} className="text-center" />
            <Button type="button" variant="outline" size="sm" onClick={() => setAdults((n) => Math.min(20, n + 1))}>
              +
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="fo-amend-children">Children</Label>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setChildren((n) => Math.max(0, n - 1))}>
              −
            </Button>
            <Input id="fo-amend-children" readOnly value={children} className="text-center" />
            <Button type="button" variant="outline" size="sm" onClick={() => setChildren((n) => Math.min(20, n + 1))}>
              +
            </Button>
          </div>
        </div>
      </div>
      {block ? <p className="text-sm text-destructive">{block}</p> : null}
      <div className="space-y-2">
        <Label htmlFor="fo-amend-primary-guest">Primary guest (optional)</Label>
        <Input
          id="fo-amend-primary-guest"
          placeholder="Search to attach a different primary guest"
          value={guest ? guest.fullName : guestSearch}
          onChange={(e) => {
            setGuest(null);
            setGuestSearch(e.target.value);
          }}
        />
        {!guest && guestSearch.trim() ? (
          <ul className="max-h-36 space-y-1 overflow-y-auto rounded-xl border border-border p-1">
            {(guestsQuery.data ?? []).map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
                  onClick={() => setGuest(g)}
                >
                  {g.fullName}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="text-xs text-muted-foreground">{COMPANIONS_DEFERRED}</p>
      </div>
      <ReasonField id="fo-guests-reason" value={reason} onChange={setReason} />
      <BeforeAfterCard
        rows={[
          { label: "adults", previous: String(stay.adults), next: String(adults) },
          { label: "children", previous: String(stay.children), next: String(children) },
          { label: "primary guest", previous: stay.guestName, next: nextGuest },
        ]}
        rate={rateImpact({
          roomSubtotal: contextQuery.data?.roomSubtotal,
          nightlyRates: contextQuery.data?.nightlyRates,
        })}
      />
    </FoAmendSheet>
  );
}

export function FoAmendServiceSheet({
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
  const queryClient = useQueryClient();
  const money = useMoney();
  const fetchContext = useServerFn(getAmendContext);
  const add = useServerFn(addStayService);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("0");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [deny, setDeny] = useState<string | null>(null);

  const contextQuery = useQuery({
    queryKey: ["fo-amend", restaurantId, stay.id],
    queryFn: () => fetchContext({ data: { restaurantId, reservationId: stay.id } }),
    enabled: open,
    retry: false,
  });

  useEffect(() => {
    if (open) {
      setName("");
      setAmount("0");
      setQuantity("1");
      setReason("");
      setDeny(null);
    }
  }, [open, stay.id]);

  const amountNumber = Number(amount);
  const qtyNumber = Number(quantity) || 1;
  const canConfirm = canConfirmService({ name, amount: amountNumber, quantity: qtyNumber, reason });
  const posts = servicePostsToFolio(amountNumber);

  const mutation = useMutation({
    mutationFn: () =>
      add({
        data: {
          restaurantId,
          reservationId: stay.id,
          name: name.trim(),
          amount: amountNumber,
          quantity: qtyNumber,
          reason: reason.trim(),
        },
      }),
    onSuccess: (result) => {
      toast.success(result.posted ? "Service posted to the folio." : "Service recorded on the stay.");
      refreshKeys(queryClient);
      void queryClient.invalidateQueries({ queryKey: ["reservation-folio"] });
      onOpenChange(false);
    },
    onError: (error) => {
      if (isPermissionDeniedMessage(error)) setDeny(errorText(error));
      else toast.error(errorText(error));
    },
  });

  if (deny) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="sm:max-w-[560px]">
          <PermissionDeniedPanel message={deny} />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <FoAmendSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Add Service"
      stay={stay}
      confirmLabel="Confirm"
      confirmDisabled={!canConfirm}
      pending={mutation.isPending}
      onConfirm={() => mutation.mutate()}
    >
      <div className="space-y-2">
        <Label htmlFor="fo-service-name">Service</Label>
        <Input
          id="fo-service-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Late checkout"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="fo-service-amount">Amount ({contextQuery.data?.currency ?? "GBP"})</Label>
          <Input
            id="fo-service-amount"
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fo-service-qty">Quantity</Label>
          <Input
            id="fo-service-qty"
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>
      </div>
      {!posts ? <p className="text-xs text-muted-foreground">{SERVICE_ZERO_NO_POST}</p> : null}
      <ReasonField id="fo-service-reason" value={reason} onChange={setReason} />
      <BeforeAfterCard
        rows={[
          { label: "service", previous: "—", next: name.trim() || "—" },
          { label: "amount", previous: money(0), next: Number.isFinite(amountNumber) ? money(amountNumber) : "—" },
        ]}
        rate={rateImpact({
          roomSubtotal: contextQuery.data?.roomSubtotal,
          nightlyRates: contextQuery.data?.nightlyRates,
        })}
      />
    </FoAmendSheet>
  );
}

export function FoAmendSpecialRequestSheet({
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
  const queryClient = useQueryClient();
  const fetchContext = useServerFn(getAmendContext);
  const save = useServerFn(addSpecialRequest);
  const [category, setCategory] = useState<SpecialRequestCategory | "">("");
  const [text, setText] = useState(stay.specialRequests ?? "");
  const [reason, setReason] = useState("");
  const [deny, setDeny] = useState<string | null>(null);

  const contextQuery = useQuery({
    queryKey: ["fo-amend", restaurantId, stay.id],
    queryFn: () => fetchContext({ data: { restaurantId, reservationId: stay.id } }),
    enabled: open,
    retry: false,
  });

  useEffect(() => {
    if (open) {
      setCategory(contextQuery.data?.specialRequestCategory ?? "");
      setText(stay.specialRequests ?? "");
      setReason("");
      setDeny(null);
    }
  }, [open, stay.id, stay.specialRequests, contextQuery.data?.specialRequestCategory]);

  const canConfirm = canConfirmSpecialRequest({ category, text, reason });

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          restaurantId,
          reservationId: stay.id,
          category: category as SpecialRequestCategory,
          text: text.trim(),
          reason: reason.trim(),
        },
      }),
    onSuccess: () => {
      toast.success("Special request saved.");
      refreshKeys(queryClient);
      onOpenChange(false);
    },
    onError: (error) => {
      if (isPermissionDeniedMessage(error)) setDeny(errorText(error));
      else toast.error(errorText(error));
    },
  });

  if (deny) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="sm:max-w-[560px]">
          <PermissionDeniedPanel message={deny} />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <FoAmendSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Add Special Request"
      stay={stay}
      confirmLabel="Confirm"
      confirmDisabled={!canConfirm}
      pending={mutation.isPending}
      onConfirm={() => mutation.mutate()}
    >
      <div className="flex flex-wrap gap-2">
        {SPECIAL_REQUEST_CATEGORIES.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setCategory(id)}
            className={
              category === id
                ? "rounded-full border border-[#C89933] bg-[#C89933]/15 px-3 py-1 text-sm font-medium text-[#251605]"
                : "rounded-full border border-border px-3 py-1 text-sm"
            }
          >
            {SPECIAL_REQUEST_CATEGORY_LABELS[id]}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        <Label htmlFor="fo-special-text">Request</Label>
        <Textarea id="fo-special-text" value={text} onChange={(e) => setText(e.target.value)} rows={4} />
      </div>
      <ReasonField id="fo-special-reason" value={reason} onChange={setReason} />
      <BeforeAfterCard
        rows={[
          {
            label: "category",
            previous: contextQuery.data?.specialRequestCategory
              ? SPECIAL_REQUEST_CATEGORY_LABELS[contextQuery.data.specialRequestCategory]
              : "—",
            next: category ? SPECIAL_REQUEST_CATEGORY_LABELS[category] : "—",
          },
          { label: "request", previous: stay.specialRequests ?? "—", next: text.trim() || "—" },
        ]}
        rate={rateImpact({
          roomSubtotal: contextQuery.data?.roomSubtotal,
          nightlyRates: contextQuery.data?.nightlyRates,
        })}
      />
    </FoAmendSheet>
  );
}

export function FoGuestRequestSheet({
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
  const queryClient = useQueryClient();
  const fetchContext = useServerFn(getAmendContext);
  const create = useServerFn(createGuestRequest);
  const setStatus = useServerFn(setGuestRequestStatus);
  const [text, setText] = useState("");
  const [deny, setDeny] = useState<string | null>(null);

  const contextQuery = useQuery({
    queryKey: ["fo-amend", restaurantId, stay.id],
    queryFn: () => fetchContext({ data: { restaurantId, reservationId: stay.id } }),
    enabled: open,
    retry: false,
  });

  useEffect(() => {
    if (open) {
      setText("");
      setDeny(null);
    }
  }, [open, stay.id]);

  const canConfirm = canConfirmGuestRequest({ text });

  const mutation = useMutation({
    mutationFn: () => create({ data: { restaurantId, reservationId: stay.id, text: text.trim() } }),
    onSuccess: () => {
      toast.success("Guest request opened.");
      refreshKeys(queryClient);
      onOpenChange(false);
    },
    onError: (error) => {
      if (isPermissionDeniedMessage(error)) setDeny(errorText(error));
      else toast.error(errorText(error));
    },
  });

  const toggle = useMutation({
    mutationFn: (input: { requestId: string; status: "open" | "done" }) =>
      setStatus({ data: { restaurantId, requestId: input.requestId, status: input.status } }),
    onSuccess: () => {
      toast.success("Guest request updated.");
      refreshKeys(queryClient);
      void contextQuery.refetch();
    },
    onError: (error) => toast.error(errorText(error)),
  });

  if (deny) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="sm:max-w-[560px]">
          <PermissionDeniedPanel message={deny} />
        </SheetContent>
      </Sheet>
    );
  }

  const requests = contextQuery.data?.guestRequests ?? [];
  const requestsError = contextQuery.data?.guestRequestsError;

  return (
    <FoAmendSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Guest Request"
      stay={stay}
      confirmLabel="Confirm"
      confirmDisabled={!canConfirm}
      pending={mutation.isPending}
      onConfirm={() => mutation.mutate()}
    >
      {requestsError ? <p className="text-sm text-destructive">{requestsError}</p> : null}
      <div className="space-y-2">
        <Label htmlFor="fo-guest-request-text">Request</Label>
        <Textarea
          id="fo-guest-request-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="What did the guest ask for?"
        />
        <p className="text-xs text-muted-foreground">This text is the auditable statement. Status starts as Open.</p>
      </div>
      <BeforeAfterCard
        rows={[{ label: "request", previous: "—", next: text.trim() || "—" }]}
        rate={rateImpact({
          roomSubtotal: contextQuery.data?.roomSubtotal,
          nightlyRates: contextQuery.data?.nightlyRates,
        })}
      />
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">On this stay</p>
        {requests.length === 0 && !requestsError ? (
          <p className="text-sm text-muted-foreground">No guest requests yet.</p>
        ) : (
          <ul className="space-y-2">
            {requests.map((row) => (
              <li key={row.id} className="flex items-start justify-between gap-2 rounded-xl border border-border p-3">
                <div>
                  <p className="text-sm">{row.requestText}</p>
                  <p className="text-xs text-muted-foreground capitalize">{row.status}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    toggle.mutate({ requestId: row.id, status: row.status === "open" ? "done" : "open" })
                  }
                >
                  {row.status === "open" ? "Mark done" : "Reopen"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </FoAmendSheet>
  );
}

export type FoAmendKind = "upgrade" | "guests" | "service" | "special" | "guest_request";

export function FoAmendKindSheet({
  kind,
  restaurantId,
  stay,
  open,
  onOpenChange,
}: {
  kind: FoAmendKind;
  restaurantId: string;
  stay: FrontOfficeStay;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const props = { restaurantId, stay, open, onOpenChange };
  if (kind === "upgrade") return <FoAmendUpgradeSheet {...props} />;
  if (kind === "guests") return <FoAmendGuestsSheet {...props} />;
  if (kind === "service") return <FoAmendServiceSheet {...props} />;
  if (kind === "special") return <FoAmendSpecialRequestSheet {...props} />;
  return <FoGuestRequestSheet {...props} />;
}
