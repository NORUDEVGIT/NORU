import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Plus, Search, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { CreateReservationMasterPicker } from "@/packages/pms/components/bookings/create-reservation-master-picker";
import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import { ReservationWorkspaceOverlay } from "@/packages/pms/components/reservations/reservation-workspace-overlay";
import {
  allotmentAvailabilityRanges,
  allotmentSummary,
  allotmentsForCreate,
  canSelectGroupCreateStep,
  emptyAllotmentRow,
  emptyGroupCreateDraft,
  executeGroupBlockCreate,
  GB05_NON_ATOMIC_CREATE_DEBT,
  GROUP_BLOCK_NOT_AVAILABLE,
  GROUP_BLOCKS_DISABLED_HELPER,
  GROUP_CREATE_INVENTORY_IMPACT,
  GROUP_CREATE_NO_HOLD,
  GROUP_CREATE_STATUS_LABELS,
  GROUP_CREATE_STEPS,
  GROUP_CREATE_SUCCESS,
  GROUP_TYPE_LABELS,
  groupBlockPreflightFromRules,
  groupCreateDraftIsDirty,
  groupCreateSuccessDetail,
  isRoomTypeSelectableForBlock,
  otherLocalRequestedForRow,
  remainingAfterBlockPreview,
  validateAllotmentRow,
  validateGroupCreateDetails,
  type GroupAllotmentDraftRow,
  type GroupBlockPreflight,
  type GroupCreateDraft,
  type GroupCreateStatus,
} from "@/packages/pms/lib/groups-create-wizard";
import { GROUP_TYPES, type GroupType } from "@/packages/pms/lib/groups";
import { addGroupBlock, createGroup } from "@/packages/pms/lib/groups.functions";
import { guestListItems, listGuests } from "@/packages/pms/lib/guests.functions";
import {
  PMS_OP_BTN_COMPACT,
  PMS_OP_BTN_OUTLINE,
  PMS_OP_DATE,
  PMS_OP_INPUT,
  PMS_OP_LABEL,
  PMS_OP_PANEL,
  PMS_OP_PLACEHOLDER,
  PMS_OP_SELECT_TRIGGER,
  PMS_OP_TEXTAREA,
} from "@/packages/pms/lib/pms-operational-surface";
import { getInventoryRules } from "@/packages/pms/lib/inventory-rules.functions";
import { getPmsSet6Snapshot } from "@/packages/pms/lib/pms-set6-sales-distribution.functions";
import { listRatePlans } from "@/packages/pms/lib/rates.functions";
import { getRoomTypeAvailability } from "@/packages/pms/lib/reservations.functions";
import { listRoomTypes } from "@/packages/pms/lib/rooms.functions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
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

const selectClass = cn(PMS_OP_SELECT_TRIGGER);
const inputClass = cn(PMS_OP_INPUT, PMS_OP_PLACEHOLDER);
const dateClass = cn(PMS_OP_INPUT, PMS_OP_DATE);

