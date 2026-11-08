import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, CalendarDays, ChevronDown, HelpCircle, Search } from "lucide-react";

import { NoruLogo } from "@/core/components/noru-logo";
import type { RestaurantMembership } from "@/core/lib/restaurant.functions";
import { PmsAccountMenu } from "@/packages/pms/components/pms-account-menu";
import { PmsCommandChrome } from "@/packages/pms/components/pms-command-chrome";
import { PmsHelpPanel } from "@/packages/pms/components/pms-help-panel";
import { getFirstAccessiblePmsRoute, pmsModuleVisible } from "@/packages/pms/lib/pms-client-access";
import { PMS_MODULE_NAV, type PmsModuleNavLabel } from "@/packages/pms/lib/pms-module-nav";
import { usePmsPermissions } from "@/packages/pms/lib/use-pms-permissions";
import { usePropertyBusinessDate } from "@/packages/pms/lib/use-property-business-date";
import { resolvePmsReturnTo } from "@/packages/pms/lib/cashiering-shell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/components/ui/tooltip";
import { PmsSelect } from "./room-inventory-shared";

export const PMS_MODULE_NAV_ITEMS = [
  { label: "Front Office", to: "/restaurant/pms/front-office" },
  { label: "Reservations", to: "/restaurant/pms/reservations" },
  { label: "Rooms & Inventory", to: "/restaurant/pms/room-inventory" },
  { label: "Guest Profiles", to: "/restaurant/pms/guests" },
  { label: "Housekeeping", to: "/restaurant/pms/housekeeping" },
  { label: "Reports", to: "/restaurant/pms/reports" },
  { label: "Settings", to: "/restaurant/settings" },
] as const;

export type PmsModuleName = (typeof PMS_MODULE_NAV_ITEMS)[number]["label"];

type PmsModuleNavItemId = (typeof PMS_MODULE_NAV)[number]["id"];

/** Collapses into More on laptop widths. Wide desktops keep these in the bar. */
const PMS_NAV_MORE_IDS = new Set<PmsModuleNavItemId>([
  "rates-revenue",
  "night-audit",
  "reports",
  "settings",
]);

function moduleNavItemClass(active: boolean): string {
  return active
    ? "shrink-0 whitespace-nowrap border-b-2 border-[#C89933] px-2.5 py-2 text-xs font-medium text-white"
    : "shrink-0 whitespace-nowrap border-b-2 border-transparent px-2.5 py-2 text-xs text-white/75 transition-colors hover:text-white";
}

