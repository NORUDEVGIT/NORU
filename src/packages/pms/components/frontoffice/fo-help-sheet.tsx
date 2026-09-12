import { Link } from "@tanstack/react-router";

import { Button } from "@/shared/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import type { FoNavId } from "@/packages/pms/lib/front-office-shell";

export function FoHelpSheet({
  open,
  onOpenChange,
  onNavigate,
  canOpenCashiering,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (id: FoNavId) => void;
  canOpenCashiering: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md" data-testid="fo-help-sheet">
        <SheetHeader>
          <SheetTitle>Front Office help</SheetTitle>
          <SheetDescription>Short desk notes. Nothing is posted from this panel.</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4 text-sm">
          <section>
            <h3 className="font-medium text-[#251605]">Room Rack + Calendar</h3>
            <p className="mt-1 text-muted-foreground">
              Drag or resize a stay, then Confirm. Phone uses Room Move and Extend Stay — not a silent write.
            </p>
          </section>
          <section>
            <h3 className="font-medium text-[#251605]">Exceptions honesty</h3>
            <p className="mt-1 text-muted-foreground">
              The badge is the count of Live open rows, including zero. Types without a trustworthy signal stay
              Coming soon. Permission denied is not Coming soon. Exceptions only show real feeds — empty means clear.
            </p>
          </section>
          <section>
            <h3 className="font-medium text-[#251605]">Money path</h3>
            <p className="mt-1 text-muted-foreground">
              Settle and Void live in Cashiering. Front Office never opens a second till or an FO Void.
            </p>
          </section>
          <section>
            <h3 className="font-medium text-[#251605]">Move / Extend vs drag</h3>
            <p className="mt-1 text-muted-foreground">
              Calendar drop only opens Confirm. Menu Move stays available when a room is dirty.
            </p>
          </section>
          <section>
            <h3 className="font-medium text-[#251605]">Phone</h3>
            <p className="mt-1 text-muted-foreground">
              Use the Front Office menu and stay actions. Drag handles stay off on phone.
            </p>
          </section>

          <div className="flex flex-col gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                onNavigate("exceptions");
                onOpenChange(false);
              }}
            >
              Open Exceptions
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                onNavigate("rack");
                onOpenChange(false);
              }}
            >
              Open Room Rack + Calendar
            </Button>
            {canOpenCashiering ? (
              <Button variant="outline" asChild>
                <Link to="/restaurant/pms/cashiering" onClick={() => onOpenChange(false)}>
                  Open Cashiering
                </Link>
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">Cashiering is unavailable for this role.</p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
