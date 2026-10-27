import type { ReactNode } from "react";

import type {
  FoGuestWorkspaceTab,
  FoGuestWorkspaceTabId,
} from "@/packages/pms/lib/fo-guest-workspace-tabs";
import { cn } from "@/shared/lib/utils";

export function FoGuestWorkspaceTabBar({
  tabs,
  active,
  onSelect,
}: {
  tabs: FoGuestWorkspaceTab[];
  active: FoGuestWorkspaceTabId;
  onSelect: (id: FoGuestWorkspaceTabId) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Guest workspace"
      className="flex gap-1 overflow-x-auto"
      data-testid="fo-guest-workspace-tabs"
    >
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            data-testid={`fo-guest-tab-${tab.id}`}
            onClick={() => onSelect(tab.id)}
            className={cn(
              "shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              selected
                ? "border-[#C89933] text-[#F6EFE4]"
                : "border-transparent text-[#C4B39A] hover:text-[#F6EFE4]",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/** Workflow tab body. Buttons inside launch the existing owner workflow. */
export function FoWorkflowPanel({
  title,
  description,
  testId,
  children,
}: {
  title: string;
  description: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <section
      role="tabpanel"
      className="max-w-3xl space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm"
      data-testid={testId}
    >
      <div className="space-y-1">
        <h3 className="font-display text-base font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

export function FoWorkflowUnavailable({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
