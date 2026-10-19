import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { CardWorkspaceHeader } from "./card-workspace-header";
import { PropertySetupActionFooter } from "./action-footer";
import { PropertySetupStatusRail } from "./status-rail";

import type { PropertySetupCardStatus } from "@/packages/pms/lib/pms-property-setup-card1";
import type { PropertySetupCardNumber } from "@/packages/pms/lib/pms-property-setup-card-identity";
import type { PropertySetupRailSection } from "./status-rail";

function handleBackToPrevious() {
  if (typeof window === "undefined") return;
  const search = new URLSearchParams(window.location.search);
  const returnTo = search.get("returnTo") || search.get("from");
  if (returnTo) {
    window.location.href = returnTo;
    return;
  }
  if (window.history.length > 1 && document.referrer && document.referrer.includes("/restaurant/")) {
    window.history.back();
    return;
  }
  if (document.referrer && document.referrer.includes("/restaurant/pms/rates-revenue")) {
    window.location.href = "/restaurant/pms/rates-revenue";
    return;
  }
  window.location.href = "/restaurant/pms/room-inventory";
}

export function PropertySetupWorkspaceShell({
  cardNumber,
  title,
  description,
  status,
  context,
  headerActions,
  children,
  stepNav,
  rail,
  percent,
  sections,
  complete,
  inProgress,
  notStarted,
  blockers,
  warnings,
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
}) {
  return (
    <div
      className="flex min-h-[calc(100dvh-3.75rem)] min-w-0 flex-1 flex-col overflow-hidden overflow-x-hidden bg-[#F7F4EE]"
      data-testid="property-setup-workspace-shell"
    >
      <div className="@container min-h-0 min-w-0 w-full flex-1 overflow-y-auto">
        <div className="flex min-h-0 flex-col gap-4 px-4 pb-6 pt-5 sm:px-6 @min-[56rem]:flex-row">
          <div className="min-w-0 flex-1 space-y-5">
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

            <CardWorkspaceHeader
              cardNumber={cardNumber}
              title={title}
              description={description}
              status={status}
              context={context}
              actions={headerActions}
            />

            {stepNav}

            <div className="min-w-0">{children}</div>
          </div>

          {rail ?? (
            <PropertySetupStatusRail
              percent={percent}
              sections={sections}
              complete={complete}
              inProgress={inProgress}
              notStarted={notStarted}
              blockers={blockers}
              warnings={warnings}
            />
          )}
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