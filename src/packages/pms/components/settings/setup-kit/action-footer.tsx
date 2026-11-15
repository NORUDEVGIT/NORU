import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, Loader2, Save } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";

export function PropertySetupActionFooter({
  onBack,
  onSaveDraft,
  onContinue,
  backLabel = "Back",
  saveDraftLabel = "Save Draft",
  continueLabel = "Save & Continue",
  saveDraftDisabled = false,
  continueDisabled = false,
  backDisabled = false,
  saveDraftPending = false,
  continuePending = false,
  dirty = false,
  extra,
  testId = "property-setup-action-footer",
  elevated = false,
}: {
  onBack: () => void;
  onSaveDraft?: () => void;
  onContinue?: () => void;
  backLabel?: string;
  saveDraftLabel?: string;
  continueLabel?: string;
  saveDraftDisabled?: boolean;
  continueDisabled?: boolean;
  backDisabled?: boolean;
  saveDraftPending?: boolean;
  continuePending?: boolean;
  dirty?: boolean;
  extra?: ReactNode;
  testId?: string;
  elevated?: boolean;
}) {
  return (
    <footer
      className={
        elevated
          ? "fixed inset-x-0 bottom-0 z-40 flex h-14 w-full items-center justify-between gap-3 border-t border-[#E6E1D8] bg-[#F7F4EE] px-4 shadow-[0_-8px_20px_rgba(37,22,5,0.06)] sm:px-6"
          : "sticky bottom-0 z-10 mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-[#E6E1D8] bg-[#F7F4EE]/95 px-4 py-3 backdrop-blur sm:px-6"
      }
      data-testid={testId}
      data-dirty={dirty ? "true" : "false"}
    >
      <Button type="button" variant="outline" className="shrink-0" disabled={backDisabled} onClick={onBack}>
        <ArrowLeft className="size-4" />
        {backLabel}
      </Button>
      <div className={cn("flex items-center gap-2", elevated ? "shrink-0 flex-wrap justify-end sm:flex-nowrap" : "flex-wrap")}>
        {onSaveDraft ? (
          <Button
            type="button"
            variant="outline"
            disabled={saveDraftDisabled}
            onClick={onSaveDraft}
          >
            {saveDraftPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            {saveDraftLabel}
          </Button>
        ) : null}
        {onContinue ? (
          <Button
            type="button"
            className="bg-[#C89933] font-medium text-[#251605] hover:bg-[#C89933]/90"
            disabled={continueDisabled || continuePending}
            onClick={onContinue}
          >
            {continuePending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ArrowRight className="size-4" />
            )}
            {continueLabel}
          </Button>
        ) : null}
        {extra}
      </div>
    </footer>
  );
}
