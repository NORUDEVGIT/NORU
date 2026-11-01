
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarPlus,
  ChevronDown,
  Download,
  Pencil,
  Settings,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { setTravelAgentStatus } from "@/packages/pms/lib/guest-travel-agent-detail.functions";
import { exportGuestAccount } from "@/packages/pms/lib/guest-privacy.functions";

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
    partnerSince?: string;
    logoUrl: string | null;
  };
  onEdit: () => void;
  onNavigate?: (nav: any) => void;
  canManageRes?: boolean;
}) {
  const queryClient = useQueryClient();
  const changeStatus = useServerFn(setTravelAgentStatus);
  const exportAccount = useServerFn(exportGuestAccount);

  const statusMutation = useMutation({
    mutationFn: (status: "active" | "inactive") =>
      changeStatus({
        data: {
          restaurantId,
          agencyId: agency.id,
          status,
        },
      }),
    onSuccess: async (_result, status) => {
      await queryClient.invalidateQueries({
        queryKey: ["travel-agent-detail", restaurantId, agency.id],
      });
      await queryClient.invalidateQueries({
        queryKey: ["guest-account", restaurantId, agency.id],
      });
      await queryClient.invalidateQueries({
        queryKey: ["travel-agent-workspace-summary", restaurantId],
      });

      toast.success(
        status === "active"
          ? "Agency activated."
          : "Agency deactivated.",
      );
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const exportMutation = useMutation({
    mutationFn: () =>
      exportAccount({
        data: {
          restaurantId,
          accountId: agency.id,
        },
      }),
    onSuccess: (result) => {
      const blob = new Blob([result.jsonText], {
        type: "application/json",
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = result.filename;
      link.click();

      URL.revokeObjectURL(url);

      toast.success("Travel agency profile export downloaded.");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  return (
    <div
      className="space-y-3"
      data-testid="travel-agent-detail-header-wrapper"
    >
      <header
        className="rounded-xl border border-[#DDD4C5] bg-white p-4 shadow-sm sm:p-5"
        data-testid="travel-agent-detail-header"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Left: Agency Name Only */}
          <div className="min-w-0">
            <h1
              className="break-words font-display text-xl font-bold tracking-tight text-[#251605] sm:text-2xl"
              data-testid="travel-agent-header-name"
            >
              {agency.name}
            </h1>
          </div>

          {/* Right: Header Actions */}
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              asChild
              className="bg-[#C89933] font-medium text-[#251605] hover:bg-[#B88928]"
              data-testid="travel-agent-new-reservation"
            >
              <Link
                to="/restaurant/pms/reservations"
                search={{
                  create: "new",
                  travelAgentId: agency.id,
                }}
              >
                <CalendarPlus className="mr-1.5 size-4" />
                New Booking
              </Link>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="border-[#DDD4C5] text-[#251605] hover:bg-[#F7F4EE]"
                  aria-label="More agency actions"
                  data-testid="travel-agent-more-actions"
                >
                  More
                  <ChevronDown className="ml-1.5 size-3.5" />
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-52">
                {/* Edit Agency */}
                <DropdownMenuItem
                  onClick={onEdit}
                  data-testid="travel-agent-edit"
                >
                  <Pencil className="mr-2 size-3.5 text-muted-foreground" />
                  Edit Agency
                </DropdownMenuItem>

                {/* Activate / Deactivate */}
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

                {/* Additional Navigation */}
                {onNavigate && (
                  <>
                    <DropdownMenuItem
                      onClick={() => onNavigate("bookings")}
                    >
                      <CalendarPlus className="mr-2 size-3.5 text-muted-foreground" />
                      Reservations
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      onClick={() => onNavigate("settings")}
                    >
                      <Settings className="mr-2 size-3.5 text-muted-foreground" />
                      Agency Settings
                    </DropdownMenuItem>
                  </>
                )}

                <DropdownMenuSeparator />

                {/* Export Agency Profile */}
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
