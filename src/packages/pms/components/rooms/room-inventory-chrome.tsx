import { type FormEvent, type ReactNode, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { CalendarDays, ChevronDown, HelpCircle, MoreHorizontal, Search } from "lucide-react";

import { NoruLogo } from "@/core/components/noru-logo";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { PmsCommandChrome } from "@/packages/pms/components/pms-command-chrome";
import { usePropertyBusinessDate } from "@/packages/pms/lib/use-property-business-date";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/components/ui/tooltip";

const NAV_ITEMS = [
  { label: "Front Office", to: "/restaurant/pms/front-office" },
  { label: "Reservations", to: "/restaurant/pms/reservations" },
  { label: "Rooms & Inventory", to: "/restaurant/pms/room-inventory" },
  { label: "Housekeeping", to: "/restaurant/pms/housekeeping" },
  { label: "F&B", to: "/restaurant/restaurant-management/dashboard" },
  { label: "Reports", to: "/restaurant/pms/reports" },
  { label: "Settings", to: "/restaurant/settings" },
] as const;

export function RoomInventoryChrome({
  membership,
  onRoomSearch,
  activeModule = "Rooms & Inventory",
  searchPlaceholder = "Search room…",
  searchTestId,
  helpLabel = "Room & Inventory operational workspace",
  onHelpClick,
  overflowItems = [],
  shellTestId = "room-inventory-command-shell",
  children,
}: {
  membership: RestaurantMembership;
  onRoomSearch: (value: string) => void;
  activeModule?: (typeof NAV_ITEMS)[number]["label"];
  searchPlaceholder?: string;
  searchTestId?: string;
  helpLabel?: string;
  onHelpClick?: () => void;
  overflowItems?: Array<{ label: string; onSelect: () => void; testId?: string }>;
  shellTestId?: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const businessDate = usePropertyBusinessDate(
    membership.restaurant.id,
    membership.restaurant.timezone,
  );
  const [search, setSearch] = useState("");

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    onRoomSearch(search.trim());
  }

  const initials = membership.restaurant.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <PmsCommandChrome
      shellTestId={shellTestId}
      contentClassName="p-0"
      useDefaultControls={false}
      onGuestSearch={() => void navigate({ to: "/restaurant/pms/guests" })}
      onQuickAction={() => undefined}
      nav={
        <div className="flex min-w-0 items-center gap-5">
          <Link to="/restaurant/pms" className="shrink-0">
            <NoruLogo size="sm" wordmarkClassName="text-white" />
          </Link>
          <nav
            className="hidden min-w-0 items-center gap-0.5 overflow-x-auto lg:flex"
            aria-label="PMS modules"
            data-testid="pms-module-nav"
          >
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                aria-current={item.label === activeModule ? "page" : undefined}
                className={
                  item.label === activeModule
                    ? "border-b-2 border-[#C89933] px-2.5 py-2 text-xs font-medium text-white"
                    : "border-b-2 border-transparent px-2.5 py-2 text-xs text-white/75 transition-colors hover:text-white"
                }
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      }
      mobile={
        <div className="border-b border-border bg-card px-3 py-2 lg:hidden">
          <select
            aria-label="PMS module"
            value={NAV_ITEMS.find((item) => item.label === activeModule)?.to ?? ""}
            onChange={(event) => window.location.assign(event.target.value)}
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
          >
            {NAV_ITEMS.map((item) => (
              <option key={item.label} value={item.to}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      }
      rightControls={
        <>
          <div className="hidden items-center gap-1.5 border-l border-white/15 pl-3 text-xs text-white/85 xl:flex">
            <span className="max-w-36 truncate">{membership.restaurant.name}</span>
            <ChevronDown className="size-3" />
          </div>
          <div className="hidden items-center gap-1.5 text-xs text-white/75 md:flex">
            <CalendarDays className="size-3.5" />
            <span>
              {new Date(`${businessDate}T00:00:00Z`).toLocaleDateString("en-GB", {
                weekday: "short",
                day: "numeric",
                month: "short",
                year: "numeric",
                timeZone: "UTC",
              })}
            </span>
          </div>
          <form onSubmit={submitSearch} className="hidden lg:block">
            <label className="flex h-8 w-52 items-center gap-2 rounded-lg border border-white/10 bg-white/10 px-2.5 text-white/75 focus-within:border-[#C89933]/70">
              <Search className="size-3.5 shrink-0" />
              <input
                data-testid={searchTestId}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-white/45"
              />
            </label>
          </form>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="rounded-lg p-1.5 text-white/75 hover:bg-white/10 hover:text-white"
                aria-label={`${activeModule} help`}
                data-testid={onHelpClick ? "fo-help" : undefined}
                onClick={onHelpClick}
              >
                <HelpCircle className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{helpLabel}</TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="rounded-lg p-1.5 text-white/75 hover:bg-white/10 hover:text-white"
                aria-label="More PMS destinations"
              >
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {overflowItems.map((item) => (
                <DropdownMenuItem key={item.label} data-testid={item.testId} onSelect={item.onSelect}>
                  {item.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onSelect={() => void navigate({ to: "/restaurant/pms" })}>
                PMS home
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => void navigate({ to: "/restaurant/pms/night-audit" })}
              >
                Night Audit
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="flex size-8 items-center justify-center rounded-full bg-[#F4E9D0] text-[11px] font-semibold text-[#251605]">
            {initials || "P"}
          </span>
        </>
      }
    >
      {children}
    </PmsCommandChrome>
  );
}
