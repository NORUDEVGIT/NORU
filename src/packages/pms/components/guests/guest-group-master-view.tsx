import { Building, Calendar, FileText, Hotel, Pencil, Shield, Users } from "lucide-react";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { groupStatusLabel } from "@/packages/pms/lib/guest-group-detail-workspace";

export function GuestGroupMasterView({
  group,
  onEdit,
  canWrite = true,
}: {
  group: {
    id: string;
    name: string;
    code: string | null;
    email: string | null;
    phone: string | null;
    accountStatus: string;
    groupTypeId?: string | null;
    groupTypeName: string | null;
    arrivalDate: string | null;
    departureDate: string | null;
    expectedPax: number | null;
    expectedRooms: number | null;
    companyMasterName: string | null;
    travelAgentMasterName: string | null;
    primaryContactName: string | null;
    primaryContactEmail: string | null;
    primaryContactPhone: string | null;
    notes: string | null;
    specialRequests: string | null;
    groupOperations?: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
  };
  onEdit: () => void;
  canWrite?: boolean;
}) {
  const operations = (group.groupOperations ?? {}) as Record<string, any>;
  const commercial = (operations["commercial"] && typeof operations["commercial"] === "object"
    ? operations["commercial"]
    : {}) as Record<string, any>;
  const billing = (operations["billing"] && typeof operations["billing"] === "object"
    ? operations["billing"]
    : {}) as Record<string, any>;

  const marketSegment = (commercial["marketSegment"] as string) || null;
  const bookingSource = (commercial["bookingSource"] as string) || null;
  const billingArrangement = (billing["arrangement"] as string) || (billing["instructions"] as string) || null;
  const ratePlanRef = (commercial["ratePlanReference"] as string) || null;
  const packageRef = (commercial["packageReference"] as string) || null;
  const mealPlanRef = (commercial["mealPlanReference"] as string) || null;

  return (
    <div className="space-y-6" data-testid="group-master-view">
      {/* Top Banner with Edit action */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#DDD4C5] bg-white p-4 shadow-sm">
        <div>
          <h2 className="font-display text-lg text-[#251605]">Group Master Details</h2>
          <p className="text-xs text-[#756A5B]">
            Canonical master identity, stay parameters, partner links, and commercial defaults.
          </p>
        </div>
        {canWrite ? (
          <Button
            type="button"
            size="sm"
            onClick={onEdit}
            className="gap-1.5 bg-[#C89933] text-white hover:bg-[#8A641A] shadow-sm"
            data-testid="group-master-edit-button"
          >
            <Pencil className="size-3.5" />
            Edit Group
          </Button>
        ) : null}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Section 1: Group Identity */}
        <div className="rounded-2xl border border-[#DDD4C5] bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-[#DDD4C5]/60 pb-3">
            <Users className="size-4 text-[#8A641A]" />
            <h3 className="font-display text-base text-[#251605]">Group Identity</h3>
          </div>
          <dl className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <dt className="text-[#756A5B]">Group Name</dt>
              <dd className="mt-1 font-medium text-[#251605]">{group.name}</dd>
            </div>
            <div>
              <dt className="text-[#756A5B]">Group Code</dt>
              <dd className="mt-1 font-mono font-medium text-[#251605]">{group.code ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[#756A5B]">Group Type</dt>
              <dd className="mt-1">
                {group.groupTypeName ? (
                  <Badge variant="outline" className="border-[#DDD4C5] text-[#251605]">
                    {group.groupTypeName}
                  </Badge>
                ) : (
                  <span className="text-[#756A5B]">—</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[#756A5B]">Operational Status</dt>
              <dd className="mt-1">
                <Badge variant={group.accountStatus === "active" ? "default" : "secondary"}>
                  {groupStatusLabel(group.accountStatus)}
                </Badge>
              </dd>
            </div>
          </dl>
        </div>

        {/* Section 2: Stay Plan */}
        <div className="rounded-2xl border border-[#DDD4C5] bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-[#DDD4C5]/60 pb-3">
            <Calendar className="size-4 text-[#8A641A]" />
            <h3 className="font-display text-base text-[#251605]">Stay Plan</h3>
          </div>
          <dl className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <dt className="text-[#756A5B]">Arrival Date</dt>
              <dd className="mt-1 font-medium text-[#251605]">{group.arrivalDate ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[#756A5B]">Departure Date</dt>
              <dd className="mt-1 font-medium text-[#251605]">{group.departureDate ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[#756A5B]">Expected Pax</dt>
              <dd className="mt-1 font-medium text-[#251605]">{group.expectedPax != null ? group.expectedPax : "—"}</dd>
            </div>
            <div>
              <dt className="text-[#756A5B]">Expected Rooms</dt>
              <dd className="mt-1 font-medium text-[#251605]">{group.expectedRooms != null ? group.expectedRooms : "—"}</dd>
            </div>
          </dl>
        </div>

        {/* Section 3: Primary Contact */}
        <div className="rounded-2xl border border-[#DDD4C5] bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-[#DDD4C5]/60 pb-3">
            <Users className="size-4 text-[#8A641A]" />
            <h3 className="font-display text-base text-[#251605]">Primary Contact</h3>
          </div>
          <dl className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <dt className="text-[#756A5B]">Contact Name</dt>
              <dd className="mt-1 font-medium text-[#251605]">{group.primaryContactName || "—"}</dd>
            </div>
            <div>
              <dt className="text-[#756A5B]">Email</dt>
              <dd className="mt-1 font-medium text-[#251605]">{group.primaryContactEmail || group.email || "—"}</dd>
            </div>
            <div>
              <dt className="text-[#756A5B]">Phone</dt>
              <dd className="mt-1 font-medium text-[#251605]">{group.primaryContactPhone || group.phone || "—"}</dd>
            </div>
          </dl>
        </div>

        {/* Section 4: Partners */}
        <div className="rounded-2xl border border-[#DDD4C5] bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-[#DDD4C5]/60 pb-3">
            <Building className="size-4 text-[#8A641A]" />
            <h3 className="font-display text-base text-[#251605]">Partners</h3>
          </div>
          <dl className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <dt className="text-[#756A5B]">Company Master</dt>
              <dd className="mt-1 font-medium text-[#251605]">{group.companyMasterName || "None linked"}</dd>
            </div>
            <div>
              <dt className="text-[#756A5B]">Travel Agency Master</dt>
              <dd className="mt-1 font-medium text-[#251605]">{group.travelAgentMasterName || "None linked"}</dd>
            </div>
          </dl>
        </div>

        {/* Section 5: Commercial / Source References */}
        <div className="rounded-2xl border border-[#DDD4C5] bg-white p-5 shadow-sm space-y-4 md:col-span-2">
          <div className="flex items-center gap-2 border-b border-[#DDD4C5]/60 pb-3">
            <FileText className="size-4 text-[#8A641A]" />
            <h3 className="font-display text-base text-[#251605]">Commercial & Source References</h3>
          </div>
          <dl className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-3">
            <div>
              <dt className="text-[#756A5B]">Market Segment</dt>
              <dd className="mt-1 font-medium text-[#251605]">{marketSegment || "—"}</dd>
            </div>
            <div>
              <dt className="text-[#756A5B]">Source of Business</dt>
              <dd className="mt-1 font-medium text-[#251605]">{bookingSource || "—"}</dd>
            </div>
            <div>
              <dt className="text-[#756A5B]">Billing Arrangement</dt>
              <dd className="mt-1 font-medium text-[#251605]">{billingArrangement || "—"}</dd>
            </div>
            {ratePlanRef ? (
              <div>
                <dt className="text-[#756A5B]">Rate Plan Reference</dt>
                <dd className="mt-1 font-medium text-[#251605]">{ratePlanRef}</dd>
              </div>
            ) : null}
            {packageRef ? (
              <div>
                <dt className="text-[#756A5B]">Package Reference</dt>
                <dd className="mt-1 font-medium text-[#251605]">{packageRef}</dd>
              </div>
            ) : null}
            {mealPlanRef ? (
              <div>
                <dt className="text-[#756A5B]">Meal Plan Reference</dt>
                <dd className="mt-1 font-medium text-[#251605]">{mealPlanRef}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        {/* Section 6: Notes & Requests */}
        {(group.notes || group.specialRequests) && (
          <div className="rounded-2xl border border-[#DDD4C5] bg-white p-5 shadow-sm space-y-4 md:col-span-2">
            <div className="flex items-center gap-2 border-b border-[#DDD4C5]/60 pb-3">
              <FileText className="size-4 text-[#8A641A]" />
              <h3 className="font-display text-base text-[#251605]">Notes & Special Requests</h3>
            </div>
            <div className="space-y-3 text-xs">
              {group.notes ? (
                <div>
                  <span className="font-medium text-[#756A5B]">Internal Notes:</span>
                  <p className="mt-1 text-[#251605] whitespace-pre-wrap">{group.notes}</p>
                </div>
              ) : null}
              {group.specialRequests ? (
                <div>
                  <span className="font-medium text-[#756A5B]">Special Requests:</span>
                  <p className="mt-1 text-[#251605] whitespace-pre-wrap">{group.specialRequests}</p>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* Section 7: Audit */}
        <div className="rounded-2xl border border-[#DDD4C5] bg-[#F7F4EE]/50 p-5 shadow-sm space-y-4 md:col-span-2">
          <div className="flex items-center gap-2 border-b border-[#DDD4C5]/60 pb-3">
            <Shield className="size-4 text-[#756A5B]" />
            <h3 className="font-display text-base text-[#251605]">Audit & Metadata</h3>
          </div>
          <dl className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-3">
            <div>
              <dt className="text-[#756A5B]">System Master ID</dt>
              <dd className="mt-1 font-mono text-[11px] text-[#756A5B]">{group.id}</dd>
            </div>
            <div>
              <dt className="text-[#756A5B]">Created At</dt>
              <dd className="mt-1 text-[#251605]">{group.createdAt || "—"}</dd>
            </div>
            <div>
              <dt className="text-[#756A5B]">Last Updated</dt>
              <dd className="mt-1 text-[#251605]">{group.updatedAt || "—"}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
