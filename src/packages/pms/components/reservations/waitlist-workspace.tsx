import { useMemo, useState, type ReactNode } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarClock, CircleCheck, Hourglass, ListTodo, Users } from "lucide-react";

import { reservationHistoryChanges } from "@/packages/pms/lib/reservation-history-display";
import {
  WAITLIST_DISPLAY_STATUSES,
  waitlistWorkspaceKpis,
  type WaitlistDetail,
  type WaitlistListRow,
  type WaitlistMatchCandidate,
} from "@/packages/pms/lib/waitlist";
import {
  amendWaitlistRequest,
  cancelWaitlistRequest,
  convertWaitlist,
  createWaitlistOffer,
  createWaitlistRequest,
  getWaitlist,
  listWaitlist,
  matchWaitlist,
  respondWaitlistOffer,
} from "@/packages/pms/lib/waitlist.functions";
import { listGuests } from "@/packages/pms/lib/guests.functions";
import { listRoomTypes } from "@/packages/pms/lib/rooms.functions";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { cn } from "@/shared/lib/utils";

type WaitlistRequestWrite = {
  restaurantId: string;
  guestId: string;
  arrivalDate: string;
  departureDate: string;
  adults: number;
  children: number;
  requestedRoomTypeId?: string | null;
  flexibleDates?: boolean;
  priority?: number;
  notes?: string | null;
};

type WaitlistFn<TIn, TOut> = (input: { data: TIn }) => Promise<TOut>;

