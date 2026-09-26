import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";

import { PermissionDeniedPanel } from "@/packages/pms/components/frontoffice/coming-soon-panel";
import { isPermissionDeniedMessage } from "@/packages/pms/lib/front-office-shell";
import {
  GUEST_PROFILE_DETAIL_PATH,
  guestProfileSearch,
} from "@/packages/pms/lib/guest-profile-wave1";
import { GUEST_SERVICE_PRIORITY_LABELS, GUEST_SERVICE_STATUS_LABELS } from "@/packages/pms/lib/guest-services-workspace";
import { preferredTimeOverdue, foGuestServiceHeadline } from "@/packages/pms/lib/fo-guest-services";
import { getFrontOfficeGuestServiceSummary } from "@/packages/pms/lib/fo-guest-services.functions";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";

export function FoGuestServicesPanel({
  restaurantId,
  reservationId,
  guestId,
  compact = false,
}: {
  restaurantId: string;
  reservationId: string;
  guestId: string;
  compact?: boolean;
}) {
  const fetchSummary = useServerFn(getFrontOfficeGuestServiceSummary);
  const query = useQuery({
    queryKey: ["front-office", "guest-services", restaurantId, reservationId],
    queryFn: () => fetchSummary({ data: { restaurantId, reservationId, guestId } }),
    retry: false,
  });

  const servicesHref = {
    to: GUEST_PROFILE_DETAIL_PATH,
    params: { guestId },
    search: guestProfileSearch({ card: "services" }),
  } as const;

  if (query.isError && isPermissionDeniedMessage(query.error)) {
    return compact ? null : <PermissionDeniedPanel message="You don't have access to Guest Services for this stay." />;
  }
  if (query.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading guest services…</p>;
  }
  if (query.isError) {
    return (
      <div className="space-y-2 text-sm">
        <p className="text-destructive">
          {query.error instanceof Error ? query.error.message : "Could not load guest services."}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const summary = query.data;
  if (!summary) return null;
  if (summary.permissionDenied) {
    return compact ? null : <PermissionDeniedPanel message="You don't have access to Guest Services for this stay." />;
  }
  if (!summary.available) {
    return (
      <p className="text-sm text-muted-foreground">Guest Services is unavailable until its workspace is configured.</p>
    );
  }

  const headline = foGuestServiceHeadline(summary.signals);
  const nowMs = Date.now();

  if (compact) {
    if (summary.signals.activeCount === 0) return null;
    return (
      <p className="text-sm" data-testid="fo-gs-compact">
        Guest Services: {headline}.{" "}
        <Link className="underline-offset-4 hover:underline" {...servicesHref}>
          View all
        </Link>
      </p>
    );
  }

  return (
    <section className="space-y-2" data-testid="fo-gs-panel">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Guest Services</h3>
        <Button variant="link" className="h-auto px-0 text-xs" asChild>
          <Link {...servicesHref}>View all</Link>
        </Button>
      </div>
      <p className="text-sm">{headline}</p>
      {!summary.typesConfigured ? (
        <p className="text-xs text-muted-foreground">No active Guest Service Types in Settings.</p>
      ) : null}
      <p className="text-xs text-muted-foreground">SLA clock is not configured on these requests.</p>
      {summary.active.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active requests.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {summary.active.map((item) => {
            const overdue = preferredTimeOverdue(item.preferredAt, nowMs);
            return (
              <li key={item.id} className="rounded-xl border border-border p-3">
                <p className="font-medium">
                  <Link className="underline-offset-4 hover:underline" {...servicesHref}>
                    {item.serviceName}
                  </Link>
                </p>
                <p className="text-xs text-muted-foreground">
                  {item.categoryName || "Type"} · {GUEST_SERVICE_STATUS_LABELS[item.status]} ·{" "}
                  <span className={cn(item.priority === "urgent" && "font-semibold text-destructive")}>
                    {GUEST_SERVICE_PRIORITY_LABELS[item.priority]}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {item.assignedName ? `Assigned ${item.assignedName}` : "Unassigned"}
                  {" · "}
                  {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(
                    new Date(item.requestedAt),
                  )}
                </p>
                {item.preferredAt ? (
                  <p className={cn("text-xs", overdue ? "text-destructive" : "text-muted-foreground")}>
                    Preferred {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.preferredAt))}
                    {overdue ? " · passed" : ""}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">No due time set</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
