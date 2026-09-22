import { MoreHorizontal } from "lucide-react";
import { Link } from "@tanstack/react-router";
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
import { setGroupStatus } from "@/packages/pms/lib/guest-group-detail.functions";
import { groupStatusLabel } from "@/packages/pms/lib/guest-group-detail-workspace";
import type { GroupDetailNavId } from "@/packages/pms/lib/guest-profile-wave1";

export function GuestGroupHeader({
  restaurantId,
  group,
  onEdit,
  onNavigate,
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
    groupTypeName: string | null;
    arrivalDate: string | null;
    departureDate: string | null;
    companyMasterName: string | null;
    travelAgentMasterName: string | null;
  };
  onEdit: () => void;
  onNavigate: (nav: GroupDetailNavId) => void;
  canManageRes: boolean;
}) {
  const queryClient = useQueryClient();
  const changeStatus = useServerFn(setGroupStatus);
  const mutation = useMutation({
    mutationFn: (status: "pending" | "active" | "inactive") =>
      changeStatus({ data: { restaurantId, groupId: group.id, status } }),
    onSuccess: async (_result, status) => {
      await queryClient.invalidateQueries({ queryKey: ["group-detail", restaurantId, group.id] });
      toast.success(`Group ${groupStatusLabel(status).toLowerCase()}.`);
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
          {canManageRes ? (
            <Link to="/restaurant/bookings/new" search={{ groupAccountMasterId: group.id }}>
              <Button type="button">Add reservation</Button>
            </Link>
          ) : null}
          <Button type="button" variant="outline" onClick={onEdit}>
            Edit
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="icon" aria-label="Group actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onNavigate("members")}>Members</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onNavigate("rooming")}>Rooming list</DropdownMenuItem>
              {group.accountStatus !== "active" ? (
                <DropdownMenuItem onClick={() => mutation.mutate("active")}>Confirm group</DropdownMenuItem>
              ) : null}
              {group.accountStatus === "active" ? (
                <DropdownMenuItem onClick={() => mutation.mutate("pending")}>Revert to draft</DropdownMenuItem>
              ) : null}
              {group.accountStatus !== "inactive" ? (
                <DropdownMenuItem onClick={() => mutation.mutate("inactive")}>Cancel group</DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
