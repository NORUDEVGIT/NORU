import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
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
import { ComingSoonChip, PermissionDeniedPanel } from "@/packages/pms/components/frontoffice/coming-soon-panel";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/components/ui/collapsible";
import type { FrontOfficeStay } from "@/packages/pms/lib/frontoffice.functions";
import { getFrontOfficeExceptions, type FoControlSnapshot } from "@/packages/pms/lib/fo-control.functions";
import {
  FO_CONTROL_ACTION_LABELS,
  FO_CONTROL_CATEGORIES,
  FO_CONTROL_OWNERS,
  FO_CONTROL_OWNER_LABELS,
  FO_CONTROL_SEVERITIES,
  filterFrontOfficeExceptions,
  type FoControlAction,
  type FoControlCategory,
  type FoControlOwner,
  type FoControlSeverity,
  type FrontOfficeExceptionItem,
} from "@/packages/pms/lib/fo-control";
import { COMING_SOON_EXCEPTION_TYPES, type FoRackFocus } from "@/packages/pms/lib/fo-exceptions";
import { FO_BRAND, isPermissionDeniedMessage } from "@/packages/pms/lib/front-office-shell";
import { cn } from "@/shared/lib/utils";

export type { FoRackFocus };

export function useFoExceptionDesk(restaurantId: string, today: string, enabled = true) {
  const fetchExceptions = useServerFn(getFrontOfficeExceptions);
  const query = useQuery({
    queryKey: ["front-office", "exceptions", restaurantId, today],
    queryFn: () => fetchExceptions({ data: { restaurantId, businessDate: today } }),
    retry: false,
    enabled,
  });

  const snapshot: FoControlSnapshot | undefined = query.data;
  const stayById = useMemo(() => {
    const map = new Map<string, FrontOfficeStay>();
    for (const stay of snapshot?.stays ?? []) map.set(stay.id, stay);
    return map;
  }, [snapshot?.stays]);

  const denied = query.isError && isPermissionDeniedMessage(query.error);
  const failed = query.isError && !denied;

  return {
    snapshot,
    items: snapshot?.items ?? [],
    stayById,
    badgeCount: snapshot?.available ? snapshot.items.length : 0,
    highCount: (snapshot?.items ?? []).filter((row) => row.severity === "critical").length,
    openDiscrepancyRoomIds: new Set(snapshot?.openDiscrepancyRoomIds ?? []),
    denied: denied ? query.error : snapshot?.permissionDenied ? true : null,
    failed: failed || Boolean(snapshot && snapshot.available === false && !snapshot.permissionDenied),
    loading: query.isLoading,
    refetch: query.refetch,
    isError: query.isError,
    error: query.error,
    partialSources: snapshot?.partialSources ?? [],
  };
}

