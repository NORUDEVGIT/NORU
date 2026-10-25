import { Fragment, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";

import { formatStayDate } from "@/packages/pms/components/bookings/reservation-bits";
import { ReservationWorkspaceOverlay } from "@/packages/pms/components/reservations/reservation-workspace-overlay";
import {
  GROUP_BLOCK_NOT_AVAILABLE,
  GROUP_BLOCKS_DISABLED_HELPER,
  emptyAllotmentRow,
  groupBlockPreflightFromRules,
  isRoomTypeSelectableForBlock,
  validateAllotmentRow,
  type GroupAllotmentDraftRow,
} from "@/packages/pms/lib/groups-create-wizard";
import {
  GROUP_DETAIL_EMPTY,
  GROUP_DETAIL_TABS,
  allowedGroupStatusTargets,
  groupBlockStatusLabel,
  groupDetailSummary,
  groupHistoryDetails,
  groupHistoryEventLabel,
  groupLinkedUnitRows,
  groupOverviewFields,
  groupPickupRows,
  groupStatusLabel,
  groupStayNights,
  groupTypeLabel,
  type GroupDetailTabId,
} from "@/packages/pms/lib/groups-detail-workspace";
import { GROUP_TYPES, type GroupStatus } from "@/packages/pms/lib/groups";
import {
  addGroupBlock,
  addRoomingRow,
  amendGroup,
  convertRoomingRow,
  getGroupOperationalDetail,
  releaseGroupBlock,
  type GroupBlockRead,
  type GroupRecord,
} from "@/packages/pms/lib/groups.functions";
import type { GroupOperationalUnit } from "@/packages/pms/lib/groups-operational-detail";
import { getGuestAccount } from "@/packages/pms/lib/guest-accounts.functions";
import { getGuest, guestListItems, listGuests } from "@/packages/pms/lib/guests.functions";
import { getInventoryRules } from "@/packages/pms/lib/inventory-rules.functions";
import {
  PMS_OP_BTN_COMPACT,
  PMS_OP_BTN_OUTLINE,
  PMS_OP_DATE,
  PMS_OP_INPUT,
  PMS_OP_PANEL,
  PMS_OP_PLACEHOLDER,
  PMS_OP_SELECT_TRIGGER,
  PMS_OP_TABLE_HEAD,
  PMS_OP_TABLE_ROW,
  PMS_OP_TABLE_SHELL,
} from "@/packages/pms/lib/pms-operational-surface";
import { listRatePlans } from "@/packages/pms/lib/rates.functions";
import { getRoomTypeAvailability } from "@/packages/pms/lib/reservations.functions";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Input } from "@/shared/components/ui/input";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Textarea } from "@/shared/components/ui/textarea";
import { cn } from "@/shared/lib/utils";

const inputClass = cn(PMS_OP_INPUT, PMS_OP_PLACEHOLDER);
const dateClass = cn(PMS_OP_INPUT, PMS_OP_DATE);

type GroupDetailData = {
  group: GroupRecord;
  blocks: GroupBlockRead[];
  rooming: Array<{
    id: string;
    guest_id: string | null;
    guest_name: string;
    room_type_id: string | null;
    group_block_id: string | null;
    status: string;
    reservation_id: string | null;
  }>;
  history: Array<{
    id: string;
    event_type: string;
    previous_values: Record<string, unknown> | null;
    new_values: Record<string, unknown> | null;
    notes: string | null;
    created_at: string;
    actor_membership_id: string | null;
  }>;
  reservations: Array<{
    id: string;
    confirmation_number: string;
    guest_id: string | null;
    arrival_date: string;
    departure_date: string;
    status: string;
    room_type_id: string | null;
    pms_group_block_id: string | null;
  }>;
};

