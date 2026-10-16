import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BedDouble,
  Building,
  Calendar,
  CheckCircle2,
  DollarSign,
  Hotel,
  Mail,
  Phone,
  Users,
} from "lucide-react";

import { Badge } from "@/shared/components/ui/badge";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { getGroupFinancials } from "@/packages/pms/lib/guest-group-detail.functions";
import {
  GROUP_MASTER_COPY,
  groupStatusLabel,
} from "@/packages/pms/lib/guest-group-detail-workspace";
import type { CanonicalGroupViewId } from "@/packages/pms/lib/guest-group-detail-view";

export function GuestGroupOverviewView({
  groupId,
  restaurantId,
  data,
  onNavigate,
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
    };
    kpis: {
      members: number;
      reservations: number;
      assignedRooms: number;
      expectedPax: number | null;
      expectedRooms: number | null;
    };
    reservationStatus?: Record<string, number>;
    unassignedRooms?: number;
    folioAccess?: boolean;
  };
  onNavigate: (nav: CanonicalGroupViewId) => void;
}) {
  const group = data.group;
  const loadFinancials = useServerFn(getGroupFinancials);
  const financials = useQuery({
    queryKey: ["group-financials", restaurantId, groupId],
    queryFn: () => loadFinancials({ data: { restaurantId, groupId } }),
    enabled: Boolean(data.folioAccess),
  });

  return (
    <div className="space-y-6" data-testid="group-overview-view">
      {/* Intro Header Note */}
      <div className="rounded-2xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
        <p className="text-xs text-[#756A5B]">{GROUP_MASTER_COPY}</p>
      </div>

      {/* L1. Compact 6-Cell Summary Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" data-testid="group-overview-kpis">
        <div className="rounded-xl border border-[#DDD4C5] bg-white p-3 text-left shadow-sm">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">Status</span>
          <div className="mt-1">
            <Badge variant={group.accountStatus === "active" ? "default" : "secondary"}>
              {groupStatusLabel(group.accountStatus)}
            </Badge>
          </div>
        </div>

        <div className="rounded-xl border border-[#DDD4C5] bg-white p-3 text-left shadow-sm">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">Group Type</span>
          <p className="mt-1 truncate text-xs font-semibold text-[#251605]">
            {group.groupTypeName ?? "General"}
          </p>
        </div>

        <div
          className="rounded-xl border border-[#DDD4C5] bg-white p-3 text-left shadow-sm"
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">Members</span>
          <p className="mt-1 font-display text-lg font-bold text-[#251605]">
            {data.kpis.members}
            {group.expectedPax != null ? (
              <span className="text-xs font-normal text-[#756A5B]"> / {group.expectedPax} exp</span>
            ) : null}
          </p>
        </div>

        <div
          className="rounded-xl border border-[#DDD4C5] bg-white p-3 text-left shadow-sm"
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">Reservations</span>
          <p className="mt-1 font-display text-lg font-bold text-[#251605]">
            {data.kpis.reservations}
          </p>
        </div>

        <div
          className="rounded-xl border border-[#DDD4C5] bg-white p-3 text-left shadow-sm"
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">Assigned Rooms</span>
          <p className="mt-1 font-display text-lg font-bold text-emerald-700">
            {data.kpis.assignedRooms}
            <span className="text-xs font-normal text-[#756A5B]"> / {data.kpis.reservations}</span>
          </p>
        </div>

        <div
          className="rounded-xl border border-[#DDD4C5] bg-white p-3 text-left shadow-sm"
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#756A5B]">
            {data.folioAccess ? "Outstanding" : "Expected Rooms"}
          </span>
          {data.folioAccess ? (
            financials.isLoading ? (
              <Skeleton className="mt-1 h-5 w-16" />
            ) : (
              <p className="mt-1 font-display text-lg font-bold text-[#251605]">
                {financials.data?.summary.outstandingBalance ?? "$0.00"}
              </p>
            )
          ) : (
            <p className="mt-1 font-display text-lg font-bold text-[#251605]">
              {group.expectedRooms ?? "—"}
            </p>
          )}
        </div>
      </div>

      {/* L2. Primary Row (3 Panels) */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Panel 1: Group Information */}
        <div className="rounded-2xl border border-[#DDD4C5] bg-white p-4 shadow-sm space-y-3">
          <div className="flex items-center gap-2 border-b border-[#DDD4C5]/60 pb-2">
            <Users className="size-4 text-[#8A641A]" />
            <h3 className="font-display text-sm font-semibold text-[#251605]">Group Information</h3>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-[#756A5B]">Code:</span>
              <span className="font-mono font-medium text-[#251605]">{group.code ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#756A5B]">Type:</span>
              <span className="text-[#251605]">{group.groupTypeName ?? "General"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#756A5B]">Status:</span>
              <span className="capitalize text-[#251605]">{groupStatusLabel(group.accountStatus)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#756A5B]">Expected Capacity:</span>
              <span className="font-medium text-[#251605]">
                {group.expectedPax ?? "—"} pax · {group.expectedRooms ?? "—"} rooms
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#756A5B]">Dates:</span>
              <span className="text-[#251605]">
                {group.arrivalDate && group.departureDate
                  ? `${group.arrivalDate} → ${group.departureDate}`
                  : "Not set"}
              </span>
            </div>
          </div>
        </div>

        {/* Panel 2: Primary Contact & Partners */}
        <div className="rounded-2xl border border-[#DDD4C5] bg-white p-4 shadow-sm space-y-3">
          <div className="flex items-center gap-2 border-b border-[#DDD4C5]/60 pb-2">
            <Building className="size-4 text-[#8A641A]" />
            <h3 className="font-display text-sm font-semibold text-[#251605]">Contact & Partners</h3>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-[#756A5B]">Contact:</span>
              <span className="font-medium text-[#251605]">{group.primaryContactName || "None"}</span>
            </div>
            {group.primaryContactEmail ? (
              <div className="flex items-center justify-between gap-1">
                <span className="text-[#756A5B]">Email:</span>
                <span className="truncate text-[#251605]">{group.primaryContactEmail}</span>
              </div>
            ) : null}
            {group.primaryContactPhone ? (
              <div className="flex justify-between">
                <span className="text-[#756A5B]">Phone:</span>
                <span className="text-[#251605]">{group.primaryContactPhone}</span>
              </div>
            ) : null}
            <div className="flex justify-between pt-1 border-t border-[#DDD4C5]/40">
              <span className="text-[#756A5B]">Company:</span>
              <span className="font-medium text-[#251605]">{group.companyMasterName || "None"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#756A5B]">Travel Agency:</span>
              <span className="font-medium text-[#251605]">{group.travelAgentMasterName || "None"}</span>
            </div>
          </div>
        </div>

        {/* Panel 3: Upcoming / Current Stay */}
        <div className="rounded-2xl border border-[#DDD4C5] bg-white p-4 shadow-sm space-y-3">
          <div className="flex items-center gap-2 border-b border-[#DDD4C5]/60 pb-2">
            <Calendar className="size-4 text-[#8A641A]" />
            <h3 className="font-display text-sm font-semibold text-[#251605]">Stay Snapshot</h3>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-[#756A5B]">Arrival:</span>
              <span className="font-medium text-[#251605]">{group.arrivalDate ?? "Not set"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#756A5B]">Departure:</span>
              <span className="font-medium text-[#251605]">{group.departureDate ?? "Not set"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#756A5B]">Total Reservations:</span>
              <span className="font-medium text-[#251605]">{data.kpis.reservations}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#756A5B]">Open (Unassigned):</span>
              <span className="font-medium text-amber-700">{data.unassignedRooms ?? 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* L3. Secondary Row (3 Panels) */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Panel 1: Rooming Snapshot */}
        <div className="rounded-2xl border border-[#DDD4C5] bg-white p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-[#DDD4C5]/60 pb-2">
            <div className="flex items-center gap-2">
              <BedDouble className="size-4 text-[#8A641A]" />
              <h3 className="font-display text-sm font-semibold text-[#251605]">Rooming Snapshot</h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("rooming")}
              className="text-[11px] font-medium text-[#8A641A] hover:underline"
            >
              View Rooming
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg bg-[#F7F4EE] p-2">
              <span className="text-[10px] text-[#756A5B]">Assigned</span>
              <p className="mt-0.5 font-display text-base font-bold text-emerald-700">
                {data.kpis.assignedRooms}
              </p>
            </div>
            <div className="rounded-lg bg-[#F7F4EE] p-2">
              <span className="text-[10px] text-[#756A5B]">Unassigned</span>
              <p className="mt-0.5 font-display text-base font-bold text-amber-700">
                {data.unassignedRooms ?? 0}
              </p>
            </div>
            <div className="rounded-lg bg-[#F7F4EE] p-2">
              <span className="text-[10px] text-[#756A5B]">Expected</span>
              <p className="mt-0.5 font-display text-base font-bold text-[#251605]">
                {group.expectedRooms ?? "—"}
              </p>
            </div>
          </div>
        </div>

        {/* Panel 2: Member Snapshot */}
        <div className="rounded-2xl border border-[#DDD4C5] bg-white p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-[#DDD4C5]/60 pb-2">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-[#8A641A]" />
              <h3 className="font-display text-sm font-semibold text-[#251605]">Member Snapshot</h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("members")}
              className="text-[11px] font-medium text-[#8A641A] hover:underline"
            >
              View Members
            </button>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-[#756A5B]">Total Members Linked:</span>
              <span className="font-display text-sm font-bold text-[#251605]">{data.kpis.members}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#756A5B]">Expected Pax:</span>
              <span className="text-[#251605]">{group.expectedPax ?? "Not specified"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#756A5B]">Group Contact:</span>
              <span className="text-[#251605]">{group.primaryContactName || "Not assigned"}</span>
            </div>
          </div>
        </div>

        {/* Panel 3: Financial Snapshot */}
        <div className="rounded-2xl border border-[#DDD4C5] bg-white p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-[#DDD4C5]/60 pb-2">
            <div className="flex items-center gap-2">
              <DollarSign className="size-4 text-[#8A641A]" />
              <h3 className="font-display text-sm font-semibold text-[#251605]">
                {data.folioAccess ? "Financial Snapshot" : "Stay Notes"}
              </h3>
            </div>
            {data.folioAccess ? (
              <button
                type="button"
                onClick={() => onNavigate("financial")}
                className="text-[11px] font-medium text-[#8A641A] hover:underline"
              >
                View Financials
              </button>
            ) : null}
          </div>
          {data.folioAccess ? (
            financials.isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : financials.data ? (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[10px] text-[#756A5B]">Total Charges</span>
                  <p className="font-medium text-[#251605]">{financials.data.summary.totalCharges}</p>
                </div>
                <div>
                  <span className="text-[10px] text-[#756A5B]">Total Payments</span>
                  <p className="font-medium text-emerald-700">{financials.data.summary.totalPayments}</p>
                </div>
                <div>
                  <span className="text-[10px] text-[#756A5B]">Outstanding</span>
                  <p className="font-bold text-[#251605]">{financials.data.summary.outstandingBalance}</p>
                </div>
                <div>
                  <span className="text-[10px] text-[#756A5B]">Estimated Revenue</span>
                  <p className="font-medium text-[#756A5B]">{financials.data.summary.estimatedRevenue}</p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-[#756A5B]">No folio data recorded.</p>
            )
          ) : (
            <p className="text-xs text-[#756A5B] italic">
              {group.notes || "No notes recorded for this stay."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
