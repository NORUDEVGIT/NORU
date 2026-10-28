import type { ReactNode } from "react";

import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { RoomInventoryChrome } from "@/packages/pms/components/rooms/room-inventory-chrome";
import {
  NIGHT_AUDIT_DESK_EYEBROW,
  NIGHT_AUDIT_DESK_TITLE,
  NIGHT_AUDIT_TABS,
  type NightAuditTabId,
} from "@/packages/pms/lib/night-audit-shell";
import { cn } from "@/shared/lib/utils";

export function NightAuditChrome({
  membership,
  active,
  onNavigate,
  onSearch,
  children,
}: {
  membership: RestaurantMembership;
  active: NightAuditTabId;
  onNavigate: (id: NightAuditTabId) => void;
  onSearch: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <RoomInventoryChrome
      membership={membership}
      activeModule="Night Audit"
      searchPlaceholder="Search blockers or runs…"
      searchTestId="night-audit-module-search"
      helpLabel="Night Audit operational workspace"
      shellTestId="night-audit-command-shell"
      onRoomSearch={onSearch}
      suppressReturnButton
    >
      <div className="min-w-0 bg-[#F7F4EE]" data-testid="night-audit-desk">
        <header
          className="border-b border-border bg-background"
          data-testid="night-audit-desk-header"
        >
          <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-6">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {NIGHT_AUDIT_DESK_EYEBROW}
              </p>
              <h1 className="mt-0.5 font-display text-2xl font-semibold tracking-tight text-foreground">
                {NIGHT_AUDIT_DESK_TITLE}
              </h1>
            </div>

            {/* Primary mode switcher: Current Audit vs History */}
            <div className="flex items-center rounded-xl border border-border bg-muted/40 p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => onNavigate("control")}
                className={cn(
                  "rounded-lg px-4 py-1.5 transition-all cursor-pointer",
                  active !== "history"
                    ? "bg-[#251605] text-[#F7F4EE] shadow-2xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Current Audit
              </button>
              <button
                type="button"
                onClick={() => onNavigate("history")}
                className={cn(
                  "rounded-lg px-4 py-1.5 transition-all cursor-pointer",
                  active === "history"
                    ? "bg-[#251605] text-[#F7F4EE] shadow-2xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                History
              </button>
            </div>
          </div>
          {/* Legacy navigation tabs hidden - replaced by the 8-step workspace */}
          <nav
            data-testid="night-audit-workspace-nav"
            className="hidden"
            aria-hidden="true"
            aria-label="Night Audit"
          >
            {NIGHT_AUDIT_TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                data-testid={`night-audit-nav-${item.id}`}
                onClick={() => onNavigate(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </header>
        <div className="space-y-4 p-4 sm:p-5 lg:p-6">{children}</div>
      </div>
    </RoomInventoryChrome>
  );
}
