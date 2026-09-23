import type { ReactNode } from "react";

import type { PropertySetupCardStatus } from "@/packages/pms/lib/pms-property-setup-card1";
import {
  propertySetupCardByNumber,
  propertySetupCardStatusPillLabel,
  type PropertySetupCardNumber,
} from "@/packages/pms/lib/pms-property-setup-card-identity";
import { cn } from "@/shared/lib/utils";

export function CardWorkspaceHeader({
  cardNumber,
  title,
  description,
  status,
  context,
  actions,
}: {
  cardNumber: PropertySetupCardNumber;
  title?: string;
  description?: string;
  status: PropertySetupCardStatus;
  context?: string;
  actions?: ReactNode;
}) {
  const identity = propertySetupCardByNumber(cardNumber);
  const Icon = identity.Icon;
  return (
    <header className="flex items-start gap-4" data-testid="property-setup-card-header">
      <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-[#F4EDE0] text-[#251605]">
        <Icon className="size-7" strokeWidth={1.75} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {context ?? `Card ${identity.number}`}
            </p>
            <h1 className="font-sans text-3xl font-extrabold tracking-tight text-[#251605]">
              {title ?? identity.title}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {actions}
            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium",
                status === "complete" && "bg-[#436436]/12 text-[#436436]",
                status === "in_progress" && "bg-[#C89933]/15 text-[#9A6A12]",
                status === "not_started" && "bg-[#ECEAE4] text-muted-foreground",
              )}
            >
              {propertySetupCardStatusPillLabel(status)}
            </span>
          </div>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {description ?? identity.purpose}
        </p>
      </div>
    </header>
  );
}