export function ExceptionsFrame({
  restaurantId,
  today,
  onAction,
  onOpenSheet,
}: {
  restaurantId: string;
  today: string;
  onAction: (action: FoControlAction, stay: FrontOfficeStay | null, row: FrontOfficeExceptionItem) => void;
  onOpenSheet: (stay: FrontOfficeStay) => void;
  onFocusRack?: (stay: FrontOfficeStay) => void;
  onOpenRack?: (focus?: FoRackFocus) => void;
  onOpenAudit?: () => void;
}) {
  const desk = useFoExceptionDesk(restaurantId, today);
  const queryClient = useQueryClient();
  const [category, setCategory] = useState<FoControlCategory | "all">("all");
  const [severity, setSeverity] = useState<FoControlSeverity | "all">("all");
  const [owner, setOwner] = useState<FoControlOwner | "all">("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(
    () => filterFrontOfficeExceptions(desk.items, { category, severity, owner, search }),
    [desk.items, category, severity, owner, search],
  );
  const selected = filtered.find((row) => row.id === selectedId) ?? desk.items.find((row) => row.id === selectedId) ?? null;
  const selectedStay = selected?.reservationId ? desk.stayById.get(selected.reservationId) ?? null : null;

  if (desk.denied) {
    return (
      <PermissionDeniedPanel
        {...(desk.denied instanceof Error ? { message: desk.denied.message } : {})}
      />
    );
  }

  return (
    <div className="space-y-4" data-testid="fo-exceptions-queue">
      <div>
        <h2 className="font-display text-xl">Exceptions</h2>
        <p className="text-sm text-muted-foreground">
          What needs Front Desk attention now. Items disappear when the owner state is fixed.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search guest, confirmation, room"
          className="max-w-xs"
        />
        <Select value={category} onValueChange={(value) => setCategory(value as FoControlCategory | "all")}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All areas</SelectItem>
            {FO_CONTROL_CATEGORIES.map((id) => (
              <SelectItem key={id} value={id}>{id.replaceAll("_", " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={severity} onValueChange={(value) => setSeverity(value as FoControlSeverity | "all")}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Severity" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severity</SelectItem>
            {FO_CONTROL_SEVERITIES.map((id) => (
              <SelectItem key={id} value={id}>{id}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={owner} onValueChange={(value) => setOwner(value as FoControlOwner | "all")}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Owner" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All owners</SelectItem>
            {FO_CONTROL_OWNERS.map((id) => (
              <SelectItem key={id} value={id}>{FO_CONTROL_OWNER_LABELS[id]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void queryClient.invalidateQueries({ queryKey: ["front-office", "exceptions", restaurantId, today] })}
        >
          Refresh
        </Button>
      </div>

      {desk.partialSources.map((source) => (
        <p key={source.source} className="text-sm text-muted-foreground">
          {source.message}
        </p>
      ))}

      {desk.loading ? (
        <p className="text-sm text-muted-foreground">Loading exceptions…</p>
      ) : desk.failed || desk.isError ? (
        <div className="space-y-2">
          <p className="text-sm text-destructive">
            {desk.error instanceof Error ? desk.error.message : "Exceptions could not be loaded."}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => void desk.refetch()}>
            Retry
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#CCCCCC] bg-card/60 px-6 py-10 text-center" data-testid="fo-exceptions-empty">
          <p className="text-sm font-medium text-[#251605]">
            {desk.items.length === 0 ? "No active exceptions" : "No exceptions match these filters"}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Severity</th>
                <th className="px-3 py-2 font-medium">Exception</th>
                <th className="px-3 py-2 font-medium">Stay / room</th>
                <th className="px-3 py-2 font-medium">Owner</th>
                <th className="px-3 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const stay = row.reservationId ? desk.stayById.get(row.reservationId) ?? null : null;
                return (
                  <tr
                    key={row.id}
                    data-testid="fo-exception-row"
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-accent/40"
                    onClick={() => setSelectedId(row.id)}
                  >
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide",
                          row.severity === "critical" && "bg-[#251605] text-white",
                          row.severity === "warning" && "bg-[#F4E9D0] text-[#251605]",
                          row.severity === "info" && "border border-border text-muted-foreground",
                        )}
                        style={row.severity === "critical" ? { backgroundColor: FO_BRAND.chrome } : undefined}
                      >
                        {row.severity}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-medium">{row.title}</p>
                      <p className="text-xs text-muted-foreground">{row.description}</p>
                    </td>
                    <td className="px-3 py-2">
                      <p>{row.guestName || "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.confirmationNumber || "—"}
                        {row.roomNumber ? ` · Room ${row.roomNumber}` : ""}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {FO_CONTROL_OWNER_LABELS[row.ownerModule]}
                      <p className="text-muted-foreground">{row.category.replaceAll("_", " ")}</p>
                    </td>
                    <td className="px-3 py-2">
                      <Button
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          onAction(row.actionHint, stay, row);
                        }}
                      >
                        {FO_CONTROL_ACTION_LABELS[row.actionHint]}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Collapsible>
        <CollapsibleTrigger className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          Not yet available
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 flex flex-wrap gap-2">
          {COMING_SOON_EXCEPTION_TYPES.filter((item) => item.id === "late_arrival").map((item) => (
            <ComingSoonChip key={item.id} label={item.label} hint="Coming soon — no count is shown." />
          ))}
        </CollapsibleContent>
      </Collapsible>

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent side="right" className="sm:max-w-md">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle>{selected.title}</SheetTitle>
                <SheetDescription>{selected.description}</SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-2 text-sm">
                <p><span className="text-muted-foreground">Guest: </span>{selected.guestName || "—"}</p>
                <p><span className="text-muted-foreground">Stay: </span>{selected.confirmationNumber || "—"}</p>
                <p><span className="text-muted-foreground">Room: </span>{selected.roomNumber ? `Room ${selected.roomNumber}` : "—"}</p>
                <p><span className="text-muted-foreground">Owner: </span>{FO_CONTROL_OWNER_LABELS[selected.ownerModule]}</p>
                <p className="text-xs text-muted-foreground">Fix the owner state. This list has no mark-done control.</p>
                <Button
                  className="mt-2"
                  onClick={() => {
                    onAction(selected.actionHint, selectedStay, selected);
                    setSelectedId(null);
                  }}
                >
                  {FO_CONTROL_ACTION_LABELS[selected.actionHint]}
                </Button>
                {selectedStay ? (
                  <Button variant="outline" onClick={() => onOpenSheet(selectedStay)}>
                    Open stay
                  </Button>
                ) : null}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
