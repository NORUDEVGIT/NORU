import type { ReactNode } from "react";

import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { RoomInventoryChrome } from "@/packages/pms/components/rooms/room-inventory-chrome";
import {
  NIGHT_AUDIT_DESK_EYEBROW,
  NIGHT_AUDIT_DESK_TITLE,
  NIGHT_AUDIT_TAB_COPY,
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
    >
      <div className="min-w-0 bg-[#F7F4EE]" data-testid="night-audit-desk">
        <header className="border-b border-border bg-background" data-testid="night-audit-desk-header">
          <div className="px-5 pt-4 sm:px-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {NIGHT_AUDIT_DESK_EYEBROW}
            </p>
            <h1 className="mt-0.5 font-display text-2xl font-semibold tracking-tight text-foreground">
              {NIGHT_AUDIT_DESK_TITLE}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{NIGHT_AUDIT_TAB_COPY[active]}</p>
          </div>
          <nav
            data-testid="night-audit-workspace-nav"
            className="mt-3 flex items-end gap-1 overflow-x-auto px-5 sm:px-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label="Night Audit"
          >
            {NIGHT_AUDIT_TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                data-testid={`night-audit-nav-${item.id}`}
                onClick={() => onNavigate(item.id)}
                aria-current={active === item.id ? "page" : undefined}
                className={cn(
                  "relative flex h-11 min-h-11 shrink-0 items-center px-3 text-xs font-medium transition-colors",
                  active === item.id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span>{item.label}</span>
                {active === item.id ? (
                  <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[#C89933]" />
                ) : null}
              </button>
            ))}
          </nav>
        </header>
        <div className="space-y-4 p-4 sm:p-5 lg:p-6">{children}</div>
      </div>
    </RoomInventoryChrome>
  );
}
