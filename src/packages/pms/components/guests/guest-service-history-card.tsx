import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ConciergeBell, Printer, StickyNote } from "lucide-react";
import { toast } from "sonner";

import { useOptionalGuestProfileActions } from "@/packages/pms/components/guests/guest-profile-actions";
import { isInHouseStay, isUpcomingStay, reservationHref, type GuestStay } from "@/packages/pms/lib/guest-profile-wave3";
import {
  GUEST_SERVICES_COPY,
  GUEST_SERVICES_EMPTY,
  GUEST_SERVICES_NO_TYPES,
  GUEST_SERVICES_TITLE,
  GUEST_SERVICE_DESCRIPTION_MAX,
  GUEST_SERVICE_PRIORITIES,
  GUEST_SERVICE_PRIORITY_LABELS,
  GUEST_SERVICE_STATUSES,
  GUEST_SERVICE_STATUS_LABELS,
  filterGuestServices,
  guestServiceCounts,
  guestServiceRowActions,
  popularServiceTypes,
  type GuestServicePriority,
  type GuestServiceStayScope,
  type GuestServiceStatus,
} from "@/packages/pms/lib/guest-services-workspace";
import {
  createGuestServiceRequest,
  listGuestServiceWorkspace,
  listGuestStays,
  updateGuestServiceRequest,
  type GuestServiceHistoryItem,
} from "@/packages/pms/lib/guests.functions";
import { propertyToday } from "@/packages/pms/lib/reservation-dates";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Textarea } from "@/shared/components/ui/textarea";
import { cn } from "@/shared/lib/utils";

type RequestFor = "current" | "future" | "general";

