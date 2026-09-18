import type { ReactNode } from "react";

import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
import type { PropertySetupCardStatus } from "@/packages/pms/lib/pms-property-setup-card1";

export type PropertySetupNavItem = {
  id: string;
  label: string;
  href: string;
};

export type PropertySetupWorkspaceStep = {
  id: string;
  number: number;
  title: string;
  status: PropertySetupCardStatus;
};

export function PmsPropertySetupWorkspace({
  testIdPrefix,
  sidebarOutCopy,
  nav,
  title,
  subtitle,
  steps,
  activeStepId,
  onSelectStep,
  children,
  progressPct,
  completedCount,
  currentSection,
  nextStepTitle,
  cardStatusLabel,
  progressLabel,
  onBack,
  saveDraftDisabled = false,
  continueDisabled = false,
  continuePending = false,
  onSaveDraft,
  onContinue,
  statusRailContent,
}: {
  testIdPrefix: string;
  sidebarOutCopy: string;
  nav: readonly PropertySetupNavItem[];
  title: string;
  subtitle: string;
  steps: readonly PropertySetupWorkspaceStep[];
  activeStepId: string;
  onSelectStep: (id: string) => void;
  children: ReactNode;
  progressPct: number;
  completedCount: number;
  currentSection: string;
  nextStepTitle: string | null;
  cardStatusLabel: string;
  progressLabel: string;
  onBack: () => void;
  saveDraftDisabled?: boolean;
  continueDisabled?: boolean;
  continuePending?: boolean;
  onSaveDraft?: () => void;
  onContinue: () => void;
  statusRailContent?: ReactNode;
}) {
  return (
    <section
      className="min-h-[calc(100dvh-3.75rem)] bg-[#F7F4EE]"
      data-testid={`${testIdPrefix}-workspace`}
      data-card-fullscreen="true"
    >
      <div className="sr-only">{sidebarOutCopy}</div>
      <nav
        className="flex flex-wrap items-center gap-1 bg-[#251605] px-4 py-2 text-white"
        data-testid={`${testIdPrefix}-top-nav`}
        aria-label="PMS"
      >
        {nav.map((item) => (
          <a
            key={item.id}
            href={item.href}
            className={cn(
              "rounded-lg px-2.5 py-1.5 text-xs",
              item.id === "settings" ? "bg-[#C89933] text-[#251605]" : "text-white/80 hover:bg-white/10 hover:text-white",
            )}
          >
            {item.label}
          </a>
        ))}
      </nav>

      <div className="px-4 py-5 sm:px-6" data-testid={`${testIdPrefix}-fullscreen`}>
        <div className="mb-4">
          <h1 className="font-display text-3xl text-[#251605]">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>

        <ol
          className="mb-5 flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible xl:grid-cols-5"
          data-testid={`${testIdPrefix}-steps`}
        >
          {steps.map((row) => {
            const active = activeStepId === row.id;
            return (
              <li key={row.id} className="min-w-[10.5rem] sm:min-w-0">
                <button
                  type="button"
                  onClick={() => onSelectStep(row.id)}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-xl border px-2 py-2 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C89933]",
                    active
                      ? "border-[#C89933] bg-[#C89933]/10 text-[#251605]"
                      : row.status === "complete"
                        ? "border-[#436436]/40 bg-[#436436]/10 text-[#251605]"
                        : "border-[#CCCCCC] text-muted-foreground",
                  )}
                >
                  <span className="font-semibold">{row.status === "complete" && !active ? "✓" : row.number}</span>
                  <span className="leading-tight">{row.title}</span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="grid gap-4 pb-28 xl:grid-cols-[minmax(0,1fr)_17.5rem]">
          <div className="min-w-0">{children}</div>
          <aside
            className="space-y-3 xl:sticky xl:top-4 xl:self-start"
            data-testid={`${testIdPrefix}-status-rail`}
          >
            <section className="rounded-2xl border border-[#CCCCCC] bg-white p-4 shadow-sm">
              <p className="text-sm font-medium text-[#251605]">Setup Progress</p>
              <div className="mt-3 flex items-center gap-3">
                <div
                  className="relative h-14 w-14 shrink-0 rounded-full"
                  style={{ background: `conic-gradient(#C89933 ${progressPct}%, #EDE6D8 ${progressPct}%)` }}
                  aria-hidden
                >
                  <div className="absolute inset-1 flex items-center justify-center rounded-full bg-white text-[11px] font-semibold text-[#251605]">
                    {progressPct}%
                  </div>
                </div>
                <p className="text-sm text-[#251605]">
                  {completedCount} of {steps.length} sections completed
                </p>
              </div>
            </section>
            <section className="rounded-2xl border border-[#CCCCCC] bg-white p-4 shadow-sm">
              <p className="text-xs text-muted-foreground">Current Section</p>
              <p className="mt-1 text-sm font-medium text-[#251605]">{currentSection}</p>
            </section>
            {nextStepTitle ? (
              <section className="rounded-2xl border border-[#CCCCCC] bg-white p-4 shadow-sm">
                <p className="text-xs text-muted-foreground">Next Step</p>
                <p className="mt-1 text-sm font-medium text-[#251605]">{nextStepTitle}</p>
              </section>
            ) : null}
            <section className="rounded-2xl border border-[#CCCCCC] bg-white p-4 shadow-sm">
              <p className="text-xs text-muted-foreground">Card Status</p>
              <p className="mt-1 text-sm font-medium text-[#251605]">{cardStatusLabel}</p>
            </section>
            <section className="rounded-2xl border border-[#CCCCCC] bg-white p-4 shadow-sm">
              <p className="text-xs text-muted-foreground">{progressLabel}</p>
              <p className="mt-1 text-sm font-medium text-[#251605]">{progressPct}%</p>
            </section>
            {statusRailContent}
          </aside>
        </div>

        <div
          className="pointer-events-none sticky bottom-0 z-10 mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-[#CCCCCC] bg-[#F7F4EE]/95 py-3 [&>*]:pointer-events-auto"
          data-testid={`${testIdPrefix}-chrome`}
        >
          <Button type="button" variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button type="button" variant="outline" disabled={saveDraftDisabled} onClick={() => onSaveDraft?.()}>
            Save Draft
          </Button>
          <Button
            type="button"
            disabled={continueDisabled || continuePending}
            onClick={onContinue}
            className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90"
          >
            {continuePending ? "Saving…" : "Save & Continue"}
          </Button>
        </div>
      </div>
    </section>
  );
}
