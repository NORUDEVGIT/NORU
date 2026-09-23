import type { ReactNode } from "react";

/** Shared responsive shell for the four integrated Card 8 domains. */
export function PmsPropertySetupCard8Workspace({
  lifecycle,
  validation,
  checklist,
  summary,
  status,
  actions,
  children,
}: {
  lifecycle?: ReactNode;
  validation?: ReactNode;
  checklist?: ReactNode;
  summary?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4" data-testid="pms-card8-tab-workspace">
      <div className="rounded-2xl border bg-card p-4" data-testid="pms-card8-lifecycle-slot">
        {lifecycle ?? (
          <p className="text-sm text-muted-foreground">
            Readiness is derived from current setup and governance state.
          </p>
        )}
      </div>

      <div
        className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]"
        data-testid="pms-card8-workspace-layout"
      >
        <div className="min-w-0 space-y-4 overflow-x-auto">
          <div data-testid="pms-card8-content-slot">{children}</div>
          <div data-testid="pms-card8-validation-slot">
            {validation ?? <p className="sr-only">Validation result area</p>}
          </div>
          <div data-testid="pms-card8-checklist-slot">
            {checklist ?? <p className="sr-only">Go-live checklist area</p>}
          </div>
        </div>

        <aside
          className="min-w-0 rounded-2xl border bg-card p-4"
          data-testid="pms-card8-summary-slot"
        >
          {summary ?? (
            <p className="text-sm text-muted-foreground">
              No summary is available for this domain.
            </p>
          )}
        </aside>
      </div>

      <footer className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-t bg-[#F7F4EE] pt-4">
        <div data-testid="pms-card8-status-slot">
          {status ?? <p className="text-sm text-muted-foreground">Not evaluated</p>}
        </div>
        <div data-testid="pms-card8-actions-slot">{actions}</div>
      </footer>
    </div>
  );
}
