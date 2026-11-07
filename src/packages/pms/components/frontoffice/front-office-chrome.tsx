import { type ReactNode, useState, createContext, useContext } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Ban,
  BedDouble,
  Clock,
  DoorOpen,
  House,
  LogIn,
  LogOut,
  Menu,
  Pencil,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { SHELL_ICON_BUTTON } from "@/packages/pms/components/reservations/reservation-shell-slots";
import { RoomInventoryChrome } from "@/packages/pms/components/rooms/room-inventory-chrome";
import { resolvePmsReturnTo } from "@/packages/pms/lib/cashiering-shell";
import {
  FO_DESK_DESCRIPTION,
  FO_DESK_TITLE,
  FO_NAV_ITEMS,
  type FoNavId,
} from "@/packages/pms/lib/front-office-shell";
import { Button } from "@/shared/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { cn } from "@/shared/lib/utils";

/**
 * One NORU icon per Front Office destination. Keep in sync with FO_NAV_ITEMS —
 * every id must resolve to an icon or the nav menu throws.
 */
/** Rack toolbar registers a leading slot so the burger sits in the shared control row. */
const FoToolbarSlotContext = createContext<((node: HTMLElement | null) => void) | null>(null);

export function useFoToolbarSlot() {
  return useContext(FoToolbarSlotContext);
}

const FO_NAV_ICONS: Record<FoNavId, LucideIcon> = {
  rack: BedDouble,
  arrivals: LogIn,
  inhouse: House,
  departures: LogOut,
  walkins: DoorOpen,
  amendments: Pencil,
  cancellations: Ban,
  noshows: Clock,
  exceptions: TriangleAlert,
};

export function FrontOfficeChrome({
  membership,
  active,
  onNavigate,
  onGuestSearch,
  exceptionBadge = 0,
  returnTo,
  returnToLabel,
  children,
}: {
  membership: RestaurantMembership;
  active: FoNavId;
  onNavigate: (id: FoNavId) => void;
  onGuestSearch: (term?: string) => void;
  exceptionBadge?: number;
  returnTo?: string | undefined;
  returnToLabel?: string | undefined;
  children: ReactNode;
}) {
  const { hasPrevious, computedLabel, handleReturn } = resolvePmsReturnTo({
    returnTo,
    returnToLabel,
  });
  const [navOpen, setNavOpen] = useState(false);
  const [toolbarSlot, setToolbarSlot] = useState<HTMLElement | null>(null);

  function navigateTo(id: FoNavId) {
    setNavOpen(false);
    onNavigate(id);
  }

  return (
    <RoomInventoryChrome
      membership={membership}
      activeModule="Front Office"
      searchPlaceholder="Search guest, reservation, room…"
      searchTestId="fo-module-search"
      helpLabel="Help"
      shellTestId="fo-command-shell"
      onRoomSearch={(value) => onGuestSearch(value)}
      suppressReturnButton
    >
      <FoToolbarSlotContext.Provider value={setToolbarSlot}>
      <div className="relative min-w-0 bg-[#F7F4EE]" data-testid="fo-desk">
        {(() => {
          const trigger = (
        <div className="shrink-0" data-testid="fo-desk-topbar">
          <Popover open={navOpen} onOpenChange={setNavOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Front Office navigation"
                title="Front Office navigation"
                data-testid="fo-nav-trigger"
                className={SHELL_ICON_BUTTON}
              >
                <Menu className="size-4" aria-hidden="true" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              sideOffset={8}
              className="pointer-events-auto w-64 p-1.5"
              data-testid="fo-workspace-nav"
              aria-label={FO_DESK_TITLE}
            >
              <p className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {FO_DESK_TITLE}
              </p>
              <p className="sr-only">{FO_DESK_DESCRIPTION}</p>
              <div className="flex flex-col gap-0.5">
                {FO_NAV_ITEMS.map((item) => {
                  const Icon = FO_NAV_ICONS[item.id];
                  const isActive = active === item.id;
                  // "rack" is the shared Rack/Table workspace itself — shown as "All" since
                  // selecting any item below now filters that one workspace in place instead
                  // of navigating to a separate page.
                  const label = item.id === "rack" ? "All" : item.label;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-testid={`fo-nav-${item.id}`}
                      onClick={() => navigateTo(item.id)}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                        isActive
                          ? "bg-[#F4E9D0] font-medium text-[#251605]"
                          : "text-foreground hover:bg-[#F7F4EE]",
                      )}
                    >
                      <Icon className="size-4 shrink-0 text-[#8A6A24]" aria-hidden="true" />
                      <span className="flex-1">{label}</span>
                      {item.id === "exceptions" ? (
                        <span
                          data-testid="fo-exceptions-badge"
                          className="min-w-5 rounded-full bg-[#F4E9D0] px-1.5 text-center text-[10px] leading-5 text-[#251605]"
                        >
                          {exceptionBadge}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
        </div>
          );
          return toolbarSlot ? createPortal(trigger, toolbarSlot) : null;
        })()}
        {hasPrevious ? (
          <div className="px-3 pt-2 sm:px-4">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReturn}
              data-testid="fo-return-to-previous"
              className="ml-10 h-8 gap-1.5 px-3 text-xs font-semibold text-[#5C5346] hover:text-[#251605] border-[#D6CDBF] bg-white shadow-xs hover:bg-[#FAF8F4] transition-all"
            >
              <ArrowLeft className="size-3.5 text-[#8A6A24]" />
              {computedLabel}
            </Button>
          </div>
        ) : null}
        <div className="space-y-3 p-3 sm:p-4 lg:p-5">{children}</div>
      </div>
      </FoToolbarSlotContext.Provider>
    </RoomInventoryChrome>
  );
}
