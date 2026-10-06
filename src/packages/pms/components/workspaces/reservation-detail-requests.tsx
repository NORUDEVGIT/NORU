import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Bell,
  BedDouble,
  CalendarDays,
  CreditCard,
  FileText,
  Heart,
  MoreHorizontal,
  Plus,
  Search,
  Shield,
  Star,
  UserRound,
} from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  formatStayDate,
  ReservationStatusBadge,
} from "@/packages/pms/components/bookings/reservation-bits";
import { guestInitials, reviewDash } from "@/packages/pms/lib/create-reservation-review";
import {
  GUEST_SERVICE_DESCRIPTION_MAX,
  GUEST_SERVICE_PRIORITIES,
  GUEST_SERVICE_PRIORITY_LABELS,
  GUEST_SERVICE_STATUSES,
  GUEST_SERVICE_STATUS_LABELS,
  allowedServiceStatusTransitions,
  guestServiceRowActions,
  type GuestServicePriority,
  type GuestServiceStatus,
} from "@/packages/pms/lib/guest-services-workspace";
import {
  createGuestServiceRequest,
  listGuestServiceWorkspace,
  updateGuestServiceRequest,
  type GuestPreferences,
  type GuestProfile,
  type GuestServiceHistoryItem,
} from "@/packages/pms/lib/guests.functions";
import { nightsBetween } from "@/packages/pms/lib/reservation-dates";
import {
  DETAIL_DASH,
  depositStatusLabel,
  parseDepositRequirementSnapshot,
  snapshotDisplayName,
  snapshotField,
} from "@/packages/pms/lib/reservation-detail-overview";
import {
  filterServiceRequests,
  guestProfilePreferenceChips,
  REQUEST_NOTES_MAX,
  REQUEST_SECTION_TABS,
  requestHistoryEvents,
  reservationPreferenceChips,
  reservationServiceRequests,
  roomPreferenceChips,
  serviceCategoryLabel,
  serviceStatusLabel,
  vipSpecialChips,
  type RequestSectionTab,
} from "@/packages/pms/lib/reservation-detail-requests";
import {
  buildRoomPrefDraft,
  ROOM_ASSIGNMENT_PREFS,
  specialRequestsFromPrefs,
} from "@/packages/pms/lib/reservation-detail-rooms";
import {
  amendReservation,
  type ReservationDetail,
  type ReservationHistoryEntry,
} from "@/packages/pms/lib/reservations.functions";
import { useRestaurantTime } from "@/core/state/property-format";
import { cn } from "@/shared/lib/utils";

const FIELD =
  "h-8 w-full rounded-md border border-[#DDD4C5] bg-white px-2 text-sm text-[#251605] disabled:cursor-not-allowed disabled:bg-[#F7F2EA]";
const ALL = "__all";
const NONE = "__none";

