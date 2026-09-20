import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, Loader2, Save } from "lucide-react";

import { Button } from "@/shared/components/ui/button";

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
}) {
  return (
    <footer
      className="sticky bottom-0 z-10 mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-[#E6E1D8] bg-[#F7F4EE]/95 px-4 py-3 backdrop-blur sm:px-6"
      data-testid={testId}
      data-dirty={dirty ? "true" : "false"}
    >
      <Button type="button" variant="outline" disabled={backDisabled} onClick={onBack}>
        <ArrowLeft className="size-4" />
        {backLabel}
      </Button>
      <div className="flex flex-wrap items-center gap-2">
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
