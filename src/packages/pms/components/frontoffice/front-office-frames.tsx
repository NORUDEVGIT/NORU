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
import { PermissionDeniedPanel } from "@/packages/pms/components/frontoffice/coming-soon-panel";
import {
  FoAmendGuestsSheet,
  FoAmendServiceSheet,
  FoAmendSpecialRequestSheet,
  FoAmendUpgradeSheet,
  FoGuestRequestSheet,
  type FoAmendKind,
} from "@/packages/pms/components/frontoffice/fo-amend-sheet";
import { ReservationAmendmentsTab } from "@/packages/pms/components/bookings/reservation-amendments";
import { ReservationCancellationsTab } from "@/packages/pms/components/bookings/reservation-cancellations";
import { ReservationStatusBadge, formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import {
  CheckInDialog,
  NoShowDialog,
  RoomMoveDialog,
  StayDatesDialog,
  WalkInDialog,
} from "@/packages/pms/components/frontoffice/front-office-dialogs";
import { FoCancelStepper } from "@/packages/pms/components/frontoffice/fo-cancel-stepper";
import { WalkInsHistoryFrame } from "@/packages/pms/components/frontoffice/walk-ins-history-frame";
import { isPermissionDeniedMessage, stayFromReservation } from "@/packages/pms/lib/front-office-shell";
import { listArrivals, listInHouse, type FrontOfficeStay } from "@/packages/pms/lib/frontoffice.functions";
import {
  amendReservation,
  getReservation,
  listReservations,
} from "@/packages/pms/lib/reservations.functions";
import { searchFrontOfficeStays } from "@/packages/pms/lib/fo-search1.functions";
import {
  FO_SEARCH_ACTION_LABELS,
  FO_SEARCH_MATCH_LABELS,
  NO_STAYS_FOUND,
  SEARCH_DEBOUNCE_MS,
  SEARCH_HINT,
  companyGroupSoftLine,
  isSearchReady,
  searchEmpty,
  type FoSearchActionId,
} from "@/packages/pms/lib/fo-search1";

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
  const [checkInStay, setCheckInStay] = useState<FrontOfficeStay | null>(null);
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl">Walk-ins</h2>
        <p className="text-sm text-muted-foreground">
          Create today&apos;s stay, then finish registration, deposit and key.
        </p>
      </div>
      <Button onClick={() => setOpen(true)}>New walk-in</Button>
      <WalkInsHistoryFrame restaurantId={restaurantId} today={today} />
      <WalkInDialog
        restaurantId={restaurantId}
        today={today}
        open={open}
        onOpenChange={setOpen}
        onCreated={setCheckInStay}
      />
      {checkInStay ? (
        <CheckInDialog
          restaurantId={restaurantId}
          stay={checkInStay}
          open
          initialStep="registration"
          onOpenChange={(v) => !v && setCheckInStay(null)}
        />
      ) : null}
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
  const fetchReservations = useServerFn(listReservations);
  const [search, setSearch] = useState("");
  const [move, setMove] = useState<FrontOfficeStay | null>(null);
  const [dates, setDates] = useState<FrontOfficeStay | null>(null);
  const [amend, setAmend] = useState<FrontOfficeStay | null>(null);
  const [sheet, setSheet] = useState<{ stay: FrontOfficeStay; kind: FoAmendKind } | null>(null);
  const rows = inHouseQuery.data ?? [];

  const searchQuery = useQuery({
    queryKey: ["front-office", "amend-search", restaurantId, search],
    queryFn: () =>
      fetchReservations({
        data: {
          restaurantId,
          page: 1,
          pageSize: 8,
          ...(search.trim() ? { search: search.trim() } : {}),
        },
      }),
    enabled: search.trim().length > 1,
    retry: false,
  });

  const found = (searchQuery.data?.rows ?? []).map((row) => stayFromReservation(row, today));
  const visible = search.trim().length > 1 ? found : rows;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl">Amendments</h2>
        <p className="text-sm text-muted-foreground">
          Find a stay, then Move, Extend, Upgrade / Downgrade, Guests, Add Service, Special Request, Guest Request or Notes.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="fo-amend-find">Find stay</Label>
        <Input
          id="fo-amend-find"
          placeholder="Guest or confirmation"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium">{search.trim().length > 1 ? "Matching stays" : "In-house stays"}</h3>
        {inHouseQuery.isLoading && search.trim().length <= 1 ? (
          <p className="text-sm text-muted-foreground">Loading stays…</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {search.trim().length > 1 ? "No matching stays." : "Nobody is in-house to amend."}
          </p>
        ) : (
          <ul className="space-y-2">
            {visible.map((stay) => (
              <li key={stay.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card p-3">
                <div>
                  <p className="font-medium">{stay.guestName}</p>
                  <p className="text-xs text-muted-foreground">
                    Room {stay.roomNumber ?? "—"} · {stay.confirmationNumber}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setMove(stay)}>
                    Move
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setDates(stay)}>
                    Extend
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setSheet({ stay, kind: "upgrade" })}>
                    Upgrade / Downgrade
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setSheet({ stay, kind: "guests" })}>
                    Guests
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setSheet({ stay, kind: "service" })}>
                    Add Service
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setSheet({ stay, kind: "special" })}>
                    Special Request
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setSheet({ stay, kind: "guest_request" })}>
                    Guest Request
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setAmend(stay)}>
                    Notes
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
      {sheet?.kind === "upgrade" ? (
        <FoAmendUpgradeSheet restaurantId={restaurantId} stay={sheet.stay} open onOpenChange={(v) => !v && setSheet(null)} />
      ) : null}
      {sheet?.kind === "guests" ? (
        <FoAmendGuestsSheet restaurantId={restaurantId} stay={sheet.stay} open onOpenChange={(v) => !v && setSheet(null)} />
      ) : null}
      {sheet?.kind === "service" ? (
        <FoAmendServiceSheet restaurantId={restaurantId} stay={sheet.stay} open onOpenChange={(v) => !v && setSheet(null)} />
      ) : null}
      {sheet?.kind === "special" ? (
        <FoAmendSpecialRequestSheet restaurantId={restaurantId} stay={sheet.stay} open onOpenChange={(v) => !v && setSheet(null)} />
      ) : null}
      {sheet?.kind === "guest_request" ? (
        <FoGuestRequestSheet restaurantId={restaurantId} stay={sheet.stay} open onOpenChange={(v) => !v && setSheet(null)} />
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
          Cancel a confirmed stay. Post the cancel fee or a supervisor may waive it, then confirm.
        </p>
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
  return <FoCancelStepper restaurantId={restaurantId} stay={stay} open={open} onOpenChange={onOpenChange} />;
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
          Mark today&apos;s confirmed arrivals as no-show. Post the no-show charge or a supervisor may waive it, then confirm.
        </p>
      </div>

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

export { ExceptionsFrame } from "@/packages/pms/components/frontoffice/fo-exceptions-frame";

export function GuestSearchDialog({
  restaurantId,
  today,
  open,
  onOpenChange,
  onOpenStay,
  onShowOnRack,
  onCheckIn,
  onCheckOut,
  onCancel,
}: {
  restaurantId: string;
  today: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onOpenStay: (stay: FrontOfficeStay) => void;
  onShowOnRack: (stay: FrontOfficeStay) => void;
  onCheckIn: (stay: FrontOfficeStay) => void;
  onCheckOut: (stay: FrontOfficeStay) => void;
  onCancel: (stay: FrontOfficeStay) => void;
}) {
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const fetchStays = useServerFn(searchFrontOfficeStays);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(term), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [term]);

  useEffect(() => {
    if (open) return;
    setTerm("");
    setDebounced("");
  }, [open]);

  const ready = isSearchReady(debounced);
  const searchQuery = useQuery({
    queryKey: ["front-office", "global-search", restaurantId, today, debounced.trim()],
    queryFn: () =>
      fetchStays({
        data: { restaurantId, today, search: debounced.trim() },
      }),
    enabled: open && ready,
    retry: false,
  });

  function runAction(action: FoSearchActionId, stay: FrontOfficeStay) {
    if (action === "open_stay") onOpenStay(stay);
    if (action === "show_on_rack") onShowOnRack(stay);
    if (action === "check_in") onCheckIn(stay);
    if (action === "check_out") onCheckOut(stay);
    if (action === "cancel") onCancel(stay);
  }

  if (searchQuery.isError && isPermissionDeniedMessage(searchQuery.error)) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent data-testid="fo-global-search">
          <PermissionDeniedPanel message="You don't have access to guest search for this property." />
        </DialogContent>
      </Dialog>
    );
  }

  const rows = searchQuery.data?.rows ?? [];
  const empty = searchEmpty({ term: debounced, results: rows, loading: searchQuery.isLoading });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl" data-testid="fo-global-search">
        <DialogHeader>
          <DialogTitle>Guest search</DialogTitle>
          <DialogDescription>
            Search confirmation, guest, phone, email, room, company or group already stored for this property.
          </DialogDescription>
        </DialogHeader>
        <Input
          data-testid="fo-global-search-input"
          placeholder="Name, phone, email, confirmation, room, company or group"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        {!ready ? <p className="text-sm text-muted-foreground">{SEARCH_HINT}</p> : null}
        {ready && searchQuery.isLoading ? <p className="text-sm text-muted-foreground">Searching stays…</p> : null}
        {empty ? (
          <p data-testid="fo-search-empty" className="text-sm text-muted-foreground">
            {NO_STAYS_FOUND}
          </p>
        ) : null}
        {rows.length > 0 ? (
          <ul className="max-h-80 space-y-2 overflow-y-auto" data-testid="fo-search-results">
            {rows.map((hit) => {
              const soft = companyGroupSoftLine(hit, hit.matches);
              return (
                <li
                  key={hit.id}
                  data-testid="fo-search-result"
                  className="rounded-xl border border-border bg-card px-3 py-2.5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {hit.guestName} · {hit.confirmationNumber}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{hit.roomNumber ? `Room ${hit.roomNumber}` : "Unassigned"}</span>
                        <span>
                          {formatStayDate(hit.arrivalDate)} → {formatStayDate(hit.departureDate)}
                        </span>
                        <ReservationStatusBadge status={hit.status} />
                      </p>
                      {hit.matches.length > 0 ? (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {hit.matches.map((field) => (
                            <span
                              key={field}
                              data-testid={`fo-search-chip-${field}`}
                              className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                            >
                              {FO_SEARCH_MATCH_LABELS[field]}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {soft.company || soft.group ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {[soft.company, soft.group].filter(Boolean).join(" · ")}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {hit.actions.map((action) => (
                      <Button
                        key={action}
                        type="button"
                        size="sm"
                        variant={action === "open_stay" ? "default" : "outline"}
                        data-testid={`fo-search-action-${action}`}
                        onClick={() => runAction(action, hit)}
                      >
                        {FO_SEARCH_ACTION_LABELS[action]}
                      </Button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
        {searchQuery.data?.footer ? (
          <p data-testid="fo-search-cap-footer" className="text-xs text-muted-foreground">
            {searchQuery.data.footer}
          </p>
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