export function CreateGroupWizard({
  restaurantId,
  open,
  onOpenChange,
  onCreated,
}: {
  restaurantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (groupId: string) => void;
}) {
  const submitCreate = useServerFn(createGroup);
  const submitBlock = useServerFn(addGroupBlock);
  const loadRoomTypes = useServerFn(listRoomTypes);
  const loadAvailability = useServerFn(getRoomTypeAvailability);
  const loadPlans = useServerFn(listRatePlans);
  const loadSet6 = useServerFn(getPmsSet6Snapshot);
  const loadRules = useServerFn(getInventoryRules);
  const loadGuests = useServerFn(listGuests);

  const [draft, setDraft] = useState<GroupCreateDraft>(emptyGroupCreateDraft);
  const [step, setStep] = useState(0);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [submitting, setSubmitting] = useState<"idle" | "creating-group" | "creating-allotment">(
    "idle",
  );

  useEffect(() => {
    if (!open) {
      setDraft(emptyGroupCreateDraft());
      setStep(0);
      setDiscardOpen(false);
      setSubmitting("idle");
    }
  }, [open]);

  const detailsIssue = validateGroupCreateDetails(draft);
  const detailsValid = detailsIssue == null;

  const roomTypesQuery = useQuery({
    queryKey: ["pms-groups-create-room-types", restaurantId],
    queryFn: () => loadRoomTypes({ data: { restaurantId, includeInactive: false } }),
    enabled: open,
    staleTime: 5 * 60_000,
  });
  const plansQuery = useQuery({
    queryKey: ["pms-groups-create-rate-plans", restaurantId],
    queryFn: async () => {
      try {
        return await loadPlans({ data: { restaurantId, activeOnly: true } });
      } catch {
        return [];
      }
    },
    enabled: open,
    staleTime: 5 * 60_000,
  });
  const set6Query = useQuery({
    queryKey: ["pms-groups-create-set6", restaurantId],
    queryFn: async () => {
      try {
        return await loadSet6({ data: { restaurantId } });
      } catch {
        return null;
      }
    },
    enabled: open,
    staleTime: 5 * 60_000,
  });
  const rulesQuery = useQuery({
    queryKey: ["pms-groups-create-inventory-rules", restaurantId],
    queryFn: () => loadRules({ data: { restaurantId } }),
    enabled: open,
    staleTime: 30_000,
  });

  const availabilityKeys = useMemo(
    () => allotmentAvailabilityRanges(draft.allotments),
    [draft.allotments],
  );

  const availabilityQueries = useQueries({
    queries: availabilityKeys.map((range) => ({
      queryKey: ["pms-groups-create-availability", restaurantId, range.arrival, range.departure],
      queryFn: () =>
        loadAvailability({
          data: { restaurantId, arrival: range.arrival, departure: range.departure },
        }),
      enabled: open && step >= 1,
      placeholderData: keepPreviousData,
      staleTime: 30_000,
    })),
  });

  const roomTypes = roomTypesQuery.data ?? [];
  const preflight: GroupBlockPreflight = rulesQuery.isError
    ? { status: "unknown" }
    : groupBlockPreflightFromRules(rulesQuery.data?.rules.blockTypes, roomTypes);
  const ratePlans = plansQuery.data ?? [];
  const sources = (set6Query.data?.snapshot.sourceCodes ?? []).filter((row) => row.active);
  const segments = (set6Query.data?.snapshot.marketSegments ?? []).filter((row) => row.active);

  function availableFor(row: GroupAllotmentDraftRow): number | null {
    const index = availabilityKeys.findIndex(
      (range) => range.arrival === row.startDate && range.departure === row.endDate,
    );
    if (index < 0) return null;
    const rows = availabilityQueries[index]?.data;
    if (!rows) return null;
    return rows.find((type) => type.roomTypeId === row.roomTypeId)?.available ?? null;
  }

  const availableByRow = Object.fromEntries(
    draft.allotments.map((row) => [row.key, availableFor(row)]),
  );
  const preferredPlan = ratePlans.find((plan) => plan.id === draft.ratePlanId) ?? null;
  const busy = submitting !== "idle";
  const allotmentIssue =
    allotmentsForCreate(draft)
      .map((row) => validateAllotmentRow(row, draft, availableByRow[row.key] ?? null, preflight))
      .find(Boolean) ?? null;

  function requestClose() {
    if (busy) return;
    if (groupCreateDraftIsDirty(draft)) {
      setDiscardOpen(true);
      return;
    }
    onOpenChange(false);
  }

  function patch(partial: Partial<GroupCreateDraft>) {
    setDraft((current) => ({ ...current, ...partial }));
  }

  function goTo(next: number) {
    if (!canSelectGroupCreateStep(step, next, detailsValid)) return;
    if (next === 1 && draft.allotments.length === 0) {
      setDraft((current) => ({
        ...current,
        allotments: [emptyAllotmentRow(current.arrivalDate, current.departureDate)],
      }));
    }
    setStep(next);
  }

  async function submit() {
    if (busy || detailsIssue) return;
    const rows = allotmentsForCreate(draft);
    const allotmentIssue = rows
      .map((row) => validateAllotmentRow(row, draft, availableByRow[row.key] ?? null, preflight))
      .find(Boolean);
    if (allotmentIssue) {
      toast.error(allotmentIssue);
      setStep(1);
      return;
    }
    setSubmitting("creating-group");
    const result = await executeGroupBlockCreate({
      restaurantId,
      draft,
      preflight,
      createGroup: (data) => submitCreate({ data }),
      addGroupBlock: async (data) => {
        setSubmitting("creating-allotment");
        return submitBlock({ data });
      },
    });
    setSubmitting("idle");
    if (result.ok === false) {
      toast.error(result.message);
      return;
    }
    const createdRows = allotmentsForCreate(draft);
    const detail = groupCreateSuccessDetail({
      group: result.group,
      allotmentRows: createdRows.length,
      totalAllotmentQuantity: allotmentSummary(createdRows).totalAllotmentQuantity,
    });
    if (result.ok === "partial") {
      toast.warning(
        `Group ${result.group.confirmationNumber} was created, but ${result.failed.length} allotment ${result.failed.length === 1 ? "row" : "rows"} did not save. ${GB05_NON_ATOMIC_CREATE_DEBT}.`,
        { description: result.failed.map((row) => row.message).join(" · ") },
      );
    } else {
      toast.success(GROUP_CREATE_SUCCESS, { description: detail });
    }
    onCreated(result.group.id);
    onOpenChange(false);
  }

  const current = GROUP_CREATE_STEPS[step]!;

  return (
    <>
      <ReservationWorkspaceOverlay
        open={open}
        title="Create Group / Block"
        description="Set up the group master and room allotment."
        onOpenChange={(next) => {
          if (!next) requestClose();
        }}
      >
        <div className="flex min-h-0 flex-1 flex-col" data-testid="create-group-wizard">
          <CreateGroupStepper current={step} detailsValid={detailsValid} onSelect={goTo} />
          <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
            <div className="mx-auto grid max-w-[1500px] gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
              <div className="min-w-0 space-y-4">
                {step === 0 ? (
                  <GroupDetailsStep
                    restaurantId={restaurantId}
                    draft={draft}
                    sources={sources}
                    segments={segments}
                    ratePlans={ratePlans}
                    loadGuests={loadGuests}
                    onChange={patch}
                  />
                ) : null}
                {step === 1 ? (
                  <RoomAllotmentStep
                    draft={draft}
                    roomTypes={roomTypes}
                    availableByRow={availableByRow}
                    preflight={preflight}
                    onChange={(allotments) => patch({ allotments })}
                  />
                ) : null}
                {step === 2 ? (
                  <GroupReviewStep
                    draft={draft}
                    roomTypes={roomTypes}
                    preferredPlanName={
                      preferredPlan ? `${preferredPlan.code} · ${preferredPlan.name}` : null
                    }
                    availableByRow={availableByRow}
                    preflight={preflight}
                    onBackToAllotment={() => goTo(1)}
                  />
                ) : null}
              </div>
              <GroupCreateSummary draft={draft} preferredPlanName={preferredPlan?.name ?? null} />
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[#DDD4C5] bg-white px-5 py-3">
            <Button
              type="button"
              variant="outline"
              className={PMS_OP_BTN_OUTLINE}
              disabled={busy || step === 0}
              onClick={() => goTo(step - 1)}
            >
              Back
            </Button>
            <div className="flex flex-wrap items-center justify-end gap-3">
              {step < 2 && detailsIssue && step === 0 ? (
                <p className="text-xs text-[#9B3A3A]" data-testid="group-create-details-issue">
                  {detailsIssue}
                </p>
              ) : null}
              {step === 2 && allotmentIssue ? (
                <p className="text-xs text-[#9B3A3A]" data-testid="group-create-review-blocked">
                  {allotmentIssue}
                </p>
              ) : null}
              {step < 2 ? (
                <Button
                  className="!rounded-[6px] bg-[#C89933] text-[#251605] !shadow-none hover:bg-[#B98B2D]"
                  disabled={step === 0 && !detailsValid}
                  data-testid="group-create-continue"
                  onClick={() => goTo(step + 1)}
                >
                  {current.continueLabel} →
                </Button>
              ) : (
                <Button
                  className="!rounded-[6px] bg-[#C89933] text-[#251605] !shadow-none hover:bg-[#B98B2D]"
                  disabled={busy || Boolean(allotmentIssue)}
                  data-testid="group-create-submit"
                  onClick={() => void submit()}
                >
                  {submitting === "creating-group"
                    ? "Creating group…"
                    : submitting === "creating-allotment"
                      ? "Creating allotment…"
                      : "Create Group & Block"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </ReservationWorkspaceOverlay>
      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this group draft?</AlertDialogTitle>
            <AlertDialogDescription>
              Entered group details and allotment rows have not been saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDiscardOpen(false);
                onOpenChange(false);
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function CreateGroupStepper({
  current,
  detailsValid,
  onSelect,
}: {
  current: number;
  detailsValid: boolean;
  onSelect: (index: number) => void;
}) {
  return (
    <nav
      className="shrink-0 overflow-x-auto border-b border-[#DDD4C5] bg-white px-4 py-3"
      aria-label="Create group workflow"
      data-testid="create-group-stepper"
    >
      <ol className="flex min-w-max items-center gap-2">
        {GROUP_CREATE_STEPS.map((step, index) => {
          const active = index === current;
          const completed = index < current;
          const selectable = canSelectGroupCreateStep(current, index, detailsValid);
          return (
            <li key={step.id} className="flex items-center gap-2">
              {index > 0 ? <span className="h-px w-8 bg-[#DDD4C5]" aria-hidden /> : null}
              <button
                type="button"
                disabled={!selectable}
                onClick={() => onSelect(index)}
                className={cn(
                  "flex items-center gap-2 rounded-full px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C89933] focus-visible:ring-offset-2",
                  active ? "font-medium text-[#251605]" : "text-muted-foreground",
                  !selectable && "cursor-not-allowed opacity-60",
                )}
              >
                <span
                  className={cn(
                    "grid size-6 place-items-center rounded-full text-[11px]",
                    active || completed
                      ? "bg-[#C89933] text-[#251605]"
                      : "bg-[#EFE8DC] text-muted-foreground",
                  )}
                >
                  {completed ? <Check className="size-3.5" /> : index + 1}
                </span>
                <span className={cn(active && "border-b-2 border-[#C89933] pb-0.5")}>
                  {step.label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function GroupDetailsStep({
  restaurantId,
  draft,
  sources,
  segments,
  ratePlans,
  loadGuests,
  onChange,
}: {
  restaurantId: string;
  draft: GroupCreateDraft;
  sources: Array<{ code: string; name: string }>;
  segments: Array<{ code: string; name: string }>;
  ratePlans: Array<{ id: string; code: string; name: string; roomTypeName: string }>;
  loadGuests: typeof listGuests;
  onChange: (partial: Partial<GroupCreateDraft>) => void;
}) {
  return (
    <div className="space-y-4" data-testid="group-create-step-details">
      <section className={cn(PMS_OP_PANEL, "p-4")}>
        <h2 className="font-display text-base font-semibold text-[#251605]">Group identity</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Field label="Group name" htmlFor="group-create-name">
            <Input
              id="group-create-name"
              data-testid="group-create-name"
              className={inputClass}
              value={draft.name}
              onChange={(event) => onChange({ name: event.target.value })}
              placeholder="Operational group name"
            />
          </Field>
          <Field
            label="Group code / reference"
            htmlFor="group-create-code"
            hint="Optional staff code. The property confirmation number is assigned on create."
          >
            <Input
              id="group-create-code"
              data-testid="group-create-code"
              className={inputClass}
              value={draft.code}
              maxLength={40}
              onChange={(event) => onChange({ code: event.target.value })}
            />
          </Field>
          <Field label="Group type" htmlFor="group-create-type">
            <Select
              value={draft.groupType}
              onValueChange={(value) => onChange({ groupType: value as GroupType })}
            >
              <SelectTrigger
                id="group-create-type"
                className={selectClass}
                data-testid="group-create-type"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GROUP_TYPES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {GROUP_TYPE_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="Status"
            htmlFor="group-create-status"
            hint="Active room blocks still hold inventory. Status does not release rooms."
          >
            <Select
              value={draft.status}
              onValueChange={(value) => onChange({ status: value as GroupCreateStatus })}
            >
              <SelectTrigger
                id="group-create-status"
                className={selectClass}
                data-testid="group-create-status"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tentative">{GROUP_CREATE_STATUS_LABELS.tentative}</SelectItem>
                <SelectItem value="definite">{GROUP_CREATE_STATUS_LABELS.definite}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      </section>

      <section className={cn(PMS_OP_PANEL, "p-4")}>
        <h2 className="font-display text-base font-semibold text-[#251605]">Stay window</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Field label="Arrival" htmlFor="group-create-arrival">
            <Input
              id="group-create-arrival"
              data-testid="group-create-arrival"
              type="date"
              className={dateClass}
              value={draft.arrivalDate}
              onChange={(event) => onChange({ arrivalDate: event.target.value })}
            />
          </Field>
          <Field label="Departure" htmlFor="group-create-departure">
            <Input
              id="group-create-departure"
              data-testid="group-create-departure"
              type="date"
              className={dateClass}
              value={draft.departureDate}
              onChange={(event) => onChange({ departureDate: event.target.value })}
            />
          </Field>
        </div>
      </section>

      <section className={cn(PMS_OP_PANEL, "p-4")} data-testid="group-create-commercial">
        <h2 className="font-display text-base font-semibold text-[#251605]">
          Commercial relationships
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Optional links to existing company and travel-agency accounts. Linked reservations are not
          automatically updated from these fields.
        </p>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <CreateReservationMasterPicker
            restaurantId={restaurantId}
            kind="company"
            canCreate={false}
            hideCreate
            compact
            master={draft.company}
            onMasterChange={(master) =>
              onChange({
                company: master ? { id: master.id, name: master.name, code: master.code } : null,
              })
            }
          />
          <CreateReservationMasterPicker
            restaurantId={restaurantId}
            kind="travel_agent"
            canCreate={false}
            hideCreate
            compact
            master={draft.travelAgent}
            onMasterChange={(master) =>
              onChange({
                travelAgent: master
                  ? { id: master.id, name: master.name, code: master.code }
                  : null,
              })
            }
          />
        </div>
        <div className="mt-4">
          <GroupLeaderPicker
            restaurantId={restaurantId}
            leader={draft.leader}
            loadGuests={loadGuests}
            onChange={(leader) => onChange({ leader })}
          />
        </div>
      </section>

      <section className={cn(PMS_OP_PANEL, "p-4")}>
        <h2 className="font-display text-base font-semibold text-[#251605]">Classification</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Field label="Source" htmlFor="group-create-source">
            {sources.length > 0 ? (
              <Select
                value={draft.source || "__none__"}
                onValueChange={(value) => onChange({ source: value === "__none__" ? "" : value })}
              >
                <SelectTrigger
                  id="group-create-source"
                  className={selectClass}
                  data-testid="group-create-source"
                >
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {sources.map((row) => (
                    <SelectItem key={row.code} value={row.code}>
                      {row.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="group-create-source"
                data-testid="group-create-source"
                className={inputClass}
                value={draft.source}
                onChange={(event) => onChange({ source: event.target.value })}
              />
            )}
          </Field>
          <Field label="Market segment" htmlFor="group-create-segment">
            {segments.length > 0 ? (
              <Select
                value={draft.marketSegment || "__none__"}
                onValueChange={(value) =>
                  onChange({ marketSegment: value === "__none__" ? "" : value })
                }
              >
                <SelectTrigger
                  id="group-create-segment"
                  className={selectClass}
                  data-testid="group-create-segment"
                >
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {segments.map((row) => (
                    <SelectItem key={row.code} value={row.code}>
                      {row.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="group-create-segment"
                data-testid="group-create-segment"
                className={inputClass}
                value={draft.marketSegment}
                onChange={(event) => onChange({ marketSegment: event.target.value })}
              />
            )}
          </Field>
          <Field
            label="Preferred group rate plan"
            htmlFor="group-create-rate-plan"
            hint="Offered as the preferred rate plan when creating linked reservations."
            className="md:col-span-2"
          >
            <Select
              value={draft.ratePlanId || "__none__"}
              onValueChange={(value) => onChange({ ratePlanId: value === "__none__" ? "" : value })}
            >
              <SelectTrigger
                id="group-create-rate-plan"
                className={selectClass}
                data-testid="group-create-rate-plan"
              >
                <SelectValue placeholder="Optional" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {ratePlans.map((plan) => (
                  <SelectItem key={plan.id} value={plan.id}>
                    {plan.code} · {plan.name} ({plan.roomTypeName})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </section>

      <section className={cn(PMS_OP_PANEL, "p-4")}>
        <h2 className="font-display text-base font-semibold text-[#251605]">Control</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Field
            label="Cut-off date"
            htmlFor="group-create-cutoff"
            hint="Optional. Unused block inventory can be released after this business date."
          >
            <Input
              id="group-create-cutoff"
              data-testid="group-create-cutoff"
              type="date"
              className={dateClass}
              value={draft.cutoffDate}
              onChange={(event) => onChange({ cutoffDate: event.target.value })}
            />
          </Field>
          <Field
            label="Internal notes"
            htmlFor="group-create-notes"
            hint="Staff only."
            className="md:col-span-2"
          >
            <Textarea
              id="group-create-notes"
              data-testid="group-create-notes"
              className={cn(PMS_OP_TEXTAREA, PMS_OP_PLACEHOLDER)}
              value={draft.notes}
              maxLength={2000}
              onChange={(event) => onChange({ notes: event.target.value })}
            />
          </Field>
        </div>
      </section>
    </div>
  );
}

function RoomAllotmentStep({
  draft,
  roomTypes,
  availableByRow,
  preflight,
  onChange,
}: {
  draft: GroupCreateDraft;
  roomTypes: Array<{ id: string; name: string }>;
  availableByRow: Record<string, number | null | undefined>;
  preflight: GroupBlockPreflight;
  onChange: (rows: GroupAllotmentDraftRow[]) => void;
}) {
  const summary = allotmentSummary(draft.allotments);
  const blocksEnabled = preflight.status === "ready" && preflight.quantityHoldsSupported;
  return (
    <section className={cn(PMS_OP_PANEL, "p-4")} data-testid="group-create-step-allotment">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold text-[#251605]">Room allotment</h2>
          <p className="text-xs text-muted-foreground">
            Each row becomes an active room block after create. Availability is current sellable
            inventory, not a forecast.
          </p>
          {!blocksEnabled ? (
            <p className="mt-2 text-xs text-[#9B3A3A]" data-testid="group-create-blocks-disabled">
              {preflight.status === "unknown"
                ? "Could not confirm room-block eligibility. Try again."
                : GROUP_BLOCKS_DISABLED_HELPER}
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="outline"
          className={PMS_OP_BTN_OUTLINE}
          data-testid="group-create-add-row"
          onClick={() =>
            onChange([
              ...draft.allotments,
              emptyAllotmentRow(draft.arrivalDate, draft.departureDate),
            ])
          }
        >
          <Plus className="size-4" />
          Add Room Type
        </Button>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-[#DDD4C5] text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-2 py-2">Room type</th>
              <th className="px-2 py-2">Block dates</th>
              <th className="px-2 py-2">Available</th>
              <th className="px-2 py-2">Rooms blocked</th>
              <th className="px-2 py-2">Cut-off</th>
              <th className="px-2 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {draft.allotments.map((row) => {
              const available = availableByRow[row.key] ?? null;
              const other = otherLocalRequestedForRow(draft.allotments, row);
              const remaining = remainingAfterBlockPreview({
                available,
                requested: row.allotted,
                otherLocalRequested: other,
              });
              const issue = validateAllotmentRow(row, draft, available, preflight);
              return (
                <tr
                  key={row.key}
                  className="border-b border-border/70 align-top"
                  data-testid="group-create-allotment-row"
                >
                  <td className="px-2 py-2">
                    <Select
                      value={row.roomTypeId || undefined}
                      onValueChange={(roomTypeId) =>
                        onChange(
                          draft.allotments.map((item) =>
                            item.key === row.key ? { ...item, roomTypeId } : item,
                          ),
                        )
                      }
                    >
                      <SelectTrigger className={selectClass} data-testid="group-create-row-type">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {roomTypes.map((type) => {
                          const selectable = isRoomTypeSelectableForBlock(type.id, preflight);
                          return (
                            <SelectItem
                              key={type.id}
                              value={type.id}
                              disabled={!selectable}
                              data-testid={
                                selectable
                                  ? "group-create-row-type-option"
                                  : "group-create-row-type-disabled"
                              }
                            >
                              {selectable
                                ? type.name
                                : `${type.name} · ${GROUP_BLOCK_NOT_AVAILABLE}`}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-2">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input
                        type="date"
                        className={dateClass}
                        value={row.startDate}
                        onChange={(event) =>
                          onChange(
                            draft.allotments.map((item) =>
                              item.key === row.key
                                ? { ...item, startDate: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                      <Input
                        type="date"
                        className={dateClass}
                        value={row.endDate}
                        onChange={(event) =>
                          onChange(
                            draft.allotments.map((item) =>
                              item.key === row.key
                                ? { ...item, endDate: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </div>
                  </td>
                  <td className="px-2 py-2 text-xs">
                    <p data-testid="group-create-row-available">
                      Available: {available == null ? "—" : available}
                    </p>
                    <p>Requested: {row.allotted}</p>
                    {remaining != null ? (
                      <p>Remaining general availability after block: {remaining}</p>
                    ) : null}
                    {issue ? <p className="mt-1 text-[#9B3A3A]">{issue}</p> : null}
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      type="number"
                      min={1}
                      max={500}
                      className={cn(inputClass, "tabular-nums")}
                      data-testid="group-create-row-allotted"
                      value={row.allotted}
                      onChange={(event) =>
                        onChange(
                          draft.allotments.map((item) =>
                            item.key === row.key
                              ? { ...item, allotted: Number(event.target.value) || 0 }
                              : item,
                          ),
                        )
                      }
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Input
                      type="date"
                      className={dateClass}
                      value={row.cutoffDate}
                      onChange={(event) =>
                        onChange(
                          draft.allotments.map((item) =>
                            item.key === row.key
                              ? { ...item, cutoffDate: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={PMS_OP_BTN_COMPACT}
                      data-testid="group-create-remove-row"
                      onClick={() =>
                        onChange(draft.allotments.filter((item) => item.key !== row.key))
                      }
                    >
                      <Trash2 className="size-3.5" />
                      Remove
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div
        className="mt-4 grid gap-2 text-sm sm:grid-cols-4"
        data-testid="group-create-allotment-summary"
      >
        <SummaryStat label="Room types" value={String(summary.roomTypes)} />
        <SummaryStat
          label="Total allotment quantity"
          value={String(summary.totalAllotmentQuantity)}
        />
        <SummaryStat
          label="Total room nights"
          value={summary.totalRoomNights == null ? "—" : String(summary.totalRoomNights)}
        />
        <SummaryStat label="Cut-off" value={summary.cutoffLabel} />
      </div>
    </section>
  );
}

function GroupReviewStep({
  draft,
  roomTypes,
  preferredPlanName,
  availableByRow,
  preflight,
  onBackToAllotment,
}: {
  draft: GroupCreateDraft;
  roomTypes: Array<{ id: string; name: string }>;
  preferredPlanName: string | null;
  availableByRow: Record<string, number | null | undefined>;
  preflight: GroupBlockPreflight;
  onBackToAllotment: () => void;
}) {
  const typeName = (id: string) => roomTypes.find((type) => type.id === id)?.name ?? id;
  const rows = allotmentsForCreate(draft);
  const invalidRows = rows
    .map((row) => ({
      row,
      issue: validateAllotmentRow(row, draft, availableByRow[row.key] ?? null, preflight),
    }))
    .filter((item) => item.issue);
  const validRows = rows.filter((row) => !invalidRows.some((item) => item.row.key === row.key));
  return (
    <div className="space-y-4" data-testid="group-create-step-review">
      <section className={cn(PMS_OP_PANEL, "p-4")}>
        <h2 className="font-display text-base font-semibold text-[#251605]">Group details</h2>
        <dl className="mt-3 grid gap-2 text-sm md:grid-cols-2">
          <ReviewItem label="Group name" value={draft.name} />
          <ReviewItem label="Group code" value={draft.code || "Assigned on create"} />
          <ReviewItem label="Type" value={GROUP_TYPE_LABELS[draft.groupType]} />
          <ReviewItem label="Status" value={GROUP_CREATE_STATUS_LABELS[draft.status]} />
          <ReviewItem
            label="Stay"
            value={
              draft.arrivalDate && draft.departureDate
                ? `${formatStayDate(draft.arrivalDate)} → ${formatStayDate(draft.departureDate)}`
                : "—"
            }
          />
          <ReviewItem
            label="Cut-off"
            value={draft.cutoffDate ? formatStayDate(draft.cutoffDate) : "Not set"}
          />
          <ReviewItem label="Company" value={draft.company?.name ?? "—"} />
          <ReviewItem label="Travel agent" value={draft.travelAgent?.name ?? "—"} />
          <ReviewItem label="Group leader" value={draft.leader?.name ?? "—"} />
          <ReviewItem label="Source" value={draft.source || "—"} />
          <ReviewItem label="Market segment" value={draft.marketSegment || "—"} />
          <ReviewItem label="Preferred rate plan" value={preferredPlanName ?? "—"} />
          {draft.notes.trim() ? (
            <ReviewItem label="Internal notes" value={draft.notes} className="md:col-span-2" />
          ) : null}
        </dl>
      </section>
      <section className={cn(PMS_OP_PANEL, "p-4")}>
        <h2 className="font-display text-base font-semibold text-[#251605]">Room allotment</h2>
        {invalidRows.length > 0 ? (
          <div className="mt-2 space-y-2" data-testid="group-create-review-invalid">
            <p className="text-sm text-[#9B3A3A]">
              Review blocked. Correct allotment rows before creating this group.
            </p>
            <ul className="space-y-1 text-sm text-[#9B3A3A]">
              {invalidRows.map(({ row, issue }) => (
                <li key={row.key}>
                  {typeName(row.roomTypeId)}: {issue}
                </li>
              ))}
            </ul>
            <Button
              type="button"
              variant="outline"
              className={PMS_OP_BTN_OUTLINE}
              data-testid="group-create-back-allotment"
              onClick={onBackToAllotment}
            >
              Back to Room Allotment
            </Button>
          </div>
        ) : validRows.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No allotment rows.</p>
        ) : (
          <table
            className="mt-3 w-full text-left text-sm"
            data-testid="group-create-review-allotment"
          >
            <thead className="border-b border-[#DDD4C5] text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-2">Room type</th>
                <th className="py-2">Block dates</th>
                <th className="py-2">Rooms blocked</th>
                <th className="py-2">Cut-off</th>
              </tr>
            </thead>
            <tbody>
              {validRows.map((row) => (
                <tr key={row.key} className="border-b border-border/70">
                  <td className="py-2">{typeName(row.roomTypeId)}</td>
                  <td className="py-2 tabular-nums">
                    {row.startDate} → {row.endDate}
                  </td>
                  <td className="py-2 tabular-nums">{row.allotted}</td>
                  <td className="py-2">{row.cutoffDate || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section className={cn(PMS_OP_PANEL, "p-4")} data-testid="group-create-inventory-impact">
        <h2 className="font-display text-base font-semibold text-[#251605]">Inventory impact</h2>
        <p className="mt-2 text-sm text-[#251605]">
          {invalidRows.length > 0 || validRows.length === 0
            ? GROUP_CREATE_NO_HOLD
            : GROUP_CREATE_INVENTORY_IMPACT}
        </p>
      </section>
    </div>
  );
}

function GroupCreateSummary({
  draft,
  preferredPlanName,
}: {
  draft: GroupCreateDraft;
  preferredPlanName: string | null;
}) {
  const summary = allotmentSummary(draft.allotments);
  return (
    <aside className={cn(PMS_OP_PANEL, "h-fit p-4")} data-testid="group-create-summary">
      <div className="flex items-start gap-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#F4E9D0] text-[#8A641A]">
          <Users className="size-4" />
        </span>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Group summary
          </p>
          <p className="text-sm font-medium text-[#251605]">Not yet created</p>
        </div>
      </div>
      <dl className="mt-3 space-y-2 text-sm">
        <ReviewItem label="Group name" value={draft.name || "—"} />
        <ReviewItem label="Status" value={GROUP_CREATE_STATUS_LABELS[draft.status]} />
        <ReviewItem
          label="Stay"
          value={
            draft.arrivalDate && draft.departureDate
              ? `${draft.arrivalDate} → ${draft.departureDate}`
              : "—"
          }
        />
        {draft.company ? <ReviewItem label="Company" value={draft.company.name} /> : null}
        {draft.travelAgent ? (
          <ReviewItem label="Travel agent" value={draft.travelAgent.name} />
        ) : null}
        {preferredPlanName ? <ReviewItem label="Rate plan" value={preferredPlanName} /> : null}
        <ReviewItem label="Cut-off" value={draft.cutoffDate || "—"} />
        {draft.allotments.length > 0 ? (
          <>
            <ReviewItem label="Allotment rows" value={String(draft.allotments.length)} />
            <ReviewItem
              label="Total allotment quantity"
              value={String(summary.totalAllotmentQuantity)}
            />
          </>
        ) : null}
      </dl>
    </aside>
  );
}

function GroupLeaderPicker({
  restaurantId,
  leader,
  loadGuests,
  onChange,
}: {
  restaurantId: string;
  leader: GroupCreateDraft["leader"];
  loadGuests: typeof listGuests;
  onChange: (leader: GroupCreateDraft["leader"]) => void;
}) {
  const [search, setSearch] = useState("");
  const guestsQuery = useQuery({
    queryKey: ["pms-groups-create-leader", restaurantId, search],
    queryFn: () => loadGuests({ data: { restaurantId, search, limit: 8 } }),
    enabled: search.trim().length >= 2,
  });
  return (
    <div data-testid="group-leader-picker">
      <Label className={PMS_OP_LABEL}>Group leader</Label>
      <p className="mb-2 text-xs text-muted-foreground">
        Primary guest associated with this group.
      </p>
      {leader ? (
        <div className="flex items-center justify-between gap-2 rounded-[6px] border border-[#DDD4C5] bg-[#FAF8F4] px-3 py-2">
          <p className="text-sm font-medium">{leader.name}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={PMS_OP_BTN_COMPACT}
            onClick={() => onChange(null)}
          >
            Change
          </Button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#6B5E4E]" />
          <Input
            className={cn(inputClass, "pl-9")}
            data-testid="group-leader-search"
            placeholder="Search guests by name, phone or email"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {search.trim().length >= 2 ? (
            <div
              className="mt-1 max-h-48 overflow-y-auto rounded-[6px] border border-[#CCCCCC] bg-white"
              data-testid="group-leader-results"
            >
              {guestsQuery.isLoading ? (
                <p className="px-3 py-2 text-sm text-muted-foreground">Searching guests…</p>
              ) : guestListItems(guestsQuery.data).length === 0 ? (
                <p className="px-3 py-2 text-sm text-muted-foreground">No matching guests.</p>
              ) : (
                guestListItems(guestsQuery.data).map((guest) => (
                  <button
                    key={guest.id}
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-[#F7F4EE]"
                    onClick={() => {
                      onChange({ id: guest.id, name: guest.fullName });
                      setSearch("");
                    }}
                  >
                    {guest.fullName}
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor} className={PMS_OP_LABEL}>
        {label}
      </Label>
      <div className="mt-1">{children}</div>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function ReviewItem({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm text-[#251605]">{value}</dd>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[#DDD4C5] bg-[#FAF8F4] px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-medium text-[#251605]">{value}</p>
    </div>
  );
}
