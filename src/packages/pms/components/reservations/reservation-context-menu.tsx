import {
  Banknote,
  BedDouble,
  CalendarCheck,
  Copy,
  DoorOpen,
  ExternalLink,
  LogIn,
  LogOut,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  TriangleAlert,
  XCircle,
} from "lucide-react";

import {
  getReservationContextActions,
  type ReservationContextAction,
  type ReservationContextActionId,
  type ReservationContextActionInput,
} from "@/packages/pms/components/reservations/reservation-context-actions";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { cn } from "@/shared/lib/utils";

const GROUP_LABELS = {
  view_edit: "View & Edit",
  reservation: "Reservation Actions",
  front_office: "Front Office",
  cashiering: "Cashiering",
} as const;

const GROUP_ORDER = ["view_edit", "reservation", "front_office", "cashiering"] as const;

export function ReservationContextMenu({
  context,
  onAction,
  align = "end",
  triggerLabel,
}: {
  context: ReservationContextActionInput;
  onAction: (actionId: ReservationContextActionId) => void;
  align?: "start" | "center" | "end";
  triggerLabel: string;
}) {
  const actions = getReservationContextActions(context);
  const groups = GROUP_ORDER.map((group) => ({
    group,
    actions: actions.filter((action) => action.group === group),
  })).filter((entry) => entry.actions.length > 0);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          aria-label={triggerLabel}
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        className="w-56"
        onClick={(event) => event.stopPropagation()}
      >
        {groups.map((entry, index) => (
          <div key={entry.group}>
            {index > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuLabel className="px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              {GROUP_LABELS[entry.group]}
            </DropdownMenuLabel>
            <DropdownMenuGroup>
              {entry.actions.map((action) => (
                <ContextMenuItem key={action.id} action={action} onAction={onAction} />
              ))}
            </DropdownMenuGroup>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ContextMenuItem({
  action,
  onAction,
}: {
  action: ReservationContextAction;
  onAction: (actionId: ReservationContextActionId) => void;
}) {
  return (
    <DropdownMenuItem
      className={cn(
        "text-xs",
        action.destructive && "text-destructive focus:bg-destructive/10 focus:text-destructive",
      )}
      onSelect={() => onAction(action.id)}
    >
      <ActionIcon actionId={action.id} />
      {action.label}
    </DropdownMenuItem>
  );
}

function ActionIcon({ actionId }: { actionId: ReservationContextActionId }) {
  const className = "size-4";
  switch (actionId) {
    case "open":
      return <ExternalLink className={className} />;
    case "edit":
      return <Pencil className={className} />;
    case "copy":
      return <Copy className={className} />;
    case "assign_room":
      return <BedDouble className={className} />;
    case "change_room":
      return <DoorOpen className={className} />;
    case "confirm":
      return <CalendarCheck className={className} />;
    case "cancel":
      return <XCircle className={className} />;
    case "check_in":
      return <LogIn className={className} />;
    case "check_out":
      return <LogOut className={className} />;
    case "no_show":
      return <TriangleAlert className={className} />;
    case "reactivate":
      return <RotateCcw className={className} />;
    case "open_folio":
      return <Banknote className={className} />;
  }
}