export function ReservationDetailRequestsTab({
  restaurantId,
  reservation,
  guest,
  preferences,
  history,
  canManage,
  money,
  coverUrl,
  onBackToFolio,
  onSaved,
}: {
  restaurantId: string;
  reservation: ReservationDetail;
  guest: GuestProfile | null;
  preferences: GuestPreferences | null;
  history: ReservationHistoryEntry[];
  canManage: boolean;
  money: (value: number) => string;
  coverUrl: string | null;
  onBackToFolio: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const { dateTime } = useRestaurantTime();
  const fetchServices = useServerFn(listGuestServiceWorkspace);
  const createRequest = useServerFn(createGuestServiceRequest);
  const updateRequest = useServerFn(updateGuestServiceRequest);
  const submitAmend = useServerFn(amendReservation);
  const cancelled = reservation.status === "cancelled";
  const editable = canManage && !cancelled;
  const nights = nightsBetween(reservation.arrivalDate, reservation.departureDate);

  const [section, setSection] = useState<RequestSectionTab>("all");
  const [statusFilter, setStatusFilter] = useState<GuestServiceStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [notes, setNotes] = useState(reservation.notes ?? "");
  const [prefOpen, setPrefOpen] = useState(false);
  const [prefDraft, setPrefDraft] = useState(() => buildRoomPrefDraft(reservation.specialRequests));
  const [createOpen, setCreateOpen] = useState(false);
  const [draftTypeId, setDraftTypeId] = useState("");
  const [draftPriority, setDraftPriority] = useState<GuestServicePriority>("normal");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftPreferredAt, setDraftPreferredAt] = useState("");
  const [draftAssignedId, setDraftAssignedId] = useState(NONE);

  useEffect(() => {
    setNotes(reservation.notes ?? "");
    setPrefDraft(buildRoomPrefDraft(reservation.specialRequests));
  }, [reservation.id, reservation.notes, reservation.specialRequests]);

  const servicesQuery = useQuery({
    queryKey: ["guest-service-history", restaurantId, reservation.guestId, "reservation-detail"],
    queryFn: () => fetchServices({ data: { restaurantId, guestId: reservation.guestId } }),
    retry: false,
  });

  const types = useMemo(() => servicesQuery.data?.types ?? [], [servicesQuery.data?.types]);
  const staff = servicesQuery.data?.staff ?? [];
  const allItems = servicesQuery.data?.items ?? [];
  const stayItems = reservationServiceRequests(allItems, reservation.id);
  const visibleItems = filterServiceRequests(stayItems, { status: statusFilter, search });
  const historyEvents = requestHistoryEvents(stayItems, history);
  const compactHistory = section === "history" ? historyEvents : historyEvents.slice(0, 5);
  const profileChips = guestProfilePreferenceChips(preferences);
  const stayChips = reservationPreferenceChips(reservation.specialRequests);
  const roomChips = roomPreferenceChips(reservation.specialRequests);
  const vipChips = vipSpecialChips({
    guestVip: reservation.guestVip || Boolean(guest?.vipStatus),
    specialRequests: reservation.specialRequests,
  });
  const activeTypes = useMemo(() => types.filter((type) => type.active), [types]);

  useEffect(() => {
    if (!draftTypeId && activeTypes[0]) setDraftTypeId(activeTypes[0].id);
  }, [activeTypes, draftTypeId]);

  function invalidateServices() {
    void queryClient.invalidateQueries({
      queryKey: ["guest-service-history", restaurantId, reservation.guestId],
    });
  }

  const saveStay = useMutation({
    mutationFn: (input: { specialRequests?: string; notes?: string }) =>
      submitAmend({
        data: {
          restaurantId,
          reservationId: reservation.id,
          guestId: reservation.guestId,
          roomTypeId: reservation.roomTypeId,
          roomId: reservation.roomId,
          arrival: reservation.arrivalDate,
          departure: reservation.departureDate,
          adults: reservation.adults,
          children: reservation.children,
          specialRequests: input.specialRequests ?? reservation.specialRequests,
          notes: input.notes ?? notes,
          ratePlanId: reservation.ratePlanId,
        },
      }),
    onSuccess: () => {
      toast.success("Requests updated.");
      setPrefOpen(false);
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createMutation = useMutation({
    mutationFn: () => {
      if (!draftTypeId) throw new Error("Choose a service type.");
      if (!draftDescription.trim()) throw new Error("Enter a request description.");
      return createRequest({
        data: {
          restaurantId,
          guestId: reservation.guestId,
          serviceTypeId: draftTypeId,
          priority: draftPriority,
          description: draftDescription.trim(),
          reservationId: reservation.id,
          preferredAt: draftPreferredAt ? new Date(draftPreferredAt).toISOString() : null,
          assignedMembershipId: draftAssignedId === NONE ? null : draftAssignedId,
        },
      });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Service request created.");
      setCreateOpen(false);
      setDraftDescription("");
      setDraftPreferredAt("");
      invalidateServices();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: (input: {
      requestId: string;
      status?: GuestServiceStatus;
      assignedMembershipId?: string | null;
    }) =>
      updateRequest({
        data: {
          restaurantId,
          guestId: reservation.guestId,
          requestId: input.requestId,
          status: input.status,
          assignedMembershipId: input.assignedMembershipId,
        },
      }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Service request updated.");
      invalidateServices();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const show = (id: RequestSectionTab) => section === "all" || section === id;

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="reservation-detail-requests">
      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          <section className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="flex items-center gap-1.5 font-display text-base text-[#251605]">
                  <Heart className="size-4 text-[#B8954F]" />
                  Requests & Preferences
                </h2>
                <p className="text-xs text-muted-foreground">
                  Manage guest preferences and service requests for this reservation.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={!editable || activeTypes.length === 0}
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="mr-1 size-3.5" />
                Add Request
              </Button>
            </div>
            {servicesQuery.error instanceof Error ? (
              <p className="mb-2 text-sm text-destructive">{servicesQuery.error.message}</p>
            ) : null}
            <div className="flex flex-wrap gap-1">
              {REQUEST_SECTION_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium",
                    section === tab.id ? "bg-[#251605] text-white" : "bg-[#F7F2EA] text-[#251605]",
                  )}
                  onClick={() => setSection(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </section>

          {show("guest") || show("room") || show("vip") ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {show("guest") ? (
                <PreferenceCard
                  title="Guest Preferences (from profile)"
                  icon={<Heart className="size-3.5 text-[#B8954F]" />}
                  chips={profileChips}
                  empty="No guest profile preferences recorded."
                  edit={
                    <Button asChild size="sm" variant="ghost">
                      <Link
                        to="/restaurant/pms/guests/$guestId"
                        params={{ guestId: reservation.guestId }}
                        search={{ card: "preferences" }}
                      >
                        Edit
                      </Link>
                    </Button>
                  }
                />
              ) : null}
              {show("room") || show("vip") || show("guest") ? (
                <PreferenceCard
                  title="Reservation Specific Preferences"
                  icon={<Star className="size-3.5 text-[#B8954F]" />}
                  chips={section === "room" ? roomChips : section === "vip" ? vipChips : stayChips}
                  empty="No reservation-specific preferences recorded."
                  edit={
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={!editable}
                      onClick={() => setPrefOpen(true)}
                    >
                      Edit
                    </Button>
                  }
                />
              ) : null}
            </div>
          ) : null}

          {show("service") ? (
            <ServiceRequestsCard
              items={visibleItems}
              types={types}
              staff={staff}
              money={money}
              dateTime={dateTime}
              statusFilter={statusFilter}
              search={search}
              editable={editable}
              updating={updateMutation.isPending}
              onStatus={setStatusFilter}
              onSearch={setSearch}
              onUpdate={(input) => updateMutation.mutate(input)}
            />
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <section
              className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
              data-testid="request-internal-notes"
            >
              <h2 className="mb-2 font-display text-base text-[#251605]">
                Internal Notes (Requests)
              </h2>
              <p className="mb-2 text-xs text-muted-foreground">
                Internal notes about requests and guest preferences (visible to hotel staff only).
              </p>
              <Textarea
                id="request-tab-notes"
                maxLength={REQUEST_NOTES_MAX}
                disabled={!editable}
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, REQUEST_NOTES_MAX))}
                placeholder="Add internal notes here…"
                className="min-h-24"
              />
              <p className="mt-1 text-right text-[11px] text-muted-foreground">
                {notes.length}/{REQUEST_NOTES_MAX}
              </p>
            </section>
            <section
              className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
              data-testid="request-history"
            >
              <div className="mb-2 flex items-center justify-between">
                <h2 className="flex items-center gap-1.5 font-display text-base text-[#251605]">
                  <Bell className="size-3.5 text-[#B8954F]" />
                  Request History
                </h2>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setSection("history")}
                >
                  View All
                </Button>
              </div>
              {compactHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground">No request history for this stay.</p>
              ) : (
                <ol className="space-y-2 text-xs">
                  {compactHistory.map((event) => (
                    <li key={event.id} className="border-b border-[#F4EEE4] pb-2 last:border-0">
                      <p className="text-muted-foreground">{dateTime(event.at)}</p>
                      <p className="text-[#251605]">{event.text}</p>
                      {event.actor ? (
                        <p className="text-muted-foreground">by {event.actor}</p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </div>
        <RequestsSummaryRail
          reservation={reservation}
          money={money}
          coverUrl={coverUrl}
          nights={nights}
        />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#DDD4C5] bg-white py-3">
        <Button type="button" variant="outline" size="sm" onClick={onBackToFolio}>
          Back to Folio & Payments
        </Button>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            disabled={!editable || saveStay.isPending}
            onClick={() => saveStay.mutate({ notes })}
          >
            Save Changes
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setNotes(reservation.notes ?? "");
              setPrefDraft(buildRoomPrefDraft(reservation.specialRequests));
              setStatusFilter("all");
              setSearch("");
            }}
          >
            Cancel
          </Button>
        </div>
      </div>

      <Dialog open={prefOpen} onOpenChange={setPrefOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reservation specific preferences</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Stored as this reservation’s special requests. Guest Profile preferences are not
            overwritten.
          </p>
          <div className="grid gap-2">
            {ROOM_ASSIGNMENT_PREFS.map((pref) => (
              <label key={pref.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={prefDraft[pref.id]}
                  onCheckedChange={(checked) =>
                    setPrefDraft((current) => ({ ...current, [pref.id]: checked === true }))
                  }
                />
                {pref.label}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPrefOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saveStay.isPending}
              onClick={() =>
                saveStay.mutate({
                  specialRequests: specialRequestsFromPrefs(reservation.specialRequests, prefDraft),
                })
              }
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add service request</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Service Type</Label>
              <Select value={draftTypeId} onValueChange={setDraftTypeId}>
                <SelectTrigger className={FIELD}>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {activeTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Priority</Label>
              <Select
                value={draftPriority}
                onValueChange={(value) => setDraftPriority(value as GuestServicePriority)}
              >
                <SelectTrigger className={FIELD}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GUEST_SERVICE_PRIORITIES.map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      {GUEST_SERVICE_PRIORITY_LABELS[priority]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="request-description">Request</Label>
              <Input
                id="request-description"
                className={FIELD}
                maxLength={GUEST_SERVICE_DESCRIPTION_MAX}
                value={draftDescription}
                onChange={(e) => setDraftDescription(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="request-due">Due time</Label>
              <Input
                id="request-due"
                type="datetime-local"
                className={FIELD}
                value={draftPreferredAt}
                onChange={(e) => setDraftPreferredAt(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Assigned to</Label>
              <Select value={draftAssignedId} onValueChange={setDraftAssignedId}>
                <SelectTrigger className={FIELD}>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Unassigned</SelectItem>
                  {staff.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PreferenceCard({
  title,
  icon,
  chips,
  empty,
  edit,
}: {
  title: string;
  icon: ReactNode;
  chips: Array<{ id: string; label: string }>;
  empty: string;
  edit: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <h2 className="flex items-center gap-1.5 font-display text-base text-[#251605]">
          {icon}
          {title}
        </h2>
        {edit}
      </div>
      {chips.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <span
              key={`${chip.id}-${chip.label}`}
              className="rounded-full border border-[#E4D6B8] bg-[#FBF6EC] px-2.5 py-1 text-xs text-[#251605]"
            >
              {chip.label}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function ServiceRequestsCard({
  items,
  types,
  staff,
  dateTime,
  statusFilter,
  search,
  editable,
  updating,
  onStatus,
  onSearch,
  onUpdate,
}: {
  items: GuestServiceHistoryItem[];
  types: Array<{ id: string; categoryName: string }>;
  staff: Array<{ id: string; name: string }>;
  money: (value: number) => string;
  dateTime: (iso: string | null | undefined) => string;
  statusFilter: GuestServiceStatus | "all";
  search: string;
  editable: boolean;
  updating: boolean;
  onStatus: (status: GuestServiceStatus | "all") => void;
  onSearch: (value: string) => void;
  onUpdate: (input: {
    requestId: string;
    status?: GuestServiceStatus;
    assignedMembershipId?: string | null;
  }) => void;
}) {
  return (
    <section
      className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid="service-requests"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-base text-[#251605]">Service Requests</h2>
          <p className="text-xs text-muted-foreground">
            Track and manage all service requests for this reservation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select
            value={statusFilter}
            onValueChange={(value) =>
              onStatus(value === ALL ? "all" : (value as GuestServiceStatus))
            }
          >
            <SelectTrigger className={`${FIELD} w-40`}>
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Status</SelectItem>
              {GUEST_SERVICE_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {GUEST_SERVICE_STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-2 top-2 size-3.5 text-muted-foreground" />
            <Input
              className={`${FIELD} w-48 pl-7`}
              placeholder="Search requests…"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
            />
          </div>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[#E4D6B8] px-4 py-8 text-center text-sm text-muted-foreground">
          No service requests for this reservation.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-[#EEE6D8] text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-2 pr-2">#</th>
                <th className="py-2 pr-2">Request</th>
                <th className="py-2 pr-2">Category</th>
                <th className="py-2 pr-2">Assigned To</th>
                <th className="py-2 pr-2">Priority</th>
                <th className="py-2 pr-2">Requested For</th>
                <th className="py-2 pr-2">Status</th>
                <th className="py-2 pr-2">Due Time</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const actions = guestServiceRowActions(item.status);
                const transitions = allowedServiceStatusTransitions(item.status);
                return (
                  <tr key={item.id} className="border-b border-[#F4EEE4]">
                    <td className="py-2 pr-2">{index + 1}</td>
                    <td className="py-2 pr-2">{reviewDash(item.notes || item.serviceName)}</td>
                    <td className="py-2 pr-2">{serviceCategoryLabel(item, types)}</td>
                    <td className="py-2 pr-2">{reviewDash(item.assignedName)}</td>
                    <td className="py-2 pr-2">
                      <PriorityPill priority={item.priority} />
                    </td>
                    <td className="py-2 pr-2">
                      {item.preferredAt
                        ? dateTime(item.preferredAt)
                        : formatStayDate(item.requestedAt)}
                    </td>
                    <td className="py-2 pr-2">{serviceStatusLabel(item.status)}</td>
                    <td className="py-2 pr-2">
                      {item.preferredAt ? dateTime(item.preferredAt) : DETAIL_DASH}
                    </td>
                    <td className="py-2">
                      <div className="flex gap-1">
                        {actions.start ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={!editable || updating}
                            onClick={() => onUpdate({ requestId: item.id, status: "in_progress" })}
                          >
                            Start
                          </Button>
                        ) : null}
                        {actions.complete ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={!editable || updating}
                            onClick={() => onUpdate({ requestId: item.id, status: "completed" })}
                          >
                            Complete
                          </Button>
                        ) : null}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              aria-label="Request actions"
                            >
                              <MoreHorizontal className="size-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {transitions.map((status) => (
                              <DropdownMenuItem
                                key={status}
                                disabled={!editable}
                                onClick={() => onUpdate({ requestId: item.id, status })}
                              >
                                Mark {GUEST_SERVICE_STATUS_LABELS[status]}
                              </DropdownMenuItem>
                            ))}
                            {staff.map((member) => (
                              <DropdownMenuItem
                                key={member.id}
                                disabled={!editable || !actions.assign}
                                onClick={() =>
                                  onUpdate({ requestId: item.id, assignedMembershipId: member.id })
                                }
                              >
                                Assign {member.name}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function PriorityPill({ priority }: { priority: GuestServicePriority }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-semibold",
        priority === "urgent"
          ? "bg-red-50 text-red-700"
          : priority === "high"
            ? "bg-amber-50 text-amber-800"
            : "bg-[#F7F2EA] text-[#756A5B]",
      )}
    >
      {GUEST_SERVICE_PRIORITY_LABELS[priority]}
    </span>
  );
}

function RequestsSummaryRail({
  reservation,
  money,
  coverUrl,
  nights,
}: {
  reservation: ReservationDetail;
  money: (value: number) => string;
  coverUrl: string | null;
  nights: number;
}) {
  const deposit = parseDepositRequirementSnapshot(reservation.depositRequirementSnapshot);
  const assigned = Boolean(reservation.roomId && reservation.roomNumber);
  const cancellation = snapshotDisplayName(reservation.cancellationPolicySnapshot);
  const noShow = snapshotField(reservation.refundabilitySnapshot, ["no_show", "no_show_policy"]);
  const earlyDeparture = snapshotField(reservation.refundabilitySnapshot, [
    "early_departure",
    "early_departure_policy",
  ]);
  const stayNightsLabel =
    nights || nightsBetween(reservation.arrivalDate, reservation.departureDate);
  return (
    <aside
      className="h-fit space-y-3 rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm"
      data-testid="reservation-requests-summary"
    >
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Reservation Summary
        </p>
        <div className="mt-1 flex items-center gap-2">
          <p className="font-display text-lg text-[#251605]">{reservation.confirmationNumber}</p>
          <ReservationStatusBadge status={reservation.status} />
        </div>
      </div>
      <div className="flex items-start gap-3 border-t border-[#EEE6D8] pt-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#F4E9D0] text-xs font-semibold text-[#765719]">
          {guestInitials(reservation.guestName)}
        </div>
        <div className="min-w-0">
          <p className="flex items-center gap-1 font-medium text-[#251605]">
            <UserRound className="size-3.5 text-[#B8954F]" />
            {reservation.guestName}
            {reservation.guestVip ? (
              <span className="rounded-full bg-[#F4E9D0] px-1.5 py-0.5 text-[10px] font-semibold text-[#765719]">
                VIP
              </span>
            ) : null}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {reviewDash(reservation.guestPhone)}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {reviewDash(reservation.guestEmail)}
          </p>
        </div>
      </div>
      <SummaryBlock
        icon={<CalendarDays className="size-3.5 text-[#B8954F]" />}
        title="Stay Information"
      >
        <p>
          {formatStayDate(reservation.arrivalDate)} → {formatStayDate(reservation.departureDate)} (
          {stayNightsLabel} night{stayNightsLabel === 1 ? "" : "s"})
        </p>
        <p>
          {reservation.adults} Adults · {reservation.children} Children ·{" "}
          {reservation.infants == null ? DETAIL_DASH : reservation.infants} Infants
        </p>
        <p>Purpose: {reviewDash(reservation.purposeOfStay)}</p>
      </SummaryBlock>
      <SummaryBlock
        icon={<BedDouble className="size-3.5 text-[#B8954F]" />}
        title="Room Information"
      >
        <div className="flex gap-2">
          {coverUrl ? (
            <img src={coverUrl} alt="" className="h-12 w-16 rounded-md object-cover" />
          ) : (
            <div className="flex h-12 w-16 items-center justify-center rounded-md bg-[#EFE8DC] text-[#8A7B68]">
              <BedDouble className="size-5" />
            </div>
          )}
          <div>
            <p className="font-medium">{reviewDash(reservation.roomTypeName)}</p>
            <p>{assigned ? `Room ${reservation.roomNumber}` : "Not Assigned"}</p>
            <p>{reviewDash(reservation.ratePlanName)}</p>
          </div>
        </div>
      </SummaryBlock>
      <SummaryBlock icon={<FileText className="size-3.5 text-[#B8954F]" />} title="Rate & Total">
        <p>
          Room Rate{" "}
          {reservation.roomSubtotal == null ? DETAIL_DASH : money(reservation.roomSubtotal)}
        </p>
        <p className="font-medium text-[#251605]">
          Total Amount{" "}
          {reservation.roomSubtotal == null ? DETAIL_DASH : money(reservation.roomSubtotal)}
        </p>
      </SummaryBlock>
      <SummaryBlock
        icon={<CreditCard className="size-3.5 text-[#B8954F]" />}
        title="Guarantee & Deposit"
      >
        <p>{reviewDash(reservation.guaranteeMethod)}</p>
        <p>
          Deposit {deposit?.amount == null ? DETAIL_DASH : money(deposit.amount)} ·{" "}
          {depositStatusLabel(deposit)}
        </p>
      </SummaryBlock>
      <SummaryBlock icon={<Shield className="size-3.5 text-[#B8954F]" />} title="Policies">
        <p>Cancellation: {reviewDash(cancellation)}</p>
        <p>No-show: {reviewDash(noShow)}</p>
        <p>Early departure: {reviewDash(earlyDeparture)}</p>
      </SummaryBlock>
    </aside>
  );
}

function SummaryBlock({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="border-t border-[#EEE6D8] pt-3 text-xs text-muted-foreground">
      <p className="mb-1 flex items-center gap-1 font-medium text-[#251605]">
        {icon}
        {title}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