export function RoomInventoryChrome({
  membership,
  onRoomSearch,
  onSearchChange,
  activeModule = "Rooms & Inventory",
  searchPlaceholder = "Search room…",
  searchTestId,
  initialSearch = "",
  showSearch = false,
  helpLabel: _helpLabel = "Help",
  shellTestId = "room-inventory-command-shell",
  contentClassName = "p-0",
  fillViewport = false,
  returnTo,
  returnToLabel,
  suppressReturnButton = false,
  children,
}: {
  membership: RestaurantMembership;
  onRoomSearch?: (value: string) => void;
  onSearchChange?: (value: string) => void;
  /** Null leaves every module unselected. Omitted keeps the Rooms & Inventory default. */
  activeModule?: PmsModuleNavLabel | null;
  searchPlaceholder?: string;
  searchTestId?: string;
  initialSearch?: string;
  showSearch?: boolean;
  helpLabel?: string;
  shellTestId?: string;
  contentClassName?: string;
  fillViewport?: boolean;
  returnTo?: string | undefined;
  returnToLabel?: string | undefined;
  suppressReturnButton?: boolean;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const permissions = usePmsPermissions(membership.restaurantId);
  const access = { isOwner: permissions.isOwner, codes: permissions.permissions };
  const navReady = !permissions.isLoading && !permissions.isError;
  const NAV_ITEMS = navReady
    ? PMS_MODULE_NAV.filter((item) => pmsModuleVisible(access, item.catalogueKey))
    : [];
  const primaryNav = NAV_ITEMS.filter((item) => !PMS_NAV_MORE_IDS.has(item.id));
  const moreNav = NAV_ITEMS.filter((item) => PMS_NAV_MORE_IDS.has(item.id));
  const homePath = (navReady ? getFirstAccessiblePmsRoute(access) : "/restaurant/pms") ?? "/restaurant/home";
  const { hasPrevious, computedLabel, handleReturn } = resolvePmsReturnTo({
    returnTo,
    returnToLabel,
  });
  const showReturnButton = hasPrevious && !suppressReturnButton;
  const businessDate = usePropertyBusinessDate(
    membership.restaurant.id,
    membership.restaurant.timezone,
  );
  const [search, setSearch] = useState(initialSearch);
  const [helpOpen, setHelpOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => {
    setSearch(initialSearch);
  }, [initialSearch]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    onRoomSearch?.(search.trim());
  }

  const moreContainsActive = moreNav.some((item) => item.label === activeModule);
  const businessDateLabel = new Date(`${businessDate}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

  function openHelp() {
    setAccountOpen(false);
    setHelpOpen(true);
  }

  return (
    <PmsCommandChrome
      shellTestId={shellTestId}
      contentClassName={contentClassName}
      fillViewport={fillViewport}
      useDefaultControls={false}
      onGuestSearch={() => void navigate({ to: "/restaurant/pms/guests" })}
      onQuickAction={() => undefined}
      nav={
        <div className="flex min-w-0 items-center gap-4">
          <Link to={homePath as never} className="shrink-0">
            <NoruLogo size="sm" wordmarkClassName="text-white" />
          </Link>
          {showReturnButton ? (
            <button
              type="button"
              onClick={handleReturn}
              data-testid="pms-chrome-return-to-previous"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white shadow-xs hover:bg-white/20 transition-all cursor-pointer"
            >
              <ArrowLeft className="size-3.5 text-[#C89933]" />
              <span>{computedLabel}</span>
            </button>
          ) : null}
          <nav
            className="hidden min-w-0 items-center gap-0.5 lg:flex"
            aria-label="PMS modules"
            data-testid="pms-module-nav"
          >
            {primaryNav.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                aria-current={item.label === activeModule ? "page" : undefined}
                className={moduleNavItemClass(item.label === activeModule)}
              >
                {item.label}
              </Link>
            ))}
            {moreNav.length > 0 ? (
              <>
                {moreNav.map((item) => (
                  <Link
                    key={item.label}
                    to={item.to}
                    aria-current={item.label === activeModule ? "page" : undefined}
                    className={`${moduleNavItemClass(item.label === activeModule)} hidden min-[1680px]:inline`}
                  >
                    {item.label}
                  </Link>
                ))}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      data-testid="pms-module-nav-more"
                      aria-current={moreContainsActive ? "page" : undefined}
                      aria-label="More modules"
                      className={`${moduleNavItemClass(moreContainsActive)} inline-flex items-center gap-1 min-[1680px]:hidden`}
                    >
                      More
                      <ChevronDown className="size-3 shrink-0" aria-hidden="true" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="z-50">
                    {moreNav.map((item) => (
                      <DropdownMenuItem key={item.label} asChild>
                        <Link
                          to={item.to}
                          aria-current={item.label === activeModule ? "page" : undefined}
                          className={
                            item.label === activeModule ? "font-medium text-[#8A6A24]" : undefined
                          }
                        >
                          {item.label}
                        </Link>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : null}
          </nav>
        </div>
      }
      mobile={
        <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2 lg:hidden">
          {showReturnButton ? (
            <button
              type="button"
              onClick={handleReturn}
              data-testid="pms-chrome-return-to-previous-mobile"
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium text-foreground cursor-pointer"
            >
              <ArrowLeft className="size-3 text-[#C89933]" />
              <span>{computedLabel}</span>
            </button>
          ) : null}
          <PmsSelect
            aria-label="PMS module"
            disabled={!navReady}
            value={NAV_ITEMS.find((item) => item.label === activeModule)?.to ?? ""}
            onChange={(val) => window.location.assign(val)}
            className="h-9 w-full rounded-lg border-input bg-background px-3 text-sm"
            options={NAV_ITEMS.map((item) => [item.to, item.label])}
          />
        </div>
      }
      rightControls={
        <>
          <div className="hidden max-w-[11rem] items-center gap-1.5 border-l border-white/15 pl-3 text-xs text-white/85 lg:flex">
            <span className="truncate">{membership.restaurant.name}</span>
          </div>
          <div className="hidden items-center gap-1.5 text-xs text-white/75 md:flex">
            <CalendarDays className="size-3.5 shrink-0" />
            <span className="whitespace-nowrap">{businessDateLabel}</span>
          </div>
          {showSearch ? (
            <form onSubmit={submitSearch} className="hidden min-[1400px]:block">
              <label className="flex h-8 w-52 items-center gap-2 rounded-lg border border-white/10 bg-white/10 px-2.5 text-white/75 focus-within:border-[#C89933]/70">
                <Search className="size-3.5 shrink-0" />
                <input
                  data-testid={searchTestId}
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    onSearchChange?.(event.target.value);
                  }}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-white/45"
                />
              </label>
            </form>
          ) : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="rounded-lg p-1.5 text-white/75 hover:bg-white/10 hover:text-white"
                aria-label="Help"
                data-testid="fo-help"
                onClick={openHelp}
              >
                <HelpCircle className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Help</TooltipContent>
          </Tooltip>
          <PmsAccountMenu
            membership={membership}
            businessDateLabel={businessDateLabel}
            open={accountOpen}
            onOpenChange={(next) => {
              if (next) setHelpOpen(false);
              setAccountOpen(next);
            }}
            onOpenHelp={openHelp}
          />
        </>
      }
    >
      {children}
      <PmsHelpPanel
        open={helpOpen}
        onOpenChange={(next) => {
          if (next) setAccountOpen(false);
          setHelpOpen(next);
        }}
        activeModule={activeModule ?? null}
      />
    </PmsCommandChrome>
  );
}
