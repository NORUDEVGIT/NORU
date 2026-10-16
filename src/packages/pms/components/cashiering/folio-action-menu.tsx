import type { ComponentType } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  CreditCard,
  Eye,
  Landmark,
  Lock,
  MinusCircle,
  MoreHorizontal,
  Pencil,
  Percent,
  Receipt,
  ScrollText,
} from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { cn } from "@/shared/lib/utils";

type FolioActionTarget = {
  id: string;
  folioNumber: string;
  status: "open" | "closed";
};

function FolioPageItem({
  folioId,
  label,
  action,
  disabled,
  toTab,
  icon: Icon,
  destructive,
}: {
  folioId: string;
  label: string;
  action?: string;
  disabled?: boolean;
  toTab?: string;
  icon?: ComponentType<{ className?: string }>;
  destructive?: boolean;
}) {
  const content = (
    <>
      {Icon ? <Icon className="mr-2 size-4 shrink-0 opacity-70" /> : null}
      {label}
    </>
  );

  if (disabled) {
    return (
      <DropdownMenuItem disabled className={destructive ? "text-destructive" : undefined}>
        {content}
      </DropdownMenuItem>
    );
  }
  if (toTab) {
    return (
      <DropdownMenuItem asChild className={destructive ? "text-destructive focus:text-destructive" : undefined}>
        <Link to="/restaurant/pms/cashiering" search={{ tab: toTab, folio: folioId }}>
          {content}
        </Link>
      </DropdownMenuItem>
    );
  }
  return (
    <DropdownMenuItem asChild className={destructive ? "text-destructive focus:text-destructive" : undefined}>
      <Link
        to="/restaurant/pms/cashiering/folios/$folioId"
        params={{ folioId }}
        search={action ? { action } : {}}
      >
        {content}
      </Link>
    </DropdownMenuItem>
  );
}

export function FolioActionMenu({
  folio,
  canOperate,
  canManage,
  onOpenChange,
  triggerClassName,
}: {
  folio: FolioActionTarget;
  canOperate: boolean;
  canManage: boolean;
  onOpenChange?: (open: boolean) => void;
  triggerClassName?: string;
}) {
  const open = folio.status === "open";
  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("size-8", triggerClassName)}
          aria-label={`Actions for ${folio.folioNumber}`}
          data-testid="folio-row-actions"
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
        <FolioPageItem folioId={folio.id} label="Open Folio" icon={Eye} />
        <DropdownMenuSeparator />
        <FolioPageItem
          folioId={folio.id}
          action="charge"
          label="Post Charge"
          icon={Receipt}
          disabled={!canManage || !open}
        />
        <FolioPageItem
          folioId={folio.id}
          action="payment"
          label="Receive Payment"
          icon={CreditCard}
          disabled={!canOperate || !open}
        />
        <FolioPageItem
          folioId={folio.id}
          action="deposit"
          label="Add Deposit"
          icon={Landmark}
          disabled={!canOperate || !open}
        />
        <DropdownMenuSeparator />
        <FolioPageItem
          folioId={folio.id}
          action="adjustment"
          label="Adjust"
          icon={Pencil}
          disabled={!canManage || !open}
        />
        <FolioPageItem
          folioId={folio.id}
          action="refund"
          label="Refund"
          icon={MinusCircle}
          disabled={!canManage || !open}
          destructive
        />
        <FolioPageItem
          folioId={folio.id}
          action="discount"
          label="Discount"
          icon={Percent}
          disabled={!canManage || !open}
        />
        <FolioPageItem
          folioId={folio.id}
          toTab="transfers"
          label="Transfer Charge"
          icon={ArrowLeftRight}
          disabled={!canManage || !open}
        />
        <DropdownMenuSeparator />
        <FolioPageItem folioId={folio.id} label="View Transactions" icon={ScrollText} />
        <FolioPageItem
          folioId={folio.id}
          action="close"
          label="Close Folio"
          icon={Lock}
          disabled={!canManage || !open}
          destructive
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
