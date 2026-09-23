import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/shared/components/ui/button";
import { getGroupFinancials } from "@/packages/pms/lib/guest-group-detail.functions";
import { GROUP_MASTER_COPY, groupStatusLabel } from "@/packages/pms/lib/guest-group-detail-workspace";
import type { GroupDetailNavId } from "@/packages/pms/lib/guest-profile-wave1";

export function GuestGroupOverview({
  groupId,
  restaurantId,
  data,
  onNavigate,
  onEdit,
  canManageRes,
}: {
  groupId: string;
  restaurantId: string;
  data: {
    group: {
      id: string;
      code: string | null;
      name: string;
      accountStatus: string;
      groupTypeName: string | null;
      companyMasterName: string | null;
      travelAgentMasterName: string | null;
      primaryContactName: string | null;
      primaryContactEmail: string | null;
      primaryContactPhone: string | null;
      arrivalDate: string | null;
      departureDate: string | null;
      expectedPax: number | null;
      expectedRooms: number | null;
      notes: string | null;
      specialRequests: string | null;
      groupOperations?: Record<string, unknown>;
      createdAt: string;
      updatedAt: string;
    };
    kpis: { members: number; reservations: number; assignedRooms: number; expectedPax: number | null; expectedRooms: number | null };
    reservationStatus?: Record<string, number>;
    unassignedRooms?: number;
    folioAccess?: boolean;
    tourOperatorCopy: string;
  };
  onNavigate: (nav: GroupDetailNavId) => void;
  onEdit: () => void;
  canManageRes: boolean;
}) {
  const group = data.group;
  const loadFinancials = useServerFn(getGroupFinancials);
  const financials = useQuery({
    queryKey: ["group-financials", restaurantId, groupId],
    queryFn: () => loadFinancials({ data: { restaurantId, groupId } }),
    enabled: Boolean(data.folioAccess),
  });
  const operations = group.groupOperations ?? {};
  const billing = (operations.billing && typeof operations.billing === "object" ? operations.billing : {}) as Record<string, unknown>;

  return (
    <div className="space-y-4" data-testid="group-overview">
      <p className="text-sm text-muted-foreground">{GROUP_MASTER_COPY}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Members", value: `${data.kpis.members}${group.expectedPax != null ? ` / ${group.expectedPax} expected` : ""}`, nav: "members" as const },
          { label: "Reservations", value: String(data.kpis.reservations), nav: "reservations" as const },
          { label: "Rooms", value: `${data.kpis.assignedRooms} assigned · ${data.unassignedRooms ?? 0} open`, nav: "rooming" as const },
        ].map((item) => (
          <button
            key={item.label}
            type="button"
            className="rounded-2xl border border-border bg-card p-4 text-left"
            onClick={() => onNavigate(item.nav)}
          >
            <p className="text-sm text-muted-foreground">{item.label}</p>
            <p className="font-display text-2xl">{item.value}</p>
          </button>
        ))}
      </div>
      {data.reservationStatus && Object.keys(data.reservationStatus).length > 0 ? (
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Reservations by status</p>
          <p className="mt-1 text-sm">
            {Object.entries(data.reservationStatus)
              .map(([status, count]) => `${status.replaceAll("_", " ")} ${count}`)
              .join(" · ")}
          </p>
        </div>
      ) : null}
      {data.folioAccess && financials.data ? (
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            { label: "Charges", value: financials.data.summary.totalCharges },
            { label: "Payments", value: financials.data.summary.totalPayments },
            { label: "Outstanding", value: financials.data.summary.outstandingBalance },
            { label: "Estimated", value: financials.data.summary.estimatedRevenue },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              className="rounded-2xl border border-border bg-card p-4 text-left"
              onClick={() => onNavigate("financial")}
            >
              <p className="text-sm text-muted-foreground">{item.label}</p>
              <p className="font-display text-2xl">{item.value.toFixed(2)}</p>
            </button>
          ))}
        </div>
      ) : null}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl">Group master</h2>
            <p className="text-sm text-muted-foreground">
              {group.code ?? "Code pending"} · {groupStatusLabel(group.accountStatus)}
            </p>
          </div>
          <Button type="button" variant="outline" onClick={onEdit} disabled={group.accountStatus === "inactive"}>
            Edit master
          </Button>
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Type</dt>
            <dd>{group.groupTypeName || "Not set"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Stay dates</dt>
            <dd>{group.arrivalDate && group.departureDate ? `${group.arrivalDate} → ${group.departureDate}` : "Not set"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Expected</dt>
            <dd>
              {group.expectedPax ?? "—"} guests · {group.expectedRooms ?? "—"} rooms
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Primary contact</dt>
            <dd>{[group.primaryContactName, group.primaryContactEmail, group.primaryContactPhone].filter(Boolean).join(" · ") || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Company</dt>
            <dd>{group.companyMasterName || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Travel agency</dt>
            <dd>{group.travelAgentMasterName || "—"}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">{data.tourOperatorCopy}</p>
        {group.notes ? <p className="mt-3 text-sm">{group.notes}</p> : null}
        {group.specialRequests ? <p className="mt-2 text-sm">Requests: {group.specialRequests}</p> : null}
        {(operations.arrivalMethod || operations.departureMethod || billing.billingArrangement) ? (
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            {operations.arrivalMethod ? (
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Arrival</dt>
                <dd>{String(operations.arrivalMethod)}</dd>
              </div>
            ) : null}
            {operations.departureMethod ? (
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Departure</dt>
                <dd>{String(operations.departureMethod)}</dd>
              </div>
            ) : null}
            {billing.billingArrangement ? (
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Billing arrangement</dt>
                <dd>{String(billing.billingArrangement)}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
        <p className="mt-3 text-xs text-muted-foreground">
          Created {group.createdAt.slice(0, 10)} · Updated {group.updatedAt.slice(0, 10)}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => onNavigate("members")}>
          Manage members
        </Button>
        {canManageRes ? (
          <Link to="/restaurant/bookings/new" search={{ groupAccountMasterId: groupId }}>
            <Button type="button">Create reservation</Button>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
