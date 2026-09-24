/* eslint-disable react-refresh/only-export-components -- nested-layer helper is consumed by overlay tests */
import { useEffect, useState, type ReactNode } from "react";
import { CalendarPlus } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/shared/components/ui/sheet";
import { cn } from "@/shared/lib/utils";

export type ReservationWorkspaceOverlayState =
  { type: "new-reservation" } | { type: "reservation-detail"; reservationId: string } | null;

const WORKSPACE_OVERLAY_TEST_ID = "reservation-workspace-overlay";

/** Nested Dialog/Sheet/AlertDialog besides this overlay host. */
export function hasNestedReservationLayer() {
  const nodes = document.querySelectorAll<HTMLElement>(
    '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
  );
  return [...nodes].some((node) => node.dataset.testid !== WORKSPACE_OVERLAY_TEST_ID);
}

function nestedLayerFromTarget(target: EventTarget | null | undefined) {
  if (!(target instanceof Element)) return false;
  const layer = target.closest('[role="dialog"], [role="alertdialog"]');
  return Boolean(layer && layer.getAttribute("data-testid") !== WORKSPACE_OVERLAY_TEST_ID);
}

function blockParentDismiss(event: {
  preventDefault: () => void;
  target?: EventTarget | null;
  detail?: { originalEvent?: { target?: EventTarget | null } };
}) {
  const target = event.target ?? event.detail?.originalEvent?.target ?? null;
  if (nestedLayerFromTarget(target) || hasNestedReservationLayer()) {
    event.preventDefault();
  }
}

function useDesktopOverlay() {
  const [desktop, setDesktop] = useState(true);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1280px)");
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return desktop;
}

export function ReservationWorkspaceOverlay({
  open,
  title,
  description,
  onOpenChange,
  children,
  hideVisualHeader = false,
  showCreateIcon = false,
}: {
  open: boolean;
  title: string;
  description: string;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  hideVisualHeader?: boolean;
  showCreateIcon?: boolean;
}) {
  const desktop = useDesktopOverlay();
  const titleNode = (
    <div className="flex items-start gap-3">
      {showCreateIcon ? (
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#F4E9D0] text-[#765719]">
          <CalendarPlus className="size-5" />
        </span>
      ) : null}
      <div className="min-w-0">
        {desktop ? (
          <>
            <DialogTitle
              className={cn(
                "font-display text-xl font-semibold text-[#251605]",
                hideVisualHeader && "sr-only",
              )}
            >
              {title}
            </DialogTitle>
            <DialogDescription
              className={cn("mt-1 text-sm text-muted-foreground", hideVisualHeader && "sr-only")}
            >
              {description}
            </DialogDescription>
          </>
        ) : (
          <>
            <SheetTitle
              className={cn(
                "font-display text-xl font-semibold text-[#251605]",
                hideVisualHeader && "sr-only",
              )}
            >
              {title}
            </SheetTitle>
            <SheetDescription
              className={cn("mt-1 text-sm text-muted-foreground", hideVisualHeader && "sr-only")}
            >
              {description}
            </SheetDescription>
          </>
        )}
      </div>
    </div>
  );

  const header = hideVisualHeader ? (
    <div className="sr-only">{titleNode}</div>
  ) : (
    <div className="shrink-0 border-b border-[#DDD4C5] bg-white px-5 py-4 pr-12">{titleNode}</div>
  );

  const body = (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#F7F4EE]">{children}</div>
  );

  const dismissGuards = {
    onEscapeKeyDown: blockParentDismiss,
    onPointerDownOutside: blockParentDismiss,
    onInteractOutside: blockParentDismiss,
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && hasNestedReservationLayer()) return;
    onOpenChange(next);
  };

  if (desktop) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          data-testid={WORKSPACE_OVERLAY_TEST_ID}
          className={cn(
            "z-50 flex h-[min(92vh,960px)] w-[min(96vw,1400px)] max-w-none sm:max-w-none flex-col gap-0 overflow-hidden p-0",
            "rounded-2xl border border-[#DDD4C5] bg-white shadow-xl",
          )}
          {...dismissGuards}
        >
          {header}
          {body}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        data-testid={WORKSPACE_OVERLAY_TEST_ID}
        className="z-[50] flex h-dvh w-full max-w-none flex-col gap-0 overflow-hidden p-0"
        {...dismissGuards}
      >
        {header}
        {body}
      </SheetContent>
    </Sheet>
  );
}
