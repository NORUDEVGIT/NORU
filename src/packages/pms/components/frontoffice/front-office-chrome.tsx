import type { ReactNode } from "react";

import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { FoHelpSheet } from "@/packages/pms/components/frontoffice/fo-help-sheet";
import { RoomInventoryChrome } from "@/packages/pms/components/rooms/room-inventory-chrome";
import {
  FO_DESK_DESCRIPTION,
  FO_DESK_TITLE,
  FO_NAV_ITEMS,
  actionsForMenu,
  type FoNavId,
} from "@/packages/pms/lib/front-office-shell";
import { cn } from "@/shared/lib/utils";

export function FrontOfficeChrome({
  membership,
  active,
  onNavigate,
  onQuickAction,
  onGuestSearch,
  exceptionBadge = 0,
  onNotifications,
  onFoActivity,
  helpOpen,
  onHelpOpenChange,
  canOpenCashiering = false,
  children,
}: {
  membership: RestaurantMembership;
  active: FoNavId;
  onNavigate: (id: FoNavId) => void;
  onQuickAction: (actionId: string) => void;
  onGuestSearch: (term?: string) => void;
  exceptionBadge?: number;
  onNotifications?: () => void;
  onFoActivity?: () => void;
  helpOpen?: boolean;
  onHelpOpenChange?: (open: boolean) => void;
  canOpenCashiering?: boolean;
  children: ReactNode;
}) {
  const overflowItems = [
    { label: "FO activity", testId: "fo-activity", onSelect: () => onFoActivity?.() },
    { label: "Exceptions", onSelect: () => onNotifications?.() ?? onNavigate("exceptions") },
    ...actionsForMenu("quick").map((action) => ({
      label: action.label,
      onSelect: () => onQuickAction(action.id),
    })),
  ];

  return (
    <RoomInventoryChrome
      membership={membership}
      activeModule="Front Office"
      searchPlaceholder="Search guest, reservation, room…"
      searchTestId="fo-module-search"
      helpLabel="Front Office Desk operational workspace"
      shellTestId="fo-command-shell"
      onRoomSearch={(value) => onGuestSearch(value)}
      onHelpClick={() => onHelpOpenChange?.(true)}
      overflowItems={overflowItems}
    >
      <div className="min-w-0 bg-[#F7F4EE]" data-testid="fo-desk">
        <header className="border-b border-border bg-background" data-testid="fo-desk-header">
          <div className="px-5 pt-4 sm:px-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Operations
            </p>
            <h1 className="mt-0.5 font-display text-2xl font-semibold tracking-tight text-foreground">
              {FO_DESK_TITLE}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{FO_DESK_DESCRIPTION}</p>
          </div>
          <nav
            data-testid="fo-workspace-nav"
            className="mt-3 flex items-end gap-3 overflow-x-auto px-5 sm:px-6"
            aria-label="Front Office"
          >
            {FO_NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                data-testid={`fo-nav-${item.id}`}
                onClick={() => onNavigate(item.id)}
                aria-current={active === item.id ? "page" : undefined}
                className={cn(
                  "relative flex h-10 shrink-0 items-center px-2.5 text-xs font-medium transition-colors",
                  active === item.id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span>{item.label}</span>
                {item.id === "exceptions" ? (
                  <span
                    data-testid="fo-exceptions-badge"
                    className="ml-1.5 min-w-5 rounded-full bg-[#F4E9D0] px-1.5 text-center text-[10px] leading-5 text-[#251605]"
                  >
                    {exceptionBadge}
                  </span>
                ) : null}
                {active === item.id ? (
                  <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[#C89933]" />
                ) : null}
              </button>
            ))}
          </nav>
        </header>
        <div className="space-y-4 p-4 sm:p-5 lg:p-6">{children}</div>
      </div>
      <FoHelpSheet
        open={!!helpOpen}
        onOpenChange={(open) => onHelpOpenChange?.(open)}
        onNavigate={onNavigate}
        canOpenCashiering={canOpenCashiering}
      />
    </RoomInventoryChrome>
  );
}
