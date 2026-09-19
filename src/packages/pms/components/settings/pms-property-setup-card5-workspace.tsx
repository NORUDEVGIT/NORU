import type { ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

/**
 * Shared Card 5 tab workspace shell. Phase 0 establishes layout slots only;
 * callers do not load or persist business data.
 */
export function PmsPropertySetupCard5Workspace({
  search,
  drawer,
  status,
  actions,
  validate,
  children,
}: {
  search?: ReactNode;
  drawer?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  validate?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4" data-testid="pms-card5-tab-workspace">
      {validate ? (
        <div className="flex justify-end" data-testid="pms-card5-validate-slot">
          {validate}
        </div>
      ) : (
        <div className="sr-only" data-testid="pms-card5-validate-slot">
          Validate action slot
        </div>
      )}

      {search ? (
        <div data-testid="pms-card5-search-slot">{search}</div>
      ) : (
        <div className="sr-only" data-testid="pms-card5-search-slot">
          Search and filter slot
        </div>
      )}

      <div
        className={cn("grid gap-4", drawer ? "lg:grid-cols-[minmax(0,1fr)_22rem]" : "grid-cols-1")}
        data-testid="pms-card5-workspace-layout"
      >
        <div className="min-w-0 max-w-full overflow-x-auto" data-testid="pms-card5-content-slot">
          {children}
        </div>
        {drawer ? (
          <aside className="min-w-0" data-testid="pms-card5-drawer-slot">
            {drawer}
          </aside>
        ) : (
          <aside className="sr-only" data-testid="pms-card5-drawer-slot">
            Right drawer slot
          </aside>
        )}
      </div>

      {status || actions ? (
        <footer className="relative z-10 mt-2 flex flex-wrap items-center justify-between gap-3 border-t bg-[#F7F4EE] pt-4">
          <div data-testid="pms-card5-status-slot">{status}</div>
          <div data-testid="pms-card5-actions-slot">{actions}</div>
        </footer>
      ) : (
        <>
          <div className="sr-only" data-testid="pms-card5-status-slot">
            Configuration status slot
          </div>
          <div className="sr-only" data-testid="pms-card5-actions-slot">
            Workspace actions slot
          </div>
        </>
      )}
    </div>
  );
}
