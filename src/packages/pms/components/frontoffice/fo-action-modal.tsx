import type { ReactNode } from "react";
import { X } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/shared/components/ui/dialog";
import { SHELL_PRIMARY_BUTTON } from "@/packages/pms/components/reservations/reservation-shell-slots";
import { cn } from "@/shared/lib/utils";

export const FO_ACTION_CONTROL =
  "h-9 w-full rounded-[6px] border border-[#CCCCCC] bg-white px-3 text-sm text-[#251605] shadow-none placeholder:text-[#8C7E72] hover:border-[#8A641A] focus:border-[#8A641A] focus:outline-none focus:ring-1 focus:ring-[#8A641A]";

export const FO_ACTION_SELECT =
  "h-9 w-full justify-between rounded-[6px] border border-[#CCCCCC] bg-white px-3 text-sm font-normal text-[#251605] shadow-none hover:border-[#8A641A] hover:bg-white focus:ring-1 focus:ring-[#8A641A]";

const SIZE_CLASS = {
  small: "max-w-[580px] sm:max-w-[580px]",
  medium: "max-w-[720px] sm:max-w-[720px]",
  large: "max-w-[920px] sm:max-w-[920px]",
} as const;

export type FoActionModalSize = keyof typeof SIZE_CLASS;

export function foActionRoomChip(roomNumber: string | null | undefined): string {
  return roomNumber ? `Room ${roomNumber}` : "Unassigned";
}

export function FoActionModal({
  open,
  onOpenChange,
  action,
  guestName,
  confirmation,
  roomLabel,
  size,
  confirmLabel,
  confirmDisabled,
  pending,
  onConfirm,
  children,
  footerLeft,
  hideConfirm = false,
  testId,
  confirmTestId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: string;
  guestName: string;
  confirmation: string;
  roomLabel: string;
  size: FoActionModalSize;
  confirmLabel: string;
  confirmDisabled?: boolean;
  pending?: boolean;
  onConfirm?: () => void;
  children: ReactNode;
  footerLeft?: ReactNode;
  hideConfirm?: boolean;
  testId?: string;
  confirmTestId?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid={testId}
        className={cn(
          "z-[70] flex max-h-[90vh] w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden rounded-2xl border-0 p-0 shadow-2xl [&>button.absolute]:hidden",
          SIZE_CLASS[size],
        )}
      >
        <header className="relative shrink-0 bg-[#1F140A] px-4 py-2 pr-10 text-[#F3E9D8]">
          <DialogTitle className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-display text-sm font-semibold">
            <span>{action}</span>
            <span className="text-[#8A7A61]">·</span>
            <span className="truncate">{guestName}</span>
            {confirmation ? (
              <span className="rounded-full bg-[#C89933]/20 px-2 py-0.5 text-[11px] font-semibold text-[#C89933]">
                {confirmation}
              </span>
            ) : null}
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold">
              {roomLabel}
            </span>
          </DialogTitle>
          <button
            type="button"
            className="absolute right-3 top-2 rounded-md p-1 text-[#F3E9D8]/80 hover:bg-white/10 hover:text-[#F3E9D8]"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
          <DialogDescription className="sr-only">
            {action} · {guestName} · {confirmation} · {roomLabel}
          </DialogDescription>
        </header>
        <div className="h-0.5 shrink-0 bg-[#C89933]" aria-hidden />
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#FBF7F1] px-4 py-3">{children}</div>
        <footer className="shrink-0 border-t border-[#E8DFD0] bg-white px-4 py-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {footerLeft}
              <Button
                type="button"
                variant="outline"
                className="h-9 border-[#DDD4C5] bg-white text-[#4a2c1a] hover:bg-[#F7F4EE]"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
            </div>
            {hideConfirm ? null : (
              <Button
                type="button"
                data-testid={confirmTestId}
                className={cn(SHELL_PRIMARY_BUTTON, "disabled:opacity-70 disabled:text-[#251605]")}
                disabled={confirmDisabled || pending}
                onClick={onConfirm}
              >
                {pending ? "Saving…" : confirmLabel}
              </Button>
            )}
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
