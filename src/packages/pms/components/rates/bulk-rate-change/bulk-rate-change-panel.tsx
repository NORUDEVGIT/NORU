import type { ReactNode } from "react";
import { X } from "lucide-react";

import { Sheet, SheetContent } from "@/shared/components/ui/sheet";
import { BulkWizardProgress, type BulkWizardStep } from "./bulk-wizard-progress";

function PanelChrome({
  subtitle,
  children,
  footer,
  onClose,
}: {
  subtitle?: string | undefined;
  children: ReactNode;
  footer: ReactNode;
  onClose?: (() => void) | undefined;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F7F4EE]">
      <div className="flex items-start justify-between gap-3 border-b border-[#E8E1D7] bg-white px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8A641A]">
            Bulk Rate Change
          </p>
          <h3 className="mt-1 font-display text-lg font-semibold text-[#251605]">
            Update Nightly Rates
          </h3>
          {subtitle ? (
            <p className="mt-0.5 text-xs font-medium text-[#5A4833]">{subtitle}</p>
          ) : null}
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#756A5B] transition-colors hover:bg-[#F3ECE2] hover:text-[#251605]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">{children}</div>
      {footer ? (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#E8E1D7] bg-white px-5 py-3.5">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

export function BulkRateChangePanel({
  open,
  step,
  subtitle,
  progress,
  body,
  footer,
  onClose,
}: {
  open: boolean;
  step: BulkWizardStep;
  subtitle?: string | undefined;
  progress: boolean;
  body: ReactNode;
  footer: ReactNode;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent side="right" className="w-[95vw] sm:max-w-[560px] p-0 [&>button]:hidden">
        <PanelChrome subtitle={subtitle} onClose={onClose} footer={footer}>
          {progress ? <BulkWizardProgress step={step} /> : null}
          {body}
        </PanelChrome>
      </SheetContent>
    </Sheet>
  );
}