export function GuestServiceHistoryCard({
  restaurantId,
  guestId,
  guestName,
  guestProfileNumber,
  timezone,
  onOpenBookings,
}: {
  restaurantId: string;
  guestId: string;
  guestName: string;
  guestProfileNumber?: string | null;
  timezone: string;
  onOpenBookings?: () => void;
}) {
  const queryClient = useQueryClient();
  const profileActions = useOptionalGuestProfileActions();
  const fetchWorkspace = useServerFn(listGuestServiceWorkspace);
  const fetchStays = useServerFn(listGuestStays);
  const createRequest = useServerFn(createGuestServiceRequest);
  const updateRequest = useServerFn(updateGuestServiceRequest);
  const today = propertyToday(timezone);
  const tableRef = useRef<HTMLDivElement | null>(null);

  const [stayScope, setStayScope] = useState<GuestServiceStayScope>("all");
  const [statusFilter, setStatusFilter] = useState<GuestServiceStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(true);
  const [draftTypeId, setDraftTypeId] = useState("");
  const [draftPriority, setDraftPriority] = useState<GuestServicePriority>("normal");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftRequestFor, setDraftRequestFor] = useState<RequestFor>("general");
  const [draftFutureStayId, setDraftFutureStayId] = useState("");
  const [draftPreferredAt, setDraftPreferredAt] = useState("");
  const [draftInstructions, setDraftInstructions] = useState("");
  const [draftAssignedId, setDraftAssignedId] = useState("");

  const workspaceQuery = useQuery({
    queryKey: ["guest-service-history", restaurantId, guestId, "page"],
    queryFn: () => fetchWorkspace({ data: { restaurantId, guestId } }),
    retry: false,
  });
  const staysQuery = useQuery({
    queryKey: ["guest-stays", restaurantId, guestId],
    queryFn: () => fetchStays({ data: { restaurantId, guestId } }),
    retry: false,
  });

  const items = workspaceQuery.data?.items ?? [];
  const types = workspaceQuery.data?.types ?? [];
  const staff = workspaceQuery.data?.staff ?? [];
  const notes = workspaceQuery.data?.notes ?? [];
  const stays = staysQuery.data?.stays ?? [];
  const currentStay = stays.find((stay) => isInHouseStay(stay.status)) ?? null;
  const futureStays = stays.filter((stay) => isUpcomingStay(stay.status, stay.arrivalDate, today));
  const activeTypes = types.filter((type) => type.active);
  const popular = popularServiceTypes(items, types);

  const filtered = useMemo(
    () =>
      filterGuestServices(items, stays, {
        search,
        status: statusFilter,
        stayScope,
        today,
      }),
    [items, stays, search, statusFilter, stayScope, today],
  );
  const counts = guestServiceCounts(
    stayScope === "all" && statusFilter === "all" && !search.trim()
      ? items
      : filterGuestServices(items, stays, { search: "", status: "all", stayScope, today }),
  );
  const selected = filtered.find((row) => row.id === selectedId) ?? items.find((row) => row.id === selectedId) ?? null;

  useEffect(() => {
    if (currentStay) setDraftRequestFor("current");
  }, [currentStay?.id]);

  useEffect(() => {
    if (!draftTypeId && activeTypes[0]) setDraftTypeId(activeTypes[0].id);
  }, [activeTypes, draftTypeId]);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["guest-service-history", restaurantId, guestId] });
  }

  const createMutation = useMutation({
    mutationFn: () => {
      const reservationId = reservationForDraft(draftRequestFor, currentStay, futureStays, draftFutureStayId);
      if (draftRequestFor === "current" && !currentStay) {
        throw new Error("This guest has no current stay.");
      }
      if (draftRequestFor === "future" && !reservationId) {
        throw new Error("Select a future stay for this request.");
      }
      if (!draftTypeId) throw new Error("Select a service type.");
      return createRequest({
        data: {
          restaurantId,
          guestId,
          serviceTypeId: draftTypeId,
          priority: draftPriority,
          description: draftDescription,
          reservationId,
          preferredAt: draftPreferredAt ? new Date(draftPreferredAt).toISOString() : null,
          specialInstructions: draftInstructions.trim() || undefined,
          assignedMembershipId: draftAssignedId || null,
        },
      });
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Service request created.");
      setDraftDescription("");
      setDraftInstructions("");
      setSelectedId(result.id);
      setCreating(false);
      invalidate();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "The request could not be created.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: {
      requestId: string;
      status?: GuestServiceStatus;
      assignedMembershipId?: string | null;
      notes?: string;
    }) => updateRequest({ data: { restaurantId, guestId, ...input } }),
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Service request updated.");
      invalidate();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "The request could not be updated.");
    },
  });

  function openCreate(typeId?: string) {
    if (typeId) setDraftTypeId(typeId);
    setCreating(true);
  }

  function printHistory() {
    window.print();
  }

  if (workspaceQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading guest services…</p>;
  }
  if (workspaceQuery.isError) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-6" data-testid="guest-services-page">
        <h2 className="font-display text-xl">{GUEST_SERVICES_TITLE}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {workspaceQuery.error instanceof Error
            ? workspaceQuery.error.message
            : "Guest services could not be loaded."}
        </p>
        <Button className="mt-3" variant="outline" onClick={() => void workspaceQuery.refetch()}>
          Retry
        </Button>
      </div>
    );
  }
  if (!workspaceQuery.data?.available) {
    return (
      <div
        className="rounded-2xl border border-dashed border-border bg-card p-6"
        data-testid="guest-services-page"
      >
        <h2 className="font-display text-xl">{GUEST_SERVICES_TITLE}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Service requests are unavailable until Guest Overview migration 0086 is applied.
        </p>
      </div>
    );
  }

  const summaryCards: Array<{ key: GuestServiceStatus | "all"; label: string; value: number }> = [
    { key: "all", label: "All Requests", value: counts.all },
    { key: "completed", label: "Completed", value: counts.completed },
    { key: "in_progress", label: "In Progress", value: counts.in_progress },
    { key: "requested", label: "Pending", value: counts.requested },
    { key: "cancelled", label: "Cancelled", value: counts.cancelled },
  ];

  return (
    <div className="space-y-4" data-testid="guest-services-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">{GUEST_SERVICES_TITLE}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{GUEST_SERVICES_COPY}</p>
        </div>
        <Button onClick={() => openCreate()} data-testid="guest-services-new">
          <ConciergeBell className="mr-2 size-4" />
          New Service Request
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Select value={stayScope} onValueChange={(value) => setStayScope(value as GuestServiceStayScope)}>
          <SelectTrigger data-testid="guest-services-stay">
            <SelectValue placeholder="Stay" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All requests</SelectItem>
            <SelectItem value="current">
              {currentStay ? `Current Stay (${currentStay.confirmationNumber})` : "Current stay"}
            </SelectItem>
            <SelectItem value="future">Future stays</SelectItem>
            <SelectItem value="previous">Previous stays</SelectItem>
            <SelectItem value="general">General guest request</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as GuestServiceStatus | "all")}
        >
          <SelectTrigger data-testid="guest-services-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {GUEST_SERVICE_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {GUEST_SERVICE_STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search request no., type, room, stay…"
          data-testid="guest-services-search"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {summaryCards.map((card) => (
          <button
            key={card.key}
            type="button"
            className={cn(
              "rounded-2xl border border-border bg-card p-4 text-left",
              statusFilter === card.key && "ring-2 ring-primary/40",
            )}
            onClick={() => setStatusFilter(card.key)}
          >
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{card.label}</p>
            <p className="mt-1 font-display text-2xl">{card.value}</p>
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <div
            ref={tableRef}
            className="overflow-hidden rounded-2xl border border-border bg-card"
            data-testid="guest-services-table"
          >
            {activeTypes.length === 0 && items.length === 0 ? (
              <div className="p-6">
                <p className="text-sm text-muted-foreground">{GUEST_SERVICES_NO_TYPES}</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-6">
                <p className="text-sm text-muted-foreground">{GUEST_SERVICES_EMPTY}</p>
                <Button className="mt-3" onClick={() => openCreate()}>
                  New Service Request
                </Button>
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Request No.</th>
                    <th className="px-4 py-3">Service Type</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Request Time</th>
                    <th className="px-4 py-3">Requested By</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Assigned To</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr
                      key={item.id}
                      className={cn("border-t border-border", selectedId === item.id && "bg-muted/30")}
                    >
                      <td className="px-4 py-3 font-medium">{item.requestNumber ?? "—"}</td>
                      <td className="px-4 py-3">
                        {item.serviceName}
                        {item.serviceActive ? null : (
                          <Badge variant="secondary" className="ml-2">
                            Inactive
                          </Badge>
                        )}
                      </td>
                      <td className="max-w-[14rem] truncate px-4 py-3 text-muted-foreground">
                        {item.notes ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDateTime(item.requestedAt, timezone)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{item.requestedByName ?? "—"}</td>
                      <td className="px-4 py-3">{GUEST_SERVICE_STATUS_LABELS[item.status]}</td>
                      <td className="px-4 py-3 text-muted-foreground">{item.assignedName ?? "—"}</td>
                      <td className="px-4 py-3">
                        <RowActions
                          item={item}
                          staff={staff}
                          busy={updateMutation.isPending}
                          onView={() => {
                            setSelectedId(item.id);
                            setCreating(false);
                          }}
                          onUpdate={(patch) => updateMutation.mutate({ requestId: item.id, ...patch })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-border bg-card p-5" data-testid="guest-services-popular">
              <h3 className="font-display text-lg">Popular Services</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Counts are this guest&apos;s real requests against configured Guest Service Types.
              </p>
              {popular.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">{GUEST_SERVICES_NO_TYPES}</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {popular.map((type) => (
                    <li key={type.id} className="flex items-center justify-between gap-3 text-sm">
                      <div>
                        <p className="font-medium">
                          {type.name}
                          {type.active ? null : (
                            <Badge variant="secondary" className="ml-2">
                              Inactive
                            </Badge>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">{type.count} requests</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!type.active}
                        onClick={() => openCreate(type.id)}
                      >
                        Request
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-2xl border border-border bg-card p-5" data-testid="guest-services-notes">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-lg">Guest Notes (Services)</h3>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => profileActions?.openNote()}
                  disabled={!profileActions?.canManage}
                >
                  <StickyNote className="mr-2 size-4" />
                  Add Note
                </Button>
              </div>
              {notes.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">No guest notes recorded yet.</p>
              ) : (
                <ul className="mt-3 space-y-3 text-sm">
                  {notes.map((note) => (
                    <li key={note.id}>
                      <p>{note.text}</p>
                      <p className="text-xs text-muted-foreground">
                        {note.authorName ?? "Staff"} · {formatDateTime(note.createdAt, timezone)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>

        <div className="space-y-4">
          {creating ? (
            <section className="rounded-2xl border border-border bg-card p-5" data-testid="guest-services-create">
              <h3 className="font-display text-lg">Create Service Request</h3>
              {activeTypes.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">{GUEST_SERVICES_NO_TYPES}</p>
              ) : (
                <form
                  className="mt-3 grid gap-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    createMutation.mutate();
                  }}
                >
                  <div className="grid gap-1.5">
                    <Label htmlFor="guest-service-type">Service Type</Label>
                    <Select value={draftTypeId} onValueChange={setDraftTypeId}>
                      <SelectTrigger id="guest-service-type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeTypes.map((type) => (
                          <SelectItem key={type.id} value={type.id}>
                            {type.categoryName} · {type.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Priority</Label>
                    <Select
                      value={draftPriority}
                      onValueChange={(value) => setDraftPriority(value as GuestServicePriority)}
                    >
                      <SelectTrigger>
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
                  <div className="grid gap-1.5">
                    <Label htmlFor="guest-service-description">Description</Label>
                    <Textarea
                      id="guest-service-description"
                      value={draftDescription}
                      maxLength={GUEST_SERVICE_DESCRIPTION_MAX}
                      onChange={(event) => setDraftDescription(event.target.value)}
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      {draftDescription.length}/{GUEST_SERVICE_DESCRIPTION_MAX}
                    </p>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Request For</Label>
                    <Select
                      value={draftRequestFor}
                      onValueChange={(value) => setDraftRequestFor(value as RequestFor)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="current" disabled={!currentStay}>
                          Current Stay{currentStay ? ` (${currentStay.confirmationNumber})` : ""}
                        </SelectItem>
                        <SelectItem value="future" disabled={futureStays.length === 0}>
                          Future Stay
                        </SelectItem>
                        <SelectItem value="general">General Request</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {draftRequestFor === "future" && futureStays.length > 1 ? (
                    <div className="grid gap-1.5">
                      <Label>Future stay</Label>
                      <Select value={draftFutureStayId} onValueChange={setDraftFutureStayId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select stay" />
                        </SelectTrigger>
                        <SelectContent>
                          {futureStays.map((stay) => (
                            <SelectItem key={stay.id} value={stay.id}>
                              {stay.confirmationNumber}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  <div className="grid gap-1.5">
                    <Label htmlFor="guest-service-preferred">Preferred Time</Label>
                    <Input
                      id="guest-service-preferred"
                      type="datetime-local"
                      value={draftPreferredAt}
                      onChange={(event) => setDraftPreferredAt(event.target.value)}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="guest-service-instructions">Special Instructions</Label>
                    <Textarea
                      id="guest-service-instructions"
                      value={draftInstructions}
                      maxLength={GUEST_SERVICE_DESCRIPTION_MAX}
                      onChange={(event) => setDraftInstructions(event.target.value)}
                    />
                  </div>
                  {staff.length > 0 ? (
                    <div className="grid gap-1.5">
                      <Label>Assigned To</Label>
                      <Select
                        value={draftAssignedId || "unassigned"}
                        onValueChange={(value) => setDraftAssignedId(value === "unassigned" ? "" : value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Unassigned" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">Unassigned</SelectItem>
                          {staff.map((member) => (
                            <SelectItem key={member.id} value={member.id}>
                              {member.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setCreating(false)}
                      disabled={!selected}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createMutation.isPending}>
                      Submit Request
                    </Button>
                  </div>
                </form>
              )}
            </section>
          ) : selected ? (
            <section className="rounded-2xl border border-border bg-card p-5" data-testid="guest-services-detail">
              <h3 className="font-display text-lg">{selected.requestNumber ?? "Service request"}</h3>
              <dl className="mt-3 space-y-2 text-sm">
                <DetailRow label="Service" value={selected.serviceName} />
                <DetailRow label="Status" value={GUEST_SERVICE_STATUS_LABELS[selected.status]} />
                <DetailRow label="Priority" value={GUEST_SERVICE_PRIORITY_LABELS[selected.priority]} />
                <DetailRow label="Requested" value={formatDateTime(selected.requestedAt, timezone)} />
                <DetailRow
                  label="Preferred"
                  value={selected.preferredAt ? formatDateTime(selected.preferredAt, timezone) : "—"}
                />
                <DetailRow label="Stay" value={selected.confirmationNumber ?? "General request"} />
                <DetailRow label="Room" value={selected.roomNumber} />
                <DetailRow label="Requested by" value={selected.requestedByName} />
                <DetailRow label="Assigned to" value={selected.assignedName} />
                <DetailRow label="Description" value={selected.notes} />
              </dl>
              <Button className="mt-3" variant="outline" onClick={() => setCreating(true)}>
                New Service Request
              </Button>
            </section>
          ) : (
            <section className="rounded-2xl border border-dashed border-border bg-card p-5">
              <p className="text-sm text-muted-foreground">
                Select a request to view details, or create a new service request.
              </p>
              <Button className="mt-3" onClick={() => openCreate()}>
                New Service Request
              </Button>
            </section>
          )}

          <section
            className="rounded-2xl border border-border bg-card p-5"
            data-testid="guest-services-quick-actions"
          >
            <h3 className="font-display text-lg">Quick Actions</h3>
            <div className="mt-3 grid gap-2">
              <Button onClick={() => openCreate()}>New Service Request</Button>
              <Button
                variant="outline"
                onClick={() => {
                  setStayScope("all");
                  setStatusFilter("all");
                  setSearch("");
                  tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                View All Service Requests
              </Button>
              <Button
                variant="outline"
                onClick={() => profileActions?.openNote()}
                disabled={!profileActions?.canManage}
              >
                <StickyNote className="mr-2 size-4" />
                Add Note
              </Button>
              {currentStay ? (
                <Button asChild variant="outline">
                  <Link
                    to="/restaurant/pms/reservations/$reservationId"
                    params={{ reservationId: currentStay.id }}
                    title={reservationHref(currentStay.id)}
                    onClick={() => onOpenBookings?.()}
                  >
                    Open Current Stay
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" disabled>
                  Open Current Stay
                </Button>
              )}
              <Button asChild variant="outline">
                <Link to="/restaurant/pms/guest-services">Guest Services</Link>
              </Button>
              <Button variant="outline" onClick={printHistory} data-testid="guest-services-print">
                <Printer className="mr-2 size-4" />
                Print Service History
              </Button>
            </div>
          </section>
        </div>
      </div>

      <article className="guest-services-print hidden print:block" data-testid="guest-services-print">
        <h1>{guestName}</h1>
        <p>
          Profile no. {guestProfileNumber ?? "—"} · {GUEST_SERVICES_TITLE}
        </p>
        <table>
          <thead>
            <tr>
              <th>Request</th>
              <th>Service</th>
              <th>Description</th>
              <th>Requested</th>
              <th>Stay</th>
              <th>Room</th>
              <th>Requested by</th>
              <th>Assigned</th>
              <th>Status</th>
              <th>Completed</th>
              <th>Cancelled</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.id}>
                <td>{item.requestNumber ?? ""}</td>
                <td>{item.serviceName}</td>
                <td>{item.notes ?? ""}</td>
                <td>{item.requestedAt}</td>
                <td>{item.confirmationNumber ?? ""}</td>
                <td>{item.roomNumber ?? ""}</td>
                <td>{item.requestedByName ?? ""}</td>
                <td>{item.assignedName ?? ""}</td>
                <td>{GUEST_SERVICE_STATUS_LABELS[item.status]}</td>
                <td>{item.completedAt ?? ""}</td>
                <td>{item.cancelledAt ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
      <style>{`
        @media print {
          @page { margin: 12mm; }
          body * { visibility: hidden; }
          .guest-services-print, .guest-services-print * { visibility: visible; }
          .guest-services-print {
            display: block !important;
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}

function RowActions({
  item,
  staff,
  busy,
  onView,
  onUpdate,
}: {
  item: GuestServiceHistoryItem;
  staff: Array<{ id: string; name: string }>;
  busy: boolean;
  onView: () => void;
  onUpdate: (patch: { status?: GuestServiceStatus; assignedMembershipId?: string | null }) => void;
}) {
  const actions = guestServiceRowActions(item.status);
  return (
    <div className="flex flex-wrap gap-1">
      <Button size="sm" variant="ghost" onClick={onView}>
        View
      </Button>
      {actions.start ? (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => onUpdate({ status: "in_progress" })}>
          Start
        </Button>
      ) : null}
      {actions.complete ? (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => onUpdate({ status: "completed" })}>
          Complete
        </Button>
      ) : null}
      {actions.cancel ? (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => onUpdate({ status: "cancelled" })}>
          Cancel
        </Button>
      ) : null}
      {actions.assign && staff.length > 0 ? (
        <Select
          value={item.assignedMembershipId ?? "unassigned"}
          onValueChange={(value) =>
            onUpdate({ assignedMembershipId: value === "unassigned" ? null : value })
          }
        >
          <SelectTrigger className="h-8 w-[8.5rem]" disabled={busy}>
            <SelectValue placeholder="Assign" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {staff.map((member) => (
              <SelectItem key={member.id} value={member.id}>
                {member.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value?.trim() ? value : "—"}</dd>
    </div>
  );
}

function reservationForDraft(
  requestFor: RequestFor,
  currentStay: GuestStay | null,
  futureStays: GuestStay[],
  futureStayId: string,
): string | null {
  if (requestFor === "general") return null;
  if (requestFor === "current") return currentStay?.id ?? null;
  if (futureStayId) return futureStayId;
  return futureStays[0]?.id ?? null;
}

function formatDateTime(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(iso));
}
