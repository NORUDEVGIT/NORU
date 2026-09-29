import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Bell,
  CheckCircle2,
  Clock,
  ConciergeBell,
  Filter,
  Plus,
  Printer,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";

import { useOptionalGuestProfileActions } from "@/packages/pms/components/guests/guest-profile-actions";
import {
  isInHouseStay,
  isUpcomingStay,
  reservationHref,
  type GuestStay,
} from "@/packages/pms/lib/guest-profile-wave3";
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
import { formatStayDate, propertyToday } from "@/packages/pms/lib/reservation-dates";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { Textarea } from "@/shared/components/ui/textarea";
import { cn } from "@/shared/lib/utils";

type RequestFor = "current" | "future" | "general";

function reservationForDraft(
  requestFor: RequestFor,
  currentStay: GuestStay | null,
  futureStays: GuestStay[],
  futureStayId: string,
): string | null {
  if (requestFor === "current") return currentStay?.id ?? null;
  if (requestFor === "future") {
    return futureStays.find((stay) => stay.id === futureStayId)?.id ?? null;
  }
  return null;
}

export function GuestServicesView({
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

  const [stayScope, setStayScope] = useState<GuestServiceStayScope>("all");
  const [statusFilter, setStatusFilter] = useState<GuestServiceStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Drawers
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);

  // Create form draft
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

  const rawStays = staysQuery.data?.stays ?? [];
  const items = workspaceQuery.data?.items ?? [];
  const staff = workspaceQuery.data?.staff ?? [];
  const types = workspaceQuery.data?.types ?? [];
  const activeTypes = useMemo(() => types.filter((t) => t.active), [types]);

  const currentStay = useMemo(
    () => rawStays.find((stay) => isInHouseStay(stay.status)) ?? null,
    [rawStays],
  );
  const futureStays = useMemo(
    () => rawStays.filter((stay) => isUpcomingStay(stay.status, stay.arrivalDate, today)),
    [rawStays, today],
  );

  useEffect(() => {
    if (currentStay) setDraftRequestFor("current");
    else setDraftRequestFor("general");
  }, [currentStay?.id]);

  useEffect(() => {
    if (!draftTypeId && activeTypes[0]) setDraftTypeId(activeTypes[0].id);
  }, [activeTypes, draftTypeId]);

  function invalidate() {
    void queryClient.invalidateQueries({
      queryKey: ["guest-service-history", restaurantId, guestId],
    });
  }

  const createMutation = useMutation({
    mutationFn: () => {
      const reservationId = reservationForDraft(
        draftRequestFor,
        currentStay,
        futureStays,
        draftFutureStayId,
      );
      if (draftRequestFor === "current" && !currentStay) {
        throw new Error("This guest has no active in-house stay.");
      }
      if (draftRequestFor === "future" && !reservationId) {
        throw new Error("Please select a future stay for this request.");
      }
      if (!draftTypeId) throw new Error("Please select a service type.");
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
      toast.success("Service request created successfully.");
      setDraftDescription("");
      setDraftInstructions("");
      setCreateDrawerOpen(false);
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

  const filtered = useMemo(
    () =>
      filterGuestServices(items, rawStays, {
        stayScope,
        status: statusFilter,
        search,
        today,
      }),
    [items, rawStays, stayScope, statusFilter, search, today],
  );

  const counts = guestServiceCounts(items);
  const selectedItem = items.find((item) => item.id === selectedId) ?? null;

  function handleRowClick(item: GuestServiceHistoryItem) {
    setSelectedId(item.id);
    setDetailDrawerOpen(true);
  }

  if (workspaceQuery.isLoading) {
    return (
      <div className="space-y-4" data-testid="guest-services-loading">
        <div className="h-14 rounded-xl border border-[#DDD4C5] bg-white animate-pulse" />
        <div className="h-64 rounded-xl border border-[#DDD4C5] bg-white animate-pulse" />
      </div>
    );
  }

  if (workspaceQuery.isError) {
    return (
      <div
        className="rounded-xl border border-[#DDD4C5] bg-white p-6 text-center text-xs text-[#756A5B]"
        data-testid="guest-services-page"
      >
        <h2 className="font-display text-base font-semibold text-[#251605]">
          {GUEST_SERVICES_TITLE}
        </h2>
        <p className="mt-2 text-[#756A5B]">
          {workspaceQuery.error instanceof Error
            ? workspaceQuery.error.message
            : "Guest services could not be loaded."}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3 border-[#DDD4C5] bg-white text-[#251605] hover:bg-[#F7F4EE]"
          onClick={() => void workspaceQuery.refetch()}
        >
          <RefreshCw className="mr-1.5 size-3.5" /> Try Again
        </Button>
      </div>
    );
  }

  if (!workspaceQuery.data?.available) {
    return (
      <div
        className="rounded-xl border border-[#DDD4C5] bg-white p-6 text-center text-xs text-[#756A5B]"
        data-testid="guest-services-page"
      >
        <h2 className="font-display text-base font-semibold text-[#251605]">
          {GUEST_SERVICES_TITLE}
        </h2>
        <p className="mt-2 text-[#756A5B]">{GUEST_SERVICES_NO_TYPES}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="guest-services-page">
      {/* 5-Cell Status Summary Strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <div className="rounded-xl border border-[#DDD4C5] bg-white px-3 py-2.5 shadow-sm">
          <p className="text-[10px] font-medium text-[#756A5B] uppercase tracking-wider">
            All Requests
          </p>
          <p className="mt-0.5 font-display text-lg font-semibold text-[#251605]">{counts.all}</p>
        </div>
        <div className="rounded-xl border border-[#DDD4C5] bg-white px-3 py-2.5 shadow-sm">
          <p className="text-[10px] font-medium text-[#756A5B] uppercase tracking-wider">Pending</p>
          <p className="mt-0.5 font-display text-lg font-semibold text-amber-700">
            {counts.requested}
          </p>
        </div>
        <div className="rounded-xl border border-[#DDD4C5] bg-white px-3 py-2.5 shadow-sm">
          <p className="text-[10px] font-medium text-[#756A5B] uppercase tracking-wider">
            In Progress
          </p>
          <p className="mt-0.5 font-display text-lg font-semibold text-blue-700">
            {counts.in_progress}
          </p>
        </div>
        <div className="rounded-xl border border-[#DDD4C5] bg-white px-3 py-2.5 shadow-sm">
          <p className="text-[10px] font-medium text-[#756A5B] uppercase tracking-wider">
            Completed
          </p>
          <p className="mt-0.5 font-display text-lg font-semibold text-emerald-700">
            {counts.completed}
          </p>
        </div>
        <div className="rounded-xl border border-[#DDD4C5] bg-white px-3 py-2.5 shadow-sm col-span-2 sm:col-span-1">
          <p className="text-[10px] font-medium text-[#756A5B] uppercase tracking-wider">
            Cancelled
          </p>
          <p className="mt-0.5 font-display text-lg font-semibold text-[#756A5B]">
            {counts.cancelled}
          </p>
        </div>
      </div>

      {/* Operational Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#DDD4C5] bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
          <div className="relative min-w-[180px] flex-1">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#756A5B]" />
            <Input
              placeholder="Search request description, service type…"
              className="h-8 pl-8 text-xs border-[#DDD4C5] bg-white text-[#251605]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <Select
            value={stayScope}
            onValueChange={(val) => setStayScope(val as GuestServiceStayScope)}
          >
            <SelectTrigger className="h-8 w-36 text-xs border-[#DDD4C5] bg-white text-[#251605]">
              <SelectValue placeholder="Stay Scope" />
            </SelectTrigger>
            <SelectContent className="border-[#DDD4C5] bg-white text-xs">
              <SelectItem value="all">All Scopes</SelectItem>
              <SelectItem value="current_stay">Current Stay</SelectItem>
              <SelectItem value="future_stays">Future Stays</SelectItem>
              <SelectItem value="previous_stays">Previous Stays</SelectItem>
              <SelectItem value="general">General</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={statusFilter}
            onValueChange={(val) => setStatusFilter(val as GuestServiceStatus | "all")}
          >
            <SelectTrigger className="h-8 w-32 text-xs border-[#DDD4C5] bg-white text-[#251605]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="border-[#DDD4C5] bg-white text-xs">
              <SelectItem value="all">All Statuses</SelectItem>
              {GUEST_SERVICE_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {GUEST_SERVICE_STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {search || stayScope !== "all" || statusFilter !== "all" ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setStayScope("all");
                setStatusFilter("all");
              }}
              className="h-8 text-xs text-[#756A5B]"
            >
              <X className="mr-1 size-3" /> Clear
            </Button>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="h-8 text-xs border-[#DDD4C5] bg-white text-[#756A5B] hover:bg-[#F7F4EE]"
          >
            <Printer className="mr-1.5 size-3.5" /> Print
          </Button>
          <Button
            size="sm"
            onClick={() => setCreateDrawerOpen(true)}
            className="h-8 text-xs bg-[#8A641A] hover:bg-[#725215] text-white shadow-sm font-medium transition-colors"
            data-testid="guest-services-new-button"
          >
            <Plus className="mr-1.5 size-3.5" /> + New Service Request
          </Button>
        </div>
      </div>

      {/* Dense Requests Table */}
      <div className="rounded-xl border border-[#DDD4C5] bg-white shadow-sm overflow-hidden">
        {workspaceQuery.isLoading ? (
          <div className="p-8 text-center text-xs text-[#756A5B] flex items-center justify-center gap-2">
            <RefreshCw className="size-3.5 animate-spin text-[#8A641A]" />
            <span>Loading service requests…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <p className="text-xs font-medium text-[#251605]">
              {items.length === 0 ? GUEST_SERVICES_EMPTY : "No service requests match the filters."}
            </p>
            <p className="text-[11px] text-[#756A5B]">
              Record housekeeping, maintenance, amenities, or concierge requests for this guest.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" data-testid="guest-services-table">
              <thead className="bg-[#FAF8F5] text-[11px] font-semibold text-[#756A5B] border-b border-[#DDD4C5]">
                <tr>
                  <th className="px-3.5 py-2.5">Request / Description</th>
                  <th className="px-3.5 py-2.5">Stay Context</th>
                  <th className="px-3.5 py-2.5">Service Type</th>
                  <th className="px-3.5 py-2.5">Priority</th>
                  <th className="px-3.5 py-2.5">Preferred At</th>
                  <th className="px-3.5 py-2.5">Assigned To</th>
                  <th className="px-3.5 py-2.5">Status</th>
                  <th className="px-3.5 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#DDD4C5]">
                {filtered.map((item) => {
                  const isSelected = selectedId === item.id;
                  const rowActions = guestServiceRowActions(item.status);
                  return (
                    <tr
                      key={item.id}
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-[#F7F4EE]/60",
                        isSelected ? "bg-[#FBF7EE]" : "bg-white",
                      )}
                      data-testid="guest-service-row"
                      onClick={() => handleRowClick(item)}
                    >
                      <td className="px-3.5 py-2.5 font-medium text-[#251605] max-w-[260px] truncate">
                        {item.notes || item.serviceName}
                      </td>
                      <td className="px-3.5 py-2.5 text-[#756A5B]">
                        {item.confirmationNumber ? (
                          <span className="font-mono text-[11px]">
                            Conf #{item.confirmationNumber}
                          </span>
                        ) : (
                          <span className="text-[11px]">General Profile</span>
                        )}
                      </td>
                      <td className="px-3.5 py-2.5 text-[#251605]">{item.serviceName}</td>
                      <td className="px-3.5 py-2.5">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-medium border",
                            item.priority === "urgent"
                              ? "border-red-300 bg-red-50 text-red-700"
                              : item.priority === "high"
                                ? "border-amber-300 bg-amber-50 text-amber-700"
                                : "border-[#DDD4C5] bg-[#FAF8F5] text-[#756A5B]",
                          )}
                        >
                          {GUEST_SERVICE_PRIORITY_LABELS[item.priority] ?? item.priority}
                        </Badge>
                      </td>
                      <td className="px-3.5 py-2.5 text-[#756A5B]">
                        {item.preferredAt ? formatStayDate(item.preferredAt) : "—"}
                      </td>
                      <td className="px-3.5 py-2.5 text-[#756A5B]">
                        {item.assignedName ?? "Unassigned"}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-medium border",
                            item.status === "completed"
                              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                              : item.status === "in_progress"
                                ? "border-blue-300 bg-blue-50 text-blue-700"
                                : item.status === "cancelled"
                                  ? "border-gray-300 bg-gray-50 text-gray-600"
                                  : "border-amber-300 bg-amber-50 text-amber-700",
                          )}
                        >
                          {GUEST_SERVICE_STATUS_LABELS[item.status] ?? item.status}
                        </Badge>
                      </td>
                      <td className="px-3.5 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                        {rowActions.start ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              updateMutation.mutate({
                                requestId: item.id,
                                status: "in_progress",
                              })
                            }
                            className="h-7 text-xs text-blue-700 hover:bg-blue-50"
                          >
                            Start
                          </Button>
                        ) : rowActions.complete ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              updateMutation.mutate({
                                requestId: item.id,
                                status: "completed",
                              })
                            }
                            className="h-7 text-xs text-emerald-700 hover:bg-emerald-50"
                          >
                            Complete
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Right Creation Drawer for New Service Request */}
      <Sheet open={createDrawerOpen} onOpenChange={setCreateDrawerOpen}>
        <SheetContent className="w-full sm:max-w-md border-l border-[#DDD4C5] bg-white p-0 text-[#251605]">
          <div className="flex h-full flex-col">
            <SheetHeader className="border-b border-[#DDD4C5] p-4 text-left bg-[#FAF8F5]">
              <SheetTitle className="font-display text-base font-semibold text-[#251605]">
                New Service Request
              </SheetTitle>
              <SheetDescription className="text-xs text-[#756A5B]">
                Create an operational service, housekeeping, or concierge request for {guestName}.
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-[#756A5B]">Service Type *</Label>
                <Select value={draftTypeId} onValueChange={setDraftTypeId}>
                  <SelectTrigger className="h-8 text-xs border-[#DDD4C5] bg-white text-[#251605]">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent className="border-[#DDD4C5] bg-white text-xs">
                    {activeTypes.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-[#756A5B]">Stay Scope</Label>
                <Select
                  value={draftRequestFor}
                  onValueChange={(val) => setDraftRequestFor(val as RequestFor)}
                >
                  <SelectTrigger className="h-8 text-xs border-[#DDD4C5] bg-white text-[#251605]">
                    <SelectValue placeholder="Select scope" />
                  </SelectTrigger>
                  <SelectContent className="border-[#DDD4C5] bg-white text-xs">
                    <SelectItem value="general">General (No specific stay)</SelectItem>
                    <SelectItem value="current" disabled={!currentStay}>
                      Current In-House Stay{" "}
                      {currentStay ? `(#${currentStay.confirmationNumber})` : "(None)"}
                    </SelectItem>
                    <SelectItem value="future" disabled={futureStays.length === 0}>
                      Future Stay
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {draftRequestFor === "future" ? (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-[#756A5B]">Select Future Stay</Label>
                  <Select value={draftFutureStayId} onValueChange={setDraftFutureStayId}>
                    <SelectTrigger className="h-8 text-xs border-[#DDD4C5] bg-white text-[#251605]">
                      <SelectValue placeholder="Select future stay" />
                    </SelectTrigger>
                    <SelectContent className="border-[#DDD4C5] bg-white text-xs">
                      {futureStays.map((stay) => (
                        <SelectItem key={stay.id} value={stay.id}>
                          Conf #{stay.confirmationNumber} ({formatStayDate(stay.arrivalDate)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-[#756A5B]">Priority</Label>
                <Select
                  value={draftPriority}
                  onValueChange={(val) => setDraftPriority(val as GuestServicePriority)}
                >
                  <SelectTrigger className="h-8 text-xs border-[#DDD4C5] bg-white text-[#251605]">
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent className="border-[#DDD4C5] bg-white text-xs">
                    {GUEST_SERVICE_PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {GUEST_SERVICE_PRIORITY_LABELS[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-[#756A5B]">Description</Label>
                <Input
                  placeholder="e.g. Extra pillows, late turn-down, airport taxi…"
                  className="h-8 text-xs border-[#DDD4C5] bg-white text-[#251605]"
                  value={draftDescription}
                  maxLength={GUEST_SERVICE_DESCRIPTION_MAX}
                  onChange={(e) => setDraftDescription(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-[#756A5B]">
                  Preferred Time (optional)
                </Label>
                <Input
                  type="datetime-local"
                  className="h-8 text-xs border-[#DDD4C5] bg-white text-[#251605]"
                  value={draftPreferredAt}
                  onChange={(e) => setDraftPreferredAt(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-[#756A5B]">Special Instructions</Label>
                <Textarea
                  rows={2}
                  placeholder="Additional operational instructions for staff…"
                  className="text-xs border-[#DDD4C5] bg-white text-[#251605]"
                  value={draftInstructions}
                  onChange={(e) => setDraftInstructions(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-[#756A5B]">
                  Assign Staff (optional)
                </Label>
                <Select value={draftAssignedId} onValueChange={setDraftAssignedId}>
                  <SelectTrigger className="h-8 text-xs border-[#DDD4C5] bg-white text-[#251605]">
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent className="border-[#DDD4C5] bg-white text-xs">
                    <SelectItem value="">Unassigned</SelectItem>
                    {staff.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border-t border-[#DDD4C5] p-4 bg-[#FAF8F5] flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCreateDrawerOpen(false)}
                className="h-8 text-xs border-[#DDD4C5] bg-white text-[#756A5B]"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!draftTypeId || createMutation.isPending}
                onClick={() => createMutation.mutate()}
                className="h-8 text-xs bg-[#8A641A] hover:bg-[#725215] text-white font-medium"
              >
                {createMutation.isPending ? "Creating…" : "Create Request"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Right Detail & Status Drawer */}
      <Sheet open={detailDrawerOpen} onOpenChange={setDetailDrawerOpen}>
        <SheetContent className="w-full sm:max-w-md border-l border-[#DDD4C5] bg-white p-0 text-[#251605]">
          {selectedItem ? (
            <div className="flex h-full flex-col">
              <SheetHeader className="border-b border-[#DDD4C5] p-4 text-left bg-[#FAF8F5]">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="border-[#DDD4C5] text-[10px] text-[#756A5B]">
                    {selectedItem.serviceName}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="border-amber-300 bg-amber-50 text-amber-700 text-[10px]"
                  >
                    {GUEST_SERVICE_STATUS_LABELS[selectedItem.status] ?? selectedItem.status}
                  </Badge>
                </div>
                <SheetTitle className="font-display text-base font-semibold text-[#251605] mt-1">
                  {selectedItem.notes || selectedItem.serviceName}
                </SheetTitle>
                <SheetDescription className="text-xs text-[#756A5B]">
                  Created {formatStayDate(selectedItem.requestedAt)} by{" "}
                  {selectedItem.requestedByName ?? "Staff"}
                </SheetDescription>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
                <div className="rounded-lg border border-[#DDD4C5] p-3 space-y-2">
                  <h4 className="font-semibold text-[#251605]">Request Overview</h4>
                  <div className="grid grid-cols-2 gap-2 text-[#756A5B]">
                    <div>
                      <span>Priority:</span>
                      <p className="font-medium text-[#251605] capitalize">
                        {selectedItem.priority}
                      </p>
                    </div>
                    <div>
                      <span>Stay Context:</span>
                      <p className="font-medium text-[#251605]">
                        {selectedItem.confirmationNumber
                          ? `Conf #${selectedItem.confirmationNumber}`
                          : "General"}
                      </p>
                    </div>
                    <div>
                      <span>Preferred Time:</span>
                      <p className="font-medium text-[#251605]">
                        {selectedItem.preferredAt
                          ? formatStayDate(selectedItem.preferredAt)
                          : "Anytime"}
                      </p>
                    </div>
                    <div>
                      <span>Assigned Staff:</span>
                      <p className="font-medium text-[#251605]">
                        {selectedItem.assignedName ?? "Unassigned"}
                      </p>
                    </div>
                  </div>
                  {selectedItem.notes ? (
                    <div className="pt-2 border-t border-[#DDD4C5] text-[11px]">
                      <span className="font-medium text-[#756A5B]">Instructions / Notes: </span>
                      <span className="text-[#251605]">{selectedItem.notes}</span>
                    </div>
                  ) : null}
                </div>

                {/* Status Update Actions */}
                <div className="rounded-lg border border-[#DDD4C5] p-3 space-y-2">
                  <h4 className="font-semibold text-[#251605]">Update Status</h4>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {GUEST_SERVICE_STATUSES.map((status) => (
                      <Button
                        key={status}
                        variant={selectedItem.status === status ? "default" : "outline"}
                        size="sm"
                        disabled={updateMutation.isPending || selectedItem.status === status}
                        onClick={() =>
                          updateMutation.mutate({
                            requestId: selectedItem.id,
                            status,
                          })
                        }
                        className={cn(
                          "h-7 text-xs border-[#DDD4C5]",
                          selectedItem.status === status
                            ? "bg-[#8A641A] text-white"
                            : "bg-white text-[#756A5B] hover:bg-[#F7F4EE]",
                        )}
                      >
                        {GUEST_SERVICE_STATUS_LABELS[status]}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="border-t border-[#DDD4C5] p-4 bg-[#FAF8F5] flex items-center justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDetailDrawerOpen(false)}
                  className="h-8 text-xs border-[#DDD4C5] bg-white text-[#756A5B]"
                >
                  Close
                </Button>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
