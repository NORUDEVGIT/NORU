import { MoreHorizontal } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { AGENCY_TYPE_LABELS, type AgencyType } from "@/packages/pms/lib/guest-profile-travel-agency";
import { setTravelAgentStatus } from "@/packages/pms/lib/guest-travel-agent-detail.functions";
import type { TravelAgentDetailNavId } from "@/packages/pms/lib/guest-travel-agent-detail-workspace";

export function GuestTravelAgentHeader({
  restaurantId,
  agency,
  onEdit,
  onNavigate,
  canManageRes,
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
    partnerSince: string;
    logoUrl: string | null;
  };
  onEdit: () => void;
  onNavigate: (nav: TravelAgentDetailNavId) => void;
  canManageRes: boolean;
}) {
  const queryClient = useQueryClient();
  const changeStatus = useServerFn(setTravelAgentStatus);
  const mutation = useMutation({
    mutationFn: (status: "active" | "inactive") =>
      changeStatus({ data: { restaurantId, agencyId: agency.id, status } }),
    onSuccess: async (_result, status) => {
      await queryClient.invalidateQueries({ queryKey: ["travel-agent-detail", restaurantId, agency.id] });
      toast.success(status === "active" ? "Agency activated." : "Agency deactivated.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const location = [agency.addressLine1, agency.city, agency.country].filter(Boolean).join(", ");
  const typeLabel =
    agency.agencyType && agency.agencyType in AGENCY_TYPE_LABELS
      ? AGENCY_TYPE_LABELS[agency.agencyType as AgencyType]
      : agency.agencyType;

  return (
    <header className="rounded-2xl border border-border bg-card p-5" data-testid="travel-agent-detail-header">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          {agency.logoUrl ? (
            <img src={agency.logoUrl} alt="" className="h-16 w-16 rounded-xl object-cover" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-muted text-lg font-semibold">
              {agency.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl">{agency.name}</h1>
              <Badge variant={agency.accountStatus === "active" ? "default" : "secondary"}>
                {agency.accountStatus}
              </Badge>
              {typeLabel ? <Badge variant="outline">{typeLabel}</Badge> : null}
              {agency.code ? <span className="text-sm text-muted-foreground">{agency.code}</span> : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {[agency.phone, agency.email, location, agency.website].filter(Boolean).join(" · ") ||
                "No contact details yet."}
            </p>
            <p className="text-xs text-muted-foreground">
              {[
                agency.iataLicenseNumber ? `IATA ${agency.iataLicenseNumber}` : null,
                agency.primaryContactName ? `Primary ${agency.primaryContactName}` : null,
                agency.partnerSince ? `Partner since ${agency.partnerSince.slice(0, 10)}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" onClick={onEdit} data-testid="travel-agent-edit">
            Edit Agency
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="icon" aria-label="More agency actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canManageRes ? (
                <DropdownMenuItem onClick={() => onNavigate("bookings")}>New Booking</DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onClick={() => onNavigate("settings")}>Open Agency Settings</DropdownMenuItem>
              {agency.accountStatus === "active" ? (
                <DropdownMenuItem onClick={() => mutation.mutate("inactive")}>Deactivate</DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => mutation.mutate("active")}>Activate</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
