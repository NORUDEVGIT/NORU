import type { ReactNode } from "react";
import { Play } from "lucide-react";

import { AuditStatusBadge } from "@/packages/pms/components/nightaudit/end-of-day-parts";
import { formatNa1Date } from "@/packages/pms/lib/na1";
import type { EndOfDayAuditStatus } from "@/packages/pms/lib/night-audit-steps";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/components/ui/dialog";

/** The End of Day checklist, opened from the desk the way other modules open a process. */
export function EndOfDayProcessDialog({
  open,
  onOpenChange,
  businessDate,
  status,
  canStart,
  runOpen,
  starting,
  onStart,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessDate: string;
  status: EndOfDayAuditStatus;
  canStart: boolean;
  runOpen: boolean;
  starting: boolean;
  onStart: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="end-of-day-process"
        className="z-50 flex h-[min(92vh,960px)] w-[min(96vw,1280px)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
      >
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[#DDD4C5] bg-white px-5 py-4 pr-12">
          <div className="min-w-0">
            <DialogTitle className="font-display text-xl font-semibold text-[#251605]">
              End of Day
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm text-muted-foreground">
              Business date {formatNa1Date(businessDate)}. Work through the steps, then close the
              date.
            </DialogDescription>
          </div>
          <div className="flex items-center gap-2">
            <AuditStatusBadge status={status} />
            {canStart && !runOpen ? (
              <Button
                type="button"
                className="h-9 gap-1.5 bg-[#C89933] text-[#251605] hover:bg-[#B98B2D]"
                disabled={starting}
                onClick={onStart}
                data-testid="end-of-day-start"
              >
                <Play className="size-4" aria-hidden />
                {starting ? "Starting…" : "Start End of Day"}
              </Button>
            ) : null}
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#F7F4EE] p-4 sm:p-5">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
