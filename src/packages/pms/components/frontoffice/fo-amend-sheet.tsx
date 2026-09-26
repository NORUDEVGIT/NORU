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
import { GuestRestrictionWarn } from "@/packages/pms/components/guests/guest-bits";
import { guestListItems, listGuests, type GuestSummary } from "@/packages/pms/lib/guests.functions";
import type { FrontOfficeStay } from "@/packages/pms/lib/frontoffice.functions";
import { assignableListUi, formatRoomTypeLabel } from "@/packages/pms/lib/fo-room-assignment";
import { AssignableRoomsHint } from "@/packages/pms/components/frontoffice/assignable-rooms-hint";
import { useMoney } from "@/packages/restaurant-management/state/restaurant-context";
import { isPermissionDeniedMessage } from "@/packages/pms/lib/front-office-shell";
import { PermissionDeniedPanel } from "@/packages/pms/components/frontoffice/coming-soon-panel";
import {
  CATALOGUE_EMPTY_HINT,
  COMPANIONS_UNAVAILABLE,
  NO_GUESTS_FOUND,
  RATE_IMPACT_UNAVAILABLE,
  SERVICE_ZERO_NO_POST,
  SPECIAL_REQUEST_CATEGORIES,
  SPECIAL_REQUEST_CATEGORY_LABELS,
  canConfirmGuests,
  canConfirmService,
  canConfirmSpecialRequest,
  canConfirmUpgrade,
  guestSearchEmpty,
  namedPartyBlockMessage,
  nextCompanionCount,
  occupancyBlockMessage,
  rateImpact,
  servicePostsToFolio,
  stayGuestLine,
  targetRoomRequired,
  upgradeRoomBlocked,
  type SpecialRequestCategory,
} from "@/packages/pms/lib/fo-amendments";
import {
  addSpecialRequest,
  addStayService,
  amendStayGuests,
  attachStayCompanion,
  detachStayCompanion,
  getAmendContext,
  upgradeReservationType,
  type StayGuestRow,
} from "@/packages/pms/lib/fo-amendments.functions";
import { createGuestServiceRequest } from "@/packages/pms/lib/guests.functions";
import { getFrontOfficeGuestServiceSummary } from "@/packages/pms/lib/fo-guest-services.functions";
import { canConfirmFoGuestServiceRequest } from "@/packages/pms/lib/fo-guest-services";
import {
  GUEST_SERVICE_DESCRIPTION_MAX,
  GUEST_SERVICE_PRIORITIES,
  GUEST_SERVICE_PRIORITY_LABELS,
  GUEST_SERVICES_NO_TYPES,
  type GuestServicePriority,
} from "@/packages/pms/lib/guest-services-workspace";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function refreshKeys(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["front-office"] });
  void queryClient.invalidateQueries({ queryKey: ["reservations"] });
  void queryClient.invalidateQueries({ queryKey: ["reservation"] });
  void queryClient.invalidateQueries({ queryKey: ["reservation-amendments"] });
  void queryClient.invalidateQueries({ queryKey: ["fo-amend"] });
  void queryClient.invalidateQueries({ queryKey: ["guest-service-history"] });
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
        className="z-[70] flex h-dvh w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[560px]"
      >
        <SheetHeader className="shrink-0 border-b border-[#CCCCCC] px-5 py-4 text-left">
          <SheetTitle className="text-[#251605]">{title}</SheetTitle>
          <SheetDescription>
            {stay.guestName} · {stay.confirmationNumber} ·{" "}
            {stay.roomNumber ? `Room ${stay.roomNumber}` : "Unassigned"}
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
    queryKey: [
      "fo-amend",
      "assignable",
      restaurantId,
      stay.id,
      roomTypeId,
      stay.arrivalDate,
      stay.departureDate,
    ],
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
    retry: false,
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
  const upgradeRoomsState = assignableListUi({
    isPending: roomsQuery.isPending,
    isError: roomsQuery.isError,
    rooms: roomsQuery.data,
  });
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
        <p className="mt-1 font-medium">{formatRoomTypeLabel(stay.roomTypeName, stay.roomTypeCode)}</p>
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
            <SelectValue
              placeholder={contextQuery.isLoading ? "Loading types…" : "Select room type"}
            />
          </SelectTrigger>
          <SelectContent>
            {(ctx?.roomTypes ?? [])
              .filter((t) => t.id !== stay.roomTypeId)
              .map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {formatRoomTypeLabel(t.name, t.code)} · {t.available} available
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Target room{roomRequired ? "" : " (optional)"}</Label>
        <Select
          value={roomId}
          onValueChange={setRoomId}
          disabled={!roomTypeId || upgradeRoomsState.status === "error"}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={upgradeRoomsState.status === "loading" ? "Loading rooms…" : "Select a room"}
            />
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
        {roomTypeId ? (
          <AssignableRoomsHint
            status={upgradeRoomsState.status}
            roomTypeLabel={formatRoomTypeLabel(targetType?.name ?? "room type", targetType?.code)}
            onRetry={() => void roomsQuery.refetch()}
            detail={roomsQuery.error instanceof Error ? roomsQuery.error.message : null}
          />
        ) : null}
        {roomGate.blocked && roomId ? (
          <p className="text-xs text-destructive">{roomGate.reason}</p>
        ) : null}
      </div>
      <ReasonField id="fo-upgrade-reason" value={reason} onChange={setReason} />
      <BeforeAfterCard
        rows={[
          { label: "room type", previous: formatRoomTypeLabel(stay.roomTypeName, stay.roomTypeCode), next: targetType ? formatRoomTypeLabel(targetType.name, targetType.code) : "—" },
          {
            label: "room",
            previous: stay.roomNumber ?? "Unassigned",
            next: selectedRoom?.roomNumber ?? (roomId ? "—" : "Unassigned"),
          },
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
  const attach = useServerFn(attachStayCompanion);
  const detach = useServerFn(detachStayCompanion);
  const [adults, setAdults] = useState(stay.adults);
  const [children, setChildren] = useState(stay.children);
  const [reason, setReason] = useState("");
  const [guestSearch, setGuestSearch] = useState("");
  const [guest, setGuest] = useState<GuestSummary | null>(null);
  const [companionSearch, setCompanionSearch] = useState("");
  const [pendingAttach, setPendingAttach] = useState<GuestSummary | null>(null);
  const [pendingDetach, setPendingDetach] = useState<StayGuestRow | null>(null);
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
      setCompanionSearch("");
      setPendingAttach(null);
      setPendingDetach(null);
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

  const companionGuestsQuery = useQuery({
    queryKey: ["fo-amend", "companion-guests", restaurantId, companionSearch],
    queryFn: () =>
      fetchGuests({
        data: {
          restaurantId,
          status: "active" as const,
          limit: 6,
          ...(companionSearch.trim() ? { search: companionSearch.trim() } : {}),
        },
      }),
    enabled: open && companionSearch.trim().length > 0 && !pendingAttach,
  });

  const ctx = contextQuery.data;
  const companions = ctx?.companions ?? [];
  const companionsError = ctx?.companionsError ?? null;
  const primaryGuest = ctx?.primaryGuest;
  const maxOccupancy = ctx?.maxOccupancy ?? 0;
  const occupancyChanged = adults !== stay.adults || children !== stay.children || !!guest;
  const nextCount = nextCompanionCount({
    currentCount: companions.length,
    ...(pendingAttach ? { pendingAttach: true } : {}),
    ...(pendingDetach ? { pendingDetach: true } : {}),
  });
  const block = occupancyBlockMessage(adults, children, maxOccupancy);
  const namedBlock = pendingAttach ? namedPartyBlockMessage(nextCount, maxOccupancy) : null;
  const canConfirm = canConfirmGuests({
    adults,
    children,
    maxOccupancy,
    reason,
    companionCount: companions.length,
    hasOccupancyChange: occupancyChanged || !!pendingAttach || !!pendingDetach,
    ...(pendingAttach ? { pendingAttach: true } : {}),
    ...(pendingDetach ? { pendingDetach: true } : {}),
  });
  const nextGuest = guest?.fullName ?? stay.guestName;
  const attachedIds = new Set([stay.guestId, ...companions.map((c) => c.guestId)]);
  const companionResults = guestListItems(companionGuestsQuery.data).filter((g) => !attachedIds.has(g.id));
  const primaryEmpty = guestSearchEmpty({
    search: guestSearch,
    results: guestListItems(guestsQuery.data),
    loading: guestsQuery.isFetching,
  });
  const companionEmpty = guestSearchEmpty({
    search: companionSearch,
    results: companionResults,
    loading: companionGuestsQuery.isFetching,
  });
  const contextDenied = contextQuery.isError && isPermissionDeniedMessage(contextQuery.error);
  const denyMessage = deny ?? (contextDenied ? errorText(contextQuery.error) : null);
  const companionsDenied = !!companionsError && isPermissionDeniedMessage(companionsError);

  const mutation = useMutation({
    mutationFn: async () => {
      if (occupancyChanged) {
        await save({
          data: {
            restaurantId,
            reservationId: stay.id,
            adults,
            children,
            reason: reason.trim(),
            ...(guest ? { guestId: guest.id } : {}),
          },
        });
      }
      if (pendingAttach) {
        await attach({
          data: {
            restaurantId,
            reservationId: stay.id,
            guestId: pendingAttach.id,
            reason: reason.trim(),
          },
        });
      }
      if (pendingDetach) {
        await detach({
          data: {
            restaurantId,
            reservationId: stay.id,
            companionId: pendingDetach.id,
            reason: reason.trim(),
          },
        });
      }
    },
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

  if (denyMessage) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="sm:max-w-[560px]">
          <PermissionDeniedPanel message={denyMessage} />
        </SheetContent>
      </Sheet>
    );
  }

  const nextCompanions = pendingDetach
    ? companions.filter((c) => c.id !== pendingDetach.id).map((c) => c.name)
    : pendingAttach
      ? [...companions.map((c) => c.name), pendingAttach.fullName]
      : companions.map((c) => c.name);

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
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAdults((n) => Math.max(1, n - 1))}
            >
              −
            </Button>
            <Input id="fo-amend-adults" readOnly value={adults} className="text-center" />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAdults((n) => Math.min(20, n + 1))}
            >
              +
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="fo-amend-children">Children</Label>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setChildren((n) => Math.max(0, n - 1))}
            >
              −
            </Button>
            <Input id="fo-amend-children" readOnly value={children} className="text-center" />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setChildren((n) => Math.min(20, n + 1))}
            >
              +
            </Button>
          </div>
        </div>
      </div>
      {block ? <p className="text-sm text-destructive">{block}</p> : null}
      {namedBlock ? <p className="text-sm text-destructive">{namedBlock}</p> : null}
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
          primaryEmpty ? (
            <p className="text-sm text-muted-foreground">{NO_GUESTS_FOUND}</p>
          ) : (
            <ul className="max-h-36 space-y-1 overflow-y-auto rounded-xl border border-border p-1">
              {guestListItems(guestsQuery.data).map((g) => (
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
          )
        ) : null}
        {guest ? <GuestRestrictionWarn guest={guest} /> : null}
      </div>
      <div className="space-y-2" data-testid="fo-named-companions">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Named guests</p>
        {companionsDenied ? (
          <PermissionDeniedPanel message={companionsError ?? COMPANIONS_UNAVAILABLE} />
        ) : companionsError ? (
          <div
            className="rounded-2xl border border-border bg-card p-4"
            data-testid="fo-companions-unavailable"
          >
            <p className="text-sm font-medium text-[#251605]">Unavailable</p>
            <p className="mt-1 text-sm text-muted-foreground">{companionsError}</p>
          </div>
        ) : (
          <>
            <ul className="space-y-2">
              <li className="rounded-xl border border-border px-3 py-2 text-sm">
                {stayGuestLine(primaryGuest?.name ?? stay.guestName, primaryGuest?.type ?? null)} ·
                Primary
              </li>
              {companions.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
                >
                  <span className="text-sm">{stayGuestLine(row.name, row.type)}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setPendingAttach(null);
                      setPendingDetach(row);
                    }}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
            <div className="space-y-2">
              <Label htmlFor="fo-amend-companion">Add companion</Label>
              <Input
                id="fo-amend-companion"
                placeholder="Search an existing guest profile"
                value={pendingAttach ? pendingAttach.fullName : companionSearch}
                onChange={(e) => {
                  setPendingAttach(null);
                  setCompanionSearch(e.target.value);
                }}
              />
              {!pendingAttach && companionSearch.trim() ? (
                companionEmpty ? (
                  <p className="text-sm text-muted-foreground">{NO_GUESTS_FOUND}</p>
                ) : (
                  <ul className="max-h-36 space-y-1 overflow-y-auto rounded-xl border border-border p-1">
                    {companionResults.map((g) => (
                      <li key={g.id}>
                        <button
                          type="button"
                          className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
                          onClick={() => {
                            setPendingDetach(null);
                            setPendingAttach(g);
                          }}
                        >
                          {g.fullName}
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              ) : null}
            </div>
            {pendingAttach ? (
              <p className="text-sm">Pending add: {pendingAttach.fullName}</p>
            ) : null}
            {pendingDetach ? (
              <p className="text-sm">
                Pending remove: {stayGuestLine(pendingDetach.name, pendingDetach.type)}
              </p>
            ) : null}
          </>
        )}
      </div>
      <ReasonField id="fo-guests-reason" value={reason} onChange={setReason} />
      <BeforeAfterCard
        rows={[
          { label: "adults", previous: String(stay.adults), next: String(adults) },
          { label: "children", previous: String(stay.children), next: String(children) },
          { label: "primary guest", previous: stay.guestName, next: nextGuest },
          {
            label: "companions",
            previous: companions.map((c) => c.name).join(", ") || "—",
            next: nextCompanions.join(", ") || "—",
          },
        ]}
        rate={rateImpact({
          roomSubtotal: ctx?.roomSubtotal,
          nightlyRates: ctx?.nightlyRates,
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
  const [catalogueSearch, setCatalogueSearch] = useState("");
  const [selectedCatalogueId, setSelectedCatalogueId] = useState<string | null>(null);
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
      setCatalogueSearch("");
      setSelectedCatalogueId(null);
      setDeny(null);
    }
  }, [open, stay.id]);

  const catalogue = contextQuery.data?.catalogue ?? [];
  const pickFirst = catalogue.length > 0;
  const catalogueHint =
    contextQuery.data?.catalogueHint ?? (pickFirst ? null : CATALOGUE_EMPTY_HINT);
  const filteredCatalogue = catalogue.filter((item) =>
    item.name.toLowerCase().includes(catalogueSearch.trim().toLowerCase()),
  );
  const amountNumber = Number(amount);
  const qtyNumber = Number(quantity) || 1;
  const canConfirm = canConfirmService({ name, amount: amountNumber, quantity: qtyNumber, reason });
  const posts = servicePostsToFolio(amountNumber);
  const contextDenied = contextQuery.isError && isPermissionDeniedMessage(contextQuery.error);
  const denyMessage = deny ?? (contextDenied ? errorText(contextQuery.error) : null);

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
      toast.success(
        result.posted ? "Service posted to the folio." : "Service recorded on the stay.",
      );
      refreshKeys(queryClient);
      void queryClient.invalidateQueries({ queryKey: ["reservation-folio"] });
      onOpenChange(false);
    },
    onError: (error) => {
      if (isPermissionDeniedMessage(error)) setDeny(errorText(error));
      else toast.error(errorText(error));
    },
  });

  if (denyMessage) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="sm:max-w-[560px]">
          <PermissionDeniedPanel message={denyMessage} />
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
      <p className="text-xs text-muted-foreground">
        Add Service posts a stay extra to the folio. Operational Guest Services requests use Guest Request.
      </p>
      {pickFirst ? (
        <div className="space-y-2" data-testid="fo-service-catalogue">
          <Label htmlFor="fo-service-catalogue-search">Catalogue</Label>
          <Input
            id="fo-service-catalogue-search"
            placeholder="Search catalogue"
            value={catalogueSearch}
            onChange={(e) => setCatalogueSearch(e.target.value)}
          />
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-border p-1">
            {filteredCatalogue.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={
                    selectedCatalogueId === item.id
                      ? "w-full rounded-lg bg-[#C89933]/15 px-3 py-2 text-left text-sm"
                      : "w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
                  }
                  onClick={() => {
                    setSelectedCatalogueId(item.id);
                    setName(item.name);
                    setAmount(String(item.defaultAmount));
                  }}
                >
                  {item.name} · {money(item.defaultAmount)}
                </button>
              </li>
            ))}
          </ul>
          <Label htmlFor="fo-service-name">Service</Label>
          <Input id="fo-service-name" value={name} readOnly placeholder="Select a catalogue item" />
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="fo-service-name">Service</Label>
          <Input
            id="fo-service-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Late checkout"
          />
          <p className="text-xs text-muted-foreground">{catalogueHint ?? CATALOGUE_EMPTY_HINT}</p>
        </div>
      )}
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
          {
            label: "amount",
            previous: money(0),
            next: Number.isFinite(amountNumber) ? money(amountNumber) : "—",
          },
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
        <Textarea
          id="fo-special-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
        />
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
  const fetchSummary = useServerFn(getFrontOfficeGuestServiceSummary);
  const create = useServerFn(createGuestServiceRequest);
  const [serviceTypeId, setServiceTypeId] = useState("");
  const [priority, setPriority] = useState<GuestServicePriority>("normal");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [deny, setDeny] = useState<string | null>(null);

  const summaryQuery = useQuery({
    queryKey: ["front-office", "guest-services", restaurantId, stay.id],
    queryFn: () =>
      fetchSummary({ data: { restaurantId, reservationId: stay.id, guestId: stay.guestId } }),
    enabled: open,
    retry: false,
  });

  useEffect(() => {
    if (open) {
      setPriority("normal");
      setDescription("");
      setNotes("");
      setDeny(null);
    }
  }, [open, stay.id]);

  useEffect(() => {
    const first = summaryQuery.data?.types[0]?.id;
    if (open && first && !summaryQuery.data?.types.some((type) => type.id === serviceTypeId)) {
      setServiceTypeId(first);
    }
  }, [open, summaryQuery.data, serviceTypeId]);

  const typesConfigured = summaryQuery.data?.typesConfigured === true;
  const canConfirm = canConfirmFoGuestServiceRequest({
    serviceTypeId,
    description,
    typesConfigured,
  });

  const mutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          restaurantId,
          guestId: stay.guestId,
          serviceTypeId,
          priority,
          description: description.trim(),
          reservationId: stay.id,
          specialInstructions: notes.trim() || undefined,
        },
      }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Guest service request created.");
      refreshKeys(queryClient);
      onOpenChange(false);
    },
    onError: (error) => {
      if (isPermissionDeniedMessage(error)) setDeny(errorText(error));
      else toast.error(errorText(error));
    },
  });

  if (deny || (summaryQuery.isError && isPermissionDeniedMessage(summaryQuery.error))) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="sm:max-w-[560px]">
          <PermissionDeniedPanel
            message={deny ?? errorText(summaryQuery.error)}
          />
        </SheetContent>
      </Sheet>
    );
  }

  if (summaryQuery.data?.permissionDenied) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="sm:max-w-[560px]">
          <PermissionDeniedPanel message="You don't have access to Guest Services for this stay." />
        </SheetContent>
      </Sheet>
    );
  }

  const selected = summaryQuery.data?.types.find((type) => type.id === serviceTypeId);

  return (
    <FoAmendSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Guest Request"
      stay={stay}
      confirmLabel="Create request"
      confirmDisabled={!canConfirm}
      pending={mutation.isPending}
      onConfirm={() => mutation.mutate()}
    >
      <p className="text-xs text-muted-foreground">
        Creates a Guest Services request for {stay.guestName}
        {stay.roomNumber ? ` · Room ${stay.roomNumber}` : ""} · {stay.confirmationNumber}.
      </p>
      {!summaryQuery.data?.available && !summaryQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Guest Services is unavailable until its workspace is configured.</p>
      ) : null}
      {summaryQuery.data && !typesConfigured ? (
        <p className="text-sm text-muted-foreground">{GUEST_SERVICES_NO_TYPES}</p>
      ) : null}
      <div className="space-y-2">
        <Label>Service type</Label>
        <Select value={serviceTypeId} onValueChange={setServiceTypeId} disabled={!typesConfigured}>
          <SelectTrigger>
            <SelectValue placeholder="Select a type" />
          </SelectTrigger>
          <SelectContent>
            {(summaryQuery.data?.types ?? []).map((type) => (
              <SelectItem key={type.id} value={type.id}>
                {type.categoryName ? `${type.categoryName} · ${type.name}` : type.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Priority</Label>
        <Select value={priority} onValueChange={(value) => setPriority(value as GuestServicePriority)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GUEST_SERVICE_PRIORITIES.map((value) => (
              <SelectItem key={value} value={value}>
                {GUEST_SERVICE_PRIORITY_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="fo-guest-request-text">Description</Label>
        <Textarea
          id="fo-guest-request-text"
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, GUEST_SERVICE_DESCRIPTION_MAX))}
          rows={4}
          placeholder="What did the guest ask for?"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="fo-guest-request-notes">Notes</Label>
        <Textarea
          id="fo-guest-request-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value.slice(0, GUEST_SERVICE_DESCRIPTION_MAX))}
          rows={2}
          placeholder="Optional instructions"
        />
      </div>
      <BeforeAfterCard
        rows={[
          { label: "type", previous: "—", next: selected?.name ?? "—" },
          { label: "priority", previous: "—", next: GUEST_SERVICE_PRIORITY_LABELS[priority] },
          { label: "request", previous: "—", next: description.trim() || "—" },
        ]}
        rate={rateImpact({ roomSubtotal: null, nightlyRates: null })}
      />
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
