import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

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
import { PermissionDeniedPanel } from "@/packages/pms/components/frontoffice/coming-soon-panel";
import { beforeAfterFromHistory } from "@/packages/pms/lib/fo-amendments";
import { formatFoDateTime, localDateFromInstant } from "@/packages/pms/lib/fo-cancel-noshow";
import { auditActionLabel } from "@/packages/pms/lib/fo-exceptions";
import { isPermissionDeniedMessage } from "@/packages/pms/lib/front-office-shell";
import { listReservationAmendments } from "@/packages/pms/lib/reservations.functions";

const ALL = "all";

export function FoAuditViewer({
  restaurantId,
  open,
  onOpenChange,
}: {
  restaurantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const fetchHistory = useServerFn(listReservationAmendments);
  const [date, setDate] = useState("");
  const [actor, setActor] = useState(ALL);
  const [action, setAction] = useState(ALL);

  const query = useQuery({
    queryKey: ["fo-activity", restaurantId],
    queryFn: () => fetchHistory({ data: { restaurantId, limit: 200 } }),
    enabled: open,
    retry: false,
  });

  const rows = query.data ?? [];
  const actors = useMemo(
    () => Array.from(new Set(rows.map((row) => row.actorName).filter((name): name is string => Boolean(name)))).sort(),
    [rows],
  );
  const actions = useMemo(
    () =>
      Array.from(
        new Set(rows.map((row) => auditActionLabel(row.eventType, row.newValues))),
      ).sort(),
    [rows],
  );

  const visible = rows.filter((row) => {
    if (date && localDateFromInstant(row.createdAt) !== date) return false;
    if (actor !== ALL && row.actorName !== actor) return false;
    if (action !== ALL && auditActionLabel(row.eventType, row.newValues) !== action) return false;
    return true;
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg" data-testid="fo-audit-viewer">
        <SheetHeader>
          <SheetTitle>FO activity</SheetTitle>
          <SheetDescription>
            Read-only history already written by Front Office. Missing actor or reason is left blank.
          </SheetDescription>
        </SheetHeader>

        {query.isError && isPermissionDeniedMessage(query.error) ? (
          <PermissionDeniedPanel
            className="mt-4"
            {...(query.error instanceof Error ? { message: query.error.message } : {})}
          />
        ) : (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="fo-audit-date">Date</Label>
                <Input id="fo-audit-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Actor</Label>
                <Select value={actor} onValueChange={setActor}>
                  <SelectTrigger>
                    <SelectValue placeholder="Actor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All actors</SelectItem>
                    {actors.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Action</Label>
                <Select value={action} onValueChange={setAction}>
                  <SelectTrigger>
                    <SelectValue placeholder="Action" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All actions</SelectItem>
                    {actions.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {query.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading FO activity…</p>
            ) : visible.length === 0 ? (
              <p className="text-sm text-muted-foreground">No FO activity matches these filters.</p>
            ) : (
              <ul className="space-y-3">
                {visible.map((row) => {
                  const snapshots = beforeAfterFromHistory(row.previousValues, row.newValues);
                  return (
                    <li key={row.id} className="rounded-2xl border border-border bg-card p-3">
                      <p className="text-xs text-muted-foreground">{formatFoDateTime(row.createdAt)}</p>
                      <p className="mt-1 text-sm font-medium">{auditActionLabel(row.eventType, row.newValues)}</p>
                      <p className="text-xs text-muted-foreground">{row.actorName ?? "—"}</p>
                      <p className="mt-1 text-sm">
                        <Link
                          to="/restaurant/pms/reservations/$reservationId"
                          params={{ reservationId: row.reservationId }}
                          className="underline-offset-4 hover:underline"
                        >
                          {row.confirmationNumber}
                        </Link>
                        <span className="text-muted-foreground"> · {row.guestName}</span>
                      </p>
                      {row.notes ? <p className="mt-1 text-xs text-muted-foreground">Reason: {row.notes}</p> : null}
                      {snapshots.length > 0 ? (
                        <dl className="mt-2 space-y-1 text-xs">
                          {snapshots.map((pair) => (
                            <div key={`${row.id}-${pair.label}`} className="flex flex-wrap gap-x-2">
                              <dt className="capitalize text-muted-foreground">{pair.label}</dt>
                              <dd>
                                {pair.previous} → {pair.next}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
