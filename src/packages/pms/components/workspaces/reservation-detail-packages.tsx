import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { MoreHorizontal, Plus, Search } from "lucide-react";

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
import { ReservationPackageMerchandiseGrid } from "@/packages/pms/components/bookings/reservation-package-merchandise";
import { reviewDash } from "@/packages/pms/lib/create-reservation-review";
import {
  GROUP_PACKAGE_NOTE,
  GROUP_PROFILE_PREFERENCE_NOTE,
  isGroupReservation,
  traceRoomTargets,
} from "@/packages/pms/lib/reservation-detail-group";
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
  addGuestNote,
  createGuestServiceRequest,
  listGuestServiceWorkspace,
  updateGuestServiceRequest,
  type GuestHistoryEntry,
  type GuestPreferences,
  type GuestProfile,
  type GuestServiceHistoryItem,
} from "@/packages/pms/lib/guests.functions";
import {
  completeHousekeepingTask,
  createHousekeepingTask,
  listHousekeepingTasks,
  updateHousekeepingTask,
} from "@/packages/pms/lib/housekeeping.functions";
import { TASK_TYPES, type TaskType } from "@/packages/pms/lib/housekeeping.server";
import { getMealsCard3 } from "@/packages/pms/lib/meals-card3.functions";
import { parsePackageChargeBasis } from "@/packages/pms/lib/meals-card3.server";
import {
  HK_CLEANING_TYPE_LABELS,
  HK_PRIORITY_LABELS,
} from "@/packages/pms/lib/pms-set4-hk-inventory";
import { propertyToday } from "@/packages/pms/lib/reservation-dates";
import {
  buildNotesActivity,
  buildStayNoteRows,
  filterHousekeepingTasks,
  filterStayNotes,
  housekeepingStatusLabel,
  housekeepingTaskLabel,
  labeledHousekeepingTasks,
  NOTE_MAX,
  NOTE_TABS,
  roomHousekeepingTasks,
  TRACE_NO_ROOM_COPY,
  TRACE_ROOM_GAP_COPY,
  TRACE_TABS,
  type NoteTabId,
  type TraceTabId,
} from "@/packages/pms/lib/reservation-detail-notes";
import { DETAIL_DASH } from "@/packages/pms/lib/reservation-detail-overview";
import {
  appliedPackageDescription,
  appliedPackagesTotal,
  buildAvailablePackageCards,
  cataloguePackageById,
  chargeBasisHonestyCopy,
  chargeTypeLabel,
  packageInclusionLabel,
  PACKAGE_BIND_GAP_COPY,
} from "@/packages/pms/lib/reservation-detail-packages";
import {
  filterServiceRequests,
  guestProfilePreferenceChips,
  reservationPreferenceChips,
  reservationServiceRequests,
  serviceCategoryLabel,
  serviceStatusLabel,
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
import {
  getReservationCommercialAttribution,
  listEligiblePackageActivations,
} from "@/packages/pms/lib/revenue/commercial-package.functions";
import { useRestaurantTime } from "@/core/state/property-format";
import { cn } from "@/shared/lib/utils";

/* ------------------------------------------------------------------ */
/* Styling                                                             */
/* ------------------------------------------------------------------ */

const FIELD = "h-9 rounded-lg border-gray-200 bg-white text-sm";
const AREA = "border-gray-200 bg-white text-[#251605]";
const BTN_PRIMARY = "bg-[#4A2C0F] text-white hover:bg-[#3a2209]";
const BTN_OUTLINE = "border-gray-200 bg-white text-[#4A2C0F] hover:bg-gray-50";
const MUTED = "text-muted-foreground";
const TH = "border-b border-gray-200 text-[11px] uppercase tracking-wide";
const ROW = "border-b border-gray-100";
const EMPTY = "rounded-lg border border-dashed border-gray-200 px-4 py-8 text-center text-sm";
const ALL = "__all";
const NONE = "__none";

function pill(active: boolean) {
  return cn(
    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
    active
      ? "border-[#4A2C0F] bg-[#4A2C0F] text-white"
      : "border-gray-200 bg-white text-[#4A2C0F] hover:bg-gray-50",
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="border-b border-gray-200 pb-1 text-base font-bold text-[#4A2C0F]">{title}</h2>
      {children}
    </div>
  );
}

function Card({
  title,
  description,
  action,
  testId,
  children,
}: {
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
          <h3 className="text-sm font-bold text-[#251605]">{title}</h3>
          {description ? <p className={cn("mt-0.5 text-xs", MUTED)}>{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Merged page: Packages + Requests & Preferences + Notes & Traces    */
/* ------------------------------------------------------------------ */

export function ReservationDetailPackagesTab({
  restaurantId,
  reservation,
  guest = null,
  preferences = null,
  history = [],
  guestHistory = [],
  canManage,
  money,
  onSaved,
  onBackToRates,
  onBackToFolio,
  onBackToRequests,
}: {
  restaurantId: string;
  reservation: ReservationDetail;
  canManage: boolean;
  money: (value: number) => string;
  guest?: GuestProfile | null;
  preferences?: GuestPreferences | null;
  history?: ReservationHistoryEntry[];
  guestHistory?: GuestHistoryEntry[];
  onSaved?: () => void;
  // Kept optional so existing callers still compile; the first one given is used.
  onBackToRates?: () => void;
  onBackToFolio?: () => void;
  onBackToRequests?: () => void;
  coverUrl?: string | null;
}) {
  const queryClient = useQueryClient();
  const { dateTime, timezone } = useRestaurantTime();
  const today = propertyToday(timezone);

  const fetchCatalogue = useServerFn(getMealsCard3);
  const fetchEligible = useServerFn(listEligiblePackageActivations);
  const fetchCommercial = useServerFn(getReservationCommercialAttribution);
  const fetchServices = useServerFn(listGuestServiceWorkspace);
  const createRequest = useServerFn(createGuestServiceRequest);
  const updateRequest = useServerFn(updateGuestServiceRequest);
  const fetchTasks = useServerFn(listHousekeepingTasks);
  const createTask = useServerFn(createHousekeepingTask);
  const updateTask = useServerFn(updateHousekeepingTask);
  const completeTask = useServerFn(completeHousekeepingTask);
  const submitAmend = useServerFn(amendReservation);
  const submitGuestNote = useServerFn(addGuestNote);

  const editable = canManage && reservation.status !== "cancelled";
  const currency = reservation.currency?.trim() || "ETB";
  const groupReservation = isGroupReservation(reservation);
  const onBack = onBackToRates ?? onBackToFolio ?? onBackToRequests;

  /* ---------------- state ---------------- */

  // Requests
  const [statusFilter, setStatusFilter] = useState<GuestServiceStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [occasion, setOccasion] = useState(reservation.specialOccasion ?? "");
  const [prefOpen, setPrefOpen] = useState(false);
  const [prefDraft, setPrefDraft] = useState(() => buildRoomPrefDraft(reservation.specialRequests));
  const [createOpen, setCreateOpen] = useState(false);
  const [draftTypeId, setDraftTypeId] = useState("");
  const [draftPriority, setDraftPriority] = useState<GuestServicePriority>("normal");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftPreferredAt, setDraftPreferredAt] = useState("");
  const [draftAssignedId, setDraftAssignedId] = useState(NONE);

  // Notes
  const [notes, setNotes] = useState(reservation.notes ?? "");
  const [noteTab, setNoteTab] = useState<NoteTabId>("all");
  const [guestNoteOpen, setGuestNoteOpen] = useState(false);
  const [guestNoteText, setGuestNoteText] = useState("");

  // Traces
  const [traceTab, setTraceTab] = useState<TraceTabId>("all");
  const [traceSearch, setTraceSearch] = useState("");
  const [traceOpen, setTraceOpen] = useState(false);
  const [taskType, setTaskType] = useState<TaskType>("stayover_cleaning");
  const [taskNotes, setTaskNotes] = useState("");
  const [activityAll, setActivityAll] = useState(false);

  useEffect(() => {
    setNotes(reservation.notes ?? "");
    setOccasion(reservation.specialOccasion ?? "");
    setPrefDraft(buildRoomPrefDraft(reservation.specialRequests));
  }, [reservation.id, reservation.notes, reservation.specialRequests, reservation.specialOccasion]);

  /* ---------------- queries ---------------- */

  const catalogueQuery = useQuery({
    queryKey: ["meals-card3", restaurantId, "reservation-detail-packages"],
    queryFn: () => fetchCatalogue({ data: { restaurantId } }),
    retry: false,
  });
  const eligibleQuery = useQuery({
    queryKey: [
      "eligible-packages",
      restaurantId,
      reservation.ratePlanId,
      reservation.roomTypeId,
      reservation.arrivalDate,
      reservation.departureDate,
    ],
    queryFn: () =>
      fetchEligible({
        data: {
          restaurantId,
          ratePlanId: reservation.ratePlanId!,
          roomTypeId: reservation.roomTypeId,
          arrivalDate: reservation.arrivalDate,
          departureDate: reservation.departureDate,
          reservationId: reservation.id,
        },
      }),
    enabled: Boolean(reservation.ratePlanId),
    retry: false,
  });
  const commercialQuery = useQuery({
    queryKey: ["reservation-commercial", restaurantId, reservation.id, "packages"],
    queryFn: () =>
      fetchCommercial({
        data: {
          restaurantId,
          reservationId: reservation.id,
          roomSubtotal: reservation.roomSubtotal,
        },
      }),
    retry: false,
  });
  const servicesQuery = useQuery({
    queryKey: ["guest-service-history", restaurantId, reservation.guestId, "reservation-detail"],
    queryFn: () => fetchServices({ data: { restaurantId, guestId: reservation.guestId } }),
    retry: false,
  });

  const traceTargets = traceRoomTargets(reservation);
  const hasTraceRoom = groupReservation ? traceTargets.length > 0 : Boolean(reservation.roomId);
  const tasksQuery = useQuery({
    queryKey: ["housekeeping-tasks", restaurantId, today, "reservation-notes"],
    queryFn: () => fetchTasks({ data: { restaurantId, today } }),
    enabled: hasTraceRoom,
    retry: false,
  });

  /* ---------------- derived data ---------------- */

  // Packages
  const catalogue = catalogueQuery.data?.snapshot.packages ?? [];
  const components = catalogueQuery.data?.snapshot.components ?? [];
  const applied = commercialQuery.data?.packages ?? [];
  const availableCards = buildAvailablePackageCards({
    catalogue,
    components,
    eligible: eligibleQuery.data ?? [],
    roomTypeId: reservation.roomTypeId,
    ratePlanId: reservation.ratePlanId,
  });
  const appliedTotal = appliedPackagesTotal(applied);

  // Requests
  const types = useMemo(() => servicesQuery.data?.types ?? [], [servicesQuery.data?.types]);
  const staff = servicesQuery.data?.staff ?? [];
  const stayItems = reservationServiceRequests(servicesQuery.data?.items ?? [], reservation.id);
  const visibleItems = filterServiceRequests(stayItems, { status: statusFilter, search });
  const profileChips = guestProfilePreferenceChips(preferences);
  const stayChips = reservationPreferenceChips(reservation.specialRequests);
  const activeTypes = useMemo(() => types.filter((type) => type.active), [types]);

  useEffect(() => {
    if (!draftTypeId && activeTypes[0]) setDraftTypeId(activeTypes[0].id);
  }, [activeTypes, draftTypeId]);

  // Notes and traces
  const noteRows = buildStayNoteRows({
    reservation,
    reservationHistory: history,
    guest,
    guestHistory,
  });
  const visibleNotes = filterStayNotes(noteRows, noteTab);
  const roomTasks = groupReservation
    ? labeledHousekeepingTasks(tasksQuery.data ?? [], traceTargets)
    : roomHousekeepingTasks(tasksQuery.data ?? [], reservation.roomId).map((task) => ({
        ...task,
        roomContext: "",
      }));
  const visibleTasks = filterHousekeepingTasks(roomTasks, traceTab, traceSearch);
  const activity = buildNotesActivity({
    reservationHistory: history,
    guestHistory,
    tasks: roomTasks,
  });
  const visibleActivity = activityAll ? activity : activity.slice(0, 8);

  const dirty =
    notes !== (reservation.notes ?? "") || occasion !== (reservation.specialOccasion ?? "");

  /* ---------------- mutations ---------------- */

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
          notes: input.notes ?? reservation.notes,
          ratePlanId: reservation.ratePlanId,
          specialOccasion: input.specialOccasion,
        },
      }),
    onSuccess: () => {
      toast.success("Changes saved.");
      setPrefOpen(false);
      onSaved?.();
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

  const addProfileNote = useMutation({
    mutationFn: () =>
      submitGuestNote({
        data: { restaurantId, guestId: reservation.guestId, note: guestNoteText.trim() },
      }),
    onSuccess: () => {
      toast.success("Guest note added.");
      setGuestNoteOpen(false);
      setGuestNoteText("");
      void queryClient.invalidateQueries({ queryKey: ["guest", restaurantId, reservation.guestId] });
      onSaved?.();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const createTrace = useMutation({
    mutationFn: () => {
      if (!reservation.roomId) throw new Error(TRACE_NO_ROOM_COPY);
      return createTask({
        data: {
          restaurantId,
          roomId: reservation.roomId,
          taskType,
          notes: taskNotes.trim() || undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success("Housekeeping task created.");
      setTraceOpen(false);
      setTaskNotes("");
      void queryClient.invalidateQueries({ queryKey: ["housekeeping-tasks", restaurantId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const mutateTask = useMutation({
    mutationFn: (input: { taskId: string; action: "start" | "cancel" | "complete" }) => {
      if (input.action === "complete") {
        return completeTask({ data: { restaurantId, taskId: input.taskId } });
      }
      return updateTask({ data: { restaurantId, taskId: input.taskId, action: input.action } });
    },
    onSuccess: () => {
      toast.success("Housekeeping task updated.");
      void queryClient.invalidateQueries({ queryKey: ["housekeeping-tasks", restaurantId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  /* ---------------- render ---------------- */

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="reservation-detail-packages">
      <div className="min-h-0 flex-1 space-y-8">
        {/* ============ PACKAGES ============ */}
        <Section title="Packages">
          {groupReservation ? (
            <p className={cn("text-xs", MUTED)} data-testid="packages-group-eligibility">
              {GROUP_PACKAGE_NOTE}
            </p>
          ) : null}

          <Card title="Applied Packages" description={PACKAGE_BIND_GAP_COPY} testId="applied-packages">
            {applied.length === 0 ? (
              <p className={cn(EMPTY, MUTED)} data-testid="applied-packages-empty">
                No packages attached to this reservation.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm text-[#251605]">
                  <thead className={cn(TH, MUTED)}>
                    <tr>
                      <th className="px-2 py-2">#</th>
                      <th className="py-2 pr-2">Package</th>
                      <th className="py-2 pr-2">Description</th>
                      <th className="py-2 pr-2">Charge Type</th>
                      <th className="py-2 pr-2 text-right">Price ({currency})</th>
                      <th className="py-2 pr-2 text-right">Qty</th>
                      <th className="py-2 pr-2 text-right">Total ({currency})</th>
                      <th className="py-2">Stay Dates</th>
                    </tr>
                  </thead>
                  <tbody>
                    {applied.map((row, index) => {
                      const master = cataloguePackageById(catalogue, row.packageId);
                      const basis = parsePackageChargeBasis(master?.chargeBasis ?? row.chargeBasis);
                      const honesty = chargeBasisHonestyCopy(basis);
                      const inclusion = master
                        ? packageInclusionLabel(master, reservation.ratePlanId)
                        : null;
                      return (
                        <tr key={row.id} className={ROW}>
                          <td className="px-2 py-2">{index + 1}</td>
                          <td className="py-2 pr-2">
                            <p>{reviewDash(row.packageName)}</p>
                            <p className={cn("text-[11px]", MUTED)}>{reviewDash(row.packageCode)}</p>
                            {row.roomUnitLabel ? (
                              <p className={cn("text-[11px]", MUTED)}>{row.roomUnitLabel}</p>
                            ) : null}
                            {inclusion ? (
                              <p className="text-[10px] text-[#4A2C0F]">{inclusion}</p>
                            ) : null}
                          </td>
                          <td className="py-2 pr-2">
                            {reviewDash(appliedPackageDescription(row, catalogue))}
                            {honesty ? (
                              <p className={cn("mt-0.5 text-[10px]", MUTED)}>{honesty}</p>
                            ) : null}
                          </td>
                          <td className="py-2 pr-2">{reviewDash(chargeTypeLabel(basis))}</td>
                          <td className="py-2 pr-2 text-right">{money(row.unitAmount)}</td>
                          <td className="py-2 pr-2 text-right">{row.quantity}</td>
                          <td className="py-2 pr-2 text-right">{money(row.appliedAmount)}</td>
                          <td className="py-2">
                            {formatStayDate(reservation.arrivalDate)} –{" "}
                            {formatStayDate(reservation.departureDate)}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="bg-gray-100 font-semibold text-[#251605]">
                      <td className="px-2 py-2" colSpan={6}>
                        Total
                      </td>
                      <td className="py-2 pr-2 text-right">{money(appliedTotal)}</td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {!reservation.ratePlanId ? (
            <p className={cn("text-xs", MUTED)} data-testid="packages-rate-plan-unevaluated">
              Package eligibility needs a rate plan on this reservation.
            </p>
          ) : null}

          <Card
            title="Available Packages"
            description="Active packages that match this stay."
            testId="available-packages"
          >
            {availableCards.length === 0 ? (
              <p className={cn("py-4 text-center text-sm", MUTED)} data-testid="available-packages-empty">
                No active packages match this stay.
              </p>
            ) : (
              <ReservationPackageMerchandiseGrid
                cards={availableCards}
                currency={currency}
                money={money}
                emptyCopy="No active packages match this stay."
                renderFooter={() => null}
              />
            )}
          </Card>
        </Section>

        {/* ============ REQUESTS & PREFERENCES ============ */}
        <Section title="Requests & Preferences">
          <Card title="Special Occasion" description="Saved with Save Changes.">
            <Input
              id="reservation-special-occasion"
              className={FIELD}
              maxLength={80}
              disabled={!editable}
              value={occasion}
              placeholder="e.g. Anniversary, Birthday"
              onChange={(event) => setOccasion(event.target.value)}
            />
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card
              title={
                groupReservation
                  ? "Primary Guest / Booker Preferences"
                  : "Guest Preferences (from profile)"
              }
              description={groupReservation ? GROUP_PROFILE_PREFERENCE_NOTE : undefined}
              action={
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
            >
              <Chips chips={profileChips} empty="No guest profile preferences recorded." />
            </Card>
            <Card
              title="Reservation Preferences"
              action={
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
            >
              <Chips chips={stayChips} empty="No reservation-specific preferences recorded." />
            </Card>
          </div>

          <Card
            title="Service Requests"
            description="Track and manage service requests for this reservation."
            testId="service-requests"
            action={
              <div className="flex flex-wrap gap-2">
                <Select
                  value={statusFilter}
                  onValueChange={(value) =>
                    setStatusFilter(value === ALL ? "all" : (value as GuestServiceStatus))
                  }
                >
                  <SelectTrigger className={cn(FIELD, "h-8 w-36 text-xs")}>
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
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
                    className={cn(FIELD, "h-8 w-44 pl-8 text-xs")}
                    placeholder="Search requests…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  className={BTN_PRIMARY}
                  disabled={!editable || activeTypes.length === 0}
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus className="mr-1 size-3.5" />
                  Add Request
                </Button>
              </div>
            }
          >
            {servicesQuery.error instanceof Error ? (
              <p className="mb-2 text-sm text-destructive">{servicesQuery.error.message}</p>
            ) : null}
            <ServiceRequestsTable
              items={visibleItems}
              types={types}
              staff={staff}
              dateTime={dateTime}
              editable={editable}
              updating={updateMutation.isPending}
              onUpdate={(input) => updateMutation.mutate(input)}
            />
          </Card>
        </Section>

        {/* ============ NOTES & TRACES ============ */}
        <Section title="Notes & Traces">
          <Card
            title="Internal Notes"
            description="Visible to hotel staff only. Saved with Save Changes."
            testId="request-internal-notes"
          >
            <Textarea
              id="request-tab-notes"
              maxLength={NOTE_MAX}
              disabled={!editable}
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, NOTE_MAX))}
              placeholder="Add internal notes here…"
              className={cn("min-h-28", AREA)}
            />
            <p className={cn("mt-1 text-right text-[11px]", MUTED)}>
              {notes.length}/{NOTE_MAX}
            </p>
          </Card>

          <Card
            title="Notes"
            testId="notes-table"
            action={
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={BTN_OUTLINE}
                disabled={!editable}
                onClick={() => setGuestNoteOpen(true)}
              >
                <Plus className="mr-1 size-3.5" />
                Add Guest Note
              </Button>
            }
          >
            <div className="mb-3 flex flex-wrap gap-1">
              {NOTE_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={pill(noteTab === tab.id)}
                  onClick={() => setNoteTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {visibleNotes.length === 0 ? (
              <p className={cn(EMPTY, MUTED)}>No notes recorded for this filter.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm text-[#251605]">
                  <thead className={cn(TH, MUTED)}>
                    <tr>
                      <th className="px-2 py-2">#</th>
                      <th className="py-2 pr-2">Date & Time</th>
                      <th className="py-2 pr-2">Type</th>
                      <th className="py-2 pr-2">Note</th>
                      <th className="py-2 pr-2">User</th>
                      <th className="py-2">Visibility</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleNotes.map((row, index) => (
                      <tr key={row.id} className={ROW}>
                        <td className="px-2 py-2">{index + 1}</td>
                        <td className={cn("py-2 pr-2", MUTED)}>{dateTime(row.at)}</td>
                        <td className="py-2 pr-2">{row.type}</td>
                        <td className="py-2 pr-2">{row.note}</td>
                        <td className="py-2 pr-2">{reviewDash(row.user)}</td>
                        <td className="py-2">{row.visibility}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card
            title="Traces / Tasks"
            description={TRACE_ROOM_GAP_COPY}
            testId="traces-table"
            action={
              <Button
                type="button"
                size="sm"
                className={BTN_PRIMARY}
                disabled={!editable}
                onClick={() => {
                  if (!reservation.roomId) {
                    toast.message(TRACE_NO_ROOM_COPY);
                    return;
                  }
                  setTraceOpen(true);
                }}
              >
                <Plus className="mr-1 size-3.5" />
                Add Trace
              </Button>
            }
          >
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {TRACE_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={pill(traceTab === tab.id)}
                  onClick={() => setTraceTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
              <div className="relative">
                <Search className="absolute left-2 top-2 size-3.5 text-muted-foreground" />
                <Input
                  className={cn(FIELD, "h-8 w-44 pl-7 text-xs")}
                  placeholder="Search traces…"
                  value={traceSearch}
                  onChange={(e) => setTraceSearch(e.target.value)}
                />
              </div>
            </div>
            {tasksQuery.error instanceof Error ? (
              <p className="mb-2 text-sm text-destructive">{tasksQuery.error.message}</p>
            ) : null}
            {!hasTraceRoom ? (
              <p className={cn(EMPTY, MUTED)}>{TRACE_NO_ROOM_COPY}</p>
            ) : visibleTasks.length === 0 ? (
              <p className={cn(EMPTY, MUTED)}>No housekeeping tasks for this room.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm text-[#251605]">
                  <thead className={cn(TH, MUTED)}>
                    <tr>
                      <th className="px-2 py-2">#</th>
                      <th className="py-2 pr-2">Task</th>
                      <th className="py-2 pr-2">Assigned To</th>
                      <th className="py-2 pr-2">Priority</th>
                      <th className="py-2 pr-2">Status</th>
                      <th className="py-2 pr-2">Completed On</th>
                      <th className="py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTasks.map((task, index) => (
                      <tr key={task.id} className={ROW}>
                        <td className="px-2 py-2">{index + 1}</td>
                        <td className="py-2 pr-2">
                          {groupReservation && task.roomContext ? (
                            <span className="block text-xs text-[#4A2C0F]">{task.roomContext}</span>
                          ) : null}
                          {housekeepingTaskLabel(task.taskType)}
                          {task.notes ? (
                            <span className={cn("block text-xs", MUTED)}>{task.notes}</span>
                          ) : null}
                        </td>
                        <td className="py-2 pr-2">{reviewDash(task.assignedName)}</td>
                        <td className="py-2 pr-2">
                          {HK_PRIORITY_LABELS[task.priority] ?? task.priority}
                        </td>
                        <td className="py-2 pr-2">{housekeepingStatusLabel(task.status)}</td>
                        <td className="py-2 pr-2">
                          {task.completedAt ? dateTime(task.completedAt) : DETAIL_DASH}
                        </td>
                        <td className="py-2">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button type="button" size="icon" variant="ghost" aria-label="Task actions">
                                <MoreHorizontal className="size-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-white">
                              {task.status === "pending" || task.status === "assigned" ? (
                                <DropdownMenuItem
                                  disabled={!editable || mutateTask.isPending}
                                  onClick={() => mutateTask.mutate({ taskId: task.id, action: "start" })}
                                >
                                  Start
                                </DropdownMenuItem>
                              ) : null}
                              {task.status === "in_progress" ? (
                                <DropdownMenuItem
                                  disabled={!editable || mutateTask.isPending}
                                  onClick={() =>
                                    mutateTask.mutate({ taskId: task.id, action: "complete" })
                                  }
                                >
                                  Complete
                                </DropdownMenuItem>
                              ) : null}
                              {task.status !== "completed" && task.status !== "cancelled" ? (
                                <DropdownMenuItem
                                  disabled={!editable || mutateTask.isPending}
                                  onClick={() => mutateTask.mutate({ taskId: task.id, action: "cancel" })}
                                >
                                  Cancel
                                </DropdownMenuItem>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card
            title="Activity History"
            testId="notes-activity"
            action={
              activity.length > 8 && !activityAll ? (
                <Button type="button" size="sm" variant="ghost" onClick={() => setActivityAll(true)}>
                  View All
                </Button>
              ) : null
            }
          >
            {visibleActivity.length === 0 ? (
              <p className={cn("text-sm", MUTED)}>No note or housekeeping-task activity yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-[#251605]">
                  <thead className={cn(TH, MUTED)}>
                    <tr>
                      <th className="px-2 py-2">Date & Time</th>
                      <th className="py-2 pr-2">User</th>
                      <th className="py-2 pr-2">Action</th>
                      <th className="py-2">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleActivity.map((row) => (
                      <tr key={row.id} className={ROW}>
                        <td className={cn("px-2 py-2", MUTED)}>{dateTime(row.at)}</td>
                        <td className="py-2 pr-2">{reviewDash(row.user)}</td>
                        <td className="py-2 pr-2">{row.action}</td>
                        <td className="py-2">{row.details}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </Section>
      </div>

      {/* ---------------- footer ---------------- */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 bg-white py-3">
        <div>
          {onBack ? (
            <Button type="button" variant="outline" size="sm" className={BTN_OUTLINE} onClick={onBack}>
              Back
            </Button>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            className={BTN_PRIMARY}
            disabled={!editable || !dirty || saveStay.isPending}
            onClick={() =>
              saveStay.mutate({ notes, specialOccasion: occasion.trim() || null })
            }
          >
            {saveStay.isPending ? "Saving…" : "Save Changes"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={BTN_OUTLINE}
            onClick={() => {
              setNotes(reservation.notes ?? "");
              setOccasion(reservation.specialOccasion ?? "");
              setStatusFilter("all");
              setSearch("");
            }}
          >
            Cancel
          </Button>
        </div>
      </div>

      {/* ---------------- dialogs ---------------- */}
      <Dialog open={prefOpen} onOpenChange={setPrefOpen}>
        <DialogContent className="bg-white">
          <DialogHeader>
            <DialogTitle>Reservation preferences</DialogTitle>
          </DialogHeader>
          <p className={cn("text-xs", MUTED)}>
            Stored as this reservation’s special requests. Guest profile preferences are not
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
              className={BTN_PRIMARY}
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
        <DialogContent className="bg-white">
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
                <SelectContent className="bg-white">
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
                <SelectContent className="bg-white">
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
                <SelectContent className="bg-white">
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
              className={BTN_PRIMARY}
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={guestNoteOpen} onOpenChange={setGuestNoteOpen}>
        <DialogContent className="bg-white">
          <DialogHeader>
            <DialogTitle>Add guest note</DialogTitle>
          </DialogHeader>
          <p className={cn("text-xs", MUTED)}>
            Stored on the guest profile history, not on this reservation.
          </p>
          <Textarea
            maxLength={NOTE_MAX}
            value={guestNoteText}
            onChange={(e) => setGuestNoteText(e.target.value.slice(0, NOTE_MAX))}
            className={cn("min-h-28", AREA)}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setGuestNoteOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className={BTN_PRIMARY}
              disabled={addProfileNote.isPending || !guestNoteText.trim()}
              onClick={() => addProfileNote.mutate()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={traceOpen} onOpenChange={setTraceOpen}>
        <DialogContent className="bg-white">
          <DialogHeader>
            <DialogTitle>Add housekeeping task</DialogTitle>
          </DialogHeader>
          <p className={cn("text-xs", MUTED)}>{TRACE_ROOM_GAP_COPY}</p>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Task type</Label>
              <Select value={taskType} onValueChange={(value) => setTaskType(value as TaskType)}>
                <SelectTrigger className={FIELD}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  {TASK_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {HK_CLEANING_TYPE_LABELS[type] ?? type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="task-notes">Notes</Label>
              <Textarea
                id="task-notes"
                maxLength={500}
                value={taskNotes}
                onChange={(e) => setTaskNotes(e.target.value)}
                className={AREA}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTraceOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className={BTN_PRIMARY}
              disabled={createTrace.isPending}
              onClick={() => createTrace.mutate()}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small pieces                                                        */
/* ------------------------------------------------------------------ */

function Chips({
  chips,
  empty,
}: {
  chips: Array<{ id: string; label: string }>;
  empty: string;
}) {
  if (chips.length === 0) return <p className={cn("text-sm", MUTED)}>{empty}</p>;
  return (
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
  );
}

function ServiceRequestsTable({
  items,
  types,
  staff,
  dateTime,
  editable,
  updating,
  onUpdate,
}: {
  items: GuestServiceHistoryItem[];
  types: Array<{ id: string; categoryName: string }>;
  staff: Array<{ id: string; name: string }>;
  dateTime: (iso: string | null | undefined) => string;
  editable: boolean;
  updating: boolean;
  onUpdate: (input: {
    requestId: string;
    status?: GuestServiceStatus;
    assignedMembershipId?: string | null;
  }) => void;
}) {
  if (items.length === 0) {
    return <p className={cn(EMPTY, MUTED)}>No service requests for this reservation.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm text-[#251605]">
        <thead className={cn(TH, MUTED)}>
          <tr>
            <th className="py-2 pr-2">#</th>
            <th className="py-2 pr-2">Request</th>
            <th className="py-2 pr-2">Category</th>
            <th className="py-2 pr-2">Assigned To</th>
            <th className="py-2 pr-2">Priority</th>
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
              <tr key={item.id} className={ROW}>
                <td className="py-2 pr-2">{index + 1}</td>
                <td className="py-2 pr-2 font-medium">{reviewDash(item.notes || item.serviceName)}</td>
                <td className="py-2 pr-2">{serviceCategoryLabel(item, types)}</td>
                <td className="py-2 pr-2">{reviewDash(item.assignedName)}</td>
                <td className="py-2 pr-2">
                  <PriorityPill priority={item.priority} />
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
                        <Button type="button" size="icon" variant="ghost" aria-label="Request actions">
                          <MoreHorizontal className="size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-white">
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