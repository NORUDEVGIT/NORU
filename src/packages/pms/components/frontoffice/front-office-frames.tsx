import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
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
import { ComingSoonChip, ComingSoonPanel, PermissionDeniedPanel } from "@/packages/pms/components/frontoffice/coming-soon-panel";
import { ReservationAmendmentsTab } from "@/packages/pms/components/bookings/reservation-amendments";
import { ReservationCancellationsTab } from "@/packages/pms/components/bookings/reservation-cancellations";
import { ReservationStatusBadge, formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import {
  NoShowDialog,
  RoomMoveDialog,
  StayDatesDialog,
  WalkInDialog,
} from "@/packages/pms/components/frontoffice/front-office-dialogs";
import { deriveExceptionSlots, isPermissionDeniedMessage, stayFromReservation } from "@/packages/pms/lib/front-office-shell";
import {
  getFrontOfficeDashboard,
  listArrivals,
  listDepartures,
  listInHouse,
  type FrontOfficeStay,
} from "@/packages/pms/lib/frontoffice.functions";
import {
  amendReservation,
  getReservation,
  listReservations,
  setReservationStatus,
} from "@/packages/pms/lib/reservations.functions";
import { listGuests } from "@/packages/pms/lib/guests.functions";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function WalkInsFrame({
  restaurantId,
  today,
}: {
  restaurantId: string;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl">Walk-ins</h2>
        <p className="text-sm text-muted-foreground">
          Create today&apos;s stay and check the guest in with the existing walk-in dialog.
        </p>
      </div>
      <Button onClick={() => setOpen(true)}>New walk-in</Button>
      <ComingSoonPanel
        title="Walk-in history is Coming soon"
        description="Existing reservations are not tagged as walk-ins, so this frame does not invent a walk-in list."
      />
      <WalkInDialog restaurantId={restaurantId} today={today} open={open} onOpenChange={setOpen} />
    </div>
  );
}

export function AmendmentsFrame({
  restaurantId,
  today,
}: {
  restaurantId: string;
  today: string;
}) {
  const fetchInHouse = useServerFn(listInHouse);
  const inHouseQuery = useQuery({
    queryKey: ["front-office", "in-house", restaurantId, today, ""],
    queryFn: () => fetchInHouse({ data: { restaurantId, today } }),
    retry: false,
  });
  const [move, setMove] = useState<FrontOfficeStay | null>(null);
  const [dates, setDates] = useState<FrontOfficeStay | null>(null);
  const [amend, setAmend] = useState<FrontOfficeStay | null>(null);
  const rows = inHouseQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl">Amendments</h2>
        <p className="text-sm text-muted-foreground">
          Room Move and stay-date changes live here. There is no Room Moves sidebar item.
        </p>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium">In-house stays</h3>
        {inHouseQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading stays…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody is in-house to amend.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((stay) => (
              <li key={stay.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card p-3">
                <div>
                  <p className="font-medium">{stay.guestName}</p>
                  <p className="text-xs text-muted-foreground">
                    Room {stay.roomNumber ?? "—"} · {stay.confirmationNumber}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setMove(stay)}>
                    Room Move
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setDates(stay)}>
                    Extend / shorten
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setAmend(stay)}>
                    Amend notes
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-medium">Recent changes</h3>
        <ReservationAmendmentsTab restaurantId={restaurantId} />
      </div>

      {move ? (
        <RoomMoveDialog restaurantId={restaurantId} stay={move} open onOpenChange={(v) => !v && setMove(null)} />
      ) : null}
      {dates ? (
        <StayDatesDialog restaurantId={restaurantId} stay={dates} open onOpenChange={(v) => !v && setDates(null)} />
      ) : null}
      {amend ? (
        <AmendNotesDialog restaurantId={restaurantId} stay={amend} open onOpenChange={(v) => !v && setAmend(null)} />
      ) : null}
    </div>
  );
}

function AmendNotesDialog({
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
  const fetchDetail = useServerFn(getReservation);
  const amend = useServerFn(amendReservation);
  const [notes, setNotes] = useState("");

  const detailQuery = useQuery({
    queryKey: ["reservation", restaurantId, stay.id],
    queryFn: () => fetchDetail({ data: { restaurantId, reservationId: stay.id } }),
    enabled: open,
    retry: false,
  });

  useEffect(() => {
    if (open) setNotes(detailQuery.data?.reservation.notes ?? "");
  }, [open, detailQuery.data?.reservation.notes]);

  const mutation = useMutation({
    mutationFn: async () => {
      const reservation = detailQuery.data?.reservation;
      if (!reservation) throw new Error("Reservation is still loading.");
      return amend({
        data: {
          restaurantId,
          reservationId: stay.id,
          guestId: reservation.guestId,
          roomTypeId: reservation.roomTypeId,
          roomId: reservation.roomId,
          arrival: reservation.arrivalDate,
          departure: reservation.departureDate,
          adults: reservation.adults,
          children: reservation.children,
          specialRequests: reservation.specialRequests,
          notes,
        },
      });
    },
    onSuccess: () => {
      toast.success("Notes saved.");
      void queryClient.invalidateQueries({ queryKey: ["front-office"] });
      void queryClient.invalidateQueries({ queryKey: ["reservation"] });
      void queryClient.invalidateQueries({ queryKey: ["reservation-amendments"] });
      onOpenChange(false);
    },
    onError: (error) => toast.error(errorText(error)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Amend notes</DialogTitle>
          <DialogDescription>
            {stay.confirmationNumber} · uses the existing amend payload (notes only).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="fo-amend-notes">Notes</Label>
          <Textarea
            id="fo-amend-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={mutation.isPending || !detailQuery.data} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Saving…" : "Save notes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CancellationsFrame({ restaurantId }: { restaurantId: string }) {
  const fetchReservations = useServerFn(listReservations);
  const [cancel, setCancel] = useState<FrontOfficeStay | null>(null);

  const activeQuery = useQuery({
    queryKey: ["front-office", "cancellable", restaurantId],
    queryFn: () => fetchReservations({ data: { restaurantId, status: "confirmed", page: 1, pageSize: 50 } }),
    retry: false,
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl">Cancellations</h2>
        <p className="text-sm text-muted-foreground">
          Status cancel is live. Policy and fee posting are Coming soon — this screen will not invent a charge.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <ComingSoonChip label="Cancel policy" />
        <ComingSoonChip label="Cancel fees" />
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium">Confirmed stays</h3>
        {activeQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading reservations…</p>
        ) : (activeQuery.data?.rows ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No confirmed reservations to cancel.</p>
        ) : (
          <ul className="space-y-2">
            {(activeQuery.data?.rows ?? []).map((row) => {
              const stay = stayFromReservation(row, row.arrivalDate);
              return (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card p-3">
                  <div>
                    <p className="font-medium">{row.guestName}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.confirmationNumber} · {formatStayDate(row.arrivalDate)} → {formatStayDate(row.departureDate)}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setCancel(stay)}>
                    Cancel stay
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ReservationCancellationsTab restaurantId={restaurantId} />

      {cancel ? (
        <CancelStayDialog restaurantId={restaurantId} stay={cancel} open onOpenChange={(v) => !v && setCancel(null)} />
      ) : null}
    </div>
  );
}

function CancelStayDialog({
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
  const submit = useServerFn(setReservationStatus);
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      submit({
        data: {
          restaurantId,
          reservationId: stay.id,
          status: "cancelled",
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        },
      }),
    onSuccess: () => {
      toast.success("Reservation cancelled.");
      void queryClient.invalidateQueries({ queryKey: ["front-office"] });
      void queryClient.invalidateQueries({ queryKey: ["reservations"] });
      void queryClient.invalidateQueries({ queryKey: ["reservations-cancelled"] });
      onOpenChange(false);
    },
    onError: (error) => toast.error(errorText(error)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel reservation</DialogTitle>
          <DialogDescription>
            {stay.confirmationNumber} · status only. No cancellation fee is posted.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="fo-cancel-reason">Reason (optional)</Label>
          <Textarea id="fo-cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Keep reservation
          </Button>
          <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Cancelling…" : "Cancel stay"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function NoShowsFrame({
  restaurantId,
  today,
}: {
  restaurantId: string;
  today: string;
}) {
  const fetchArrivals = useServerFn(listArrivals);
  const fetchNoShows = useServerFn(listReservations);
  const [mark, setMark] = useState<FrontOfficeStay | null>(null);

  const arrivalsQuery = useQuery({
    queryKey: ["front-office", "arrivals", restaurantId, today, "confirmed", "all"],
    queryFn: () => fetchArrivals({ data: { restaurantId, date: today, status: "confirmed" } }),
    retry: false,
  });
  const noShowQuery = useQuery({
    queryKey: ["front-office", "no-shows", restaurantId],
    queryFn: () => fetchNoShows({ data: { restaurantId, status: "no_show", page: 1, pageSize: 100 } }),
    retry: false,
  });

  const arrivals = arrivalsQuery.data ?? [];
  const recorded = noShowQuery.data?.rows ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl">No-Shows</h2>
        <p className="text-sm text-muted-foreground">
          Mark today&apos;s confirmed arrivals with the existing no-show action. Charges stay Coming soon.
        </p>
      </div>
      <ComingSoonChip label="No-show charges" />

      <div className="space-y-3">
        <h3 className="text-sm font-medium">Today&apos;s confirmed arrivals</h3>
        {arrivalsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading arrivals…</p>
        ) : arrivals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No confirmed arrivals to mark.</p>
        ) : (
          <ul className="space-y-2">
            {arrivals.map((stay) => (
              <li key={stay.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card p-3">
                <div>
                  <p className="font-medium">{stay.guestName}</p>
                  <p className="text-xs text-muted-foreground">{stay.confirmationNumber}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setMark(stay)}>
                  Mark no-show
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Confirmation</th>
              <th className="px-4 py-3">Guest</th>
              <th className="px-4 py-3">Stay</th>
            </tr>
          </thead>
          <tbody>
            {recorded.map((row) => (
              <tr key={row.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <Link
                    to="/restaurant/pms/reservations/$reservationId"
                    params={{ reservationId: row.id }}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {row.confirmationNumber}
                  </Link>
                </td>
                <td className="px-4 py-3">{row.guestName}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatStayDate(row.arrivalDate)} → {formatStayDate(row.departureDate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {noShowQuery.isLoading ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Loading no-shows…</p>
        ) : recorded.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">No no-shows recorded yet.</p>
        ) : null}
      </div>

      {mark ? (
        <NoShowDialog
          restaurantId={restaurantId}
          stay={mark}
          today={today}
          open
          onOpenChange={(v) => !v && setMark(null)}
        />
      ) : null}
    </div>
  );
}

export function ExceptionsFrame({
  restaurantId,
  today,
}: {
  restaurantId: string;
  today: string;
}) {
  const fetchArrivals = useServerFn(listArrivals);
  const fetchInHouse = useServerFn(listInHouse);
  const fetchDepartures = useServerFn(listDepartures);
  const fetchDashboard = useServerFn(getFrontOfficeDashboard);

  const arrivalsQuery = useQuery({
    queryKey: ["front-office", "arrivals", restaurantId, today, "all", "unassigned"],
    queryFn: () => fetchArrivals({ data: { restaurantId, date: today, assignment: "unassigned" } }),
    retry: false,
  });
  const inHouseQuery = useQuery({
    queryKey: ["front-office", "in-house", restaurantId, today, ""],
    queryFn: () => fetchInHouse({ data: { restaurantId, today } }),
    retry: false,
  });
  const departuresQuery = useQuery({
    queryKey: ["front-office", "departures", restaurantId, today],
    queryFn: () => fetchDepartures({ data: { restaurantId, date: today } }),
    retry: false,
  });
  const dashboardQuery = useQuery({
    queryKey: ["front-office", "dashboard", restaurantId, today],
    queryFn: () => fetchDashboard({ data: { restaurantId, today } }),
    retry: false,
  });

  const denied =
    [arrivalsQuery, inHouseQuery, departuresQuery, dashboardQuery].find(
      (q) => q.isError && isPermissionDeniedMessage(q.error),
    )?.error ?? null;

  if (denied) {
    return (
      <PermissionDeniedPanel
        {...(denied instanceof Error ? { message: denied.message } : {})}
      />
    );
  }

  const slots = deriveExceptionSlots({
    unassignedArrivals: arrivalsQuery.data?.length ?? 0,
    overstays: (inHouseQuery.data ?? []).filter((s) => s.overstay).length,
    dueOutInHouse: (departuresQuery.data ?? []).filter((s) => s.status === "checked_in").length,
    outOfOrder: dashboardQuery.data?.outOfOrder ?? 0,
    outOfService: dashboardQuery.data?.outOfService ?? 0,
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl">Exceptions</h2>
        <p className="text-sm text-muted-foreground">
          Counts are derived from Live lists only. Missing exception types stay Coming soon.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {slots.map((slot) => (
          <div key={slot.id} className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{slot.label}</p>
            {slot.lane === "coming_soon" ? (
              <ComingSoonChip className="mt-2" label="Count" />
            ) : (
              <p className="mt-2 font-display text-3xl">{slot.count ?? 0}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function GuestSearchDialog({
  restaurantId,
  open,
  onOpenChange,
}: {
  restaurantId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [term, setTerm] = useState("");
  const fetchGuests = useServerFn(listGuests);
  const fetchReservations = useServerFn(listReservations);

  const guestsQuery = useQuery({
    queryKey: ["front-office", "guest-search", restaurantId, term],
    queryFn: () =>
      fetchGuests({
        data: {
          restaurantId,
          status: "active" as const,
          limit: 8,
          ...(term.trim() ? { search: term.trim() } : {}),
        },
      }),
    enabled: open,
    retry: false,
  });
  const reservationsQuery = useQuery({
    queryKey: ["front-office", "reservation-search", restaurantId, term],
    queryFn: () =>
      fetchReservations({
        data: {
          restaurantId,
          page: 1,
          pageSize: 8,
          ...(term.trim() ? { search: term.trim() } : {}),
        },
      }),
    enabled: open && term.trim().length > 0,
    retry: false,
  });

  if (guestsQuery.isError && isPermissionDeniedMessage(guestsQuery.error)) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <PermissionDeniedPanel message="You don't have access to guest search for this property." />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Guest search</DialogTitle>
          <DialogDescription>Search guests and confirmation numbers already stored for this property.</DialogDescription>
        </DialogHeader>
        <Input
          placeholder="Name, phone, email or confirmation"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Guests</p>
          <ul className="max-h-40 space-y-1 overflow-y-auto">
            {(guestsQuery.data ?? []).map((g) => (
              <li key={g.id}>
                <Link
                  to="/restaurant/pms/reservations/guests/$guestId"
                  params={{ guestId: g.id }}
                  className="block rounded-lg px-3 py-2 text-sm hover:bg-accent"
                  onClick={() => onOpenChange(false)}
                >
                  {g.fullName}
                  <span className="ml-2 text-xs text-muted-foreground">{g.phone ?? g.email ?? ""}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        {term.trim() ? (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Reservations</p>
            <ul className="max-h-40 space-y-1 overflow-y-auto">
              {(reservationsQuery.data?.rows ?? []).map((r) => (
                <li key={r.id}>
                  <Link
                    to="/restaurant/pms/reservations/$reservationId"
                    params={{ reservationId: r.id }}
                    className="block rounded-lg px-3 py-2 text-sm hover:bg-accent"
                    onClick={() => onOpenChange(false)}
                  >
                    {r.confirmationNumber} · {r.guestName}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function StayPickerDialog({
  title,
  stays,
  loading,
  open,
  onOpenChange,
  onPick,
}: {
  title: string;
  stays: FrontOfficeStay[];
  loading?: boolean;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (stay: FrontOfficeStay) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Pick a stay from Live Front Office lists.</DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading stays…</p>
        ) : stays.length === 0 ? (
          <p className="text-sm text-muted-foreground">No matching stays.</p>
        ) : (
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {stays.map((stay) => (
              <li key={stay.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
                  onClick={() => {
                    onPick(stay);
                    onOpenChange(false);
                  }}
                >
                  <span>
                    {stay.guestName}
                    <span className="ml-2 text-xs text-muted-foreground">{stay.confirmationNumber}</span>
                  </span>
                  <ReservationStatusBadge status={stay.status} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
