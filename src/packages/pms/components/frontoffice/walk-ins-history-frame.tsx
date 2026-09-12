import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { CheckInDialog } from "@/packages/pms/components/frontoffice/front-office-dialogs";
import { PermissionDeniedPanel } from "@/packages/pms/components/frontoffice/coming-soon-panel";
import { formatFoDateTime, WALK_IN_COMPLETE_BADGE, WALK_IN_INCOMPLETE_BADGE, WALK_INS_EMPTY } from "@/packages/pms/lib/fo-cancel-noshow";
import { listWalkInsHistory } from "@/packages/pms/lib/fo-cancel-noshow.functions";
import { isPermissionDeniedMessage } from "@/packages/pms/lib/front-office-shell";
import type { FrontOfficeStay } from "@/packages/pms/lib/frontoffice.functions";
import { useRestaurantTimezone } from "@/packages/restaurant-management/state/restaurant-context";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function WalkInsHistoryFrame({
  restaurantId,
  today,
}: {
  restaurantId: string;
  today: string;
}) {
  const timeZone = useRestaurantTimezone();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [completion, setCompletion] = useState<"all" | "complete" | "incomplete">("all");
  const [search, setSearch] = useState("");
  const [finishStay, setFinishStay] = useState<FrontOfficeStay | null>(null);

  const fetchHistory = useServerFn(listWalkInsHistory);
  const historyQuery = useQuery({
    queryKey: ["fo-walk-ins", restaurantId, from, to, completion, search],
    queryFn: () =>
      fetchHistory({
        data: {
          restaurantId,
          from,
          to,
          completion,
          ...(search.trim() ? { search: search.trim() } : {}),
        },
      }),
    retry: false,
  });

  if (historyQuery.isError && isPermissionDeniedMessage(historyQuery.error)) {
    return <PermissionDeniedPanel message={errorText(historyQuery.error)} />;
  }

  const rows = historyQuery.data ?? [];

  return (
    <div className="space-y-4" data-testid="fo-walk-ins-history">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="walkins-from">From</Label>
          <Input id="walkins-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="walkins-to">To</Label>
          <Input id="walkins-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="walkins-completion">Check-in</Label>
          <select
            id="walkins-completion"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={completion}
            onChange={(e) => setCompletion(e.target.value as "all" | "complete" | "incomplete")}
          >
            <option value="all">All</option>
            <option value="complete">Complete</option>
            <option value="incomplete">Incomplete</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="walkins-search">Search</Label>
          <Input
            id="walkins-search"
            placeholder="Guest or confirmation"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Date and time</th>
              <th className="px-4 py-3">Guest</th>
              <th className="px-4 py-3">Confirmation</th>
              <th className="px-4 py-3">Room</th>
              <th className="px-4 py-3">Created by</th>
              <th className="px-4 py-3">Check-in</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border">
                <td className="px-4 py-3">{formatFoDateTime(row.createdAt, timeZone)}</td>
                <td className="px-4 py-3 font-medium">{row.guestName}</td>
                <td className="px-4 py-3">{row.confirmationNumber}</td>
                <td className="px-4 py-3">{row.roomNumber ? `Room ${row.roomNumber}` : "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.createdBy}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      row.walkInIncomplete
                        ? "rounded-full bg-[#C89933]/20 px-2.5 py-1 text-xs font-semibold text-[#251605]"
                        : "rounded-full bg-[#436436]/15 px-2.5 py-1 text-xs font-semibold text-[#436436]"
                    }
                  >
                    {row.walkInIncomplete ? WALK_IN_INCOMPLETE_BADGE : WALK_IN_COMPLETE_BADGE}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  {row.walkInIncomplete ? (
                    <Button size="sm" variant="outline" onClick={() => setFinishStay(row.stay)}>
                      Finish check-in
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {historyQuery.isLoading ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Loading walk-ins…</p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">{WALK_INS_EMPTY}</p>
        ) : null}
      </div>

      {finishStay ? (
        <CheckInDialog
          restaurantId={restaurantId}
          stay={finishStay}
          open
          initialStep="registration"
          onOpenChange={(v) => !v && setFinishStay(null)}
        />
      ) : null}
    </div>
  );
}
