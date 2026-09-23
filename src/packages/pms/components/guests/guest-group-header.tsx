import { MoreHorizontal } from "lucide-react";
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
import { GUEST_PROFILE_DETAIL_PATH, guestProfileSearch, type GroupDetailNavId } from "@/packages/pms/lib/guest-profile-wave1";

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
    <header className="rounded-2xl border border-border bg-card p-5" data-testid="group-detail-header">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-muted text-lg font-semibold">
            {group.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl">{group.name}</h1>
              <Badge variant={group.accountStatus === "active" ? "default" : "secondary"}>
                {groupStatusLabel(group.accountStatus)}
              </Badge>
              {group.groupTypeName ? <Badge variant="outline">{group.groupTypeName}</Badge> : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {[group.code, group.arrivalDate && group.departureDate ? `${group.arrivalDate} → ${group.departureDate}` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p className="text-sm text-muted-foreground">
              {[group.companyMasterName, group.travelAgentMasterName, group.email, group.phone].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {allowed("add_reservation") ? (
            <Link to="/restaurant/bookings/new" search={{ groupAccountMasterId: group.id }}>
              <Button type="button">Add reservation</Button>
            </Link>
          ) : null}
          {allowed("edit") ? (
            <Button type="button" variant="outline" onClick={onEdit}>
              Edit
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="icon" aria-label="Group actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {allowed("add_member") ? (
                <DropdownMenuItem onClick={() => onNavigate("members")}>Add member</DropdownMenuItem>
              ) : null}
              {allowed("import_members") ? (
                <DropdownMenuItem onClick={() => onNavigate("members")}>Import members</DropdownMenuItem>
              ) : null}
              {allowed("assign_rooms") ? (
                <DropdownMenuItem onClick={() => onNavigate("rooming")}>Assign rooms</DropdownMenuItem>
              ) : null}
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
                <DropdownMenuItem onClick={() => onNavigate("history")}>View activity</DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
