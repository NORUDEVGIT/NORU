import type { ReactNode } from "react";
import { Bell, HelpCircle, History, MoreHorizontal, Plus, Search } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

import { NoruLogo } from "@/core/components/noru-logo";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/shared/components/ui/tooltip";
import { FoHelpSheet } from "@/packages/pms/components/frontoffice/fo-help-sheet";
import {
  FO_BRAND,
  FO_ESCAPE_MODULES,
  FO_NAV_ITEMS,
  actionsForMenu,
  type FoNavId,
} from "@/packages/pms/lib/front-office-shell";
import { cn } from "@/shared/lib/utils";

function FoPmsModulesEscape({
  variant,
}: {
  variant: "overflow" | "phone";
}) {
  const navigate = useNavigate();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="fo-pms-modules-escape"
          className={
            variant === "overflow"
              ? "inline-flex items-center rounded-lg px-2 py-1.5 text-xs text-white/80 hover:bg-white/10 hover:text-white"
              : "mt-2 flex w-full items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm"
          }
        >
          <span>PMS modules</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={variant === "overflow" ? "end" : "start"}
        side="bottom"
        className="min-w-[12rem]"
        data-testid="fo-pms-modules-menu"
      >
        {FO_ESCAPE_MODULES.map((item) => (
          <DropdownMenuItem
            key={item.to}
            onSelect={() => {
              void navigate({ to: item.to });
            }}
          >
            {item.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          data-testid="fo-exit-pms"
          onSelect={() => {
            void navigate({ to: "/restaurant/pms/dashboard" });
          }}
        >
          Exit FO → PMS
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function FrontOfficeChrome({
  active,
  onNavigate,
  onQuickAction,
  onGuestSearch,
  exceptionBadge = 0,
  notificationCount = 0,
  notificationsComingSoon = false,
  onNotifications,
  onFoActivity,
  helpOpen,
  onHelpOpenChange,
  canOpenCashiering = false,
  children,
}: {
  active: FoNavId;
  onNavigate: (id: FoNavId) => void;
  onQuickAction: (actionId: string) => void;
  onGuestSearch: () => void;
  exceptionBadge?: number;
  notificationCount?: number;
  notificationsComingSoon?: boolean;
  onNotifications?: () => void;
  onFoActivity?: () => void;
  helpOpen?: boolean;
  onHelpOpenChange?: (open: boolean) => void;
  canOpenCashiering?: boolean;
  children: ReactNode;
}) {
  const quick = actionsForMenu("quick");

  return (
    <TooltipProvider delayDuration={200}>
      <div data-testid="fo-command-shell" className="flex min-h-[calc(100dvh-3.75rem)] flex-1 flex-col">
        <header
          className="flex items-center gap-2 px-3 py-2 text-white sm:px-4"
          style={{ backgroundColor: FO_BRAND.chrome }}
          data-testid="fo-top-command"
        >
          <nav
            data-testid="fo-top-nav"
            className="hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto md:flex"
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
                  "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs transition-colors",
                  active === item.id
                    ? "bg-[#C89933] text-[#251605]"
                    : "text-white/75 hover:bg-white/10 hover:text-white",
                )}
              >
                <span>{item.label}</span>
                {item.id === "exceptions" ? (
                  <span
                    data-testid="fo-exceptions-badge"
                    className={cn(
                      "min-w-5 rounded-full px-1.5 text-center text-[10px] leading-5",
                      active === item.id ? "bg-[#251605] text-white" : "bg-white/15 text-white",
                    )}
                  >
                    {exceptionBadge}
                  </span>
                ) : null}
              </button>
            ))}
          </nav>

          <div className="hidden shrink-0 items-center gap-1 md:flex" data-testid="fo-top-overflow">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-white/80 hover:bg-white/10 hover:text-white"
                  aria-label="More Front Office destinations"
                >
                  <MoreHorizontal className="size-4" />
                  <span>More</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[14rem]" data-testid="fo-top-overflow-menu">
                <DropdownMenuLabel>Front Office</DropdownMenuLabel>
                {FO_NAV_ITEMS.map((item) => (
                  <DropdownMenuItem key={item.id} onSelect={() => onNavigate(item.id)}>
                    {item.label}
                    {item.id === "exceptions" ? ` (${exceptionBadge})` : ""}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <FoPmsModulesEscape variant="overflow" />
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              data-testid="fo-guest-search"
              onClick={onGuestSearch}
              className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white/90 hover:bg-white/15"
            >
              <Search className="size-3.5" />
              <span className="hidden sm:inline">Guest search</span>
            </button>
            {notificationsComingSoon ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    data-testid="fo-notifications"
                    className="rounded-lg p-1.5 text-white/70 hover:bg-white/10"
                    aria-label="Notifications"
                  >
                    <Bell className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Notifications — Coming soon</TooltipContent>
              </Tooltip>
            ) : (
              <button
                type="button"
                data-testid="fo-notifications"
                className="relative rounded-lg p-1.5 text-white/70 hover:bg-white/10"
                aria-label="Notifications"
                onClick={onNotifications}
              >
                <Bell className="size-4" />
                {notificationCount > 0 ? (
                  <span
                    data-testid="fo-notifications-badge"
                    className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full px-1 text-[10px] leading-4 text-[#251605]"
                    style={{ backgroundColor: FO_BRAND.gold }}
                  >
                    {notificationCount}
                  </span>
                ) : null}
              </button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="bg-[#C89933] text-[#251605] hover:bg-[#C89933]/90">
                  <Plus className="size-4 sm:mr-1" />
                  <span className="hidden sm:inline">Quick Action</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" data-testid="fo-quick-action-menu">
                {quick.map((action) =>
                  action.lane === "coming_soon" ? (
                    <DropdownMenuItem
                      key={action.id}
                      data-testid={`fo-quick-${action.id}`}
                      onSelect={() => onQuickAction(action.id)}
                      className="text-muted-foreground"
                    >
                      {action.label}
                      <span className="ml-auto text-[10px] uppercase tracking-wide">Coming soon</span>
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      key={action.id}
                      data-testid={`fo-quick-${action.id}`}
                      onSelect={() => onQuickAction(action.id)}
                    >
                      {action.label}
                    </DropdownMenuItem>
                  ),
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              type="button"
              data-testid="fo-help"
              className="rounded-lg p-1.5 text-white/70 hover:bg-white/10"
              aria-label="Help"
              onClick={() => onHelpOpenChange?.(true)}
            >
              <HelpCircle className="size-4" />
            </button>
            <button
              type="button"
              data-testid="fo-activity"
              className="rounded-lg p-1.5 text-white/70 hover:bg-white/10"
              aria-label="FO activity"
              onClick={() => onFoActivity?.()}
            >
              <History className="size-4" />
            </button>
            <NoruLogo size="sm" wordmarkClassName="text-white" />
          </div>
        </header>
        <FoHelpSheet
          open={!!helpOpen}
          onOpenChange={(open) => onHelpOpenChange?.(open)}
          onNavigate={onNavigate}
          canOpenCashiering={canOpenCashiering}
        />

        <div className="flex min-h-0 flex-1 flex-col bg-background">
          <div className="border-b border-[#CCCCCC] px-3 py-2 md:hidden">
            <label className="sr-only" htmlFor="fo-mobile-nav">
              Front Office
            </label>
            <select
              id="fo-mobile-nav"
              data-testid="fo-mobile-nav"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
              value={active}
              onChange={(e) => onNavigate(e.target.value as FoNavId)}
            >
              {FO_NAV_ITEMS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.id === "exceptions" ? `${item.label} (${exceptionBadge})` : item.label}
                </option>
              ))}
            </select>
            <FoPmsModulesEscape variant="phone" />
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-4">{children}</div>
        </div>
      </div>
    </TooltipProvider>
  );
}
