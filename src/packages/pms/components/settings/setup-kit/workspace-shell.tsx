import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
import { CardWorkspaceHeader } from "./card-workspace-header";
import { PropertySetupActionFooter } from "./action-footer";

import type { PropertySetupCardStatus } from "@/packages/pms/lib/pms-property-setup-card1";
import type { PropertySetupCardNumber } from "@/packages/pms/lib/pms-property-setup-card-identity";
import type { PropertySetupRailSection } from "./status-rail";

function settingsReturnTo(): string | null {
  if (typeof window === "undefined") return null;
  const search = new URLSearchParams(window.location.search);
  return search.get("returnTo") || search.get("from");
}

function handleBackToPrevious() {
  const returnTo = settingsReturnTo();
  if (returnTo) {
    window.location.href = returnTo;
  }
}

export function PropertySetupWorkspaceShell({
  cardNumber,
  title,
  headerActions,
  children,
  stepNav,
  footer,
  onBack,
  onSaveDraft,
  onContinue,
  saveDraftDisabled,
  continueDisabled,
  continuePending,
  saveDraftPending,
  dirty,
  continueLabel,
  extraFooter,
  footerTestId,
  hideTitle,
  wide,
}: {
  cardNumber: PropertySetupCardNumber;
  title?: string;
  description?: string;
  status: PropertySetupCardStatus;
  context?: string;
  headerActions?: ReactNode;
  children: ReactNode;
  stepNav?: ReactNode;
  rail?: ReactNode;
  percent?: number;
  sections?: readonly PropertySetupRailSection[];
  complete?: number;
  inProgress?: number;
  notStarted?: number;
  blockers?: readonly string[];
  warnings?: readonly string[];
  footer?: ReactNode | null;
  onBack: () => void;
  onSaveDraft?: () => void;
  onContinue?: () => void;
  saveDraftDisabled?: boolean;
  continueDisabled?: boolean;
  continuePending?: boolean;
  saveDraftPending?: boolean;
  dirty?: boolean;
  continueLabel?: string;
  extraFooter?: ReactNode;
  footerTestId?: string;
  hideTitle?: boolean;
  wide?: boolean;
}) {
  return (
    <div
      className="flex min-h-[calc(100dvh-3.75rem)] min-w-0 flex-1 flex-col overflow-hidden overflow-x-hidden bg-[#F7F4EE]"
      data-testid="property-setup-workspace-shell"
    >
      <div className="@container min-h-0 min-w-0 w-full flex-1 overflow-y-auto">
        <div
          className={cn(
            "min-h-0 w-full px-4 pb-6 sm:px-6",
            wide
              ? "mx-auto max-w-[90rem] space-y-3 pt-3 lg:px-8"
              : "mx-auto max-w-5xl space-y-4 pt-4",
          )}
        >
            {settingsReturnTo() ? (
              <div className="flex items-center justify-between pb-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleBackToPrevious}
                  className="h-8 gap-1.5 px-3 text-xs font-semibold text-[#5C5346] hover:text-[#251605] border-[#D6CDBF] bg-white shadow-xs"
                >
                  <ArrowLeft className="size-3.5" />
                  Back to previous page
                </Button>
              </div>
            ) : null}

            {hideTitle ? null : (
              <CardWorkspaceHeader
                cardNumber={cardNumber}
                title={title}
                actions={headerActions}
              />
            )}

            {stepNav}

            <div className="min-w-0">{children}</div>
        </div>
      </div>

      {footer === null
        ? null
        : (footer ?? (
            <PropertySetupActionFooter
              onBack={onBack}
              onSaveDraft={onSaveDraft}
              onContinue={onContinue}
              saveDraftDisabled={saveDraftDisabled}
              continueDisabled={continueDisabled}
              continuePending={continuePending}
              saveDraftPending={saveDraftPending}
              dirty={dirty}
              continueLabel={continueLabel}
              extra={extraFooter}
              testId={footerTestId}
            />
          ))}
    </div>
  );
}