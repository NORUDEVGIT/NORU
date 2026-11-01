import { CalendarPlus, MoreHorizontal, Pencil } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { duplicateGroupMaster, setGroupStatus } from "@/packages/pms/lib/guest-group-detail.functions";
import {
  GROUP_CONVERT_UNAVAILABLE,
  GROUP_INVOICE_SERVICE_UNAVAILABLE,
  canConfirmGroup,
  groupActionAllowed,
  groupStatusLabel,
} from "@/packages/pms/lib/guest-group-detail-workspace";
import {
  GUEST_PROFILE_DETAIL_PATH,
  guestProfileSearch,
  type GroupDetailNavId,
} from "@/packages/pms/lib/guest-profile-wave1";

export function GuestGroupHeader({
  restaurantId,
  group,
  reservationCount,
  onEdit,
  onNavigate,
  canWrite,
  canManageRes,
}: {
  restaurantId: string;
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
    companyMasterName: string | null;
    travelAgentMasterName: string | null;
  };
  reservationCount: number;
  onEdit: () => void;
  onNavigate: (nav: GroupDetailNavId) => void;
  canWrite: boolean;
  canManageRes: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const changeStatus = useServerFn(setGroupStatus);
  const duplicate = useServerFn(duplicateGroupMaster);
  const canConfirm = !canConfirmGroup({
    name: group.name,
    groupTypeId: group.groupTypeId,
    arrivalDate: group.arrivalDate,
    departureDate: group.departureDate,
  });
  const allowed = (action: Parameters<typeof groupActionAllowed>[0]) =>
    groupActionAllowed(action, group.accountStatus, {
      canConfirm,
      hasReservations: reservationCount > 0,
      canWrite,
      canManageRes,
    });

  const mutation = useMutation({
    mutationFn: (status: "pending" | "active" | "inactive") =>
      changeStatus({ data: { restaurantId, groupId: group.id, status } }),
    onSuccess: async (_result, status) => {
      await queryClient.invalidateQueries({ queryKey: ["group-detail", restaurantId, group.id] });
      toast.success(`Group ${groupStatusLabel(status).toLowerCase()}.`);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const duplicateMutation = useMutation({
    mutationFn: () => duplicate({ data: { restaurantId, groupId: group.id } }),
    onSuccess: (result) => {
      toast.success("Group duplicated.");
      void navigate({
        to: GUEST_PROFILE_DETAIL_PATH,
        params: { guestId: result.id },
        search: guestProfileSearch({ type: "group" }),
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <header className="rounded-2xl border border-[#DDD4C5] bg-white p-5 shadow-sm" data-testid="group-detail-header">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl text-[#251605]">{group.name}</h1>
              <Badge variant={group.accountStatus === "active" ? "default" : "secondary"}>
                {groupStatusLabel(group.accountStatus)}
              </Badge>
              {group.groupTypeName ? (
                <Badge variant="outline" className="border-[#DDD4C5] text-[#756A5B]">
                  {group.groupTypeName}
                </Badge>
              ) : null}
            </div>
            <p className="text-xs text-[#756A5B]">
              {[
                group.code,
                group.arrivalDate && group.departureDate ? `${group.arrivalDate} → ${group.departureDate}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p className="text-xs text-[#756A5B]">
              {[group.companyMasterName, group.travelAgentMasterName, group.email, group.phone]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 border-[#DDD4C5] text-[#251605] hover:bg-[#F7F4EE]"
              aria-label="Group actions"
              data-testid="group-header-more-actions"
            >
              <MoreHorizontal className="size-4" />
              More
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-52">
            {allowed("add_reservation") ? (
              <DropdownMenuItem asChild data-testid="group-header-add-reservation">
                <Link to="/restaurant/pms/reservations" search={{ create: "new", groupId: group.id }}>
                  <CalendarPlus className="mr-2 size-3.5" />
                  Add reservation
                </Link>
              </DropdownMenuItem>
            ) : null}
            {allowed("edit") ? (
              <DropdownMenuItem onClick={onEdit} data-testid="group-header-edit">
                <Pencil className="mr-2 size-3.5" />
                Edit group
              </DropdownMenuItem>
            ) : null}
            {allowed("add_member") ? (
              <DropdownMenuItem onClick={() => onNavigate("members")}>Add member</DropdownMenuItem>
            ) : null}
            {allowed("import_members") ? (
              <DropdownMenuItem onClick={() => onNavigate("members")}>Import members</DropdownMenuItem>
            ) : null}
            {allowed("assign_rooms") ? (
              <DropdownMenuItem onClick={() => onNavigate("rooming")}>Assign rooms</DropdownMenuItem>
            ) : null}

            <DropdownMenuSeparator />

            {allowed("confirm") ? (
              <DropdownMenuItem onClick={() => mutation.mutate("active")}>Confirm group</DropdownMenuItem>
            ) : null}
            {allowed("reopen") ? (
              <DropdownMenuItem onClick={() => mutation.mutate("pending")}>Reopen as draft</DropdownMenuItem>
            ) : null}
            {allowed("cancel") ? (
              <DropdownMenuItem onClick={() => mutation.mutate("inactive")}>Cancel group</DropdownMenuItem>
            ) : null}
            {allowed("duplicate") ? (
              <DropdownMenuItem disabled={duplicateMutation.isPending} onClick={() => duplicateMutation.mutate()}>
                Duplicate
              </DropdownMenuItem>
            ) : null}

            <DropdownMenuSeparator />

            <DropdownMenuItem disabled title={GROUP_INVOICE_SERVICE_UNAVAILABLE}>
              Generate invoice
            </DropdownMenuItem>
            <DropdownMenuItem disabled title={GROUP_INVOICE_SERVICE_UNAVAILABLE}>
              Send confirmation
            </DropdownMenuItem>
            <DropdownMenuItem disabled title={GROUP_CONVERT_UNAVAILABLE}>
              Convert to individual
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            {allowed("export_rooming") ? (
              <DropdownMenuItem onClick={() => onNavigate("rooming")}>Export rooming</DropdownMenuItem>
            ) : null}
            {allowed("manage_documents") ? (
              <DropdownMenuItem onClick={() => onNavigate("documents")}>Documents</DropdownMenuItem>
            ) : null}
            {allowed("view_activity") ? (
              <DropdownMenuItem onClick={() => onNavigate("activity")}>View activity</DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}