export function WaitlistWorkspace({
  restaurantId,
  canWrite,
  onOpenReservation,
}: {
  restaurantId: string;
  canWrite: boolean;
  onOpenReservation: (reservationId: string) => void;
}) {
  const queryClient = useQueryClient();
  const loadList = useServerFn(listWaitlist);
  const loadDetail = useServerFn(getWaitlist);
  const loadRoomTypes = useServerFn(listRoomTypes);
  const loadGuests = useServerFn(listGuests);
  const submitCreate = useServerFn(createWaitlistRequest);
  const submitAmend = useServerFn(amendWaitlistRequest);
  const submitMatch = useServerFn(matchWaitlist);
  const submitOffer = useServerFn(createWaitlistOffer);
  const submitRespond = useServerFn(respondWaitlistOffer);
  const submitConvert = useServerFn(convertWaitlist);
  const submitCancel = useServerFn(cancelWaitlistRequest);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<(typeof WAITLIST_DISPLAY_STATUSES)[number] | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const listQuery = useQuery({
    queryKey: ["pms-waitlist", restaurantId, search, status],
    queryFn: () =>
      loadList({
        data: {
          restaurantId,
          search: search.trim().length >= 2 ? search.trim() : undefined,
          status: status === "all" ? undefined : status,
        },
      }) as Promise<{ requests: WaitlistListRow[] }>,
    placeholderData: keepPreviousData,
  });

  const detailQuery = useQuery({
    queryKey: ["pms-waitlist-detail", restaurantId, selectedId],
    queryFn: () =>
      loadDetail({ data: { restaurantId, requestId: selectedId! } }) as Promise<WaitlistDetail>,
    enabled: selectedId !== null,
  });

  const roomTypesQuery = useQuery({
    queryKey: ["pms-waitlist-room-types", restaurantId],
    queryFn: () => loadRoomTypes({ data: { restaurantId, includeInactive: false } }),
    staleTime: 5 * 60_000,
  });

  const requests = listQuery.data?.requests ?? [];
  const kpis = waitlistWorkspaceKpis(requests);
  const selected = requests.find((row) => row.id === selectedId) ?? null;

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["pms-waitlist", restaurantId] });
    void queryClient.invalidateQueries({ queryKey: ["pms-waitlist-detail", restaurantId] });
  }

  const create = useMutation({
    mutationFn: (input: WaitlistRequestWrite) =>
      submitCreate({ data: input }) as Promise<{ id: string; confirmationNumber: string }>,
    onSuccess: (row) => {
      toast.success(`Waitlist ${row.confirmationNumber} created.`);
      setNewOpen(false);
      setSelectedId(row.id);
      invalidate();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not create waitlist request."),
  });

  return (
    <div className="space-y-4" data-testid="waitlist-workspace">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" aria-label="Waitlist KPIs">
        <Kpi label="Requests" value={kpis.total} loading={listQuery.isLoading} icon={<Users className="size-4" />} />
        <Kpi label="Open" value={kpis.open} loading={listQuery.isLoading} icon={<ListTodo className="size-4" />} />
        <Kpi label="Offered" value={kpis.offered} loading={listQuery.isLoading} icon={<Hourglass className="size-4" />} />
        <Kpi label="Expired" value={kpis.expired} loading={listQuery.isLoading} icon={<CalendarClock className="size-4" />} />
        <Kpi label="Converted" value={kpis.converted} loading={listQuery.isLoading} icon={<CircleCheck className="size-4" />} />
      </section>

      <section className="rounded-xl border border-[#DDD4C5] bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid min-w-52 flex-1 gap-1 text-[11px] font-medium text-muted-foreground">
            Search waitlist
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Confirmation number"
              aria-label="Search waitlist"
            />
          </label>
          <label className="grid gap-1 text-[11px] font-medium text-muted-foreground">
            Status
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={status}
              onChange={(event) => setStatus(event.target.value as typeof status)}
            >
              <option value="all">All statuses</option>
              {WAITLIST_DISPLAY_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          {canWrite ? (
            <Button className="bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]" onClick={() => setNewOpen((open) => !open)}>
              New request
            </Button>
          ) : null}
        </div>
        {newOpen && canWrite ? (
          <WaitlistRequestForm
            roomTypes={roomTypesQuery.data ?? []}
            loadGuests={loadGuests}
            restaurantId={restaurantId}
            submitting={create.isPending}
            onSubmit={(values) => create.mutate({ restaurantId, ...values })}
          />
        ) : null}
      </section>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0 overflow-hidden rounded-xl border border-[#DDD4C5] bg-white shadow-sm">
          {listQuery.isError ? (
            <p className="p-4 text-sm text-destructive">
              {listQuery.error instanceof Error ? listQuery.error.message : "Could not load waitlist."}
            </p>
          ) : listQuery.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : requests.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No waitlist requests for these filters.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-[#F7F4EE] text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Guest</th>
                  <th className="px-3 py-2">Stay</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Priority</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(
                      "cursor-pointer border-b border-border/70 hover:bg-[#F7F4EE]",
                      selectedId === row.id && "bg-[#F4E9D0]",
                    )}
                    onClick={() => setSelectedId(row.id)}
                  >
                    <td className="px-3 py-2">
                      <p className="font-medium">{row.guestName ?? "Guest"}</p>
                      <p className="text-[11px] text-muted-foreground">{row.confirmationNumber}</p>
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {row.arrivalDate} → {row.departureDate}
                    </td>
                    <td className="px-3 py-2 capitalize">{row.displayStatus}</td>
                    <td className="px-3 py-2 tabular-nums">{row.priority}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <aside className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm" data-testid="waitlist-quick-view">
          {!selectedId ? (
            <p className="text-sm text-muted-foreground">Select a waitlist request to match, offer, convert and view history.</p>
          ) : detailQuery.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : detailQuery.isError ? (
            <p className="text-sm text-destructive">
              {detailQuery.error instanceof Error ? detailQuery.error.message : "Could not load waitlist request."}
            </p>
          ) : detailQuery.data ? (
            <WaitlistQuickView
              restaurantId={restaurantId}
              canWrite={canWrite}
              listRow={selected}
              detail={detailQuery.data}
              roomTypes={roomTypesQuery.data ?? []}
              loadGuests={loadGuests}
              onAmend={submitAmend}
              onMatch={submitMatch}
              onOffer={submitOffer}
              onRespond={submitRespond}
              onConvert={submitConvert}
              onCancel={submitCancel}
              onOpenReservation={onOpenReservation}
              onChanged={invalidate}
            />
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  loading,
  icon,
}: {
  label: string;
  value: number;
  loading: boolean;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[#DDD4C5] bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between text-muted-foreground">
        <p className="text-[11px] font-medium uppercase tracking-wide">{label}</p>
        {icon}
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{loading ? "—" : value}</p>
    </div>
  );
}

function WaitlistRequestForm({
  restaurantId,
  roomTypes,
  loadGuests,
  submitting,
  initial,
  onSubmit,
}: {
  restaurantId: string;
  roomTypes: Array<{ id: string; name: string }>;
  loadGuests: WaitlistFn<
    { restaurantId: string; search?: string; limit?: number },
    Array<{ id: string; fullName: string }>
  >;
  submitting: boolean;
  initial?: WaitlistListRow | null;
  onSubmit: (values: Omit<WaitlistRequestWrite, "restaurantId">) => void;
}) {
  const [guestName, setGuestName] = useState(initial?.guestName ?? "");
  const [guestId, setGuestId] = useState(initial?.guestId ?? "");
  const [arrivalDate, setArrivalDate] = useState(initial?.arrivalDate ?? "");
  const [departureDate, setDepartureDate] = useState(initial?.departureDate ?? "");
  const [adults, setAdults] = useState(initial?.adults ?? 1);
  const [children, setChildren] = useState(initial?.children ?? 0);
  const [requestedRoomTypeId, setRequestedRoomTypeId] = useState(initial?.requestedRoomTypeId ?? "");
  const [flexibleDates, setFlexibleDates] = useState(initial?.flexibleDates ?? false);
  const [priority, setPriority] = useState(initial?.priority ?? 3);
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const guestsQuery = useQuery({
    queryKey: ["pms-waitlist-guests", restaurantId, guestName],
    queryFn: () => loadGuests({ data: { restaurantId, search: guestName.trim(), limit: 8 } }),
    enabled: guestName.trim().length >= 2 && guestId === "",
  });

  return (
    <form
      className="mt-3 grid gap-2 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!guestId) {
          toast.error("Select a guest profile before creating a waitlist request.");
          return;
        }
        onSubmit({
          guestId,
          arrivalDate,
          departureDate,
          adults,
          children,
          requestedRoomTypeId: requestedRoomTypeId || null,
          flexibleDates,
          priority,
          notes: notes.trim() || null,
        });
      }}
    >
      <label className="grid gap-1 text-[11px] font-medium text-muted-foreground sm:col-span-2">
        Guest
        <Input
          value={guestName}
          onChange={(event) => {
            setGuestName(event.target.value);
            setGuestId("");
          }}
          placeholder="Search guest"
          required
        />
      </label>
      {guestsQuery.data && guestsQuery.data.length > 0 && !guestId ? (
        <ul className="rounded-md border border-border bg-background sm:col-span-2">
          {guestsQuery.data.map((guest) => (
            <li key={guest.id}>
              <button
                type="button"
                className="w-full px-2 py-1 text-left hover:bg-muted"
                onClick={() => {
                  setGuestId(guest.id);
                  setGuestName(guest.fullName);
                }}
              >
                {guest.fullName}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Input type="date" value={arrivalDate} onChange={(event) => setArrivalDate(event.target.value)} required />
      <Input type="date" value={departureDate} onChange={(event) => setDepartureDate(event.target.value)} required />
      <Input type="number" min={1} value={adults} onChange={(event) => setAdults(Number(event.target.value))} />
      <Input type="number" min={0} value={children} onChange={(event) => setChildren(Number(event.target.value))} />
      <select
        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        value={requestedRoomTypeId}
        onChange={(event) => setRequestedRoomTypeId(event.target.value)}
      >
        <option value="">Any room type</option>
        {roomTypes.map((type) => (
          <option key={type.id} value={type.id}>
            {type.name}
          </option>
        ))}
      </select>
      <select
        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        value={priority}
        onChange={(event) => setPriority(Number(event.target.value))}
      >
        {[1, 2, 3, 4, 5].map((value) => (
          <option key={value} value={value}>
            Priority {value}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" checked={flexibleDates} onChange={(event) => setFlexibleDates(event.target.checked)} />
        Flexible dates
      </label>
      <Input
        className="sm:col-span-2"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="Notes"
      />
      <Button type="submit" className="sm:col-span-2" disabled={submitting}>
        Save request
      </Button>
    </form>
  );
}

function WaitlistQuickView({
  restaurantId,
  canWrite,
  listRow,
  detail,
  roomTypes,
  loadGuests,
  onAmend,
  onMatch,
  onOffer,
  onRespond,
  onConvert,
  onCancel,
  onOpenReservation,
  onChanged,
}: {
  restaurantId: string;
  canWrite: boolean;
  listRow: WaitlistListRow | null;
  detail: WaitlistDetail;
  roomTypes: Array<{ id: string; name: string }>;
  loadGuests: WaitlistFn<
    { restaurantId: string; search?: string; limit?: number },
    Array<{ id: string; fullName: string }>
  >;
  onAmend: WaitlistFn<WaitlistRequestWrite & { requestId: string }, unknown>;
  onMatch: WaitlistFn<{ restaurantId: string; requestId: string }, { candidates: WaitlistMatchCandidate[] }>;
  onOffer: WaitlistFn<
    {
      restaurantId: string;
      requestId: string;
      roomTypeId: string;
      ratePlanId?: string | null;
    },
    unknown
  >;
  onRespond: WaitlistFn<
    {
      restaurantId: string;
      requestId: string;
      offerId: string;
      response: "accepted" | "declined";
    },
    unknown
  >;
  onConvert: WaitlistFn<
    { restaurantId: string; requestId: string; offerId?: string },
    { reservationId: string; confirmationNumber?: string }
  >;
  onCancel: WaitlistFn<{ restaurantId: string; requestId: string }, unknown>;
  onOpenReservation: (reservationId: string) => void;
  onChanged: () => void;
}) {
  const request = detail.request;
  const [amendOpen, setAmendOpen] = useState(false);
  const [candidates, setCandidates] = useState<WaitlistMatchCandidate[] | null>(null);
  const liveOffer = useMemo(
    () => detail.offers.find((offer) => offer.displayStatus === "pending") ?? null,
    [detail.offers],
  );
  const acceptedOffer = useMemo(
    () => detail.offers.find((offer) => offer.displayStatus === "accepted") ?? null,
    [detail.offers],
  );

  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{request.confirmationNumber}</p>
        <h2 className="text-lg font-semibold">{request.guestName ?? "Guest"}</h2>
        <p className="capitalize text-muted-foreground">
          {request.displayStatus} · priority {request.priority}
        </p>
        <p className="tabular-nums">
          {request.arrivalDate} → {request.departureDate} · {request.adults} adults
        </p>
        <p>{request.requestedRoomTypeName ?? "Any room type"}</p>
      </div>

      {request.reservationId ? (
        <Button size="sm" variant="outline" onClick={() => onOpenReservation(request.reservationId!)}>
          Open reservation
        </Button>
      ) : null}

      {canWrite && request.displayStatus !== "converted" && request.displayStatus !== "cancelled" ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setAmendOpen((open) => !open)}>
            Amend
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              void onMatch({ data: { restaurantId, requestId: request.id } })
                .then((result) => setCandidates(result.candidates))
                .catch((error: unknown) =>
                  toast.error(error instanceof Error ? error.message : "Could not match availability."),
                )
            }
          >
            Match availability
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() =>
              void onCancel({ data: { restaurantId, requestId: request.id } })
                .then(() => {
                  toast.success("Waitlist request cancelled.");
                  onChanged();
                })
                .catch((error: unknown) =>
                  toast.error(error instanceof Error ? error.message : "Could not cancel waitlist."),
                )
            }
          >
            Cancel request
          </Button>
        </div>
      ) : null}

      {amendOpen && canWrite && listRow ? (
        <WaitlistRequestForm
          restaurantId={restaurantId}
          roomTypes={roomTypes}
          loadGuests={loadGuests}
          submitting={false}
          initial={listRow}
          onSubmit={(values) =>
            void onAmend({ data: { restaurantId, requestId: request.id, ...values } })
              .then(() => {
                toast.success("Waitlist request updated. Pending offers were cleared.");
                setAmendOpen(false);
                onChanged();
              })
              .catch((error: unknown) =>
                toast.error(error instanceof Error ? error.message : "Could not amend waitlist."),
              )
          }
        />
      ) : null}

      {candidates ? (
        <div>
          <h3 className="mb-2 font-medium">Matches</h3>
          {candidates.length === 0 ? (
            <p className="text-muted-foreground">No sellable availability for these dates.</p>
          ) : (
            <ul className="space-y-2">
              {candidates.map((candidate) => (
                <li key={candidate.roomTypeId} className="rounded-md border border-border p-2">
                  <p className="font-medium">
                    {candidate.name} · {candidate.available} available
                    {candidate.requested ? " · requested" : candidate.alternate ? " · alternate" : ""}
                  </p>
                  {!candidate.occupancyFits ? <p className="text-xs text-destructive">Occupancy exceeds this type.</p> : null}
                  {canWrite && candidate.occupancyFits && candidate.available > 0 ? (
                    <Button
                      size="sm"
                      className="mt-2"
                      onClick={() =>
                        void onOffer({
                          data: {
                            restaurantId,
                            requestId: request.id,
                            roomTypeId: candidate.roomTypeId,
                            ratePlanId: candidate.quotes.find((quote) => !quote.unavailableReason)?.ratePlanId ?? null,
                          },
                        })
                          .then(() => {
                            toast.success("Offer created. Inventory is not held.");
                            setCandidates(null);
                            onChanged();
                          })
                          .catch((error: unknown) =>
                            toast.error(error instanceof Error ? error.message : "Could not create offer."),
                          )
                      }
                    >
                      Create offer
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <div>
        <h3 className="mb-2 font-medium">Offers</h3>
        {detail.offers.length === 0 ? (
          <p className="text-muted-foreground">No offers yet.</p>
        ) : (
          <ul className="space-y-2">
            {detail.offers.map((offer) => (
              <li key={offer.id} className="rounded-md border border-border p-2">
                <p>
                  {offer.roomTypeName} · {offer.arrivalDate} → {offer.departureDate}
                </p>
                <p className="capitalize text-muted-foreground">
                  {offer.displayStatus}
                  {offer.quotedTotal != null ? ` · ${offer.quotedTotal} ${offer.quotedCurrency ?? ""}` : ""}
                </p>
                {canWrite && offer.displayStatus === "pending" ? (
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      onClick={() =>
                        void onRespond({
                          data: { restaurantId, requestId: request.id, offerId: offer.id, response: "accepted" },
                        })
                          .then(() => {
                            toast.success("Offer accepted.");
                            onChanged();
                          })
                          .catch((error: unknown) =>
                            toast.error(error instanceof Error ? error.message : "Could not accept offer."),
                          )
                      }
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void onRespond({
                          data: { restaurantId, requestId: request.id, offerId: offer.id, response: "declined" },
                        })
                          .then(() => {
                            toast.success("Offer declined.");
                            onChanged();
                          })
                          .catch((error: unknown) =>
                            toast.error(error instanceof Error ? error.message : "Could not decline offer."),
                          )
                      }
                    >
                      Decline
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {canWrite && acceptedOffer && !request.reservationId ? (
        <Button
          onClick={() =>
            void onConvert({ data: { restaurantId, requestId: request.id, offerId: acceptedOffer.id } })
              .then((result) => {
                toast.success(`Reservation ${result.confirmationNumber ?? ""} created.`);
                onChanged();
                onOpenReservation(result.reservationId);
              })
              .catch((error: unknown) =>
                toast.error(error instanceof Error ? error.message : "Could not convert waitlist."),
              )
          }
        >
          Convert to reservation
        </Button>
      ) : null}

      {liveOffer ? (
        <p className="text-xs text-muted-foreground">Live offer expires {liveOffer.expiresAt}.</p>
      ) : null}

      <div>
        <h3 className="mb-2 font-medium">History</h3>
        <ul className="space-y-2">
          {detail.history.map((event) => {
            const changes = reservationHistoryChanges(
              event.previous_values ? (JSON.parse(event.previous_values) as Record<string, unknown>) : null,
              event.new_values ? (JSON.parse(event.new_values) as Record<string, unknown>) : null,
            );
            return (
              <li key={event.id}>
                <p className="font-medium">{event.event_type.replaceAll("_", " ")}</p>
                {changes.map((change) => (
                  <p key={change.key} className="text-xs text-muted-foreground">
                    {change.key}: {change.from} → {change.to}
                  </p>
                ))}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
