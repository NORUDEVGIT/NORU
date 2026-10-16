import type { ReactNode } from "react";

import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { RoomInventoryChrome } from "@/packages/pms/components/rooms/room-inventory-chrome";
import {
  CASHIERING_DESK_DESCRIPTION,
  CASHIERING_DESK_EYEBROW,
  CASHIERING_DESK_TITLE,
  CASHIERING_TABS,
  type CashieringTabId,
} from "@/packages/pms/lib/cashiering-shell";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";

export function CashieringChrome({
  membership,
  active,
  onNavigate,
  onSearch,
  onPostPayment,
  bodyClassName = "space-y-4 p-4 sm:p-5 lg:p-6",
  children,
}: {
  membership: RestaurantMembership;
  active: CashieringTabId;
  onNavigate: (id: CashieringTabId) => void;
  onSearch: (value: string) => void;
  onPostPayment: () => void;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <RoomInventoryChrome
      membership={membership}
      activeModule="Cashiering"
      searchPlaceholder="Search rooms, guests, tasks…"
      searchTestId="cashiering-module-search"
      helpLabel="Cashiering operational workspace"
      shellTestId="cashiering-command-shell"
      onRoomSearch={onSearch}
    >
      <div className="min-w-0 bg-[#F7F4EE]" data-testid="cashiering-desk">
        <header
          className="border-b border-border bg-background"
          data-testid="cashiering-desk-header"
        >
          <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 sm:px-6">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {CASHIERING_DESK_EYEBROW}
              </p>
              <h1 className="mt-0.5 font-display text-2xl font-semibold tracking-tight text-foreground">
                {CASHIERING_DESK_TITLE}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">{CASHIERING_DESK_DESCRIPTION}</p>
            </div>
            <Button
              type="button"
              data-testid="cashiering-post-payment"
              className="h-9 min-h-11 shrink-0 bg-[#C89933] px-3 text-[#251605] hover:bg-[#B5882D] sm:min-h-9"
              onClick={onPostPayment}
            >
              + Post Payment
            </Button>
          </div>
          <nav
            data-testid="cashiering-workspace-nav"
            className="mt-3 flex items-end gap-1 overflow-x-auto px-5 sm:px-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label="Cashiering"
          >
            {CASHIERING_TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                data-testid={`cashiering-nav-${item.id}`}
                onClick={() => onNavigate(item.id)}
                aria-current={active === item.id ? "page" : undefined}
                className={cn(
                  "relative flex h-10 shrink-0 items-center px-2.5 text-xs font-medium transition-colors",
                  active === item.id
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
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
        <div className={bodyClassName}>{children}</div>
      </div>
    </RoomInventoryChrome>
  );
}
