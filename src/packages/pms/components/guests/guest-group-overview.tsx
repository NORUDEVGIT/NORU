import { Link } from "@tanstack/react-router";

import { Button } from "@/shared/components/ui/button";
import { GROUP_MASTER_COPY, groupStatusLabel } from "@/packages/pms/lib/guest-group-detail-workspace";
import type { GroupDetailNavId } from "@/packages/pms/lib/guest-profile-wave1";

export function GuestGroupOverview({
  groupId,
  data,
  onNavigate,
  onEdit,
  canManageRes,
}: {
  groupId: string;
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
      createdAt: string;
      updatedAt: string;
    };
    kpis: { members: number; reservations: number; assignedRooms: number };
    tourOperatorCopy: string;
  };
  onNavigate: (nav: GroupDetailNavId) => void;
  onEdit: () => void;
  canManageRes: boolean;
}) {
  const group = data.group;
  return (
    <div className="space-y-4" data-testid="group-overview">
      <p className="text-sm text-muted-foreground">{GROUP_MASTER_COPY}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Members", value: data.kpis.members, nav: "members" as const },
          { label: "Reservations", value: data.kpis.reservations, nav: "reservations" as const },
          { label: "Assigned rooms", value: data.kpis.assignedRooms, nav: "rooming" as const },
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
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl">Group master</h2>
            <p className="text-sm text-muted-foreground">
              {group.code ?? "Code pending"} · {groupStatusLabel(group.accountStatus)}
            </p>
          </div>
          <Button type="button" variant="outline" onClick={onEdit}>
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
