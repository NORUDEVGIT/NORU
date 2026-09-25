import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";

import { Sheet, SheetContent } from "@/shared/components/ui/sheet";
import { BulkWizardProgress, type BulkWizardStep } from "./bulk-wizard-progress";

function PanelChrome({
  children,
  footer,
  onClose,
}: {
  children: ReactNode;
  footer: ReactNode;
  onClose?: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F7F4EE]">
      <div className="flex items-start justify-between gap-3 border-b border-[#E8E1D7] px-4 py-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Bulk Rate Change
          </p>
          <h3 className="mt-1 font-display text-lg font-semibold text-[#251605]">Update nightly rates</h3>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-[#E8E1D7] xl:hidden"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">{children}</div>
      {footer ? <div className="flex flex-wrap gap-2 border-t border-[#E8E1D7] px-4 py-3">{footer}</div> : null}
    </div>
  );
}

export function BulkRateChangePanel({
  step,
  progress,
  body,
  footer,
}: {
  step: BulkWizardStep;
  progress: boolean;
  body: ReactNode;
  footer: ReactNode;
}) {
  const [desktop, setDesktop] = useState(true);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1280px)");
    const sync = () => setDesktop(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const chrome = (
    <PanelChrome onClose={() => setOpen(false)} footer={footer}>
      {progress ? <BulkWizardProgress step={step} /> : null}
      {body}
    </PanelChrome>
  );

  return (
    <>
      <aside className="hidden h-full min-h-[32rem] overflow-hidden rounded-xl border border-[#E8E1D7] bg-[#F7F4EE] xl:block">
        {chrome}
      </aside>
      {!desktop ? (
        <>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex h-8 items-center rounded-md bg-[#C89933] px-2.5 text-[10px] font-medium text-[#251605] hover:bg-[#B5882D] xl:hidden"
          >
            Open Bulk Rate Change
          </button>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent side="right" className="w-[96vw] max-w-md p-0 xl:hidden">
              {chrome}
            </SheetContent>
          </Sheet>
        </>
      ) : null}
    </>
  );
}
