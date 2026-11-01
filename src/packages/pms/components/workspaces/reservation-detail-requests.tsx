import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  ClipboardList,
  Heart,
  MoreHorizontal,
  NotebookPen,
  Plus,
  Search,
  Star,
} from "lucide-react";

import {
  GROUP_PROFILE_PREFERENCE_NOTE,
  isGroupReservation,
} from "@/packages/pms/lib/reservation-detail-group";
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
import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import { reviewDash } from "@/packages/pms/lib/create-reservation-review";
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
import { DETAIL_DASH } from "@/packages/pms/lib/reservation-detail-overview";
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

/* Local helpers (no separate UI file needed) */
const DETAIL_FIELD = "h-9 rounded-lg border-gray-200 bg-white";
const GOLD_BUTTON = "bg-[#4A2C0F] text-white hover:bg-[#3a2209]";

function DetailPage({ testId, children }: { testId?: string; children: ReactNode }) {
  return (
    <div className="space-y-4" data-testid={testId}>
      {children}
    </div>
  );
}

function DetailCard({
  icon: Icon,
  title,
  description,
  action,
  testId,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  testId?: string;
  children?: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4" data-testid={testId}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-[#251605]">
            {Icon ? <Icon className="size-4 text-muted-foreground" /> : null}
            {title}
          </h3>
          {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function DetailFooter({ left, children }: { left?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 bg-white py-3">
      <div>{left}</div>
      <div className="flex gap-2">{children}</div>
    </div>
  );
}

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
  /** Kept so existing callers still compile; the side summary was removed. */
  coverUrl?: string | null;
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

  const [section, setSection] = useState<RequestSectionTab>("all");
  const [statusFilter, setStatusFilter] = useState<GuestServiceStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [notes, setNotes] = useState(reservation.notes ?? "");
  const [prefOpen, setPrefOpen] = useState(false);
  const [prefDraft, setPrefDraft] = useState(() => buildRoomPrefDraft(reservation.specialRequests));
  const [occasion, setOccasion] = useState(reservation.specialOccasion ?? "");
  const [createOpen, setCreateOpen] = useState(false);
  const [draftTypeId, setDraftTypeId] = useState("");
  const [draftPriority, setDraftPriority] = useState<GuestServicePriority>("normal");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftPreferredAt, setDraftPreferredAt] = useState("");
  const [draftAssignedId, setDraftAssignedId] = useState(NONE);

  useEffect(() => {
    setNotes(reservation.notes ?? "");
    setPrefDraft(buildRoomPrefDraft(reservation.specialRequests));
    setOccasion(reservation.specialOccasion ?? "");
  }, [reservation.id, reservation.notes, reservation.specialRequests, reservation.specialOccasion]);

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
    mutationFn: (input: {
      specialRequests?: string;
      notes?: string;
      specialOccasion?: string | null;
    }) =>
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
          specialOccasion: input.specialOccasion,
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
    <DetailPage testId="reservation-detail-requests">
      {/* Title, occasion and section tabs */}
      <DetailCard
        icon={Heart}
        title="Requests & Preferences"
        description="Guest preferences and service requests for this reservation."
        action={
          <Button
            type="button"
            size="sm"
            className={GOLD_BUTTON}
            disabled={!editable || activeTypes.length === 0}
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="mr-1 size-3.5" />
            Add Request
          </Button>
        }
      >
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid min-w-48 flex-1 gap-1 text-xs text-muted-foreground">
            Special Occasion
            <Input
              id="reservation-special-occasion"
              className={DETAIL_FIELD}
              maxLength={80}
              disabled={!editable || saveStay.isPending}
              value={occasion}
              onChange={(event) => setOccasion(event.target.value)}
            />
          </label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!editable || saveStay.isPending}
            onClick={() => saveStay.mutate({ specialOccasion: occasion.trim() || null })}
          >
            Save occasion
          </Button>
        </div>
        {servicesQuery.error instanceof Error ? (
          <p className="mt-2 text-sm text-destructive">{servicesQuery.error.message}</p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {REQUEST_SECTION_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={cn(
                "rounded-full px-3.5 py-1 text-xs font-semibold transition-colors",
                section === tab.id
                  ? "bg-[#4A2C0F] text-white"
                  : "bg-gray-100 text-[#251605] hover:bg-gray-200",
              )}
              onClick={() => setSection(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </DetailCard>

      {/* Preferences */}
      {show("guest") || show("room") || show("vip") ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {isGroupReservation(reservation) && show("guest") ? (
            <p className="text-xs text-muted-foreground lg:col-span-2">
              {GROUP_PROFILE_PREFERENCE_NOTE}
            </p>
          ) : null}
          {show("guest") ? (
            <PreferenceCard
              title={
                isGroupReservation(reservation)
                  ? "Primary Guest / Booker Preferences"
                  : "Guest Preferences (from profile)"
              }
              icon={Heart}
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
              icon={Star}
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

      {/* Service requests */}
      {show("service") ? (
        <ServiceRequestsCard
          items={visibleItems}
          types={types}
          staff={staff}
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

      {/* Notes and history */}
      <div className="grid gap-4 lg:grid-cols-2">
        <DetailCard
          icon={NotebookPen}
          title="Internal Notes"
          description="Visible to hotel staff only."
          testId="request-internal-notes"
        >
          <Textarea
            id="request-tab-notes"
            maxLength={REQUEST_NOTES_MAX}
            disabled={!editable}
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, REQUEST_NOTES_MAX))}
            placeholder="Add internal notes here…"
            className="min-h-28 rounded-lg border-gray-200"
          />
          <p className="mt-1 text-right text-[11px] text-muted-foreground">
            {notes.length}/{REQUEST_NOTES_MAX}
          </p>
        </DetailCard>

        <DetailCard
          icon={Bell}
          title="Request History"
          testId="request-history"
          action={
            <Button type="button" size="sm" variant="ghost" onClick={() => setSection("history")}>
              View All
            </Button>
          }
        >
          {compactHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No request history for this stay.</p>
          ) : (
            <ol className="space-y-2 text-xs">
              {compactHistory.map((event) => (
                <li key={event.id} className="border-b border-gray-100 pb-2 last:border-0">
                  <p className="text-muted-foreground">{dateTime(event.at)}</p>
                  <p className="text-[#251605]">{event.text}</p>
                  {event.actor ? <p className="text-muted-foreground">by {event.actor}</p> : null}
                </li>
              ))}
            </ol>
          )}
        </DetailCard>
      </div>

      <DetailFooter
        left={
          <Button type="button" variant="outline" size="sm" onClick={onBackToFolio}>
            Back to Folio & Payments
          </Button>
        }
      >
        <Button
          type="button"
          size="sm"
          className={GOLD_BUTTON}
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
      </DetailFooter>

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
              className={GOLD_BUTTON}
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
                <SelectTrigger className={DETAIL_FIELD}>
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
                <SelectTrigger className={DETAIL_FIELD}>
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
                className={DETAIL_FIELD}
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
                className={DETAIL_FIELD}
                value={draftPreferredAt}
                onChange={(e) => setDraftPreferredAt(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Assigned to</Label>
              <Select value={draftAssignedId} onValueChange={setDraftAssignedId}>
                <SelectTrigger className={DETAIL_FIELD}>
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
              className={GOLD_BUTTON}
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DetailPage>
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
  icon: typeof Heart;
  chips: Array<{ id: string; label: string }>;
  empty: string;
  edit: ReactNode;
}) {
  return (
    <DetailCard icon={icon} title={title} action={edit}>
      {chips.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <span
              key={`${chip.id}-${chip.label}`}
              className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-[#251605]"
            >
              {chip.label}
            </span>
          ))}
        </div>
      )}
    </DetailCard>
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
    <DetailCard
      icon={ClipboardList}
      title="Service Requests"
      description="Track and manage service requests for this reservation."
      testId="service-requests"
      action={
        <div className="flex flex-wrap gap-2">
          <Select
            value={statusFilter}
            onValueChange={(value) =>
              onStatus(value === ALL ? "all" : (value as GuestServiceStatus))
            }
          >
            <SelectTrigger className={`${DETAIL_FIELD} h-8 w-36 text-xs`}>
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
            <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
            <Input
              className={`${DETAIL_FIELD} h-8 w-44 pl-8 text-xs`}
              placeholder="Search requests…"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
            />
          </div>
        </div>
      }
    >
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-muted-foreground">
          No service requests for this reservation.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-gray-200 text-[11px] uppercase tracking-wide text-muted-foreground">
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
                  <tr key={item.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 pr-2">{index + 1}</td>
                    <td className="py-2 pr-2 font-medium">
                      {reviewDash(item.notes || item.serviceName)}
                    </td>
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
    </DetailCard>
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
            : "bg-gray-100 text-muted-foreground",
      )}
    >
      {GUEST_SERVICE_PRIORITY_LABELS[priority]}
    </span>
  );
}