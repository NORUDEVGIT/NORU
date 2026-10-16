import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CalendarPlus, Download, MoreHorizontal, Pencil, Plus, Settings } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { AGENCY_TYPE_LABELS, type AgencyType } from "@/packages/pms/lib/guest-profile-travel-agency";
import { setTravelAgentStatus } from "@/packages/pms/lib/guest-travel-agent-detail.functions";
import { exportGuestAccount } from "@/packages/pms/lib/guest-privacy.functions";
import {
  GUEST_PROFILE_DIRECTORY_PATH,
  guestProfileSearch,
} from "@/packages/pms/lib/guest-profile-wave1";

export function GuestTravelAgentHeader({
  restaurantId,
  agency,
  onEdit,
  onNavigate,
  canManageRes,
  showBackButton = true,
}: {
  restaurantId: string;
  agency: {
    id: string;
    name: string;
    code: string | null;
    email: string | null;
    phone: string | null;
    addressLine1: string | null;
    city: string | null;
    country: string | null;
    website: string | null;
    accountStatus: string;
    agencyType: string | null;
    iataLicenseNumber: string | null;
    primaryContactName: string | null;
    partnerSince?: string;
    logoUrl: string | null;
  };
  onEdit: () => void;
  onNavigate?: (nav: any) => void;
  canManageRes?: boolean;
  showBackButton?: boolean;
}) {
  const queryClient = useQueryClient();
  const changeStatus = useServerFn(setTravelAgentStatus);
  const exportAccount = useServerFn(exportGuestAccount);

  const statusMutation = useMutation({
    mutationFn: (status: "active" | "inactive") =>
      changeStatus({ data: { restaurantId, agencyId: agency.id, status } }),
    onSuccess: async (_result, status) => {
      await queryClient.invalidateQueries({ queryKey: ["travel-agent-detail", restaurantId, agency.id] });
      await queryClient.invalidateQueries({ queryKey: ["guest-account", restaurantId, agency.id] });
      await queryClient.invalidateQueries({ queryKey: ["travel-agent-workspace-summary", restaurantId] });
      toast.success(status === "active" ? "Agency activated." : "Agency deactivated.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const exportMutation = useMutation({
    mutationFn: () => exportAccount({ data: { restaurantId, accountId: agency.id } }),
    onSuccess: (result) => {
      const blob = new Blob([result.jsonText], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Travel agency profile export downloaded.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const location = [agency.addressLine1, agency.city, agency.country].filter(Boolean).join(", ");
  const typeLabel =
    agency.agencyType && agency.agencyType in AGENCY_TYPE_LABELS
      ? AGENCY_TYPE_LABELS[agency.agencyType as AgencyType]
      : agency.agencyType;

  return (
    <div className="space-y-3" data-testid="travel-agent-detail-header-wrapper">
      {showBackButton && (
        <div>
          <Link
            to={GUEST_PROFILE_DIRECTORY_PATH}
            search={guestProfileSearch({ type: "travel-agent" })}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#756A5B] hover:text-[#251605] transition-colors"
            data-testid="travel-agent-header-back-button"
          >
            <ArrowLeft className="size-3.5" /> Back to Travel Agencies
          </Link>
        </div>
      )}

      <header
        className="rounded-xl border border-[#DDD4C5] bg-white p-4 sm:p-5 shadow-sm"
        data-testid="travel-agent-detail-header"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Left: Avatar + Primary Identity Metadata */}
          <div className="flex items-start gap-4 min-w-0">
            <div className="relative shrink-0">
              {agency.logoUrl ? (
                <img
                  src={agency.logoUrl}
                  alt={agency.name}
                  className="size-16 rounded-xl object-cover ring-2 ring-[#E5DECE]"
                />
              ) : (
                <div className="flex size-16 items-center justify-center rounded-xl bg-[#F4E9D0] font-display text-xl font-bold text-[#8A641A] ring-2 ring-[#E5DECE]">
                  {agency.name.slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>

            <div className="space-y-1.5 min-w-0">
              {/* Name + Status Badges */}
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl font-bold tracking-tight text-[#251605]">
                  {agency.name}
                </h1>

                {agency.accountStatus === "active" ? (
                  <span className="inline-flex items-center rounded-full bg-[#E8F5E9] px-2.5 py-0.5 text-xs font-medium text-[#2E7D32]">
                    Active
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-[#F5F5F5] px-2.5 py-0.5 text-xs font-medium text-[#616161]">
                    Inactive
                  </span>
                )}

                {typeLabel ? (
                  <span className="inline-flex items-center rounded-full bg-[#F4E9D0] px-2.5 py-0.5 text-xs font-medium text-[#8A641A] uppercase">
                    {typeLabel}
                  </span>
                ) : null}

                {agency.code ? (
                  <span className="font-mono text-xs font-medium text-[#8A641A] bg-[#FBF7EE] px-2 py-0.5 rounded border border-[#EADBBD]">
                    {agency.code}
                  </span>
                ) : null}

                {agency.iataLicenseNumber ? (
                  <span className="inline-flex items-center gap-1 rounded bg-[#FAF8F5] border border-[#DDD4C5] px-2 py-0.5 text-xs font-mono text-[#52483E]">
                    IATA {agency.iataLicenseNumber}
                  </span>
                ) : null}
              </div>

              {/* Sub-row 1: Contact Details */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#756A5B]">
                {agency.phone ? <span className="font-medium text-[#251605]">{agency.phone}</span> : null}
                {agency.phone && (agency.email || location || agency.website) ? <span>·</span> : null}
                {agency.email ? <span>{agency.email}</span> : null}
                {agency.email && (location || agency.website) ? <span>·</span> : null}
                {location ? <span>{location}</span> : null}
                {location && agency.website ? <span>·</span> : null}
                {agency.website ? (
                  <a
                    href={agency.website.startsWith("http") ? agency.website : `https://${agency.website}`}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline text-[#8A641A]"
                  >
                    {agency.website}
                  </a>
                ) : null}
                {!agency.phone && !agency.email && !location && !agency.website ? (
                  <span className="italic text-[#8C827A]">No contact details yet</span>
                ) : null}
              </div>

              {/* Sub-row 2: Primary Contact Person */}
              {agency.primaryContactName ? (
                <div className="text-xs text-[#756A5B]">
                  <span>Primary Contact: </span>
                  <span className="font-medium text-[#251605]">{agency.primaryContactName}</span>
                </div>
              ) : null}
            </div>
          </div>

          {/* Right: Operational Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              asChild
              className="bg-[#C89933] text-[#251605] hover:bg-[#B88928] font-medium"
              data-testid="travel-agent-new-reservation"
            >
              <Link to="/restaurant/pms/reservations" search={{ create: "new", travelAgentId: agency.id }}>
                <CalendarPlus className="mr-1.5 size-4" />
                New Booking
              </Link>
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={onEdit}
              className="border-[#DDD4C5] text-[#251605] hover:bg-[#F7F4EE]"
              data-testid="travel-agent-edit"
            >
              <Pencil className="mr-1.5 size-3.5" />
              Edit Agency
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="border-[#DDD4C5] text-[#251605] hover:bg-[#F7F4EE]"
                  aria-label="More agency actions"
                  data-testid="travel-agent-more-actions"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {agency.accountStatus === "active" ? (
                  <DropdownMenuItem
                    onClick={() => statusMutation.mutate("inactive")}
                    disabled={statusMutation.isPending}
                  >
                    Deactivate Agency
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={() => statusMutation.mutate("active")}
                    disabled={statusMutation.isPending}
                  >
                    Activate Agency
                  </DropdownMenuItem>
                )}
                {onNavigate && (
                  <>
                    <DropdownMenuItem onClick={() => onNavigate("bookings")}>
                      <CalendarPlus className="mr-2 size-3.5 text-muted-foreground" />
                      Reservations
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onNavigate("settings")}>
                      <Settings className="mr-2 size-3.5 text-muted-foreground" />
                      Agency Settings
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => exportMutation.mutate()}
                  disabled={exportMutation.isPending}
                >
                  <Download className="mr-2 size-3.5 text-muted-foreground" />
                  Export Profile (JSON)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
    </div>
  );
}
