import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { cn } from "@/shared/lib/utils";
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
import { preferredTimeOverdue } from "@/packages/pms/lib/fo-guest-services";
import { HK_GUEST_SERVICES_PATH, HK_FIELD_ACTION_CLASS } from "@/packages/pms/lib/housekeeping-shell";
import { PriorityBadge, formatWhen } from "./housekeeping-bits";
import { HkDesktopOnly, HkFieldActions, HkFieldCard, HkFieldStack } from "./housekeeping-field";

type Props = { restaurantId: string; today: string };

function errText(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong.";
}

export function HousekeepingRequestsTab({ restaurantId }: Props) {
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

  const rows = list.data ?? [];
  const now = Date.now();
  const filtered = rows.filter((row) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "open") return row.status === "requested" || row.status === "in_progress";
    return row.status === statusFilter;
  });
  const selected = filtered.find((row) => row.id === selectedId) ?? filtered[0] ?? null;
  const openCount = rows.filter((row) => row.status === "requested").length;
  const progressCount = rows.filter((row) => row.status === "in_progress").length;
  const urgentCount = rows.filter(
    (row) => row.priority === "urgent" && (row.status === "requested" || row.status === "in_progress"),
  ).length;
  const overdueCount = rows.filter(
    (row) =>
      (row.status === "requested" || row.status === "in_progress") && preferredTimeOverdue(row.preferredAt, now),
  ).length;

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

  return (
    <div className="space-y-4" data-testid="hk-requests-workspace">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Pending", openCount, "Not started"],
          ["In progress", progressCount, "Being handled"],
          ["Urgent", urgentCount, "Need attention"],
          ["Preferred time passed", overdueCount, "Display only"],
        ].map(([label, value, hint]) => (
          <div key={label} className="rounded-2xl border border-border bg-background px-3 py-3">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="mt-1 font-display text-2xl font-semibold">{list.isLoading ? "—" : value}</p>
            <p className="text-[11px] text-muted-foreground">{hint}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {(["open", "requested", "in_progress", "completed", "all"] as const).map((key) => (
            <Button
              key={key}
              size="sm"
              variant={statusFilter === key ? "secondary" : "ghost"}
              onClick={() => setStatusFilter(key)}
            >
              {key === "open" ? "Open" : key === "all" ? "All" : GUEST_SERVICE_STATUS_LABELS[key]}
            </Button>
          ))}
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to={HK_GUEST_SERVICES_PATH}>Open Guest Services</Link>
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
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
        <HkDesktopOnly className="overflow-x-auto rounded-2xl border border-border bg-background">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3">Request</th>
                <th className="p-3">Room</th>
                <th className="p-3">Guest</th>
                <th className="p-3">Type</th>
                <th className="p-3">Priority</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {list.isLoading ? (
                <tr>
                  <td colSpan={6} className="p-4 text-muted-foreground">
                    Loading requests…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-4 text-muted-foreground">
                    No housekeeping-routed guest requests.
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(
                      "cursor-pointer border-t border-border",
                      selected?.id === row.id && "bg-[#F7F4EE]",
                    )}
                    onClick={() => setSelectedId(row.id)}
                  >
                    <td className="p-3 font-medium">{row.requestNumber ?? "—"}</td>
                    <td className="p-3">{row.roomNumber ?? "—"}</td>
                    <td className="p-3">{row.guestName}</td>
                    <td className="p-3 text-muted-foreground">{row.serviceName}</td>
                    <td className="p-3">
                      <PriorityBadge priority={row.priority} />
                    </td>
                    <td className="p-3">{GUEST_SERVICE_STATUS_LABELS[row.status]}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </HkDesktopOnly>

        <aside className="hidden rounded-2xl border border-border bg-background p-4 md:block">
          {selected ? (
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
          ) : (
            <p className="text-sm text-muted-foreground">Select a request to see details.</p>
          )}
        </aside>
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
