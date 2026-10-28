import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import type { HousekeepingScope } from "@/core/lib/module-access";
import { RoomInventoryChrome } from "@/packages/pms/components/rooms/room-inventory-chrome";
import { resolvePmsReturnTo } from "@/packages/pms/lib/cashiering-shell";
import {
  HK_AREA_ITEMS,
  HK_DESK_DESCRIPTION,
  HK_DESK_TITLE,
  visibleHkAreas,
  type HkAreaId,
  type HkResolvableAreaId,
} from "@/packages/pms/lib/housekeeping-shell";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";

export function HousekeepingChrome({
  membership,
  scope,
  active,
  onNavigate,
  onSearch,
  returnTo,
  returnToLabel,
  children,
}: {
  membership: RestaurantMembership;
  scope: HousekeepingScope;
  active: HkResolvableAreaId;
  onNavigate: (id: HkAreaId) => void;
  onSearch: (value: string) => void;
  returnTo?: string | undefined;
  returnToLabel?: string | undefined;
  children: ReactNode;
}) {
  const visible = visibleHkAreas(scope);
  const { hasPrevious, computedLabel, handleReturn } = resolvePmsReturnTo({
    returnTo,
    returnToLabel,
  });

  return (
    <RoomInventoryChrome
      membership={membership}
      activeModule="Housekeeping"
      searchPlaceholder="Search rooms, guests, tasks…"
      searchTestId="hk-module-search"
      helpLabel="Housekeeping Desk operational workspace"
      shellTestId="hk-command-shell"
      onRoomSearch={onSearch}
      suppressReturnButton
    >
      <div className="min-w-0 bg-[#F7F4EE]" data-testid="hk-desk">
        <header className="border-b border-border bg-background" data-testid="hk-desk-header">
          <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 sm:px-6">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Operations
              </p>
              <h1 className="mt-0.5 font-display text-2xl font-semibold tracking-tight text-foreground">
                {HK_DESK_TITLE}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">{HK_DESK_DESCRIPTION}</p>
            </div>

            {hasPrevious ? (
              <div className="flex items-center gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReturn}
                  data-testid="hk-return-to-previous"
                  className="h-8 gap-1.5 px-3 text-xs font-semibold text-[#5C5346] hover:text-[#251605] border-[#D6CDBF] bg-white shadow-xs hover:bg-[#FAF8F4] transition-all"
                >
                  <ArrowLeft className="size-3.5 text-[#8A6A24]" />
                  {computedLabel}
                </Button>
              </div>
            ) : null}
          </div>
          <nav
            data-testid="hk-workspace-nav"
            className="mt-3 flex items-end gap-1 overflow-x-auto px-5 sm:px-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label="Housekeeping"
          >
            {HK_AREA_ITEMS.filter((item) => visible.includes(item.id)).map((item) => (
              <button
                key={item.id}
                type="button"
                data-testid={`hk-nav-${item.id}`}
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
