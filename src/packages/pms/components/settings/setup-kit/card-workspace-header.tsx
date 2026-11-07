import type { ReactNode } from "react";

import { propertySetupCardByNumber, type PropertySetupCardNumber } from "@/packages/pms/lib/pms-property-setup-card-identity";
import type { PropertySetupCardStatus } from "@/packages/pms/lib/pms-property-setup-card1";

export function CardWorkspaceHeader({
  cardNumber,
  title,
  actions,
}: {
  cardNumber: PropertySetupCardNumber;
  title?: string;
  description?: string;
  status?: PropertySetupCardStatus;
  context?: string;
  actions?: ReactNode;
}) {
  const identity = propertySetupCardByNumber(cardNumber);
  return (
    <header className="flex items-center justify-between gap-3" data-testid="property-setup-card-header">
      <h1 className="min-w-0 truncate font-sans text-xl font-semibold tracking-tight text-[#251605]">
        {title ?? identity.title}
      </h1>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