export function GroupDetailWorkspace({
  restaurantId,
  canWrite,
  open,
  detail,
  loading,
  error,
  roomTypes,
  onAmend,
  onAddBlock,
  onRelease,
  onAddRooming,
  onConvert,
  onOpenChange,
  onRetry,
  onChanged,
  onOpenReservation,
  onCreateStay,
  canCreateReservation = false,
}: {
  restaurantId: string;
  canWrite: boolean;
  open: boolean;
  detail: GroupDetailData | null;
  loading: boolean;
  error: string | null;
  roomTypes: Array<{ id: string; name: string }>;
  onAmend: typeof amendGroup;
  onAddBlock: typeof addGroupBlock;
  onRelease: typeof releaseGroupBlock;
  onAddRooming: typeof addRoomingRow;
  onConvert: typeof convertRoomingRow;
  onOpenChange: (open: boolean) => void;
  onRetry: () => void;
  onChanged: () => void;
  onOpenReservation: (reservationId: string) => void;
  onCreateStay?: (groupId: string, blockId: string | null) => void;
  canCreateReservation?: boolean;
}) {
  const [tab, setTab] = useState<GroupDetailTabId>("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [addBlockOpen, setAddBlockOpen] = useState(false);
  const group = detail?.group ?? null;
  const nights = group ? groupStayNights(group.arrivalDate, group.departureDate) : 0;
  const summary = groupDetailSummary(detail?.blocks ?? [], detail?.reservations.length ?? 0);
  const loadOperational = useServerFn(getGroupOperationalDetail);
  const operationalQuery = useQuery({
    queryKey: ["pms-group-operational", restaurantId, group?.id],
    queryFn: () => loadOperational({ data: { restaurantId, groupId: group!.id } }),
    enabled: open && Boolean(group?.id),
  });
  const operationalUnits = operationalQuery.data?.units ?? [];
  const operationalBlocks = operationalQuery.data?.blocks ?? detail?.blocks ?? [];

  function openReservation(id: string) {
    onOpenChange(false);
    onOpenReservation(id);
  }

  return (
    <>
      <ReservationWorkspaceOverlay
        open={open}
        title={group ? `${group.confirmationNumber} · ${group.name}` : "Group detail"}
        description={
          group
            ? `${formatStayDate(group.arrivalDate)} → ${formatStayDate(group.departureDate)}`
            : "Operational group workspace"
        }
        hideVisualHeader
        onOpenChange={onOpenChange}
      >
        <div className="flex min-h-0 flex-1 flex-col" data-testid="group-detail-workspace">
          <header className="shrink-0 border-b border-[#DDD4C5] bg-white px-5 py-4 pr-12">
            {loading && !group ? (
              <Skeleton className="h-16 w-80" />
            ) : group ? (
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.confirmationNumber}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-xl font-semibold text-[#251605]">
                      {group.name}
                    </h2>
                    <span className="rounded-full bg-[#F4E9D0] px-2 py-0.5 text-xs font-medium text-[#765719]">
                      {groupStatusLabel(group.status)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatStayDate(group.arrivalDate)} → {formatStayDate(group.departureDate)}
                    {nights ? ` · ${nights} nights` : ""}
                    {group.cutoffDate ? ` · Cut-off: ${formatStayDate(group.cutoffDate)}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canWrite ? (
                    <Button
                      variant="outline"
                      className={PMS_OP_BTN_OUTLINE}
                      data-testid="group-detail-edit"
                      onClick={() => setEditOpen(true)}
                    >
                      Edit Group
                    </Button>
                  ) : null}
                  {canWrite ? (
                    <Button
                      className="h-10 !rounded-[6px] bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]"
                      data-testid="group-detail-add-allotment"
                      onClick={() => {
                        setTab("allotment");
                        setAddBlockOpen(true);
                      }}
                    >
                      Add Allotment
                    </Button>
                  ) : null}
                  {canCreateReservation && group && onCreateStay ? (
                    <Button
                      variant="outline"
                      className={PMS_OP_BTN_OUTLINE}
                      data-testid="group-detail-create-reservation"
                      onClick={() => onCreateStay(group.id, null)}
                    >
                      Create Reservation
                    </Button>
                  ) : null}
                  {canWrite ? (
                    <MoreMenu
                      group={group}
                      blocks={detail?.blocks ?? []}
                      restaurantId={restaurantId}
                      onAmend={onAmend}
                      onRelease={onRelease}
                      onChanged={onChanged}
                    />
                  ) : null}
                </div>
              </div>
            ) : error ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-destructive">{error}</p>
                <Button variant="outline" className={PMS_OP_BTN_OUTLINE} onClick={onRetry}>
                  Retry
                </Button>
              </div>
            ) : null}
          </header>
          <nav
            className="shrink-0 overflow-x-auto border-b border-[#DDD4C5] bg-white px-4"
            aria-label="Group detail"
            data-testid="group-detail-tabs"
          >
            <div className="flex min-w-max gap-1 py-2">
              {GROUP_DETAIL_TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm",
                    tab === item.id
                      ? "bg-[#F4E9D0] font-medium text-[#251605]"
                      : "text-muted-foreground hover:bg-[#F7F4EE]",
                  )}
                  onClick={() => setTab(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </nav>
          <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
            {loading && !detail ? (
              <Skeleton className="h-48 w-full" />
            ) : error && !detail ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : detail ? (
              <>
                {tab === "overview" ? (
                  <OverviewTab group={detail.group} summary={summary} restaurantId={restaurantId} />
                ) : null}
                {tab === "allotment" ? (
                  <AllotmentTab
                    restaurantId={restaurantId}
                    canWrite={canWrite}
                    group={detail.group}
                    blocks={detail.blocks}
                    roomTypes={roomTypes}
                    onRelease={onRelease}
                    onChanged={onChanged}
                    onAdd={() => setAddBlockOpen(true)}
                    canCreateReservation={canCreateReservation}
                    onCreateStay={onCreateStay}
                  />
                ) : null}
                {tab === "pickup" ? (
                  <PickupTab
                    blocks={operationalBlocks}
                    units={operationalUnits}
                    loading={operationalQuery.isLoading}
                    error={
                      operationalQuery.error instanceof Error
                        ? operationalQuery.error.message
                        : operationalQuery.isError
                          ? "Could not load pickup units."
                          : null
                    }
                    onRetry={() => void operationalQuery.refetch()}
                  />
                ) : null}
                {tab === "rooming" ? (
                  <RoomingTab
                    restaurantId={restaurantId}
                    canWrite={canWrite}
                    group={detail.group}
                    blocks={detail.blocks}
                    rooming={detail.rooming}
                    onAddRooming={onAddRooming}
                    onConvert={onConvert}
                    onChanged={onChanged}
                    onOpenReservation={openReservation}
                  />
                ) : null}
                {tab === "linked" ? (
                  <LinkedTab
                    units={operationalUnits}
                    loading={operationalQuery.isLoading}
                    error={
                      operationalQuery.error instanceof Error
                        ? operationalQuery.error.message
                        : operationalQuery.isError
                          ? "Could not load linked reservations."
                          : null
                    }
                    onRetry={() => void operationalQuery.refetch()}
                    onOpenReservation={openReservation}
                  />
                ) : null}
                {tab === "history" ? <HistoryTab history={detail.history} /> : null}
              </>
            ) : null}
          </div>
        </div>
      </ReservationWorkspaceOverlay>
      {group && canWrite ? (
        <EditGroupDialog
          restaurantId={restaurantId}
          group={group}
          open={editOpen}
          onAmend={onAmend}
          onOpenChange={setEditOpen}
          onChanged={onChanged}
        />
      ) : null}
      {group && canWrite ? (
        <AddAllotmentDialog
          restaurantId={restaurantId}
          group={group}
          roomTypes={roomTypes}
          open={addBlockOpen}
          onAddBlock={onAddBlock}
          onOpenChange={setAddBlockOpen}
          onChanged={onChanged}
        />
      ) : null}
    </>
  );
}

function MoreMenu({
  group,
  blocks,
  restaurantId,
  onAmend,
  onRelease,
  onChanged,
}: {
  group: GroupRecord;
  blocks: GroupBlockRead[];
  restaurantId: string;
  onAmend: typeof amendGroup;
  onRelease: typeof releaseGroupBlock;
  onChanged: () => void;
}) {
  const targets = allowedGroupStatusTargets(group.status);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={PMS_OP_BTN_OUTLINE} data-testid="group-detail-more">
          More
          <MoreHorizontal className="ml-1 size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {targets.map((status) => (
          <DropdownMenuItem
            key={status}
            onClick={() =>
              void onAmend({
                data: {
                  restaurantId,
                  groupId: group.id,
                  name: group.name,
                  groupType: group.groupType as (typeof GROUP_TYPES)[number],
                  status,
                  arrivalDate: group.arrivalDate,
                  departureDate: group.departureDate,
                  cutoffDate: group.cutoffDate,
                  notes: group.notes,
                },
              })
                .then(() => {
                  toast.success(`Group status set to ${groupStatusLabel(status)}.`);
                  onChanged();
                })
                .catch((error: unknown) =>
                  toast.error(error instanceof Error ? error.message : "Could not change status."),
                )
            }
          >
            Set {groupStatusLabel(status)}
          </DropdownMenuItem>
        ))}
        {blocks.some((block) => block.status === "active") ? (
          <DropdownMenuItem
            onClick={() =>
              void Promise.all(
                blocks
                  .filter((block) => block.status === "active")
                  .map((block) =>
                    onRelease({
                      data: {
                        restaurantId,
                        groupId: group.id,
                        blockId: block.id,
                        allotted: 0,
                      },
                    }),
                  ),
              )
                .then(() => {
                  toast.success("Unused allotment released. Linked stays were kept.");
                  onChanged();
                })
                .catch((error: unknown) =>
                  toast.error(
                    error instanceof Error ? error.message : "Could not release allotment.",
                  ),
                )
            }
          >
            Release remaining allotment
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function OverviewTab({
  group,
  summary,
  restaurantId,
}: {
  group: GroupRecord;
  summary: ReturnType<typeof groupDetailSummary>;
  restaurantId: string;
}) {
  const loadGuest = useServerFn(getGuest);
  const loadAccount = useServerFn(getGuestAccount);
  const loadPlans = useServerFn(listRatePlans);
  const leaderQuery = useQuery({
    queryKey: ["pms-group-leader", restaurantId, group.leaderGuestId],
    queryFn: () => loadGuest({ data: { restaurantId, guestId: group.leaderGuestId! } }),
    enabled: Boolean(group.leaderGuestId),
  });
  const companyQuery = useQuery({
    queryKey: ["pms-group-company", restaurantId, group.companyMasterId],
    queryFn: () => loadAccount({ data: { restaurantId, accountId: group.companyMasterId! } }),
    enabled: Boolean(group.companyMasterId),
  });
  const taQuery = useQuery({
    queryKey: ["pms-group-ta", restaurantId, group.travelAgentMasterId],
    queryFn: () => loadAccount({ data: { restaurantId, accountId: group.travelAgentMasterId! } }),
    enabled: Boolean(group.travelAgentMasterId),
  });
  const plansQuery = useQuery({
    queryKey: ["pms-group-rate-plans", restaurantId],
    queryFn: async () => {
      try {
        return await loadPlans({ data: { restaurantId, activeOnly: true } });
      } catch {
        return [];
      }
    },
  });
  const rateName = plansQuery.data?.find((plan) => plan.id === group.ratePlanId);
  const fields = [
    ...groupOverviewFields(group),
    companyQuery.data ? { label: "Company", value: companyQuery.data.name } : null,
    taQuery.data ? { label: "Travel agent", value: taQuery.data.name } : null,
    leaderQuery.data ? { label: "Group leader", value: leaderQuery.data.guest.fullName } : null,
    rateName
      ? { label: "Preferred rate plan", value: `${rateName.code} · ${rateName.name}` }
      : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  return (
    <div
      className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]"
      data-testid="group-detail-overview"
    >
      <section className={cn(PMS_OP_PANEL, "p-4")}>
        <h3 className="font-display text-base font-semibold text-[#251605]">Group information</h3>
        <dl className="mt-3 grid gap-2 text-sm md:grid-cols-2">
          {fields.map((field) => (
            <div key={field.label}>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {field.label}
              </dt>
              <dd className="text-[#251605]">{field.value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <aside className={cn(PMS_OP_PANEL, "h-fit p-4")} data-testid="group-detail-summary">
        <h3 className="font-display text-base font-semibold text-[#251605]">Group summary</h3>
        <dl className="mt-3 space-y-2 text-sm">
          <SummaryRow label="Total allotment" value={`${summary.totalAllotment} rooms`} />
          <SummaryRow label="Picked up" value={`${summary.pickedUp} rooms`} />
          <SummaryRow label="Remaining" value={`${summary.remaining} rooms`} />
          <SummaryRow label="Linked reservations" value={`${summary.linkedReservations} stays`} />
          <SummaryRow
            label="Cut-off date"
            value={group.cutoffDate ? formatStayDate(group.cutoffDate) : "Not set"}
          />
        </dl>
      </aside>
    </div>
  );
}

function AllotmentTab({
  restaurantId,
  canWrite,
  group,
  blocks,
  roomTypes,
  onRelease,
  onChanged,
  onAdd,
  canCreateReservation = false,
  onCreateStay,
}: {
  restaurantId: string;
  canWrite: boolean;
  group: GroupRecord;
  blocks: GroupBlockRead[];
  roomTypes: Array<{ id: string; name: string }>;
  onRelease: typeof releaseGroupBlock;
  onChanged: () => void;
  onAdd: () => void;
  canCreateReservation?: boolean;
  onCreateStay?: (groupId: string, blockId: string | null) => void;
}) {
  return (
    <section className={cn(PMS_OP_PANEL, "p-4")} data-testid="group-detail-allotment">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-base font-semibold text-[#251605]">Room allotment</h3>
        {canWrite ? (
          <Button variant="outline" className={PMS_OP_BTN_OUTLINE} onClick={onAdd}>
            <Plus className="size-4" />
            Add Allotment
          </Button>
        ) : null}
      </div>
      {blocks.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{GROUP_DETAIL_EMPTY.allotment}</p>
      ) : (
        <div className={cn(PMS_OP_TABLE_SHELL, "mt-3")}>
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className={PMS_OP_TABLE_HEAD}>
              <tr>
                <th className="px-3 py-2">Room type</th>
                <th className="px-3 py-2">Block dates</th>
                <th className="px-3 py-2">Allotted</th>
                <th className="px-3 py-2">Pickup</th>
                <th className="px-3 py-2">Remaining</th>
                <th className="px-3 py-2">Cut-off</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {blocks.map((block) => (
                <tr key={block.id} className={PMS_OP_TABLE_ROW}>
                  <td className="px-3 py-2">
                    {block.roomTypeName ??
                      roomTypes.find((type) => type.id === block.roomTypeId)?.name ??
                      "Room type"}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatStayDate(block.startDate)} → {formatStayDate(block.endDate)}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{block.totals.allotted}</td>
                  <td className="px-3 py-2 tabular-nums">{block.totals.pickedUp}</td>
                  <td className="px-3 py-2 tabular-nums">{block.totals.remaining}</td>
                  <td className="px-3 py-2">
                    {block.cutoffDate ? formatStayDate(block.cutoffDate) : "—"}
                  </td>
                  <td className="px-3 py-2">{groupBlockStatusLabel(block.status)}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      {canCreateReservation && onCreateStay && block.status === "active" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className={PMS_OP_BTN_COMPACT}
                          data-testid="group-detail-block-create-reservation"
                          onClick={() => onCreateStay(group.id, block.id)}
                        >
                          Create Reservation
                        </Button>
                      ) : null}
                      {canWrite && block.status === "active" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className={PMS_OP_BTN_COMPACT}
                          data-testid="group-detail-release-block"
                          onClick={() =>
                            void onRelease({
                              data: {
                                restaurantId,
                                groupId: group.id,
                                blockId: block.id,
                                allotted: 0,
                              },
                            })
                              .then(() => {
                                toast.success(
                                  "Unused allotment released. Linked stays were kept.",
                                );
                                onChanged();
                              })
                              .catch((error: unknown) =>
                                toast.error(
                                  error instanceof Error
                                    ? error.message
                                    : "Could not release block.",
                                ),
                              )
                          }
                        >
                          Release block
                        </Button>
                      ) : null}
                      {!(
                        (canCreateReservation && onCreateStay && block.status === "active") ||
                        (canWrite && block.status === "active")
                      )
                        ? "—"
                        : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function PickupTab({
  blocks,
  units,
  loading,
  error,
  onRetry,
}: {
  blocks: GroupBlockRead[];
  units: GroupOperationalUnit[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const rows = groupPickupRows(blocks, units);
  const anyPickup = rows.some((row) => row.pickedUp > 0);
  return (
    <section className={cn(PMS_OP_PANEL, "p-4")} data-testid="group-detail-pickup">
      <h3 className="font-display text-base font-semibold text-[#251605]">
        Block pickup by room type
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Pickup counts reservation room units, not reservation headers.
      </p>
      {error ? (
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" className={PMS_OP_BTN_OUTLINE} onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : loading ? (
        <Skeleton className="mt-4 h-32 w-full" />
      ) : !anyPickup ? (
        <p className="mt-4 text-sm text-muted-foreground">{GROUP_DETAIL_EMPTY.pickup}</p>
      ) : (
        <div className={cn(PMS_OP_TABLE_SHELL, "mt-3")}>
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className={PMS_OP_TABLE_HEAD}>
              <tr>
                <th className="px-3 py-2">Room type</th>
                <th className="px-3 py-2">Blocked</th>
                <th className="px-3 py-2">Picked up</th>
                <th className="px-3 py-2">Remaining</th>
                <th className="px-3 py-2">Pickup %</th>
                <th className="px-3 py-2">Reservation units</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Fragment key={row.blockId}>
                  <tr className={PMS_OP_TABLE_ROW}>
                    <td className="px-3 py-2">{row.roomTypeName}</td>
                    <td className="px-3 py-2 tabular-nums">{row.blocked}</td>
                    <td className="px-3 py-2 tabular-nums">{row.pickedUp}</td>
                    <td className="px-3 py-2 tabular-nums">{row.remaining}</td>
                    <td className="px-3 py-2 tabular-nums">{row.pickupPercent}%</td>
                    <td className="px-3 py-2 tabular-nums">{row.reservationUnits}</td>
                  </tr>
                  {row.units.map((unit) => (
                    <tr
                      key={unit.reservationRoomId}
                      className={PMS_OP_TABLE_ROW}
                      data-testid="group-detail-pickup-unit"
                    >
                      <td className="px-3 py-2 pl-6 text-xs text-muted-foreground" colSpan={6}>
                        {unit.confirmationNumber}
                        {unit.guestName ? ` · ${unit.guestName}` : ""}
                        {` · ${unit.roomNumber ?? "Unassigned"}`}
                        {unit.roomTypeName ? ` · ${unit.roomTypeName}` : ""}
                        {` · ${unit.arrivalDate} → ${unit.departureDate}`}
                        {` · ${unit.unitStatus.replaceAll("_", " ")}`}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function RoomingTab({
  restaurantId,
  canWrite,
  group,
  blocks,
  rooming,
  onAddRooming,
  onConvert,
  onChanged,
  onOpenReservation,
}: {
  restaurantId: string;
  canWrite: boolean;
  group: GroupRecord;
  blocks: GroupBlockRead[];
  rooming: GroupDetailData["rooming"];
  onAddRooming: typeof addRoomingRow;
  onConvert: typeof convertRoomingRow;
  onChanged: () => void;
  onOpenReservation: (id: string) => void;
}) {
  const loadGuests = useServerFn(listGuests);
  const [guestName, setGuestName] = useState("");
  const [guestId, setGuestId] = useState<string | null>(null);
  const [blockId, setBlockId] = useState(blocks[0]?.id ?? "");
  const guestsQuery = useQuery({
    queryKey: ["pms-group-rooming-guests", restaurantId, guestName],
    queryFn: () => loadGuests({ data: { restaurantId, search: guestName, limit: 8 } }),
    enabled: guestName.trim().length >= 2,
  });

  return (
    <section className={cn(PMS_OP_PANEL, "p-4")} data-testid="group-detail-rooming">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-base font-semibold text-[#251605]">Rooming list</h3>
      </div>
      {rooming.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{GROUP_DETAIL_EMPTY.rooming}</p>
      ) : (
        <div className={cn(PMS_OP_TABLE_SHELL, "mt-3")}>
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className={PMS_OP_TABLE_HEAD}>
              <tr>
                <th className="px-3 py-2">Guest name</th>
                <th className="px-3 py-2">Guest profile</th>
                <th className="px-3 py-2">Room type</th>
                <th className="px-3 py-2">Block</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Linked reservation</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rooming.map((row) => {
                const block = blocks.find((item) => item.id === row.group_block_id);
                return (
                  <tr key={row.id} className={PMS_OP_TABLE_ROW}>
                    <td className="px-3 py-2">{row.guest_name}</td>
                    <td className="px-3 py-2">{row.guest_id ? "Linked" : "Name only"}</td>
                    <td className="px-3 py-2">{block?.roomTypeName ?? "—"}</td>
                    <td className="px-3 py-2">
                      {block
                        ? `${formatStayDate(block.startDate)} → ${formatStayDate(block.endDate)}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2 capitalize">{row.status}</td>
                    <td className="px-3 py-2">{row.reservation_id ? "Created" : "—"}</td>
                    <td className="px-3 py-2">
                      {row.reservation_id ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className={PMS_OP_BTN_COMPACT}
                          onClick={() => onOpenReservation(row.reservation_id!)}
                        >
                          Open reservation
                        </Button>
                      ) : canWrite ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className={PMS_OP_BTN_COMPACT}
                          data-testid="group-detail-convert-rooming"
                          onClick={() =>
                            void onConvert({
                              data: { restaurantId, groupId: group.id, rowId: row.id },
                            })
                              .then(() => {
                                toast.success("Reservation created from rooming list.");
                                onChanged();
                              })
                              .catch((error: unknown) =>
                                toast.error(
                                  error instanceof Error
                                    ? error.message
                                    : "Could not convert rooming row.",
                                ),
                              )
                          }
                        >
                          Convert
                        </Button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {canWrite ? (
        <form
          className="mt-4 grid gap-2 md:grid-cols-3"
          data-testid="group-detail-add-rooming"
          onSubmit={(event) => {
            event.preventDefault();
            const block = blocks.find((item) => item.id === blockId) ?? blocks[0];
            void onAddRooming({
              data: {
                restaurantId,
                groupId: group.id,
                groupBlockId: block?.id ?? null,
                guestId,
                guestName: guestName.trim(),
                arrivalDate: group.arrivalDate,
                departureDate: group.departureDate,
                adults: 1,
                children: 0,
                roomTypeId: block?.roomTypeId ?? null,
              },
            })
              .then(() => {
                toast.success("Rooming row added.");
                setGuestName("");
                setGuestId(null);
                onChanged();
              })
              .catch((error: unknown) =>
                toast.error(error instanceof Error ? error.message : "Could not add rooming row."),
              );
          }}
        >
          <Input
            className={inputClass}
            value={guestName}
            onChange={(event) => {
              setGuestName(event.target.value);
              setGuestId(null);
            }}
            placeholder="Guest name"
            required
          />
          <select
            className={cn(PMS_OP_SELECT_TRIGGER, "h-10")}
            value={blockId}
            onChange={(event) => setBlockId(event.target.value)}
          >
            <option value="">No block</option>
            {blocks.map((block) => (
              <option key={block.id} value={block.id}>
                {block.roomTypeName ?? "Room type"}
              </option>
            ))}
          </select>
          <Button type="submit" className="bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]">
            Add rooming row
          </Button>
          {guestListItems(guestsQuery.data).length > 0 ? (
            <ul className="md:col-span-3 rounded-md border border-[#DDD4C5] bg-white">
              {guestListItems(guestsQuery.data).map((guest) => (
                <li key={guest.id}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-[#F7F4EE]"
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
        </form>
      ) : null}
    </section>
  );
}

function LinkedTab({
  units,
  loading,
  error,
  onRetry,
  onOpenReservation,
}: {
  units: GroupOperationalUnit[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpenReservation: (id: string) => void;
}) {
  const rows = groupLinkedUnitRows(units);
  return (
    <section className={cn(PMS_OP_PANEL, "p-4")} data-testid="group-detail-linked">
      <h3 className="font-display text-base font-semibold text-[#251605]">Linked reservations</h3>
      {error ? (
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" className={PMS_OP_BTN_OUTLINE} onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : loading ? (
        <Skeleton className="mt-4 h-32 w-full" />
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{GROUP_DETAIL_EMPTY.linked}</p>
      ) : (
        <div className={cn(PMS_OP_TABLE_SHELL, "mt-3")}>
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className={PMS_OP_TABLE_HEAD}>
              <tr>
                <th className="px-3 py-2">Confirmation</th>
                <th className="px-3 py-2">Guest</th>
                <th className="px-3 py-2">Room / Unit</th>
                <th className="px-3 py-2">Room type</th>
                <th className="px-3 py-2">Stay</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Block</th>
                <th className="px-3 py-2">Pickup contribution</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className={PMS_OP_TABLE_ROW}
                  data-testid="group-detail-linked-unit"
                >
                  <td className="px-3 py-2">{row.confirmationNumber}</td>
                  <td className="px-3 py-2">{row.guestName ?? "—"}</td>
                  <td className="px-3 py-2">{row.roomLabel}</td>
                  <td className="px-3 py-2">{row.roomTypeName ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{row.stay}</td>
                  <td className="px-3 py-2 capitalize">{row.status}</td>
                  <td className="px-3 py-2">{row.blockLabel}</td>
                  <td className="px-3 py-2">{row.pickupContribution}</td>
                  <td className="px-3 py-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className={PMS_OP_BTN_COMPACT}
                      data-testid="group-detail-open-reservation"
                      onClick={() => onOpenReservation(row.reservationId)}
                    >
                      Open reservation
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function HistoryTab({ history }: { history: GroupDetailData["history"] }) {
  return (
    <section className={cn(PMS_OP_PANEL, "p-4")} data-testid="group-detail-history">
      <h3 className="font-display text-base font-semibold text-[#251605]">Activity history</h3>
      {history.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{GROUP_DETAIL_EMPTY.history}</p>
      ) : (
        <div className={cn(PMS_OP_TABLE_SHELL, "mt-3")}>
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className={PMS_OP_TABLE_HEAD}>
              <tr>
                <th className="px-3 py-2">Date & time</th>
                <th className="px-3 py-2">Event</th>
                <th className="px-3 py-2">Details</th>
                <th className="px-3 py-2">User</th>
              </tr>
            </thead>
            <tbody>
              {history.map((event) => (
                <tr key={event.id} className={PMS_OP_TABLE_ROW}>
                  <td className="px-3 py-2 tabular-nums">
                    {event.created_at.slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="px-3 py-2">
                    {groupHistoryEventLabel(event.event_type, event.notes)}
                  </td>
                  <td className="px-3 py-2">
                    {groupHistoryDetails(event.previous_values, event.new_values, event.notes)}
                  </td>
                  <td className="px-3 py-2">Staff</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function EditGroupDialog({
  restaurantId,
  group,
  open,
  onAmend,
  onOpenChange,
  onChanged,
}: {
  restaurantId: string;
  group: GroupRecord;
  open: boolean;
  onAmend: typeof amendGroup;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState(group.name);
  const [groupType, setGroupType] = useState(group.groupType);
  const [status, setStatus] = useState(group.status);
  const [arrivalDate, setArrivalDate] = useState(group.arrivalDate);
  const [departureDate, setDepartureDate] = useState(group.departureDate);
  const [cutoffDate, setCutoffDate] = useState(group.cutoffDate ?? "");
  const [notes, setNotes] = useState(group.notes ?? "");
  const amend = useMutation({
    mutationFn: () =>
      onAmend({
        data: {
          restaurantId,
          groupId: group.id,
          name: name.trim(),
          groupType: groupType as (typeof GROUP_TYPES)[number],
          status: status as GroupStatus,
          arrivalDate,
          departureDate,
          cutoffDate: cutoffDate || null,
          notes: notes.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("Group updated.");
      onChanged();
      onOpenChange(false);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not amend group."),
  });
  const statusOptions = [group.status, ...allowedGroupStatusTargets(group.status)];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="group-detail-edit-dialog">
        <DialogHeader>
          <DialogTitle>Edit group</DialogTitle>
          <DialogDescription>
            Update fields supported by the current group amendment.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            amend.mutate();
          }}
        >
          <Input
            className={inputClass}
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
          <select
            className={cn(PMS_OP_SELECT_TRIGGER, "h-10")}
            value={groupType}
            onChange={(event) => setGroupType(event.target.value)}
          >
            {GROUP_TYPES.map((value) => (
              <option key={value} value={value}>
                {groupTypeLabel(value)}
              </option>
            ))}
          </select>
          <select
            className={cn(PMS_OP_SELECT_TRIGGER, "h-10")}
            value={status}
            onChange={(event) => setStatus(event.target.value as GroupStatus)}
          >
            {statusOptions.map((value) => (
              <option key={value} value={value}>
                {groupStatusLabel(value)}
              </option>
            ))}
          </select>
          <Input
            className={dateClass}
            type="date"
            value={arrivalDate}
            onChange={(event) => setArrivalDate(event.target.value)}
            required
          />
          <Input
            className={dateClass}
            type="date"
            value={departureDate}
            onChange={(event) => setDepartureDate(event.target.value)}
            required
          />
          <Input
            className={dateClass}
            type="date"
            value={cutoffDate}
            onChange={(event) => setCutoffDate(event.target.value)}
          />
          <Textarea
            className={cn(inputClass, "min-h-20")}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Internal notes"
          />
          <Button
            type="submit"
            disabled={amend.isPending}
            className="bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]"
          >
            Save group
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddAllotmentDialog({
  restaurantId,
  group,
  roomTypes,
  open,
  onAddBlock,
  onOpenChange,
  onChanged,
}: {
  restaurantId: string;
  group: GroupRecord;
  roomTypes: Array<{ id: string; name: string }>;
  open: boolean;
  onAddBlock: typeof addGroupBlock;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const loadAvailability = useServerFn(getRoomTypeAvailability);
  const loadRules = useServerFn(getInventoryRules);
  const [row, setRow] = useState<GroupAllotmentDraftRow>(
    emptyAllotmentRow(group.arrivalDate, group.departureDate, "add-block"),
  );
  const rulesQuery = useQuery({
    queryKey: ["pms-groups-create-inventory-rules", restaurantId],
    queryFn: () => loadRules({ data: { restaurantId } }),
    enabled: open,
  });
  const availabilityQuery = useQuery({
    queryKey: ["pms-groups-create-availability", restaurantId, row.startDate, row.endDate],
    queryFn: () =>
      loadAvailability({ data: { restaurantId, arrival: row.startDate, departure: row.endDate } }),
    enabled: open && Boolean(row.startDate && row.endDate && row.endDate > row.startDate),
  });
  const preflight = groupBlockPreflightFromRules(rulesQuery.data?.rules.blockTypes, roomTypes);
  const available =
    availabilityQuery.data?.find((type) => type.roomTypeId === row.roomTypeId)?.available ?? null;
  const issue = validateAllotmentRow(row, group, available, preflight);

  const add = useMutation({
    mutationFn: () => {
      if (issue) throw new Error(issue);
      return onAddBlock({
        data: {
          restaurantId,
          groupId: group.id,
          roomTypeId: row.roomTypeId,
          startDate: row.startDate,
          endDate: row.endDate,
          allotted: row.allotted,
          cutoffDate: row.cutoffDate || null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Room block created.");
      onChanged();
      onOpenChange(false);
      setRow(emptyAllotmentRow(group.arrivalDate, group.departureDate, "add-block"));
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not create room block."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="group-detail-add-allotment-dialog">
        <DialogHeader>
          <DialogTitle>Add allotment</DialogTitle>
          <DialogDescription>
            Hold rooms for this group using an active room block.
          </DialogDescription>
        </DialogHeader>
        {preflight.status === "ready" && !preflight.quantityHoldsSupported ? (
          <p className="text-sm text-[#9B3A3A]">{GROUP_BLOCKS_DISABLED_HELPER}</p>
        ) : null}
        <div className="grid gap-3">
          <select
            className={cn(PMS_OP_SELECT_TRIGGER, "h-10")}
            value={row.roomTypeId}
            onChange={(event) => setRow({ ...row, roomTypeId: event.target.value })}
            data-testid="group-detail-block-type"
          >
            <option value="">Select room type</option>
            {roomTypes.map((type) => (
              <option
                key={type.id}
                value={type.id}
                disabled={!isRoomTypeSelectableForBlock(type.id, preflight)}
              >
                {isRoomTypeSelectableForBlock(type.id, preflight)
                  ? type.name
                  : `${type.name} · ${GROUP_BLOCK_NOT_AVAILABLE}`}
              </option>
            ))}
          </select>
          <Input
            className={dateClass}
            type="date"
            value={row.startDate}
            onChange={(event) => setRow({ ...row, startDate: event.target.value })}
          />
          <Input
            className={dateClass}
            type="date"
            value={row.endDate}
            onChange={(event) => setRow({ ...row, endDate: event.target.value })}
          />
          <Input
            className={inputClass}
            type="number"
            min={1}
            value={row.allotted}
            onChange={(event) => setRow({ ...row, allotted: Number(event.target.value) || 0 })}
          />
          <Input
            className={dateClass}
            type="date"
            value={row.cutoffDate}
            onChange={(event) => setRow({ ...row, cutoffDate: event.target.value })}
          />
          {issue ? <p className="text-xs text-[#9B3A3A]">{issue}</p> : null}
          <Button
            disabled={Boolean(issue) || add.isPending}
            className="bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]"
            onClick={() => add.mutate()}
          >
            Create allotment
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-[#251605]">{value}</dd>
    </div>
  );
}
