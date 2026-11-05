import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { cn } from "@/shared/lib/utils";
import { PmsFilterChoiceRow, PmsFilterMenu } from "@/packages/pms/components/pms-filter-menu";
import {
  HkBusinessDate,
  HkShellSlot,
  HkToolbarSearch,
} from "@/packages/pms/components/housekeeping/housekeeping-shell-slots";
import {
  ROOM_TABLE_HEAD,
  ROOM_TABLE_ROW,
  ROOM_TABLE_TD,
  ROOM_TABLE_TH,
  ROOM_TABLE_WRAP,
} from "@/packages/pms/components/rooms/room-inventory-shell";
import {
  listHousekeepingGuestRequests,
  updateHousekeepingGuestRequest,
  type HousekeepingGuestRequest,
} from "@/packages/pms/lib/housekeeping.functions";
import {
  GUEST_SERVICE_STATUS_LABELS,
  guestServiceRowActions,
  type GuestServiceStatus,
} from "@/packages/pms/lib/guest-services-workspace";
import { HK_GUEST_SERVICES_PATH, HK_FIELD_ACTION_CLASS } from "@/packages/pms/lib/housekeeping-shell";
import { PriorityBadge, formatWhen } from "./housekeeping-bits";
import { HkDesktopOnly, HkFieldActions, HkFieldCard, HkFieldStack } from "./housekeeping-field";

type Props = { restaurantId: string; today: string };

function errText(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong.";
}

export function HousekeepingRequestsTab({ restaurantId, today }: Props) {
  const qc = useQueryClient();
  const fetchList = useServerFn(listHousekeepingGuestRequests);
  const updateFn = useServerFn(updateHousekeepingGuestRequest);
  const list = useQuery({
    queryKey: ["hk-requests", restaurantId],
    queryFn: () => fetchList({ data: { restaurantId } }),
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<GuestServiceStatus | "open" | "all">("open");
  const [workNotes, setWorkNotes] = useState("");
  const [query, setQuery] = useState("");

  const rows = list.data ?? [];
  const queryText = query.trim().toLowerCase();
  const filtered = rows.filter((row) => {
    if (statusFilter === "all") {
      /* keep */
    } else if (statusFilter === "open") {
      if (row.status !== "requested" && row.status !== "in_progress") return false;
    } else if (row.status !== statusFilter) {
      return false;
    }
    if (!queryText) return true;
    return `${row.requestNumber ?? ""} ${row.serviceName} ${row.roomNumber ?? ""} ${row.guestName}`.toLowerCase().includes(queryText);
  });
  const selected = filtered.find((row) => row.id === selectedId) ?? null;

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ["hk-requests", restaurantId] });
    void qc.invalidateQueries({ queryKey: ["hk-rack", restaurantId] });
    void qc.invalidateQueries({ queryKey: ["hk-tasks", restaurantId] });
    void qc.invalidateQueries({ queryKey: ["guest-service-history", restaurantId] });
  }

  const update = useMutation({
    mutationFn: (vars: { requestId: string; status?: GuestServiceStatus; notes?: string }) =>
      updateFn({ data: { restaurantId, ...vars } }),
    onSuccess: () => {
      toast.success("Guest request updated.");
      setWorkNotes("");
      invalidate();
    },
    onError: (e) => toast.error(errText(e)),
  });

  const statusLabel =
    statusFilter === "open"
      ? "Open"
      : statusFilter === "all"
        ? ""
        : GUEST_SERVICE_STATUS_LABELS[statusFilter];

  return (
    <div className="space-y-4" data-testid="hk-requests-workspace">
      <HkShellSlot name="date">
        <HkBusinessDate today={today} />
      </HkShellSlot>
      <HkShellSlot name="search">
        <HkToolbarSearch
          value={query}
          onChange={setQuery}
          placeholder="Search request, room, guest, or service…"
          testId="hk-requests-search"
        />
      </HkShellSlot>
      <HkShellSlot name="filter">
        <PmsFilterMenu
          activeCount={statusFilter !== "open" ? 1 : 0}
          onClear={() => setStatusFilter("open")}
          buttonTestId="hk-requests-filters-button"
          menuTestId="hk-requests-filters-menu"
        >
          <PmsFilterChoiceRow
            label="Status"
            value={statusFilter}
            current={statusLabel}
            options={[
              ["open", "Open"],
              ["requested", GUEST_SERVICE_STATUS_LABELS.requested],
              ["in_progress", GUEST_SERVICE_STATUS_LABELS.in_progress],
              ["completed", GUEST_SERVICE_STATUS_LABELS.completed],
              ["all", "All"],
            ]}
            neutralValue="open"
            onChange={(value) => setStatusFilter(value as GuestServiceStatus | "open" | "all")}
          />
        </PmsFilterMenu>
      </HkShellSlot>

      <div className={cn("grid gap-4", selected && "xl:grid-cols-[minmax(0,1fr)_340px]")}>
        <HkFieldStack testId="hk-requests-field-worklist">
          {list.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading requests…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No housekeeping-routed guest requests.</p>
          ) : (
            filtered.map((row) => (
              <HkFieldCard key={row.id} selected={selected?.id === row.id}>
                <p className="font-medium">{row.requestNumber ?? "Request"}</p>
                <p className="text-sm">
                  {row.serviceName}
                  {row.roomNumber ? ` · Room ${row.roomNumber}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">{row.guestName}</p>
                <div className="flex items-center gap-2">
                  <PriorityBadge priority={row.priority} />
                  <span className="text-xs text-muted-foreground">{GUEST_SERVICE_STATUS_LABELS[row.status]}</span>
                </div>
                <RequestActions
                  row={row}
                  pending={update.isPending}
                  large
                  onUpdate={(status) =>
                    update.mutate({
                      requestId: row.id,
                      status,
                      notes: workNotes || undefined,
                    })
                  }
                />
              </HkFieldCard>
            ))
          )}
        </HkFieldStack>
        <HkDesktopOnly className={ROOM_TABLE_WRAP}>
          <table className="w-full min-w-[760px] text-sm">
            <thead className={ROOM_TABLE_HEAD}>
              <tr>
                <th className={ROOM_TABLE_TH}>Request</th>
                <th className={ROOM_TABLE_TH}>Room</th>
                <th className={ROOM_TABLE_TH}>Guest</th>
                <th className={ROOM_TABLE_TH}>Type</th>
                <th className={ROOM_TABLE_TH}>Priority</th>
                <th className={ROOM_TABLE_TH}>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.isLoading ? (
                <tr>
                  <td colSpan={6} className={`${ROOM_TABLE_TD} text-muted-foreground`}>
                    Loading requests…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className={`${ROOM_TABLE_TD} text-muted-foreground`}>
                    No housekeeping-routed guest requests.
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(
                      ROOM_TABLE_ROW,
                      "cursor-pointer",
                      selected?.id === row.id && "bg-[#F4E9D0]/70",
                    )}
                    onClick={() => setSelectedId(row.id)}
                  >
                    <td className={`${ROOM_TABLE_TD} font-medium`}>{row.requestNumber ?? "—"}</td>
                    <td className={ROOM_TABLE_TD}>{row.roomNumber ?? "—"}</td>
                    <td className={ROOM_TABLE_TD}>{row.guestName}</td>
                    <td className={`${ROOM_TABLE_TD} text-muted-foreground`}>{row.serviceName}</td>
                    <td className={ROOM_TABLE_TD}>
                      <PriorityBadge priority={row.priority} />
                    </td>
                    <td className={ROOM_TABLE_TD}>{GUEST_SERVICE_STATUS_LABELS[row.status]}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </HkDesktopOnly>

        {selected ? (
        <aside className="hidden rounded-2xl border border-border bg-background p-4 md:block">
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setSelectedId(null)}
              >
                Close
              </button>
            </div>
            <RequestDetail
              row={selected}
              workNotes={workNotes}
              onNotes={setWorkNotes}
              pending={update.isPending}
              onUpdate={(status) =>
                update.mutate({
                  requestId: selected.id,
                  status,
                  notes: workNotes || undefined,
                })
              }
            />
        </aside>
        ) : null}
      </div>
    </div>
  );
}

function RequestDetail({
  row,
  workNotes,
  onNotes,
  pending,
  onUpdate,
}: {
  row: HousekeepingGuestRequest;
  workNotes: string;
  onNotes: (value: string) => void;
  pending: boolean;
  onUpdate: (status: GuestServiceStatus) => void;
}) {
  const actions = guestServiceRowActions(row.status);
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {row.requestNumber ?? "Request"} · {GUEST_SERVICE_STATUS_LABELS[row.status]}
      </p>
      <h3 className="font-display text-xl">{row.serviceName}</h3>
      <p className="text-sm text-muted-foreground">
        {row.guestName}
        {row.roomNumber ? ` · Room ${row.roomNumber}` : ""}
        {row.confirmationNumber ? ` · ${row.confirmationNumber}` : ""}
      </p>
      <p className="text-sm">
        Priority <PriorityBadge priority={row.priority} />
      </p>
      {row.preferredAt ? (
        <p className="text-xs text-muted-foreground">Preferred {formatWhen(row.preferredAt)}</p>
      ) : null}
      {row.notes ? <p className="text-sm whitespace-pre-wrap">{row.notes}</p> : null}
      <p className="text-xs text-muted-foreground">Logged {formatWhen(row.requestedAt)}</p>
      <p className="text-xs text-muted-foreground">
        Guest Services owns this request. Housekeeping executes it here.
      </p>
      <div className="flex flex-col gap-1">
        <Link to="/restaurant/pms/guests/$guestId" params={{ guestId: row.guestId }} className="text-xs text-[#C89933]">
          Open guest profile
        </Link>
        <Link to={HK_GUEST_SERVICES_PATH} className="text-xs text-[#C89933]">
          Open Guest Services
        </Link>
      </div>
      {actions.start || actions.complete || actions.cancel ? (
        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea value={workNotes} onChange={(e) => onNotes(e.target.value)} rows={2} />
        </div>
      ) : null}
      <RequestActions row={row} pending={pending} large={false} onUpdate={onUpdate} />
    </div>
  );
}

function RequestActions({
  row,
  pending,
  large,
  onUpdate,
}: {
  row: HousekeepingGuestRequest;
  pending: boolean;
  large: boolean;
  onUpdate: (status: GuestServiceStatus) => void;
}) {
  const actions = guestServiceRowActions(row.status);
  if (!actions.start && !actions.complete && !actions.cancel) return null;
  const cls = large ? HK_FIELD_ACTION_CLASS : undefined;
  return (
    <HkFieldActions>
      {actions.start ? (
        <Button className={cls} variant="outline" disabled={pending} onClick={() => onUpdate("in_progress")}>
          Start
        </Button>
      ) : null}
      {actions.complete ? (
        <Button
          className={cn(cls, "bg-[#C89933] text-[#251605] hover:bg-[#b8892c]")}
          disabled={pending}
          onClick={() => onUpdate("completed")}
        >
          Complete
        </Button>
      ) : null}
      {actions.cancel ? (
        <Button className={cls} variant="outline" disabled={pending} onClick={() => onUpdate("cancelled")}>
          Cancel
        </Button>
      ) : null}
    </HkFieldActions>
  );
}
